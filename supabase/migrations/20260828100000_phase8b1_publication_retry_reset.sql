-- =============================================================================
-- Phase 8B.1 — Forward migration: retry-of-failed-job unlock
-- (Run 4 defect: "retry path is unreachable")
-- =============================================================================
-- Contexto: NO reemplaza ni edita ninguna migracion ya aplicada
-- (20260825120000_phase8b1_publication_domain_persistence.sql,
-- 20260827090000_phase8b1_publication_domain_hardening.sql) — se aplica
-- ADEMAS de ambas.
--
-- DEFECTO CONFIRMADO EN RUN 4: create_publication_job(retry_of_job_id=...)
-- ya validaba correctamente la elegibilidad de retry (job previo 'failed'
-- con failure_category en la lista retryable), pero ese branch de
-- validacion se evalua DESPUES de un guard anterior que exige
-- `v_target_status IN ('ready', 'scheduled')` — y `mark_publication_job_failed`
-- (unica RPC que puede dejar un job realmente 'failed', porque solo corre
-- sobre jobs 'in_progress', y todo job 'in_progress' ya paso por
-- start_publication_job, que ya puso el target en 'publishing') SIEMPRE
-- deja el target en 'failed', nunca en 'ready'/'scheduled'. Resultado: la
-- rama de retry de create_publication_job es alcanzable en la migracion
-- aplicada solo en teoria — en la practica, para CUALQUIER job que
-- realmente fallo via el camino real, es inalcanzable. Confirmado en
-- runtime (Run 4), no solo por inspeccion estatica.
--
-- DISEÑO ELEGIDO: Opcion preferida del kickoff — introducir una transicion
-- explicita y autorizada de reset del target ('failed' -> 'ready'),
-- SEPARADA de create_publication_job, en vez de fusionar la logica de
-- reset dentro de create_publication_job. Justificacion (preserva mejor
-- los limites de agregado y los invariantes de 8A.1 ya existentes):
--   - 8A.1 ya modela cada transicion de status de
--     campaign_activation_targets como su PROPIA RPC de proposito unico
--     (prepare_activation_target, mark_activation_target_ready,
--     mark_activation_target_published, cancel_activation_target) — nunca
--     una transicion de target "de paso" dentro de una RPC cuyo aggregate
--     root es otro (job). Fusionar el reset dentro de create_publication_job
--     rompería ese patron y mezclaria dos decisiones de autorizacion
--     distintas (crear un job = operator+; decidir reabrir un target que
--     fallo para reintentar = una decision mas sensible) en una sola RPC.
--   - El reset es una decision OPERATIVA INTENCIONAL (no automatica): un
--     humano decide explicitamente "este fallo es elegible para
--     reintentar, autorizo continuar" — separarlo en su propia RPC hace
--     esa decision auditable de forma independiente (evento propio
--     'retry_prepared' en campaign_publication_events, distinto de
--     'job_queued' que ya registra create_publication_job).
--   - create_publication_job permanece SIN CAMBIOS de comportamiento
--     (mismo guard `v_target_status IN ('ready','scheduled')`, misma
--     validacion de retry_of_job_id) — la unica ganancia es que, una vez
--     que el target vuelve a 'ready' via la nueva RPC, ese guard ya
--     existente deja de bloquear el camino real. El job 'failed' original
--     NUNCA se reabre ni se muta — permanece inmutable, historico. El
--     retry SIEMPRE es un job NUEVO (mismo invariante ya documentado en
--     canRetryPublicationJob/create_publication_job).
--
-- AUTORIZACION ELEGIDA: strategist+ (rol minimo), usando el modelo de
-- roles ya existente de Phase 8 (has_organization_role — mismo mecanismo
-- que cancel_publication_job/in_progress y reconcile_publication_job).
-- Justificacion: reabrir un target que fallo para permitir un reintento es
-- una decision operativa deliberada del mismo orden de sensibilidad que
-- reconciliar un unknown_outcome (reconcile_publication_job, tambien
-- strategist+) — ambas son decisiones humanas explicitas sobre como tratar
-- un resultado ya ocurrido, no la creacion rutinaria de un job nuevo
-- (create_publication_job, operator+, sigue igual — la barra alta esta en
-- la decision de "autorizo reintentar", no en el paso mecanico de crear el
-- job una vez autorizado).
-- =============================================================================

