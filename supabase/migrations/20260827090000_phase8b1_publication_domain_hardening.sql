-- =============================================================================
-- Phase 8B.1 — Forward hardening migration (Runtime Run 2 defect triage)
-- =============================================================================
-- Contexto: esta migracion NO reemplaza ni edita
-- 20260825120000_phase8b1_publication_domain_persistence.sql (ya aplicada
-- localmente) -- corrige, hacia adelante, dos defectos reales confirmados
-- por ejecucion en runtime (Postgres/Supabase local real, no solo
-- inspeccion estatica):
--
-- DEFECTO 1 -- campaign_publication_attempts append-only DEMASIADO ESTRICTO.
-- El trigger reject_publication_attempt_mutation() (adjunto a
-- trg_publication_attempts_no_update / trg_publication_attempts_no_delete)
-- rechaza INCONDICIONALMENTE cualquier UPDATE, sin importar quien lo
-- ejecute. Pero el propio modelo de dominio (packages/domain/src/entities/
-- campaign-publication-attempt.ts, funcion isPublicationAttemptOpen) define
-- explicitamente un ciclo de vida de dos fases para un attempt: "abierto"
-- (completed_at IS NULL, outcome IS NULL) y "cerrado" (completed_at/outcome
-- fijados una unica vez). Las RPCs mark_publication_job_succeeded,
-- mark_publication_job_failed y mark_publication_job_unknown_outcome
-- (todas SECURITY DEFINER, definidas en la migracion ya aplicada) hacen
-- legitimamente exactamente esa transicion de cierre con un UPDATE sobre
-- campaign_publication_attempts -- y el trigger, tal como esta escrito hoy,
-- rechaza ese UPDATE aunque provenga de una RPC autorizada, porque el
-- trigger no distingue "quien" ni "que cambia", solo "hay un UPDATE".
-- Confirmado en runtime: claim_publication_job/mark_publication_job_failed/
-- mark_publication_job_unknown_outcome fallaban con
-- "campaign_publication_attempts: append-only, direct UPDATE/DELETE not
-- allowed (use RPCs)" al ejecutar el camino de vida REAL disenado por la
-- propia migracion.
--
-- Por que es seguro relajar el trigger (y no un downgrade de seguridad):
-- campaign_publication_attempts ya tiene, en la migracion aplicada,
-- "REVOKE ALL ON public.campaign_publication_attempts FROM anon,
-- authenticated, service_role" + "GRANT SELECT ... TO authenticated"
-- (unicamente SELECT). Es decir: NINGUN rol de aplicacion (anon,
-- authenticated, service_role) tiene ya, a nivel de GRANT, ningun permiso
-- de UPDATE/DELETE sobre esta tabla. La UNICA via de escritura posible es
-- a traves de las RPC SECURITY DEFINER, que se ejecutan con los privilegios
-- del OWNER de la funcion (superusuario de migracion), no del caller. Por lo
-- tanto, relajar el trigger para permitir EXCLUSIVAMENTE la transicion
-- exacta abierto->cerrado (OLD.completed_at IS NULL AND NEW.completed_at
-- IS NOT NULL) no abre ninguna superficie nueva a ningun caller real: solo
-- permite que las 3 RPCs ya disenadas para hacer esa transicion puedan
-- efectivamente hacerla. Un intento de re-cerrar un attempt ya cerrado
-- (OLD.completed_at IS NOT NULL) sigue rechazado incondicionalmente, igual
-- que cualquier DELETE, y tambien sigue rechazada cualquier otra mutacion
-- sobre un attempt TODAVIA abierto que no lo cierre (NEW.completed_at IS
-- NULL) -- p.ej. alterar provider_status sin fijar completed_at.
--
-- DEFECTO 2 -- mark_webhook_event_processed no es idempotente frente a
-- reintentos: confirmado en runtime que invocar la RPC dos veces con el
-- mismo p_webhook_event_id (ya en status 'received' -> 'processed' tras la
-- primera llamada) inserta una SEGUNDA fila en campaign_publication_events
-- (event_type='webhook_received') -- eventos_webhook_received crecio 0 -> 1
-- -> 2 en el mismo webhook_event_id. El ESTADO AUTORITATIVO del job/target/
-- activation nunca se duplica (esta protegido, por separado, por los guards
-- de estado de las RPCs de transicion de job -- ver check 8.7b: un job ya
-- succeeded rechaza un segundo mark_publication_job_succeeded). Pero el
-- registro de auditoria campaign_publication_events SI se duplicaba en cada
-- reintento de "procesar" el mismo webhook, lo cual es un invariante de
-- persistencia real de 8B.1 (procesamiento de webhook replay-safe), no algo
-- diferible a 8B.3 (que solo agrega el proveedor de test firmado, no
-- cambia este invariante). Fix: mark_publication_job_processed ahora lee el
-- status ACTUAL del webhook event antes de mutarlo; si ya esta en un status
-- terminal (processed|failed), la llamada es un NO-OP idempotente (no
-- vuelve a actualizar processed_at/error_code, no vuelve a insertar el
-- evento de auditoria) en lugar de reprocesar incondicionalmente.
-- =============================================================================