-- -----------------------------------------------------------------------
-- 1) Helper compartido: unica fuente de verdad para "es esta
--    failure_category elegible para retry" — evita que
--    create_publication_job y prepare_publication_retry puedan divergir
--    silenciosamente (mismo criterio que
--    PUBLICATION_RETRYABLE_FAILURE_CATEGORIES en
--    packages/shared/src/constants/publication.ts, que esta funcion
--    espeja exactamente).
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_publication_failure_retryable(p_failure_category text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_failure_category IN (
    'INTEGRATION_NOT_AVAILABLE', 'RATE_LIMITED', 'DISPATCH_FAILED', 'PROVIDER_OUTAGE',
    'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED'
  );
$$;

COMMENT ON FUNCTION public.is_publication_failure_retryable(text) IS
  'Espejo SQL de isRetryablePublicationFailure() / '
  'PUBLICATION_RETRYABLE_FAILURE_CATEGORIES (packages/shared/src/constants/'
  'publication.ts) -- fuente unica de verdad reutilizada por '
  'create_publication_job y prepare_publication_retry para que ambas RPCs '
  'nunca puedan divergir sobre que categorias de fallo son retryable.';

-- -----------------------------------------------------------------------
-- 2) create_publication_job: mismo comportamiento externo, ahora usa el
--    helper compartido en vez de repetir la lista inline (forward-patch
--    puramente interno -- ninguna validacion cambia de resultado).
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_publication_job(
  p_target_id uuid,
  p_retry_of_job_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor              uuid := auth.uid();
  v_target_org_id      uuid;
  v_target_client_id   uuid;
  v_target_activation_id uuid;
  v_target_channel     public.activation_channel;
  v_target_provider    public.activation_provider;
  v_target_integration uuid;
  v_target_status      public.activation_target_status;
  v_existing_active    uuid;
  v_prev_status        public.publication_job_status;
  v_prev_failure_cat   text;
  v_prev_target_id     uuid;
  v_retry_count        integer := 0;
  v_idempotency_key    text;
  v_job_id             uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'create_publication_job: authentication required';
  END IF;

  SELECT organization_id, client_id, activation_id, channel, provider, client_integration_id, status
    INTO v_target_org_id, v_target_client_id, v_target_activation_id, v_target_channel,
         v_target_provider, v_target_integration, v_target_status
  FROM public.campaign_activation_targets
  WHERE id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'create_publication_job: target not found (id: %)', p_target_id;
  END IF;

  IF NOT public.has_organization_role(v_target_org_id, 'operator') THEN
    RAISE EXCEPTION 'create_publication_job: actor lacks operator+ role (target_id: %)', p_target_id;
  END IF;

  IF v_target_provider = 'manual' THEN
    RAISE EXCEPTION 'create_publication_job: target % is manual, does not use publication jobs', p_target_id;
  END IF;

  IF v_target_status NOT IN ('ready', 'scheduled') THEN
    RAISE EXCEPTION 'create_publication_job: target % is not ready/scheduled (current status: %)',
      p_target_id, v_target_status;
  END IF;

  -- Un target no puede tener dos jobs activos (defensa explicita ademas del
  -- indice unico parcial -- mensaje de error mas claro que un 23505 crudo).
  SELECT id INTO v_existing_active
  FROM public.campaign_publication_jobs
  WHERE target_id = p_target_id
    AND status NOT IN ('succeeded', 'failed', 'cancelled')
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'create_publication_job: target % already has an active publication job (%)',
      p_target_id, v_existing_active;
  END IF;

  IF p_retry_of_job_id IS NOT NULL THEN
    SELECT status, failure_category, target_id, retry_count
      INTO v_prev_status, v_prev_failure_cat, v_prev_target_id, v_retry_count
    FROM public.campaign_publication_jobs
    WHERE id = p_retry_of_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'create_publication_job: retry_of_job_id not found (id: %)', p_retry_of_job_id;
    END IF;

    IF v_prev_target_id IS DISTINCT FROM p_target_id THEN
      RAISE EXCEPTION 'create_publication_job: retry_of_job_id % does not belong to target %',
        p_retry_of_job_id, p_target_id;
    END IF;

    IF v_prev_status <> 'failed' OR v_prev_failure_cat IS NULL
       OR NOT public.is_publication_failure_retryable(v_prev_failure_cat) THEN
      RAISE EXCEPTION
        'create_publication_job: job % is not eligible for retry (status: %, failure_category: %)',
        p_retry_of_job_id, v_prev_status, v_prev_failure_cat;
    END IF;

    v_retry_count := v_retry_count + 1;
  ELSE
    v_retry_count := 0;
  END IF;

  v_idempotency_key := 'publish:' || v_target_org_id::text || ':' || p_target_id::text || ':' || v_retry_count::text;

  INSERT INTO public.campaign_publication_jobs (
    organization_id, client_id, activation_id, target_id, channel, provider,
    client_integration_id, status, idempotency_key, retry_of_job_id, retry_count, created_by
  ) VALUES (
    v_target_org_id, v_target_client_id, v_target_activation_id, p_target_id, v_target_channel,
    v_target_provider, v_target_integration, 'queued', v_idempotency_key, p_retry_of_job_id,
    v_retry_count, v_actor
  )
  RETURNING id INTO v_job_id;

  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, event_type, actor_user_id, is_system, note)
  VALUES
    (v_target_org_id, v_job_id, 'job_queued', v_actor, false, NULL);

  RETURN v_job_id;
END;
$$;

COMMENT ON FUNCTION public.create_publication_job(uuid, uuid) IS
  'RPC: crea un CampaignPublicationJob en queued para un target automatizado '
  'ready/scheduled. Rol operator+. p_retry_of_job_id encadena un retry '
  '(solo si el job anterior es failed+retryable). Sin cambio de '
  'comportamiento en 20260828100000 -- solo reutiliza '
  'is_publication_failure_retryable() en vez de una lista inline.';

-- -----------------------------------------------------------------------
-- 3) prepare_publication_retry(p_job_id, p_note) -- NUEVA RPC. Unica via
--    autorizada para transicionar un target de 'failed' a 'ready' con el
--    proposito explicito de habilitar un retry via
--    create_publication_job(target_id, retry_of_job_id=p_job_id). Rol
--    strategist+. NUNCA muta el job historico -- solo lee su status/
--    failure_category para validar elegibilidad, y solo escribe el target
--    + un evento de auditoria en el job (SIN cambiar su status/campos).
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prepare_publication_retry(
  p_job_id uuid,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor           uuid := auth.uid();
  v_org_id          uuid;
  v_target_id       uuid;
  v_status          public.publication_job_status;
  v_failure_cat     text;
  v_target_status   public.activation_target_status;
  v_existing_active uuid;
  v_rows            int;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'prepare_publication_retry: authentication required';
  END IF;

  SELECT organization_id, target_id, status, failure_category
    INTO v_org_id, v_target_id, v_status, v_failure_cat
  FROM public.campaign_publication_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prepare_publication_retry: job not found (id: %)', p_job_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'strategist') THEN
    RAISE EXCEPTION 'prepare_publication_retry: actor lacks strategist+ role (job_id: %)', p_job_id;
  END IF;

  -- Elegibilidad IDENTICA a la que create_publication_job exige de
  -- retry_of_job_id -- mismo helper, misma condicion exacta. unknown_outcome
  -- NUNCA es elegible directamente aqui (debe reconciliarse primero via
  -- reconcile_publication_job, que -- si resulta "no publicado" -- deja el
  -- job en 'failed' con failure_category
  -- UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED, que SI es retryable).
  IF v_status <> 'failed' THEN
    RAISE EXCEPTION 'prepare_publication_retry: job % is not failed (current status: %)', p_job_id, v_status;
  END IF;

  IF v_failure_cat IS NULL OR NOT public.is_publication_failure_retryable(v_failure_cat) THEN
    RAISE EXCEPTION 'prepare_publication_retry: job % is not eligible for retry (failure_category: %)',
      p_job_id, v_failure_cat;
  END IF;

  -- Defensa explicita adicional (deberia ser imposible dado el indice
  -- unico parcial sobre campaign_publication_jobs, pero se revalida aqui
  -- por claridad del mensaje de error -- mismo criterio que
  -- create_publication_job): bloquea preparar un retry duplicado mientras
  -- ya existe un job activo para este target (p.ej. un retry anterior ya
  -- creado y todavia no terminal).
  SELECT id INTO v_existing_active
  FROM public.campaign_publication_jobs
  WHERE target_id = v_target_id
    AND status NOT IN ('succeeded', 'failed', 'cancelled')
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'prepare_publication_retry: target % already has an active publication job (%)',
      v_target_id, v_existing_active;
  END IF;

  SELECT status INTO v_target_status
  FROM public.campaign_activation_targets
  WHERE id = v_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prepare_publication_retry: target not found (id: %)', v_target_id;
  END IF;

  IF v_target_status <> 'failed' THEN
    RAISE EXCEPTION
      'prepare_publication_retry: target % is not failed (current status: %) -- retry preparation already applied or target diverged',
      v_target_id, v_target_status;
  END IF;

  -- Limpia los campos de diagnostico del fallo anterior -- el target vuelve
  -- a 'ready' para un intento fresco, no debe seguir mostrando el
  -- failure_code/failure_message del intento ya historico (que permanece
  -- integro en el job 'failed' original, nunca se borra de ahi).
  UPDATE public.campaign_activation_targets
  SET status = 'ready',
      failed_at = NULL,
      failure_code = NULL,
      failure_message = NULL
  WHERE id = v_target_id AND status = 'failed';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'prepare_publication_retry: target % failed->ready transition did not apply (concurrent change?)', v_target_id;
  END IF;

  -- Evento de auditoria SOBRE EL JOB FALLIDO ORIGINAL (nunca se muta su
  -- status/failure_category/completed_at -- permanece inmutable,
  -- historico). Este evento documenta la decision operativa explicita de
  -- autorizar un retry, distinta del evento 'job_queued' que emitira el
  -- job NUEVO cuando create_publication_job(retry_of_job_id=p_job_id) se
  -- invoque a continuacion.
  INSERT INTO public.campaign_publication_events
    (organization_id, job_id, event_type, actor_user_id, is_system, note)
  VALUES
    (v_org_id, p_job_id, 'retry_prepared', v_actor, false, p_note);

  RETURN v_target_id;
END;
$$;

COMMENT ON FUNCTION public.prepare_publication_retry(uuid, text) IS
  'RPC: unica via autorizada para transicionar un target de failed a ready '
  'con el proposito de reintentar. Rol strategist+ (decision operativa '
  'intencional, mismo nivel que reconcile_publication_job). Requiere que '
  'el job referenciado este failed con una failure_category retryable, y '
  'que el target no tenga ya un job activo. NUNCA muta el job historico -- '
  'solo agrega un evento de auditoria (retry_prepared). Tras esta RPC, '
  'create_publication_job(target_id, retry_of_job_id=p_job_id) puede crear '
  'el job NUEVO de retry (retry_count+1), sin reabrir jamas el job '
  'original.';

-- -----------------------------------------------------------------------
-- 4) campaign_publication_events.event_type: agrega 'retry_prepared' a la
--    lista cerrada (CHECK) -- cambio aditivo, ninguna fila existente deja
--    de cumplir el constraint.
-- -----------------------------------------------------------------------

ALTER TABLE public.campaign_publication_events
  DROP CONSTRAINT IF EXISTS campaign_publication_events_event_type_check;

ALTER TABLE public.campaign_publication_events
  ADD CONSTRAINT campaign_publication_events_event_type_check CHECK (event_type IN (
    'job_queued', 'job_claimed', 'job_started', 'job_succeeded',
    'job_failed', 'job_cancelled', 'job_marked_unknown_outcome',
    'job_reconciled', 'webhook_received', 'retry_prepared'
  ));

-- -----------------------------------------------------------------------
-- 5) GRANTS -- mismo patron que create_publication_job/cancel_publication_job/
--    reconcile_publication_job (capa "flujo de usuario normal": SOLO
--    authenticated, gate de rol interno strategist+; NUNCA service_role).
-- -----------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.prepare_publication_retry(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_publication_retry(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.prepare_publication_retry(uuid, text) TO authenticated;

-- create_publication_job/reconcile_publication_job ya tenian sus GRANT/REVOKE
-- correctos desde 20260825120000 -- CREATE OR REPLACE FUNCTION (paso 2
-- arriba) no los altera, se preservan automaticamente.