-- -----------------------------------------------------------------------
-- 1) campaign_publication_attempts: permitir SOLO la transicion de cierre
--    abierto -> cerrado (completed_at pasa de NULL a NOT NULL), manteniendo
--    el rechazo incondicional de: DELETE, y cualquier UPDATE cuando el
--    attempt ya estaba cerrado (OLD.completed_at IS NOT NULL).
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_publication_attempt_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'campaign_publication_attempts: append-only, DELETE not allowed (use RPCs)';
  END IF;

  -- TG_OP = 'UPDATE' a partir de aqui.
  IF OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_publication_attempts: attempt already closed (completed_at set), no further UPDATE allowed (use RPCs)';
  END IF;

  -- Unica transicion legitima: OLD abierto (completed_at IS NULL) Y este
  -- UPDATE efectivamente lo CIERRA (NEW.completed_at IS NOT NULL). No basta
  -- con que el attempt ESTUVIERA abierto: cualquier otra mutacion sobre un
  -- attempt abierto que NO fije completed_at (p.ej. alterar provider_status
  -- sin cerrar el attempt) sigue rechazada -- solo se permite exactamente
  -- la transicion de cierre que hacen mark_publication_job_succeeded /
  -- mark_publication_job_failed / mark_publication_job_unknown_outcome.
  -- Ningun caller de aplicacion tiene GRANT UPDATE directo sobre esta tabla
  -- (ver REVOKE ALL en la migracion 20260825120000, seccion H); esta
  -- condicion adicional es defensa en profundidad para que ni siquiera un
  -- rol con GRANT UPDATE mal otorgado en el futuro pueda tocar un attempt
  -- abierto sin cerrarlo.
  IF NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'campaign_publication_attempts: append-only, direct UPDATE/DELETE not allowed (use RPCs)';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reject_publication_attempt_mutation() IS
  'Trigger de defensa en profundidad para campaign_publication_attempts: '
  'rechaza SIEMPRE DELETE; para UPDATE, permite UNICAMENTE la transicion '
  'exacta de cierre abierto->cerrado (OLD.completed_at IS NULL AND '
  'NEW.completed_at IS NOT NULL), usada por mark_publication_job_succeeded/'
  '_failed/_unknown_outcome. Cualquier otra mutacion -- reabrir/recerrar un '
  'attempt ya cerrado, o alterar un attempt abierto SIN cerrarlo -- sigue '
  'rechazada. Forward-fix de 20260825120000 (ver 20260827090000) -- no '
  'reemplaza la migracion original, la corrige hacia adelante.';

-- Los triggers ya existentes (trg_publication_attempts_no_update,
-- trg_publication_attempts_no_delete) siguen apuntando a esta misma
-- funcion por nombre (CREATE OR REPLACE FUNCTION la reemplaza in-place);
-- no es necesario recrear los triggers.

-- -----------------------------------------------------------------------
-- 2) mark_webhook_event_processed: no-op idempotente si el webhook event
--    ya esta en un status terminal (processed|failed).
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_webhook_event_processed(
  p_webhook_event_id uuid,
  p_status text,
  p_error_code text DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_attempt_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status public.publication_webhook_event_status;
BEGIN
  IF p_status NOT IN ('processed', 'failed') THEN
    RAISE EXCEPTION 'mark_webhook_event_processed: status must be processed or failed (got: %)', p_status;
  END IF;

  SELECT status INTO v_current_status
  FROM public.campaign_publication_webhook_events
  WHERE id = p_webhook_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_webhook_event_processed: webhook event not found (id: %)', p_webhook_event_id;
  END IF;

  -- Idempotencia: si el webhook event ya alcanzo un status terminal
  -- (processed|failed) en una llamada anterior, un reintento con los
  -- mismos argumentos es un NO-OP -- no se vuelve a actualizar
  -- processed_at/error_code/job_id/etc, y sobre todo no se vuelve a
  -- insertar el evento de auditoria 'webhook_received' (que antes de este
  -- fix se duplicaba en cada reintento: 0 -> 1 -> 2 eventos para el MISMO
  -- webhook_event_id). El estado autoritativo del job nunca dependio de
  -- este INSERT (esta protegido por separado por los guards de status en
  -- las RPCs de transicion de job), pero el registro de auditoria si debe
  -- ser replay-safe, y ahora lo es.
  IF v_current_status IN ('processed', 'failed') THEN
    RETURN;
  END IF;

  UPDATE public.campaign_publication_webhook_events
  SET status = p_status::public.publication_webhook_event_status,
      processed_at = now(),
      error_code = left(p_error_code, 200),
      job_id = COALESCE(p_job_id, job_id),
      organization_id = COALESCE(p_organization_id, organization_id),
      attempt_id = COALESCE(p_attempt_id, attempt_id)
  WHERE id = p_webhook_event_id;

  IF p_job_id IS NOT NULL AND p_organization_id IS NOT NULL THEN
    INSERT INTO public.campaign_publication_events
      (organization_id, job_id, attempt_id, event_type, actor_user_id, is_system, note)
    VALUES
      (p_organization_id, p_job_id, p_attempt_id, 'webhook_received', NULL, true,
       'webhook_event_id: ' || p_webhook_event_id::text);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.mark_webhook_event_processed(uuid, text, text, uuid, uuid, uuid) IS
  'RPC: marca un campaign_publication_webhook_events como processed|failed '
  'y correlaciona job_id/organization_id/attempt_id una vez resueltos. '
  'Inserta un evento webhook_received cuando se provee job_id+organization_id. '
  'Idempotente/replay-safe desde 20260827090000: si el webhook event ya '
  'esta en un status terminal, una llamada repetida es un NO-OP (no '
  'duplica el evento de auditoria). SOLO service_role.';

-- Los GRANT/REVOKE de funcion existentes de la migracion 20260825120000
-- (REVOKE ALL ... FROM PUBLIC/anon/authenticated; GRANT EXECUTE ... TO
-- service_role) se preservan automaticamente: CREATE OR REPLACE FUNCTION
-- no altera los privilegios ya otorgados sobre la funcion.
