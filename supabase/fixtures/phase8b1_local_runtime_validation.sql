-- =============================================================================
-- Phase 8B.1 — Local runtime validation script
-- Archivo: supabase/fixtures/phase8b1_local_runtime_validation.sql
--
-- PROPOSITO
--   Verificar el comportamiento REAL en runtime (no solo texto de la
--   migracion) de las 4 tablas / 12 RPCs / RLS / triggers de
--   20260825120000_phase8b1_publication_domain_persistence.sql contra
--   Supabase LOCAL. Complementa (no reemplaza) los tests de contrato de
--   texto de packages/infrastructure/packages/domain. Sigue EXACTAMENTE el
--   mismo patron/mecanismo que supabase/fixtures/phase8a1_local_runtime_validation.sql
--   (guarda de entorno local, tabla temporal de ids, set_config +
--   SET ROLE authenticated/service_role para simular sesiones, DO blocks con
--   EXCEPTION para negativos, salida "RESULT: <n> ... = PASS|FAIL").
--
-- ALCANCE / GARANTIAS
--   - Solo LOCAL: aborta si detecta que no esta corriendo contra Supabase
--     local (SECCION 0), mismo guard exacto que 8A.1.
--   - No usa Supabase cloud, no usa `db push`/`db reset`.
--   - No modifica la migracion 20260825120000 ni supabase/config.toml.
--   - No deshabilita triggers/RLS/constraints para "hacer pasar" un test ni
--     para simplificar el cleanup -- si un cleanup no es seguro bajo las
--     constraints reales, se documenta y se deja como historico (ver
--     phase8b1_local_runtime_validation_cleanup.sql).
--   - Todos los fixtures llevan el marcador 'phase8b1-local' en metadata o
--     el prefijo 'Phase8B1 Smoke' en su nombre/slug.
--   - Cada verificacion negativa (debe fallar) esta envuelta en su propio
--     DO $$ ... EXCEPTION WHEN OTHERS ... $$ para que un fallo ESPERADO no
--     aborte el resto del script.
--   - Salida: cada verificacion emite exactamente una linea
--       RESULT: <seccion>.<n> <descripcion> = PASS | FAIL <detalle>
--     Extraer todas las lineas con: grep '^RESULT:' <output>
--   - Simulacion de rol/actor (mismo mecanismo EXACTO que 8A.1, SECCION 11):
--     `PERFORM set_config('request.jwt.claim.sub', <user_id>::text, false)`
--     + `SET ROLE authenticated` para invocar las RPCs `authenticated`
--     (create_publication_job/cancel_publication_job/reconcile_publication_job)
--     como un usuario real con auth.uid() poblado; `SET ROLE service_role`
--     (sin jwt.claim.sub -- estas RPCs no llaman auth.uid()) para las RPCs
--     internas de worker/webhook (claim/start/record_attempt/mark_*/
--     append_event/record_webhook_receipt/mark_webhook_event_processed).
--     El resto del script corre como el superusuario de la conexion
--     (postgres, via docker exec) -- se usa deliberadamente para 2 pruebas
--     de defensa-en-profundidad de los triggers (SECCION 6) que NINGUNA RPC
--     real expone como superficie de usuario (ver nota ahi).
--
-- USO (ejecutar EN LA MAQUINA DEL USUARIO, no desde este puente -- no hay
-- ruta de red desde el sandbox de Claude hacia el Postgres local):
--   docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=0 \
--     < supabase/fixtures/phase8b1_local_runtime_validation.sql \
--     | tee /tmp/phase8b1_runtime_output.txt
--
--   (ON_ERROR_STOP=0 es intencional: algunos statements de la SECCION 1/2
--   son solo de inspeccion y no deben abortar el script si alguna columna
--   difiere; todo comportamiento negativo real ya esta capturado dentro de
--   sus propios DO blocks con EXCEPTION.)
--
--   Alternativa sin docker (psql directo contra el puerto local expuesto
--   por `supabase start`, ver supabase/config.toml [db] port = 54722):
--   psql "postgresql://postgres:postgres@127.0.0.1:54722/postgres" \
--     -v ON_ERROR_STOP=0 \
--     -f supabase/fixtures/phase8b1_local_runtime_validation.sql \
--     | tee /tmp/phase8b1_runtime_output.txt
--
-- EXTRACCION RAPIDA DE RESULTADOS:
--   grep '^RESULT:' /tmp/phase8b1_runtime_output.txt
--   grep '^RESULT:.*FAIL' /tmp/phase8b1_runtime_output.txt   -- debe ser vacio
--
-- DURACION ESPERADA: unos pocos segundos (todo en una sola sesion psql,
-- sin llamadas de red externas -- ningun ChannelPublisherPort/adapter real
-- existe todavia, ver alcance de la migracion).
--
-- SEGURIDAD DE RE-EJECUCION: SI, es repetible -- CORREGIDO tras Run 1
-- (2026-08-27, ver SECCION 3 para el detalle completo del bug original y
-- su fix). org/cliente/integraciones se de-duplican por slug; las 6
-- campanas smoke (una por escenario) se reusan state-aware (crea-o-reusa +
-- aprueba, mismo patron que 8A.1 SECCION 4); la ACTIVATION de cada
-- escenario tambien se reusa state-aware (solo se crea una nueva si la
-- anterior ya es terminal) -- necesario porque los escenarios D/E/manual
-- terminan A PROPOSITO en un status no-terminal permanente (cancelacion
-- de job in_progress nunca transiciona el target -- R-PUB-08; un target
-- manual nunca se toca en este script), asi que sin este reuso una 2a
-- corrida violaria uq_campaign_activations_active_per_campaign otra vez.
-- Los TARGETS/JOBS individuales SIEMPRE se crean nuevos por corrida (cada
-- corrida dispara su propio ciclo de vida fresco, capturado en sus propios
-- ids de p8b1_ids -- las secciones 5-13 solo leen los ids de la corrida
-- actual, nunca "el" target de la activation de forma ambigua).
--
-- LIMITACION RESIDUAL CONOCIDA (no resuelta en esta ronda, documentada):
-- en escenarios D/E/manual, targets NO-terminales de corridas anteriores
-- permanecen en la activation reusada junto al target fresco de la
-- corrida actual. `deriveActivationStatus` prioriza "algun target
-- publishing -> executing" sobre "todos ready -> ready", asi que una
-- activation E reusada con un target viejo atascado en 'publishing'
-- (dejado asi por R-PUB-08) podria derivar a 'executing' ANTES de que el
-- target fresco de esta corrida siquiera exista -- no se ha ejercitado
-- ni verificado este caso de 3ra corrida en adelante. Recomendacion: para
-- una validacion de multiples corridas completamente limpia, resetear la
-- base local (o usar el cleanup + recrear) entre corridas de este
-- fixture; una unica corrida limpia (o incluso una 2a inmediatamente
-- despues) es el caso principal que esta correccion garantiza.
--
-- Las membresias de organization_members "spare" creadas para el role
-- matrix (SECCION 4) se BORRAN al final de la SECCION 8 (limpieza real,
-- dentro del propio script, de datos transitorios que este mismo script
-- creo -- no es el cleanup de smoke data de negocio, ver mas abajo).
--
-- CLEANUP: ver phase8b1_local_runtime_validation_cleanup.sql (entrega el
-- SQL exacto para borrar clientes/organizacion foranea/campana smoke -- NO
-- se ejecuta automaticamente). Las activations/targets/jobs/attempts/events
-- smoke de campaign_publication_* y campaign_activation_* quedan como
-- historico permanente por diseno (mismo criterio documentado que 8A.1):
-- una vez que un target/job sale de su estado inicial, los triggers de
-- integridad (check_activation_target_deletable de 8A.1, y el hecho de que
-- las 4 tablas de 8B.1 NO otorgan DELETE a ningun rol -- SECCION I de la
-- migracion, "TODA escritura pasa por las RPCs SECURITY DEFINER") hacen que
-- borrarlas requiera bypassear proteccion real -- esta tarea EXPLICITAMENTE
-- prohibe deshabilitar triggers/RLS/constraints para simplificar cleanup, y
-- este script honra esa restriccion dejando esas filas como historico
-- documentado en vez de forzar su borrado.
-- =============================================================================

-- =============================================================================
-- SECCION 0 — GUARDA DE ENTORNO LOCAL (identico a 8A.1)
-- =============================================================================
DO $guard$
DECLARE
  v_server_addr inet := inet_server_addr();
  v_database    text := current_database();
  v_org_exists  boolean;
BEGIN
  IF v_server_addr IS NOT NULL
     AND v_server_addr NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
    RAISE EXCEPTION
      'ABORT phase8b1_local_runtime_validation: inet_server_addr()=% no es loopback.',
      v_server_addr;
  END IF;

  IF v_database ILIKE '%prod%' THEN
    RAISE EXCEPTION
      'ABORT phase8b1_local_runtime_validation: current_database()=% parece produccion.',
      v_database;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organizations WHERE name = 'BopAgency Local'
  ) INTO v_org_exists;

  IF NOT v_org_exists THEN
    RAISE EXCEPTION
      'ABORT phase8b1_local_runtime_validation: no existe organizacion '
      '"BopAgency Local". Aborta sin escribir nada.';
  END IF;

  RAISE NOTICE 'RESULT: 0.1 guarda de entorno local = PASS (server_addr=%, database=%)',
    COALESCE(v_server_addr::text, '(socket local)'), v_database;
END;
$guard$;

-- =============================================================================
-- SECCION 0b — Tabla temporal para pasar IDs de fixtures entre bloques DO
-- =============================================================================
CREATE TEMP TABLE IF NOT EXISTS p8b1_ids (key text PRIMARY KEY, value uuid);
GRANT SELECT, INSERT, UPDATE ON p8b1_ids TO authenticated;

CREATE TEMP TABLE IF NOT EXISTS p8b1_meta (key text PRIMARY KEY, value timestamptz);
INSERT INTO p8b1_meta (key, value) VALUES ('run_start', clock_timestamp())
  ON CONFLICT (key) DO NOTHING;

-- Nonce de texto, unico por ejecucion del fixture (no requiere limpieza
-- entre corridas): usado para que external_event_id de webhooks (SECCION
-- 12) sea unico por corrida, evitando falsos "replay" contra filas
-- persistidas por una corrida ANTERIOR (Issue 4, Run 2), mientras se
-- preserva el replay REAL dentro de la misma corrida (12.1 vs 12.2 usan el
-- MISMO nonce -> mismo external_event_id).
CREATE TEMP TABLE IF NOT EXISTS p8b1_meta_text (key text PRIMARY KEY, value text);
INSERT INTO p8b1_meta_text (key, value) VALUES ('run_nonce', gen_random_uuid()::text)
  ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- SECCION 1 — INSPECCION ESTRUCTURAL Y DE RPCs (solo lectura)
-- Mapea: sanity-check estructural previo a los 24 checks funcionales.
-- =============================================================================

\echo '--- 1a. Tablas / columnas ---'
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'campaign_publication_jobs', 'campaign_publication_attempts',
    'campaign_publication_events', 'campaign_publication_webhook_events'
  )
ORDER BY table_name, ordinal_position;

\echo '--- 1b. RLS enabled ---'
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname IN (
  'campaign_publication_jobs', 'campaign_publication_attempts',
  'campaign_publication_events', 'campaign_publication_webhook_events'
) AND relnamespace = 'public'::regnamespace;

\echo '--- 1c. Policies ---'
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'campaign_publication_jobs', 'campaign_publication_attempts',
    'campaign_publication_events', 'campaign_publication_webhook_events'
  )
ORDER BY tablename, cmd;

\echo '--- 1d. Grants tabla-nivel (debe ser: authenticated=SELECT unicamente en 3 de 4; webhook_events sin ningun grant) ---'
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'campaign_publication_jobs', 'campaign_publication_attempts',
    'campaign_publication_events', 'campaign_publication_webhook_events'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

DO $rpc_count$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN (
      'create_publication_job', 'claim_publication_job', 'start_publication_job',
      'record_publication_attempt', 'mark_publication_job_succeeded',
      'mark_publication_job_failed', 'mark_publication_job_unknown_outcome',
      'cancel_publication_job', 'reconcile_publication_job',
      'mark_activation_target_publishing', 'mark_activation_target_failed',
      'append_publication_event', 'record_publication_webhook_receipt',
      'mark_webhook_event_processed', 'prepare_publication_retry'
    );
  -- CORRECCION POST-RETRY-RESET (2026-08-27): 14 -> 15 RPCs. La migracion
  -- 20260828100000_phase8b1_publication_retry_reset.sql agrego
  -- prepare_publication_retry como RPC NUEVA (no un reemplazo de una
  -- existente) -- este inventario estaba desactualizado desde Run 4/5/6/7,
  -- que solo la ejercitaban funcionalmente (SECCION 9/11.9) sin nunca
  -- actualizar este conteo estructural. is_publication_failure_retryable
  -- (helper SQL interno, no una RPC de flujo de usuario) queda
  -- deliberadamente fuera de este inventario, igual que las 7 funciones de
  -- trigger de la migracion original.
  IF v_count = 15 THEN
    RAISE NOTICE 'RESULT: 1.1 las 15 RPCs de 8B.1 existen y compilan = PASS (count=%)', v_count;
  ELSE
    RAISE NOTICE 'RESULT: 1.1 las 15 RPCs de 8B.1 existen y compilan = FAIL (count=%, esperado 15)', v_count;
  END IF;
END;
$rpc_count$;

\echo '--- 1e. EXECUTE grants (debe coincidir con el diseno documentado post-retry-reset: 4 authenticated, 11 service_role) ---'
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'create_publication_job', 'claim_publication_job', 'start_publication_job',
    'record_publication_attempt', 'mark_publication_job_succeeded',
    'mark_publication_job_failed', 'mark_publication_job_unknown_outcome',
    'cancel_publication_job', 'reconcile_publication_job',
    'mark_activation_target_publishing', 'mark_activation_target_failed',
    'append_publication_event', 'record_publication_webhook_receipt',
    'mark_webhook_event_processed', 'prepare_publication_retry'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY routine_name, grantee;

DO $grant_shape$
DECLARE
  v_authenticated_count int;
  v_service_role_count int;
BEGIN
  -- CORRECCION POST-RETRY-RESET (2026-08-27): 3 -> 4 authenticated.
  -- prepare_publication_retry es una RPC de flujo de usuario normal
  -- (strategist+ verificado DENTRO de la funcion, igual que
  -- reconcile_publication_job) -- pertenece a la misma capa que
  -- create_publication_job/cancel_publication_job/reconcile_publication_job,
  -- nunca a service_role. service_role no cambia (11, sin cambio en la
  -- migracion de retry-reset).
  SELECT count(*) INTO v_authenticated_count
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public' AND grantee = 'authenticated'
    AND routine_name IN (
      'create_publication_job', 'cancel_publication_job', 'reconcile_publication_job',
      'prepare_publication_retry'
    );

  SELECT count(*) INTO v_service_role_count
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public' AND grantee = 'service_role'
    AND routine_name IN (
      'claim_publication_job', 'start_publication_job', 'record_publication_attempt',
      'mark_publication_job_succeeded', 'mark_publication_job_failed',
      'mark_publication_job_unknown_outcome', 'mark_activation_target_publishing',
      'mark_activation_target_failed', 'append_publication_event',
      'record_publication_webhook_receipt', 'mark_webhook_event_processed'
    );

  IF v_authenticated_count = 4 AND v_service_role_count = 11 THEN
    RAISE NOTICE 'RESULT: 1.2 capas de autorizacion por RPC (4 authenticated / 11 service_role) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 1.2 capas de autorizacion por RPC (4 authenticated / 11 service_role) = FAIL (authenticated=%, service_role=%, esperado 4/11)',
      v_authenticated_count, v_service_role_count;
  END IF;
END;
$grant_shape$;

-- =============================================================================
-- SECCION 2 — FIXTURES: organizacion/cliente/integraciones locales +
-- organizacion "foranea" (mismo patron que 8A.1 SECCION 3)
-- =============================================================================

DO $fixtures$
DECLARE
  v_org_a_id uuid;
  v_owner_id uuid;
  v_owner_role text;
  v_client_a_id uuid;
  v_integration_a_id uuid;
  v_org_b_id uuid;
  v_client_b_id uuid;
  v_integration_b_id uuid;
BEGIN
  SELECT id INTO v_org_a_id FROM public.organizations WHERE name = 'BopAgency Local';
  IF v_org_a_id IS NULL THEN
    RAISE EXCEPTION 'ABORT: organizacion "BopAgency Local" no encontrada (revalidado).';
  END IF;

  SELECT om.user_id, om.role INTO v_owner_id, v_owner_role
  FROM public.organization_members om
  WHERE om.organization_id = v_org_a_id AND om.role = 'owner'
  ORDER BY om.joined_at ASC LIMIT 1;

  IF v_owner_id IS NULL THEN
    SELECT om.user_id, om.role INTO v_owner_id, v_owner_role
    FROM public.organization_members om
    WHERE om.organization_id = v_org_a_id
    ORDER BY om.joined_at ASC LIMIT 1;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'ABORT: no se encontro ningun miembro de "BopAgency Local".';
  END IF;

  RAISE NOTICE 'RESULT: 2.1 organizacion/actor local resueltos = PASS (org_a=%, owner=%, role=%)',
    v_org_a_id, v_owner_id, v_owner_role;

  -- Cliente A (dedupe por slug)
  SELECT id INTO v_client_a_id FROM public.clients
  WHERE organization_id = v_org_a_id AND slug = 'phase8b1-smoke-client-a';
  IF v_client_a_id IS NULL THEN
    INSERT INTO public.clients (organization_id, name, slug, created_by, metadata)
    VALUES (v_org_a_id, 'Phase8B1 Smoke Client A', 'phase8b1-smoke-client-a', v_owner_id,
            '{"fixture":"phase8b1-local"}'::jsonb)
    RETURNING id INTO v_client_a_id;
  END IF;
  RAISE NOTICE 'RESULT: 2.2 cliente A (org propia) = PASS (client_a=%)', v_client_a_id;

  -- Integracion A (org propia, valida para targets automatizados reales)
  SELECT id INTO v_integration_a_id FROM public.client_integrations
  WHERE organization_id = v_org_a_id AND external_account_id = 'phase8b1-smoke-integration-a';
  IF v_integration_a_id IS NULL THEN
    INSERT INTO public.client_integrations
      (organization_id, client_id, provider, external_account_id, configuration, status)
    VALUES
      (v_org_a_id, v_client_a_id, 'meta', 'phase8b1-smoke-integration-a',
       '{"fixture":"phase8b1-local"}'::jsonb, 'active')
    RETURNING id INTO v_integration_a_id;
  END IF;
  RAISE NOTICE 'RESULT: 2.3 client_integration A (org propia, para targets automatizados) = PASS (integration_a=%)', v_integration_a_id;

  -- Organizacion B "foranea" (dedupe por slug)
  SELECT id INTO v_org_b_id FROM public.organizations WHERE slug = 'phase8b1-smoke-org-b';
  IF v_org_b_id IS NULL THEN
    INSERT INTO public.organizations (name, slug)
    VALUES ('Phase8B1 Smoke Org B', 'phase8b1-smoke-org-b')
    RETURNING id INTO v_org_b_id;
  END IF;
  RAISE NOTICE 'RESULT: 2.4 organizacion B (forania, cross-tenant) = PASS (org_b=%)', v_org_b_id;

  SELECT id INTO v_client_b_id FROM public.clients
  WHERE organization_id = v_org_b_id AND slug = 'phase8b1-smoke-client-b';
  IF v_client_b_id IS NULL THEN
    INSERT INTO public.clients (organization_id, name, slug, created_by, metadata)
    VALUES (v_org_b_id, 'Phase8B1 Smoke Client B', 'phase8b1-smoke-client-b', v_owner_id,
            '{"fixture":"phase8b1-local"}'::jsonb)
    RETURNING id INTO v_client_b_id;
  END IF;
  RAISE NOTICE 'RESULT: 2.5 cliente B (org forania) = PASS (client_b=%)', v_client_b_id;

  SELECT id INTO v_integration_b_id FROM public.client_integrations
  WHERE organization_id = v_org_b_id AND external_account_id = 'phase8b1-smoke-integration-b';
  IF v_integration_b_id IS NULL THEN
    INSERT INTO public.client_integrations
      (organization_id, client_id, provider, external_account_id, configuration, status)
    VALUES
      (v_org_b_id, v_client_b_id, 'meta', 'phase8b1-smoke-integration-b',
       '{"fixture":"phase8b1-local"}'::jsonb, 'active')
    RETURNING id INTO v_integration_b_id;
  END IF;
  RAISE NOTICE 'RESULT: 2.6 client_integration B (org forania, para cross-org test) = PASS (integration_b=%)', v_integration_b_id;

  INSERT INTO p8b1_ids (key, value) VALUES
    ('org_a', v_org_a_id), ('owner', v_owner_id), ('client_a', v_client_a_id),
    ('integration_a', v_integration_a_id),
    ('org_b', v_org_b_id), ('client_b', v_client_b_id), ('integration_b', v_integration_b_id)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END;
$fixtures$;

-- =============================================================================
-- SECCION 3 — 6 CAMPANAS APROBADAS AISLADAS (state-aware, REPETIBLE) + 6
-- ACTIVATIONS frescas (una por escenario) con targets automatizados y manual.
--
-- CORRECCION POST-RUN-1 (2026-08-27): la version original de esta seccion
-- usaba UNA sola campana aprobada compartida y creaba 6 activations sobre
-- ella en la misma corrida. Eso viola `uq_campaign_activations_active_per_campaign`
-- (8A.1 -- como mucho UNA activation NO-terminal por campana), porque
-- ninguna de las 6 activations de escenario llega a estado terminal antes
-- de que se cree la siguiente -- la 2a INSERT (activation "b") siempre
-- fallaba con 23505 duplicate key, y todo el bloque 3.4 se revertia
-- (una unica DO = una unica transaccion implicita), dejando TODOS los ids
-- de activation/target/job en NULL para el resto del script. Root cause
-- 100% de fixture (harness), NO de la migracion -- el constraint hizo
-- exactamente lo que debia (documentado en R-PUB-11 / reporte 8B.1).
--
-- FIX: cada escenario de target/job usa su PROPIA campana aprobada
-- (nombres 'Phase8B1 Smoke Campaign <letra> (<escenario>)') -- asi cada
-- activation es la UNICA no-terminal de SU campana, sin tocar el
-- constraint, y se preserva el diseno original de aislamiento total por
-- escenario (cada activation deriva su status SOLO de sus propios
-- targets, sin contaminacion entre escenarios -- necesario para los
-- checks #21/#22/#23 de auto-transicion).
-- =============================================================================

-- 3.1 helper: crea-o-reusa + aprueba UNA campana por nombre (parametrizado,
-- se llama 6 veces -- una por escenario). Misma logica exacta que la
-- version anterior de 3.1, ahora reutilizable.
CREATE OR REPLACE FUNCTION pg_temp.p8b1_get_or_create_approved_campaign(
  p_name text,
  OUT o_campaign_id uuid,
  OUT o_approval_id uuid
)
RETURNS record
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid;
  v_status public.campaign_status; v_approval_count int;
BEGIN
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8b1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  SELECT id, status INTO o_campaign_id, v_status FROM public.campaigns
    WHERE organization_id = v_org_a AND name = p_name;

  IF o_campaign_id IS NULL THEN
    INSERT INTO public.campaigns (organization_id, client_id, name, objective, platform, budget, status, created_by, updated_by, metadata)
    VALUES (v_org_a, v_client_a, p_name, 'conversions', 'meta_ads', 1000, 'draft', v_owner, v_owner, '{"fixture":"phase8b1-local"}'::jsonb)
    RETURNING id, status INTO o_campaign_id, v_status;
  END IF;

  IF v_status = 'draft' THEN
    UPDATE public.campaigns SET status = 'review', submitted_for_review_at = now(), updated_by = v_owner
      WHERE id = o_campaign_id AND status = 'draft';
    v_status := 'review';
  END IF;

  IF v_status = 'review' THEN
    PERFORM public.approve_campaign(o_campaign_id);
  ELSIF v_status = 'approved' THEN
    NULL; -- reuso.
  ELSE
    RAISE EXCEPTION 'harness: campana "%" (%) en estado inesperado %', p_name, o_campaign_id, v_status;
  END IF;

  SELECT count(*) INTO v_approval_count FROM public.campaign_approvals
    WHERE campaign_id = o_campaign_id AND action = 'approved';
  IF v_approval_count <> 1 THEN
    RAISE EXCEPTION 'harness: se esperaba exactamente 1 campaign_approval "approved" para "%" (encontrados %)', p_name, v_approval_count;
  END IF;
  SELECT id INTO o_approval_id FROM public.campaign_approvals
    WHERE campaign_id = o_campaign_id AND action = 'approved';

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
END;
$fn$;

-- 3.2 helper: crea una activation fresca (pending, sin targets) sobre la
-- campana approved (p_campaign_id/p_approval_id) que el caller ya resolvio
-- con 3.1. Cada escenario pasa SU PROPIA campana -- por eso nunca puede
-- haber 2 activations no-terminales compitiendo por el mismo campaign_id
-- (ver correccion arriba). Se llama una vez por "escenario" de job/target
-- aislado para que cada activation derive su status SOLO en funcion
-- del/los target(s) que le agreguemos (compute_campaign_activation_status
-- de 8A.1 opera por activation, no por campana) -- asi los checks
-- #21/#22/#23 (no auto-transicion INESPERADA) se pueden verificar con
-- precision exacta por escenario.
CREATE OR REPLACE FUNCTION pg_temp.p8b1_new_activation(p_campaign_id uuid, p_approval_id uuid, p_label text)
RETURNS uuid
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid;
  v_activation_id uuid;
BEGIN
  -- REUSO state-aware (correccion post-Run-1, 2026-08-27): algunos
  -- escenarios (D "cancel queued", E "cancel in_progress", "manual
  -- rejected") terminan A PROPOSITO en un status NO-terminal permanente
  -- (ver R-PUB-08: cancelar un job in_progress NUNCA transiciona el
  -- target; un target manual nunca se toca en este script) -- eso es
  -- correcto/esperado, no un bug. Sin este reuso, una 2a corrida de este
  -- fixture violaria uq_campaign_activations_active_per_campaign de la
  -- MISMA forma que el bug original (solo que en la corrida N+1 en vez de
  -- dentro de la misma corrida). Se reusa la activation NO-terminal
  -- existente de esta campana si ya hay una; solo se crea una nueva si no
  -- existe ninguna o si la anterior ya llego a estado terminal.
  SELECT id INTO v_activation_id FROM public.campaign_activations
    WHERE campaign_id = p_campaign_id
      AND status NOT IN ('completed', 'partially_completed', 'failed', 'cancelled')
    LIMIT 1;

  IF v_activation_id IS NOT NULL THEN
    RETURN v_activation_id;
  END IF;

  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8b1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by, metadata)
  VALUES
    (v_org_a, v_client_a, p_campaign_id, p_approval_id,
     jsonb_build_object('schemaVersion', 'activation-snapshot-v1', 'label', p_label),
     v_owner, jsonb_build_object('fixture', 'phase8b1-local', 'label', p_label))
  RETURNING id INTO v_activation_id;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RETURN v_activation_id;
END;
$fn$;

-- 3.3 helper: agrega un target automatizado (meta_ads/meta, integration_a) a
-- una activation y lo lleva de pending -> ready (prepare + mark_ready, RPCs
-- reales de 8A.1) para que create_publication_job lo acepte.
CREATE OR REPLACE FUNCTION pg_temp.p8b1_new_ready_target(p_activation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_integration_a uuid; v_target_id uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8b1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_integration_a FROM p8b1_ids WHERE key = 'integration_a';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activation_targets
    (activation_id, organization_id, client_id, channel, provider, client_integration_id)
  VALUES
    (p_activation_id, v_org_a, v_client_a, 'meta_ads', 'meta', v_integration_a)
  RETURNING id INTO v_target_id;

  PERFORM public.prepare_activation_target(v_target_id, '{"assetsReady":true}'::jsonb);
  PERFORM public.mark_activation_target_ready(v_target_id);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RETURN v_target_id;
END;
$fn$;

-- 3.4 crea las 6 campanas aprobadas (una por escenario) + sus
-- activations/targets de trabajo para el resto del script.
DO $seed_targets$
DECLARE
  v_nonce text;
  v_campaign_a uuid; v_approval_a uuid; v_activation_a uuid; v_target_a uuid;  -- happy path (succeeded)
  v_campaign_b uuid; v_approval_b uuid; v_activation_b uuid; v_target_b uuid;  -- failure + retry
  v_campaign_c uuid; v_approval_c uuid; v_activation_c uuid; v_target_c uuid;  -- unknown_outcome + reconcile
  v_campaign_d uuid; v_approval_d uuid; v_activation_d uuid; v_target_d uuid;  -- role matrix: cancel queued (operator)
  v_campaign_e uuid; v_approval_e uuid; v_activation_e uuid; v_target_e uuid;  -- role matrix: cancel in_progress (operator fail / strategist pass)
  v_campaign_manual uuid; v_approval_manual uuid; v_activation_manual uuid; v_target_manual uuid; -- manual target (rechazo de job)
  v_campaign_f uuid; v_approval_f uuid; v_activation_f uuid; v_target_f uuid;  -- retry state guard (Run 4, SECCION 9.x)
  v_campaign_g uuid; v_approval_g uuid; v_activation_g uuid; v_target_g uuid;  -- cancelled retry guard (Run 5, SECCION 11.9b) -- owner-only, sin operator/strategist
BEGIN
  -- CORRECCION POST-RUN-2 (2026-08-27, Run 3 root cause): antes, los 6
  -- nombres de campana eran literales fijos. p8b1_get_or_create_approved_campaign
  -- resuelve por nombre EXACTO -- asi que una 2a/3a corrida siempre
  -- REUSABA la misma campana/activation de la corrida anterior.
  -- p8b1_new_activation ya era state-aware para la activation (reusa si
  -- sigue no-terminal), pero p8b1_new_ready_target NUNCA fue state-aware
  -- para el TARGET -- siempre hace un INSERT incondicional. Al reusar una
  -- activation cuyo target de escenario anterior segui existiendo (mismo
  -- activation_id + channel='meta_ads' + provider='meta' + placement NULL),
  -- ese INSERT colisionaba con uq_activation_targets_dedupe (23505) --
  -- Run 3 lo confirmo en runtime. Ademas, aunque se resolviera reusando el
  -- target existente, su estado de ciclo de vida ya habia sido mutado por
  -- la corrida anterior (published/failed/etc.) -- reusarlo NO le daria a
  -- esta corrida un ciclo de vida fresco e independiente que probar. Fix
  -- (Opcion A, preferida cuando el estado reusado pudo haber sido mutado):
  -- cada corrida usa un nonce unico (mismo p8b1_meta_text.run_nonce que ya
  -- usa la SECCION 12 de webhooks) incrustado en el nombre de cada una de
  -- las 6 campanas -- la busqueda por nombre exacto de
  -- p8b1_get_or_create_approved_campaign NUNCA encuentra una campana de
  -- una corrida anterior, asi que SIEMPRE crea 6 campanas/approvals/
  -- activations/targets frescos e independientes, sin tocar el invariante
  -- uq_campaign_activations_active_per_campaign ni uq_activation_targets_dedupe,
  -- y sin requerir ninguna limpieza entre corridas.
  SELECT value INTO v_nonce FROM p8b1_meta_text WHERE key = 'run_nonce';

  SELECT o_campaign_id, o_approval_id INTO v_campaign_a, v_approval_a
    FROM pg_temp.p8b1_get_or_create_approved_campaign('Phase8B1 Smoke Campaign A (happy path) [' || v_nonce || ']');
  v_activation_a := pg_temp.p8b1_new_activation(v_campaign_a, v_approval_a, 'target-a-happy-path');
  v_target_a := pg_temp.p8b1_new_ready_target(v_activation_a);

  SELECT o_campaign_id, o_approval_id INTO v_campaign_b, v_approval_b
    FROM pg_temp.p8b1_get_or_create_approved_campaign('Phase8B1 Smoke Campaign B (failure retry) [' || v_nonce || ']');
  v_activation_b := pg_temp.p8b1_new_activation(v_campaign_b, v_approval_b, 'target-b-failure-retry');
  v_target_b := pg_temp.p8b1_new_ready_target(v_activation_b);

  SELECT o_campaign_id, o_approval_id INTO v_campaign_c, v_approval_c
    FROM pg_temp.p8b1_get_or_create_approved_campaign('Phase8B1 Smoke Campaign C (unknown outcome) [' || v_nonce || ']');
  v_activation_c := pg_temp.p8b1_new_activation(v_campaign_c, v_approval_c, 'target-c-unknown-outcome');
  v_target_c := pg_temp.p8b1_new_ready_target(v_activation_c);

  SELECT o_campaign_id, o_approval_id INTO v_campaign_d, v_approval_d
    FROM pg_temp.p8b1_get_or_create_approved_campaign('Phase8B1 Smoke Campaign D (cancel queued) [' || v_nonce || ']');
  v_activation_d := pg_temp.p8b1_new_activation(v_campaign_d, v_approval_d, 'target-d-cancel-queued');
  v_target_d := pg_temp.p8b1_new_ready_target(v_activation_d);

  SELECT o_campaign_id, o_approval_id INTO v_campaign_e, v_approval_e
    FROM pg_temp.p8b1_get_or_create_approved_campaign('Phase8B1 Smoke Campaign E (cancel in progress) [' || v_nonce || ']');
  v_activation_e := pg_temp.p8b1_new_activation(v_campaign_e, v_approval_e, 'target-e-cancel-in-progress');
  v_target_e := pg_temp.p8b1_new_ready_target(v_activation_e);

  SELECT o_campaign_id, o_approval_id INTO v_campaign_manual, v_approval_manual
    FROM pg_temp.p8b1_get_or_create_approved_campaign('Phase8B1 Smoke Campaign Manual (rejected) [' || v_nonce || ']');
  v_activation_manual := pg_temp.p8b1_new_activation(v_campaign_manual, v_approval_manual, 'target-manual-rejected');

  -- Escenario F -- dedicado EXCLUSIVAMENTE a los checks negativos de
  -- prepare_publication_retry (SECCION 9.x, Run 4): un target propio,
  -- aislado de A-E, para poder llevar su job a queued/claimed/in_progress/
  -- unknown_outcome sin interferir con ningun otro escenario.
  SELECT o_campaign_id, o_approval_id INTO v_campaign_f, v_approval_f
    FROM pg_temp.p8b1_get_or_create_approved_campaign('Phase8B1 Smoke Campaign F (retry state guard) [' || v_nonce || ']');
  v_activation_f := pg_temp.p8b1_new_activation(v_campaign_f, v_approval_f, 'target-f-retry-state-guard');
  v_target_f := pg_temp.p8b1_new_ready_target(v_activation_f);

  -- Escenario G -- (Run 5) dedicado EXCLUSIVAMENTE al check "retry
  -- rechazado desde cancelled" (SECCION 11.9b), usando UNICAMENTE el actor
  -- owner (strategist+ por jerarquia de rol) -- NUNCA depende de
  -- operator_user/strategist_user (residual estructural del role matrix
  -- cuando no hay auth.users de sobra). owner puede cancelar un job
  -- queued directamente (cancel_publication_job no exige mas que
  -- operator+ para queued, y owner ya satisface operator+/strategist+ por
  -- la jerarquia has_organization_role), asi que este escenario es
  -- alcanzable en CUALQUIER entorno local, sin importar cuantos auth.users
  -- de sobra existan.
  SELECT o_campaign_id, o_approval_id INTO v_campaign_g, v_approval_g
    FROM pg_temp.p8b1_get_or_create_approved_campaign('Phase8B1 Smoke Campaign G (cancelled retry guard) [' || v_nonce || ']');
  v_activation_g := pg_temp.p8b1_new_activation(v_campaign_g, v_approval_g, 'target-g-cancelled-retry-guard');
  v_target_g := pg_temp.p8b1_new_ready_target(v_activation_g);

  PERFORM set_config('request.jwt.claim.sub', (SELECT value::text FROM p8b1_ids WHERE key = 'owner'), false);
  SET ROLE authenticated;
  INSERT INTO public.campaign_activation_targets
    (activation_id, organization_id, client_id, channel, provider)
  VALUES
    (v_activation_manual, (SELECT value FROM p8b1_ids WHERE key = 'org_a'),
     (SELECT value FROM p8b1_ids WHERE key = 'client_a'), 'manual', 'manual')
  RETURNING id INTO v_target_manual;
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  INSERT INTO p8b1_ids (key, value) VALUES
    ('campaign_a', v_campaign_a),
    ('activation_a', v_activation_a), ('target_a', v_target_a),
    ('activation_b', v_activation_b), ('target_b', v_target_b),
    ('activation_c', v_activation_c), ('target_c', v_target_c),
    ('activation_d', v_activation_d), ('target_d', v_target_d),
    ('activation_e', v_activation_e), ('target_e', v_target_e),
    ('activation_manual', v_activation_manual), ('target_manual', v_target_manual),
    ('activation_f', v_activation_f), ('target_f', v_target_f),
    ('activation_g', v_activation_g), ('target_g', v_target_g)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RAISE NOTICE 'RESULT: 3.4 8 campanas aisladas + activations/targets de trabajo creados (7 automatizados ready + 1 manual pending) = PASS';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 3.4 6 campanas aisladas + activations/targets de trabajo creados = FAIL (%: %)', SQLSTATE, SQLERRM;
END;
$seed_targets$;

-- 3.5 -- GUARDA DE SETUP: si 3.4 no produjo los 12 ids criticos (una
-- activation + un target por cada uno de los 6 escenarios), las SECCIONES
-- 4-13 (~40 checks) dependen todas de esos ids y NO deben ni intentarse --
-- generarian docenas de "FAIL"/"not found (id: NULL)" enganosos que son en
-- realidad cascada de ESTE fallo de setup, no defectos independientes de
-- publication. En vez de eso, se saltan explicitamente con \if de psql
-- (ver el bloque \gset/\if inmediatamente despues de esta seccion).
DO $setup_guard$
DECLARE
  v_present int;
BEGIN
  SELECT count(*) INTO v_present FROM p8b1_ids WHERE key IN (
    'campaign_a',
    'activation_a', 'target_a', 'activation_b', 'target_b',
    'activation_c', 'target_c', 'activation_d', 'target_d',
    'activation_e', 'target_e', 'activation_manual', 'target_manual',
    'activation_f', 'target_f', 'activation_g', 'target_g'
  );
  IF v_present = 17 THEN
    RAISE NOTICE 'RESULT: 3.5 guarda de setup (17/17 ids criticos presentes) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 3.5 guarda de setup = FAIL (%/17 ids criticos presentes -- SECCIONES 4-13 se saltaran, ver 3.1/3.4 para la causa raiz)', v_present;
  END IF;
END;
$setup_guard$;

-- Variable psql (cliente, no servidor) que decide si las SECCIONES 4-13
-- (~40 checks, todos dependientes de los 13 ids de la SECCION 3) se
-- ejecutan. Esto es control de flujo NATIVO de psql (\gset/\if/\endif),
-- deliberado en vez de tocar cada uno de los 43 bloques DO con EXCEPTION
-- de las secciones 4-13: con ON_ERROR_STOP=0 (necesario para que la
-- SECCION 1/2, de solo-inspeccion, no aborte el script entero ante una
-- diferencia de columna) un RAISE EXCEPTION sin capturar dentro de un DO
-- NO detiene el resto del script -- psql simplemente sigue con el
-- siguiente statement. \if es la unica herramienta de este harness que
-- puede saltar un rango completo de statements de forma limpia.
SELECT (
  SELECT count(*) FROM p8b1_ids WHERE key IN (
    'campaign_a',
    'activation_a', 'target_a', 'activation_b', 'target_b',
    'activation_c', 'target_c', 'activation_d', 'target_d',
    'activation_e', 'target_e', 'activation_manual', 'target_manual',
    'activation_f', 'target_f', 'activation_g', 'target_g'
  )
) = 17 AS setup_ok
\gset

\if :setup_ok
-- =============================================================================
-- SECCION 4 — ROLE MATRIX: membresias desechables (viewer/operator/strategist)
-- Mismo patron que 8A.1 SECCION 11.3: reutiliza auth.users existentes que
-- AUN NO son miembros de "BopAgency Local", les crea una membresia
-- DESECHABLE con el rol exacto necesario (NO crea ningun auth.users nuevo).
-- Se limpian en la SECCION 8 (al final del script). Si no hay suficientes
-- auth.users libres, los sub-checks que dependan del rol faltante reportan
-- ESTRUCTURAL (nunca un PASS fabricado) — igual criterio que 8A.1 11.3.
-- =============================================================================

DO $role_matrix_fixtures$
DECLARE
  v_org_a uuid;
  v_spare_ids uuid[];
  v_viewer uuid; v_operator uuid; v_strategist uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';

  SELECT array_agg(u.id ORDER BY u.created_at ASC) INTO v_spare_ids
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_org_a AND om.user_id = u.id
  );

  v_viewer     := v_spare_ids[1];
  v_operator   := v_spare_ids[2];
  v_strategist := v_spare_ids[3];

  IF v_viewer IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org_a, v_viewer, 'viewer')
      ON CONFLICT DO NOTHING;
    INSERT INTO p8b1_ids (key, value) VALUES ('viewer_user', v_viewer) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;
  IF v_operator IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org_a, v_operator, 'operator')
      ON CONFLICT DO NOTHING;
    INSERT INTO p8b1_ids (key, value) VALUES ('operator_user', v_operator) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;
  IF v_strategist IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org_a, v_strategist, 'strategist')
      ON CONFLICT DO NOTHING;
    INSERT INTO p8b1_ids (key, value) VALUES ('strategist_user', v_strategist) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  END IF;

  RAISE NOTICE 'RESULT: 4.1 membresias desechables role matrix (viewer=%, operator=%, strategist=%) = %',
    v_viewer, v_operator, v_strategist,
    CASE WHEN v_viewer IS NOT NULL AND v_operator IS NOT NULL AND v_strategist IS NOT NULL
      THEN 'PASS' ELSE 'ESTRUCTURAL (no runtime: no hay suficientes auth.users libres para los 3 roles -- los sub-checks del rol faltante reportaran ESTRUCTURAL, nunca un PASS fabricado; esta validacion NO crea auth.users nuevos)' END;
END;
$role_matrix_fixtures$;

-- =============================================================================
-- SECCION 5 — CHECKS #1/#2: creacion de job (target automatizado PASS,
-- target manual FAIL)
-- =============================================================================

-- 5.1 (check #1) PASS: create_publication_job sobre target automatizado ready.
DO $job_create_ok$
DECLARE
  v_owner uuid; v_target_a uuid; v_job_id uuid; v_idem text;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  v_job_id := public.create_publication_job(v_target_a, NULL);
  SELECT idempotency_key INTO v_idem FROM public.campaign_publication_jobs WHERE id = v_job_id;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8b1_ids (key, value) VALUES ('job_a1', v_job_id) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  IF v_idem LIKE 'publish:%:%:0' THEN
    RAISE NOTICE 'RESULT: 5.1 [check #1] create_publication_job sobre target automatizado ready = PASS (job=%, idempotency_key=%)', v_job_id, v_idem;
  ELSE
    RAISE NOTICE 'RESULT: 5.1 [check #1] create_publication_job sobre target automatizado ready = FAIL (idempotency_key inesperado: %)', v_idem;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 5.1 [check #1] create_publication_job sobre target automatizado ready = FAIL (error inesperado: %)', SQLERRM;
END;
$job_create_ok$;

-- 5.2 (check #2) FAIL esperado: create_publication_job sobre target manual.
DO $job_create_manual_rejected$
DECLARE
  v_owner uuid; v_target_manual uuid;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_manual FROM p8b1_ids WHERE key = 'target_manual';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  PERFORM public.create_publication_job(v_target_manual, NULL);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 5.2 [check #2] create_publication_job sobre target manual = FAIL (se permitio, defecto real)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is manual, does not use publication jobs' THEN
    RAISE NOTICE 'RESULT: 5.2 [check #2] create_publication_job sobre target manual = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 5.2 [check #2] create_publication_job sobre target manual = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$job_create_manual_rejected$;

-- =============================================================================
-- SECCION 6 — CHECKS #5/#6/#7/#8/#9: tenencia + enums cerrados a nivel de
-- INSERT directo en campaign_publication_jobs.
--
-- NOTA IMPORTANTE (por que se usa el superusuario de la conexion, NO
-- `SET ROLE authenticated`, para esta seccion): `create_publication_job` es
-- la UNICA via de escritura expuesta a `authenticated`, y su firma es
-- `(p_target_id uuid, p_retry_of_job_id uuid)` -- NO recibe organization_id/
-- client_id/channel/provider/client_integration_id como parametros en
-- absoluto: todos se LEEN del target real (SELECT ... INTO). Por diseno,
-- ningun usuario final puede pasarle a esta RPC un organization_id/
-- client_id/channel/provider distinto al del target -- la superficie para
-- un mismatch simplemente no existe en el camino normal. Los triggers
-- check_publication_job_target_match (organization_id/client_id/channel/
-- provider/client_integration_id) y los tipos ENUM de las columnas channel/
-- provider son, por tanto, defensa en profundidad para un futuro escritor
-- distinto (o un bug en la propia RPC) -- exactamente como documenta la
-- migracion (SECCION F, comentario "verificado por trigger ... nunca
-- confiado al caller"). Para verificar que esa defensa en profundidad
-- REALMENTE funciona (no solo que el camino feliz nunca la alcanza), estos
-- checks hacen INSERT directo contra la tabla como el propio superusuario
-- de la sesion psql (postgres via docker exec) -- el mismo rol bajo el cual
-- corre TODO el resto de este script salvo cuando se hace SET ROLE
-- explicito. authenticated no tiene NINGUN grant de INSERT sobre esta tabla
-- (SECCION I de la migracion) asi que un intento equivalente bajo
-- `SET ROLE authenticated` fallaria antes con "permission denied for
-- table", nunca llegaria al trigger -- probarlo asi no verificaria el
-- trigger en si.
-- =============================================================================

-- 6.1 (check #5) FAIL esperado: organization_id != el del target real.
DO $tenant_fail_org$
DECLARE
  v_target_a uuid; v_org_a uuid; v_org_b uuid; v_client_a uuid; v_activation_a uuid;
  v_owner uuid; v_channel public.activation_channel; v_provider public.activation_provider;
  v_integration_a uuid;
BEGIN
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_org_b FROM p8b1_ids WHERE key = 'org_b';
  SELECT value INTO v_client_a FROM p8b1_ids WHERE key = 'client_a';
  SELECT value INTO v_activation_a FROM p8b1_ids WHERE key = 'activation_a';
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_integration_a FROM p8b1_ids WHERE key = 'integration_a';

  INSERT INTO public.campaign_publication_jobs
    (organization_id, client_id, activation_id, target_id, channel, provider,
     client_integration_id, idempotency_key, created_by)
  VALUES
    (v_org_b, v_client_a, v_activation_a, v_target_a, 'meta_ads', 'meta',
     v_integration_a, 'phase8b1-smoke-tenant-fail-org', v_owner);

  RAISE NOTICE 'RESULT: 6.1 [check #5] organization_id != target real = FAIL (¡se creo sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ~* 'organization_id mismatch' THEN
    RAISE NOTICE 'RESULT: 6.1 [check #5] organization_id != target real (cross-org) = PASS (rechazado por trigger: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 6.1 [check #5] organization_id != target real (cross-org) = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$tenant_fail_org$;

-- 6.2 (check #6) FAIL esperado: client_id de otra organizacion.
DO $tenant_fail_client$
DECLARE
  v_target_a uuid; v_org_a uuid; v_client_b uuid; v_activation_a uuid;
  v_owner uuid; v_integration_a uuid;
BEGIN
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_b FROM p8b1_ids WHERE key = 'client_b';
  SELECT value INTO v_activation_a FROM p8b1_ids WHERE key = 'activation_a';
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_integration_a FROM p8b1_ids WHERE key = 'integration_a';

  INSERT INTO public.campaign_publication_jobs
    (organization_id, client_id, activation_id, target_id, channel, provider,
     client_integration_id, idempotency_key, created_by)
  VALUES
    (v_org_a, v_client_b, v_activation_a, v_target_a, 'meta_ads', 'meta',
     v_integration_a, 'phase8b1-smoke-tenant-fail-client', v_owner);

  RAISE NOTICE 'RESULT: 6.2 [check #6] client_id de otra organizacion (cross-client) = FAIL (¡se creo sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ~* 'client_id mismatch' THEN
    RAISE NOTICE 'RESULT: 6.2 [check #6] client_id de otra organizacion (cross-client) = PASS (rechazado por trigger: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 6.2 [check #6] client_id de otra organizacion (cross-client) = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$tenant_fail_client$;

-- 6.3 (check #7) FAIL esperado: client_integration_id de otra organizacion
-- (integration_b) puesto en un job que por lo demas referencia correctamente
-- a target_a (organization_id/client_id/activation_id/channel/provider
-- reales). NOTA: la validacion "primaria" de integraciones cross-org ya
-- existe en 8A.1 (trigger sobre campaign_activation_targets, R-ACT-04,
-- verificado en phase8a1_local_runtime_validation.sql 6.5) -- create_publication_job
-- ni siquiera acepta client_integration_id como parametro (lo hereda del
-- target ya validado). Este check prueba la capa ADICIONAL que SI es nueva
-- de 8B.1: el trigger check_publication_job_target_match tambien exige que
-- client_integration_id del JOB coincida exactamente con el del target
-- padre -- defensa en profundidad para un futuro escritor que intentara
-- fijar un client_integration_id distinto al del target real.
DO $invalid_integration_ref$
DECLARE
  v_target_a uuid; v_org_a uuid; v_client_a uuid; v_activation_a uuid;
  v_owner uuid; v_integration_b uuid;
BEGIN
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8b1_ids WHERE key = 'client_a';
  SELECT value INTO v_activation_a FROM p8b1_ids WHERE key = 'activation_a';
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_integration_b FROM p8b1_ids WHERE key = 'integration_b';

  INSERT INTO public.campaign_publication_jobs
    (organization_id, client_id, activation_id, target_id, channel, provider,
     client_integration_id, idempotency_key, created_by)
  VALUES
    (v_org_a, v_client_a, v_activation_a, v_target_a, 'meta_ads', 'meta',
     v_integration_b, 'phase8b1-smoke-invalid-integration', v_owner);

  RAISE NOTICE 'RESULT: 6.3 [check #7] client_integration_id no coincide con el del target (foraneo) = FAIL (¡se creo sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ~* 'client_integration_id mismatch' THEN
    RAISE NOTICE 'RESULT: 6.3 [check #7] client_integration_id no coincide con el del target (foraneo) = PASS (rechazado por trigger: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 6.3 [check #7] client_integration_id no coincide con el del target (foraneo) = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$invalid_integration_ref$;

-- 6.4 (check #8) FAIL esperado: provider arbitrario/invalido (fuera del
-- ENUM cerrado public.activation_provider).
DO $invalid_provider$
DECLARE
  v_target_a uuid; v_org_a uuid; v_client_a uuid; v_activation_a uuid;
  v_owner uuid; v_integration_a uuid;
BEGIN
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8b1_ids WHERE key = 'client_a';
  SELECT value INTO v_activation_a FROM p8b1_ids WHERE key = 'activation_a';
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_integration_a FROM p8b1_ids WHERE key = 'integration_a';

  EXECUTE format(
    'INSERT INTO public.campaign_publication_jobs
       (organization_id, client_id, activation_id, target_id, channel, provider,
        client_integration_id, idempotency_key, created_by)
     VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L)',
    v_org_a, v_client_a, v_activation_a, v_target_a, 'meta_ads', 'not_a_real_provider',
    v_integration_a, 'phase8b1-smoke-invalid-provider', v_owner
  );

  RAISE NOTICE 'RESULT: 6.4 [check #8] provider arbitrario/invalido = FAIL (¡se creo sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = '22P02' OR SQLERRM ~* 'invalid input value for enum' THEN
    RAISE NOTICE 'RESULT: 6.4 [check #8] provider arbitrario/invalido (enum cerrado) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 6.4 [check #8] provider arbitrario/invalido (enum cerrado) = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$invalid_provider$;

-- 6.5 (check #9) FAIL esperado: channel arbitrario/invalido (fuera del ENUM
-- cerrado public.activation_channel).
DO $invalid_channel$
DECLARE
  v_target_a uuid; v_org_a uuid; v_client_a uuid; v_activation_a uuid;
  v_owner uuid; v_integration_a uuid;
BEGIN
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8b1_ids WHERE key = 'client_a';
  SELECT value INTO v_activation_a FROM p8b1_ids WHERE key = 'activation_a';
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_integration_a FROM p8b1_ids WHERE key = 'integration_a';

  EXECUTE format(
    'INSERT INTO public.campaign_publication_jobs
       (organization_id, client_id, activation_id, target_id, channel, provider,
        client_integration_id, idempotency_key, created_by)
     VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L)',
    v_org_a, v_client_a, v_activation_a, v_target_a, 'not_a_real_channel', 'meta',
    v_integration_a, 'phase8b1-smoke-invalid-channel', v_owner
  );

  RAISE NOTICE 'RESULT: 6.5 [check #9] channel arbitrario/invalido = FAIL (¡se creo sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = '22P02' OR SQLERRM ~* 'invalid input value for enum' THEN
    RAISE NOTICE 'RESULT: 6.5 [check #9] channel arbitrario/invalido (enum cerrado) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 6.5 [check #9] channel arbitrario/invalido (enum cerrado) = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$invalid_channel$;

-- =============================================================================
-- SECCION 7 — CHECKS #3/#4: idempotencia / un job no-terminal por target.
-- Reutiliza job_a1 (queued, target_a) de la SECCION 5.
-- =============================================================================

-- 7.1 (checks #3 y #4) FAIL esperado: segundo job sobre el MISMO target
-- mientras el primero sigue no-terminal (misma via, create_publication_job —
-- cubre a la vez "duplicado mientras hay uno activo" y "un job no-terminal
-- por target").
DO $duplicate_active_job$
DECLARE
  v_owner uuid; v_target_a uuid;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  PERFORM public.create_publication_job(v_target_a, NULL);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 7.1 [checks #3/#4] segundo job sobre target con uno activo = FAIL (¡se creo sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'already has an active publication job' THEN
    RAISE NOTICE 'RESULT: 7.1 [checks #3/#4] segundo job sobre target con uno activo = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 7.1 [checks #3/#4] segundo job sobre target con uno activo = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$duplicate_active_job$;

-- 7.2 (check #3, nivel indice) FAIL esperado: el propio indice unico parcial
-- uq_publication_jobs_active_per_target rechaza un INSERT directo duplicado
-- incluso si se bypasea el guard explicito de la RPC (defensa en
-- profundidad — mismo criterio que 8A.1 SECCION 7 sobre indices parciales).
DO $duplicate_active_job_index$
DECLARE
  v_target_a uuid; v_org_a uuid; v_client_a uuid; v_activation_a uuid;
  v_owner uuid; v_integration_a uuid;
BEGIN
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8b1_ids WHERE key = 'client_a';
  SELECT value INTO v_activation_a FROM p8b1_ids WHERE key = 'activation_a';
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_integration_a FROM p8b1_ids WHERE key = 'integration_a';

  -- Insert directo (superusuario) con un idempotency_key DISTINTO al de
  -- job_a1 -- si solo la RPC protegiera esto (y no el indice), este INSERT
  -- pasaria. target_id repetido con status no-terminal debe violar el
  -- indice parcial igual.
  INSERT INTO public.campaign_publication_jobs
    (organization_id, client_id, activation_id, target_id, channel, provider,
     client_integration_id, idempotency_key, created_by)
  VALUES
    (v_org_a, v_client_a, v_activation_a, v_target_a, 'meta_ads', 'meta',
     v_integration_a, 'phase8b1-smoke-duplicate-index-bypass', v_owner);

  RAISE NOTICE 'RESULT: 7.2 [check #3, indice] INSERT directo duplicado sobre target activo = FAIL (¡se creo sin error, DEFECTO — el indice parcial no esta protegiendo!)';
EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = '23505' THEN
    RAISE NOTICE 'RESULT: 7.2 [check #3, indice] INSERT directo duplicado sobre target activo = PASS (rechazado por uq_publication_jobs_active_per_target: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 7.2 [check #3, indice] INSERT directo duplicado sobre target activo = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$duplicate_active_job_index$;

-- =============================================================================
-- SECCION 8 — CICLO DE VIDA COMPLETO (checks #10/#12/#13/#14/#15/#17/#21/#22/#23)
-- Avanza job_a1 (target_a) por el camino feliz completo:
-- queued -> claimed -> in_progress -> succeeded, con 2 attempts (para
-- probar numeracion/unicidad, check #17) y verifica en cada paso que
-- campaign.status/activation.status se comporten EXACTAMENTE como dicta
-- compute_campaign_activation_status() de 8A.1 (checks #21/#22/#23).
-- =============================================================================

-- 8.1 (check #10) FAIL esperado: ninguna RPC "authenticated" acepta actor
-- via parametro — sin auth.uid() (jwt.claim.sub vacio), create_publication_job
-- debe rechazar. (Inspeccion de firma complementaria: create_publication_job/
-- cancel_publication_job/reconcile_publication_job NO declaran ningun
-- parametro p_actor_id/p_user_id — confirmado por lectura de la SECCION G de
-- la migracion; auth.uid() se lee internamente y jamas se acepta del
-- caller.)
DO $no_actor_spoof$
DECLARE
  v_target_a uuid;
BEGIN
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_d'; -- target aun sin job activo

  PERFORM set_config('request.jwt.claim.sub', '', false); -- sin actor
  SET ROLE authenticated;

  PERFORM public.create_publication_job(v_target_a, NULL);

  RESET ROLE;
  RAISE NOTICE 'RESULT: 8.1 [check #10] create_publication_job sin auth.uid() = FAIL (¡se permitio, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF SQLERRM ~* 'authentication required' THEN
    RAISE NOTICE 'RESULT: 8.1 [check #10] create_publication_job sin auth.uid() (actor no puede ser spoofeado -- se deriva de auth.uid(), ninguna RPC lo acepta como parametro) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 8.1 [check #10] create_publication_job sin auth.uid() = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$no_actor_spoof$;

-- 8.2 (check #22 parcial) estado inicial: activation_a debe estar en
-- 'preparing' o 'ready' (target_a esta 'ready', unico target) antes de
-- arrancar el job -- snapshot de referencia.
DO $activation_a_pre$
DECLARE
  v_activation_a uuid; v_status public.activation_status;
BEGIN
  SELECT value INTO v_activation_a FROM p8b1_ids WHERE key = 'activation_a';
  SELECT status INTO v_status FROM public.campaign_activations WHERE id = v_activation_a;
  RAISE NOTICE 'RESULT: 8.2 [check #22, snapshot] activation_a.status antes de start_publication_job = % (informativo, no PASS/FAIL)', v_status;
END;
$activation_a_pre$;

-- 8.3 (check #12 paso 1) claim_publication_job (queued -> claimed), service_role.
DO $claim_ok$
DECLARE
  v_job uuid; v_status public.publication_job_status;
BEGIN
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_a1';

  SET ROLE service_role;
  PERFORM public.claim_publication_job(v_job, 'phase8b1-smoke-worker-1');
  RESET ROLE;
  SELECT status INTO v_status FROM public.campaign_publication_jobs WHERE id = v_job;

  IF v_status = 'claimed' THEN
    RAISE NOTICE 'RESULT: 8.3 [check #12, paso 1/4] claim_publication_job queued->claimed = PASS (status=%)', v_status;
  ELSE
    RAISE NOTICE 'RESULT: 8.3 [check #12, paso 1/4] claim_publication_job queued->claimed = FAIL (status=%)', v_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'RESULT: 8.3 [check #12, paso 1/4] claim_publication_job queued->claimed = FAIL (error inesperado: %)', SQLERRM;
END;
$claim_ok$;

-- 8.4 (check #12 paso 2 + #22) start_publication_job (claimed -> in_progress);
-- verifica ATOMICAMENTE que target_a -> publishing Y que activation_a se
-- derive a 'executing' (compute_campaign_activation_status linea "IF
-- v_publishing > 0 THEN RETURN 'executing'").
DO $start_ok$
DECLARE
  v_job uuid; v_target_a uuid; v_activation_a uuid; v_campaign uuid;
  v_job_status public.publication_job_status;
  v_target_status public.activation_target_status;
  v_activation_status public.activation_status;
  v_campaign_status public.campaign_status;
BEGIN
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_a1';
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';
  SELECT value INTO v_activation_a FROM p8b1_ids WHERE key = 'activation_a';
  SELECT value INTO v_campaign FROM p8b1_ids WHERE key = 'campaign_a';

  SET ROLE service_role;
  PERFORM public.start_publication_job(v_job, 15);
  RESET ROLE;
  SELECT status INTO v_job_status FROM public.campaign_publication_jobs WHERE id = v_job;
  SELECT status INTO v_target_status FROM public.campaign_activation_targets WHERE id = v_target_a;

  SELECT status INTO v_activation_status FROM public.campaign_activations WHERE id = v_activation_a;
  SELECT status INTO v_campaign_status FROM public.campaigns WHERE id = v_campaign;

  IF v_job_status = 'in_progress' AND v_target_status = 'publishing' THEN
    RAISE NOTICE 'RESULT: 8.4a [check #12, paso 2/4] start_publication_job claimed->in_progress + target ready->publishing (misma tx) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 8.4a [check #12, paso 2/4] start_publication_job claimed->in_progress + target ready->publishing (misma tx) = FAIL (job=%, target=%)', v_job_status, v_target_status;
  END IF;

  IF v_activation_status = 'executing' THEN
    RAISE NOTICE 'RESULT: 8.4b [check #22] activation.status derivado a executing (target publishing, invariante 8A.1) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 8.4b [check #22] activation.status derivado a executing (target publishing, invariante 8A.1) = FAIL (status=%, esperado executing)', v_activation_status;
  END IF;

  IF v_campaign_status = 'approved' THEN
    RAISE NOTICE 'RESULT: 8.4c [check #21] campaign.status permanece approved (sin auto-transicion) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 8.4c [check #21] campaign.status permanece approved (sin auto-transicion) = FAIL (status=%)', v_campaign_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'RESULT: 8.4 [check #12, paso 2/4] start_publication_job = FAIL (error inesperado: %)', SQLERRM;
END;
$start_ok$;

-- 8.5 (check #17) record_publication_attempt x2 en el mismo job: verifica
-- attempt_number secuencial (1, luego 2) y que un idempotency_key duplicado
-- DENTRO del mismo job sea rechazado (uq_publication_attempts_job_idempotency).
DO $attempts_numbering$
DECLARE
  v_job uuid; v_attempt1 uuid; v_attempt2 uuid;
  v_num1 int; v_num2 int;
BEGIN
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_a1';

  SET ROLE service_role;
  v_attempt1 := public.record_publication_attempt(v_job, 'phase8b1-smoke-attempt-1');
  RESET ROLE;
  SELECT attempt_number INTO v_num1 FROM public.campaign_publication_attempts WHERE id = v_attempt1;

  -- Duplicado del MISMO idempotency_key dentro del mismo job -> debe rechazarse.
  BEGIN
    SET ROLE service_role;
    PERFORM public.record_publication_attempt(v_job, 'phase8b1-smoke-attempt-1');
    RESET ROLE;
    RAISE NOTICE 'RESULT: 8.5a [check #17] idempotency_key duplicado dentro del mismo job = FAIL (¡se creo sin error, defecto real!)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    IF SQLSTATE = '23505' THEN
      RAISE NOTICE 'RESULT: 8.5a [check #17] idempotency_key duplicado dentro del mismo job (uq_publication_attempts_job_idempotency) = PASS (rechazado: %)', SQLERRM;
    ELSE
      RAISE NOTICE 'RESULT: 8.5a [check #17] idempotency_key duplicado dentro del mismo job = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
    END IF;
  END;

  -- Segundo attempt REAL (idempotency_key distinto) -> attempt_number debe
  -- avanzar a 2 (nunca reusar 1).
  SET ROLE service_role;
  v_attempt2 := public.record_publication_attempt(v_job, 'phase8b1-smoke-attempt-2');
  RESET ROLE;
  SELECT attempt_number INTO v_num2 FROM public.campaign_publication_attempts WHERE id = v_attempt2;

  INSERT INTO p8b1_ids (key, value) VALUES ('attempt_a1', v_attempt1), ('attempt_a2', v_attempt2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  IF v_num1 = 1 AND v_num2 = 2 THEN
    RAISE NOTICE 'RESULT: 8.5b [check #17] attempt_number secuencial (1, luego 2) sin reuso = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 8.5b [check #17] attempt_number secuencial (1, luego 2) sin reuso = FAIL (num1=%, num2=%)', v_num1, v_num2;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'RESULT: 8.5 [check #17] attempts numbering = FAIL (error inesperado: %)', SQLERRM;
END;
$attempts_numbering$;

-- 8.6 (check #12 paso 3 + #22/#23) mark_publication_job_succeeded
-- (in_progress -> succeeded); target publishing -> published; activation ->
-- completed (unico target, published, sin failed).
DO $succeed_ok$
DECLARE
  v_job uuid; v_attempt2 uuid; v_target_a uuid; v_activation_a uuid;
  v_job_status public.publication_job_status;
  v_target_status public.activation_target_status;
  v_activation_status public.activation_status;
BEGIN
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_a1';
  SELECT value INTO v_attempt2 FROM p8b1_ids WHERE key = 'attempt_a2';
  SELECT value INTO v_target_a FROM p8b1_ids WHERE key = 'target_a';
  SELECT value INTO v_activation_a FROM p8b1_ids WHERE key = 'activation_a';

  SET ROLE service_role;
  PERFORM public.mark_publication_job_succeeded(v_job, v_attempt2, 'phase8b1-smoke-external-id', 'https://example.invalid/ad/1', 'ACTIVE');
  RESET ROLE;
  SELECT status INTO v_job_status FROM public.campaign_publication_jobs WHERE id = v_job;
  SELECT status INTO v_target_status FROM public.campaign_activation_targets WHERE id = v_target_a;

  SELECT status INTO v_activation_status FROM public.campaign_activations WHERE id = v_activation_a;

  IF v_job_status = 'succeeded' AND v_target_status = 'published' THEN
    RAISE NOTICE 'RESULT: 8.6a [check #12, paso 3/4 -- estado terminal] mark_publication_job_succeeded in_progress->succeeded + target publishing->published = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 8.6a [check #12, paso 3/4] mark_publication_job_succeeded = FAIL (job=%, target=%)', v_job_status, v_target_status;
  END IF;

  IF v_activation_status = 'completed' THEN
    RAISE NOTICE 'RESULT: 8.6b [check #22] activation.status derivado a completed (target published, invariante 8A.1) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 8.6b [check #22] activation.status derivado a completed (target published, invariante 8A.1) = FAIL (status=%)', v_activation_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'RESULT: 8.6 [check #12] mark_publication_job_succeeded = FAIL (error inesperado: %)', SQLERRM;
END;
$succeed_ok$;

-- 8.7 (check #15) FAIL esperado x2: job succeeded (terminal) no puede
-- resucitarse -- ni via cancel_publication_job (rol authenticated) ni via
-- mark_publication_job_succeeded de nuevo (rol service_role).
DO $terminal_guard_cancel$
DECLARE
  v_owner uuid; v_job uuid; v_job_status public.publication_job_status;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_a1';

  SELECT status INTO v_job_status FROM public.campaign_publication_jobs WHERE id = v_job;
  IF v_job_status IS DISTINCT FROM 'succeeded' THEN
    RAISE NOTICE 'RESULT: 8.7a [check #15] cancel_publication_job sobre job succeeded (terminal) = SKIPPED (job_a1.status=% -- no llego a succeeded en esta corrida, la asercion terminal-state requiere ese prerequisito; ver 8.3/8.4/8.5/8.6 para el estado real de la cadena)', v_job_status;
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  PERFORM public.cancel_publication_job(v_job, 'intento sobre job terminal');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 8.7a [check #15] cancel_publication_job sobre job succeeded (terminal) = FAIL (¡se permitio, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is already terminal' THEN
    RAISE NOTICE 'RESULT: 8.7a [check #15] cancel_publication_job sobre job succeeded (terminal) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 8.7a [check #15] cancel_publication_job sobre job succeeded (terminal) = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$terminal_guard_cancel$;

DO $terminal_guard_resurrect$
DECLARE
  v_job uuid; v_attempt2 uuid; v_job_status public.publication_job_status;
BEGIN
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_a1';
  SELECT value INTO v_attempt2 FROM p8b1_ids WHERE key = 'attempt_a2';

  SELECT status INTO v_job_status FROM public.campaign_publication_jobs WHERE id = v_job;
  IF v_job_status IS DISTINCT FROM 'succeeded' THEN
    RAISE NOTICE 'RESULT: 8.7b [check #15] mark_publication_job_succeeded de nuevo sobre job ya succeeded (terminal) = SKIPPED (job_a1.status=% -- no llego a succeeded en esta corrida, no hay resurreccion que probar todavia)', v_job_status;
    RETURN;
  END IF;

  SET ROLE service_role;
  PERFORM public.mark_publication_job_succeeded(v_job, v_attempt2, 'phase8b1-smoke-external-id-2');
  RESET ROLE;

  RAISE NOTICE 'RESULT: 8.7b [check #15] mark_publication_job_succeeded de nuevo sobre job ya succeeded (terminal) = FAIL (¡se permitio, DEFECTO CRITICO — resurreccion de job terminal!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF SQLERRM ~* 'is not in_progress' THEN
    RAISE NOTICE 'RESULT: 8.7b [check #15] mark_publication_job_succeeded de nuevo sobre job ya succeeded (terminal) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 8.7b [check #15] mark_publication_job_succeeded de nuevo sobre job ya succeeded (terminal) = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$terminal_guard_resurrect$;

-- 8.8 (check #18) append-only real de campaign_publication_events: UPDATE y
-- DELETE directos denegados incluso al superusuario de tabla-owner? NO -- el
-- superusuario (postgres, dueno de la tabla) SIEMPRE puede bypassear un
-- GRANT REVOKE, pero los triggers trg_publication_events_no_update/
-- no_delete disparan para CUALQUIER rol, incluido el dueno de la tabla
-- (los triggers no distinguen por rol) -- por eso "no update/delete real"
-- se prueba aqui igual que 8A.1 probo su equivalente: como el superusuario
-- de la sesion, confiando en el TRIGGER (no en el GRANT) para el rechazo.
DO $events_append_only$
DECLARE
  v_any_event_id uuid;
BEGIN
  SELECT id INTO v_any_event_id FROM public.campaign_publication_events
  WHERE job_id = (SELECT value FROM p8b1_ids WHERE key = 'job_a1')
  LIMIT 1;

  -- Guarda dura: sin una fila REAL, un UPDATE ... WHERE id = NULL afecta 0
  -- filas y el trigger FOR EACH ROW nunca dispara -- eso se reportaria como
  -- "se permitio, DEFECTO" de forma FALSA (no probo nada). Nunca reportar
  -- PASS/FAIL sin haber intentado mutar una fila real.
  IF v_any_event_id IS NULL THEN
    RAISE NOTICE 'RESULT: 8.8a [check #18] UPDATE directo sobre campaign_publication_events = SKIPPED (no hay ninguna fila de evento para job_a1 -- dependencia de SECCION 3/8 no satisfecha, no se intento ningun UPDATE real)';
    RETURN;
  END IF;

  UPDATE public.campaign_publication_events SET note = 'tampered' WHERE id = v_any_event_id;

  RAISE NOTICE 'RESULT: 8.8a [check #18] UPDATE directo sobre campaign_publication_events = FAIL (¡se permitio, DEFECTO — el trigger append-only no esta protegiendo!)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ~* 'append-only, direct UPDATE/DELETE not allowed' THEN
    RAISE NOTICE 'RESULT: 8.8a [check #18] UPDATE directo sobre campaign_publication_events = PASS (rechazado por trigger: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 8.8a [check #18] UPDATE directo sobre campaign_publication_events = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$events_append_only$;

DO $events_append_only_delete$
DECLARE
  v_any_event_id uuid;
BEGIN
  SELECT id INTO v_any_event_id FROM public.campaign_publication_events
  WHERE job_id = (SELECT value FROM p8b1_ids WHERE key = 'job_a1')
  LIMIT 1;

  IF v_any_event_id IS NULL THEN
    RAISE NOTICE 'RESULT: 8.8b [check #18] DELETE directo sobre campaign_publication_events = SKIPPED (no hay ninguna fila de evento para job_a1 -- dependencia de SECCION 3/8 no satisfecha, no se intento ningun DELETE real)';
    RETURN;
  END IF;

  DELETE FROM public.campaign_publication_events WHERE id = v_any_event_id;

  RAISE NOTICE 'RESULT: 8.8b [check #18] DELETE directo sobre campaign_publication_events = FAIL (¡se permitio, DEFECTO — el trigger append-only no esta protegiendo!)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ~* 'append-only, direct UPDATE/DELETE not allowed' THEN
    RAISE NOTICE 'RESULT: 8.8b [check #18] DELETE directo sobre campaign_publication_events = PASS (rechazado por trigger: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 8.8b [check #18] DELETE directo sobre campaign_publication_events = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$events_append_only_delete$;

-- 8.9 (check #18, attempts) mismo criterio, sobre campaign_publication_attempts.
DO $attempts_append_only$
DECLARE
  v_attempt1 uuid;
BEGIN
  SELECT value INTO v_attempt1 FROM p8b1_ids WHERE key = 'attempt_a1';

  IF v_attempt1 IS NULL THEN
    RAISE NOTICE 'RESULT: 8.9 [check #18, attempts] UPDATE directo sobre campaign_publication_attempts = SKIPPED (no hay ningun attempt_a1 -- dependencia de SECCION 3/8 no satisfecha, no se intento ningun UPDATE real)';
    RETURN;
  END IF;

  UPDATE public.campaign_publication_attempts SET provider_status = 'tampered' WHERE id = v_attempt1;

  RAISE NOTICE 'RESULT: 8.9 [check #18, attempts] UPDATE directo sobre campaign_publication_attempts = FAIL (¡se permitio, DEFECTO!)';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM ~* 'append-only, direct UPDATE/DELETE not allowed' THEN
    RAISE NOTICE 'RESULT: 8.9 [check #18, attempts] UPDATE directo sobre campaign_publication_attempts = PASS (rechazado por trigger: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 8.9 [check #18, attempts] UPDATE directo sobre campaign_publication_attempts = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$attempts_append_only$;

-- =============================================================================
-- SECCION 9 — CHECKS #13/#16: camino de fallo + retry chain (target_b).
-- =============================================================================

-- 9.1 (check #13) camino de fallo completo: queued -> claimed -> in_progress
-- -> failed; target publishing -> failed; activation -> failed (unico
-- target, sin published).
DO $failure_path$
DECLARE
  v_owner uuid; v_target_b uuid; v_activation_b uuid; v_job uuid; v_attempt uuid;
  v_job_status public.publication_job_status;
  v_target_status public.activation_target_status;
  v_activation_status public.activation_status;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_b FROM p8b1_ids WHERE key = 'target_b';
  SELECT value INTO v_activation_b FROM p8b1_ids WHERE key = 'activation_b';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  v_job := public.create_publication_job(v_target_b, NULL);
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  SET ROLE service_role;
  PERFORM public.claim_publication_job(v_job, 'phase8b1-smoke-worker-2');
  PERFORM public.start_publication_job(v_job, 15);
  v_attempt := public.record_publication_attempt(v_job, 'phase8b1-smoke-attempt-b1');
  PERFORM public.mark_publication_job_failed(v_job, 'DISPATCH_FAILED', v_attempt, 'ERR_DISPATCH', 'Phase8B1 smoke: fallo simulado retryable');
  RESET ROLE;
  SELECT status INTO v_job_status FROM public.campaign_publication_jobs WHERE id = v_job;
  SELECT status INTO v_target_status FROM public.campaign_activation_targets WHERE id = v_target_b;

  SELECT status INTO v_activation_status FROM public.campaign_activations WHERE id = v_activation_b;

  INSERT INTO p8b1_ids (key, value) VALUES ('job_b1', v_job) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  IF v_job_status = 'failed' AND v_target_status = 'failed' THEN
    RAISE NOTICE 'RESULT: 9.1a [check #13] camino de fallo in_progress->failed + target publishing->failed = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 9.1a [check #13] camino de fallo = FAIL (job=%, target=%)', v_job_status, v_target_status;
  END IF;

  IF v_activation_status = 'failed' THEN
    RAISE NOTICE 'RESULT: 9.1b [check #22] activation.status derivado a failed (target failed, invariante 8A.1) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 9.1b [check #22] activation.status derivado a failed = FAIL (status=%)', v_activation_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 9.1 [check #13] camino de fallo = FAIL (error inesperado: %)', SQLERRM;
END;
$failure_path$;

-- 9.2 (check #16) create_publication_job(target_b, retry_of_job_id=job_b1)
-- SIN pasar primero por prepare_publication_retry: debe seguir rechazado
-- -- confirma que el guard `v_target_status IN ('ready','scheduled')` de
-- create_publication_job NO cambio de comportamiento (Run 4 / 20260828100000
-- solo agrega una via NUEVA para llegar a 'ready', nunca debilita este
-- guard existente).
DO $retry_precondition_still_blocked$
DECLARE
  v_owner uuid; v_target_b uuid; v_job_b1 uuid;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_b FROM p8b1_ids WHERE key = 'target_b';
  SELECT value INTO v_job_b1 FROM p8b1_ids WHERE key = 'job_b1';

  IF v_job_b1 IS NULL THEN
    RAISE NOTICE 'RESULT: 9.2 [check #16] create_publication_job(retry_of_job_id) sin reset previo = SKIPPED (no hay job_b1 -- camino de fallo de SECCION 9.1 no lo produjo, dependencia no satisfecha)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  PERFORM public.create_publication_job(v_target_b, v_job_b1);
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 9.2 [check #16] create_publication_job(retry_of_job_id) sin prepare_publication_retry previo = FAIL (¡se permitio sin resetear el target, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is not ready/scheduled' THEN
    RAISE NOTICE 'RESULT: 9.2 [check #16] create_publication_job(retry_of_job_id) sin reset previo = PASS (rechazado, guard de target status intacto: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 9.2 [check #16] create_publication_job(retry_of_job_id) sin reset previo = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$retry_precondition_still_blocked$;

-- 9.3 (check #16, Run 4) prepare_publication_retry exige strategist+ --
-- operator (rol asignado exactamente 'operator' en SECCION 4) debe ser
-- rechazado. ESTRUCTURAL si no hay operator_user disponible (sin auth.users
-- de sobra) -- mismo criterio que el resto del role matrix, nunca se
-- fabrica un PASS.
DO $retry_prepare_requires_strategist$
DECLARE
  v_operator uuid; v_job_b1 uuid;
BEGIN
  SELECT value INTO v_operator FROM p8b1_ids WHERE key = 'operator_user';
  SELECT value INTO v_job_b1 FROM p8b1_ids WHERE key = 'job_b1';

  IF v_operator IS NULL THEN
    RAISE NOTICE 'RESULT: 9.3 [check #16] operator NO puede preparar un retry (prepare_publication_retry) = ESTRUCTURAL (no runtime: no hay un auth.users libre para asignarle el rol "operator" -- ver 4.1. No se fabrica un PASS.)';
    RETURN;
  END IF;
  IF v_job_b1 IS NULL THEN
    RAISE NOTICE 'RESULT: 9.3 [check #16] operator NO puede preparar un retry = SKIPPED (no hay job_b1 -- dependencia de SECCION 9.1 no satisfecha)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_operator::text, false);
  SET ROLE authenticated;
  PERFORM public.prepare_publication_retry(v_job_b1, 'intento de operator, deberia rechazarse');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 9.3 [check #16] operator NO puede preparar un retry = FAIL (¡se permitio, defecto real -- requiere strategist+!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'lacks strategist\+ role' THEN
    RAISE NOTICE 'RESULT: 9.3 [check #16] operator NO puede preparar un retry (piso strategist+) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 9.3 [check #16] operator NO puede preparar un retry = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$retry_prepare_requires_strategist$;

-- 9.4 (check #16, Run 4) prepare_publication_retry como strategist+ (owner):
-- target_b vuelve failed -> ready, se limpian failed_at/failure_code/
-- failure_message, y se registra el evento retry_prepared SOBRE job_b1
-- (que permanece failed -- nunca se muta).
DO $retry_prepare_ok$
DECLARE
  v_owner uuid; v_job_b1 uuid; v_target_b uuid;
  v_returned_target uuid;
  v_target_status public.activation_target_status;
  v_failed_at timestamptz; v_failure_code text; v_failure_message text;
  v_job_status_before public.publication_job_status; v_job_status_after public.publication_job_status;
  v_failure_cat_before text; v_failure_cat_after text;
  v_event_count int;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_job_b1 FROM p8b1_ids WHERE key = 'job_b1';
  SELECT value INTO v_target_b FROM p8b1_ids WHERE key = 'target_b';

  IF v_job_b1 IS NULL THEN
    RAISE NOTICE 'RESULT: 9.4 [check #16] prepare_publication_retry (strategist+) = SKIPPED (no hay job_b1 -- dependencia de SECCION 9.1 no satisfecha)';
    RETURN;
  END IF;

  SELECT status, failure_category INTO v_job_status_before, v_failure_cat_before
  FROM public.campaign_publication_jobs WHERE id = v_job_b1;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  v_returned_target := public.prepare_publication_retry(v_job_b1, 'Phase8B1 smoke: fallo transitorio (DISPATCH_FAILED), autorizado a reintentar');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  SELECT status, failed_at, failure_code, failure_message
    INTO v_target_status, v_failed_at, v_failure_code, v_failure_message
  FROM public.campaign_activation_targets WHERE id = v_target_b;

  SELECT status, failure_category INTO v_job_status_after, v_failure_cat_after
  FROM public.campaign_publication_jobs WHERE id = v_job_b1;

  SELECT count(*) INTO v_event_count FROM public.campaign_publication_events
  WHERE job_id = v_job_b1 AND event_type = 'retry_prepared';

  IF v_returned_target = v_target_b AND v_target_status = 'ready'
     AND v_failed_at IS NULL AND v_failure_code IS NULL AND v_failure_message IS NULL THEN
    RAISE NOTICE 'RESULT: 9.4a [check #16] prepare_publication_retry resetea target_b failed->ready y limpia diagnostico de fallo = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 9.4a [check #16] prepare_publication_retry = FAIL (target=%, returned=%, failed_at=%, failure_code=%, failure_message=%)',
      v_target_status, v_returned_target, v_failed_at, v_failure_code, v_failure_message;
  END IF;

  IF v_job_status_before = 'failed' AND v_job_status_after = 'failed'
     AND v_failure_cat_before IS NOT DISTINCT FROM v_failure_cat_after THEN
    RAISE NOTICE 'RESULT: 9.4b [check #16] job_b1 (historico) permanece INMUTABLE tras prepare_publication_retry (status/failure_category sin cambio) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 9.4b [check #16] job_b1 debio permanecer inmutable = FAIL (antes: status=%, cat=% -- despues: status=%, cat=%)',
      v_job_status_before, v_failure_cat_before, v_job_status_after, v_failure_cat_after;
  END IF;

  IF v_event_count = 1 THEN
    RAISE NOTICE 'RESULT: 9.4c [check #16] evento retry_prepared registrado sobre job_b1 (auditoria, no autoridad) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 9.4c [check #16] evento retry_prepared = FAIL (count=%, esperado 1)', v_event_count;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 9.4 [check #16] prepare_publication_retry (strategist+) = FAIL (error inesperado: %)', SQLERRM;
END;
$retry_prepare_ok$;

-- 9.5 (check #16) create_publication_job(target_b, retry_of_job_id=job_b1)
-- AHORA SI debe crear un job NUEVO (retry_count=1), sin reabrir job_b1.
DO $retry_job_created$
DECLARE
  v_owner uuid; v_target_b uuid; v_job_b1 uuid; v_job_b2 uuid;
  v_job_b2_retry_of uuid; v_job_b2_retry_count int; v_job_b2_status public.publication_job_status;
  v_job_b1_status public.publication_job_status;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_b FROM p8b1_ids WHERE key = 'target_b';
  SELECT value INTO v_job_b1 FROM p8b1_ids WHERE key = 'job_b1';

  IF v_job_b1 IS NULL THEN
    RAISE NOTICE 'RESULT: 9.5 [check #16] create_publication_job(retry_of_job_id) tras reset = SKIPPED (no hay job_b1 -- dependencia no satisfecha)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  v_job_b2 := public.create_publication_job(v_target_b, v_job_b1);
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  INSERT INTO p8b1_ids (key, value) VALUES ('job_b2', v_job_b2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  SELECT retry_of_job_id, retry_count, status INTO v_job_b2_retry_of, v_job_b2_retry_count, v_job_b2_status
  FROM public.campaign_publication_jobs WHERE id = v_job_b2;

  SELECT status INTO v_job_b1_status FROM public.campaign_publication_jobs WHERE id = v_job_b1;

  IF v_job_b2 IS DISTINCT FROM v_job_b1 AND v_job_b2_retry_of = v_job_b1
     AND v_job_b2_retry_count = 1 AND v_job_b2_status = 'queued' THEN
    RAISE NOTICE 'RESULT: 9.5a [check #16] retry crea un job NUEVO (job_b2=%, retry_of_job_id=job_b1, retry_count=1, status=queued) = PASS', v_job_b2;
  ELSE
    RAISE NOTICE 'RESULT: 9.5a [check #16] retry job creation = FAIL (job_b2=%, retry_of=%, retry_count=%, status=%)',
      v_job_b2, v_job_b2_retry_of, v_job_b2_retry_count, v_job_b2_status;
  END IF;

  IF v_job_b1_status = 'failed' THEN
    RAISE NOTICE 'RESULT: 9.5b [check #16] job_b1 (original) permanece failed -- NUNCA se reabre = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 9.5b [check #16] job_b1 no debio cambiar de status = FAIL (status=%)', v_job_b1_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 9.5 [check #16] create_publication_job(retry_of_job_id) tras reset = FAIL (error inesperado: %)', SQLERRM;
END;
$retry_job_created$;

-- 9.6 (check #16) duplicado bloqueado: con job_b2 ya activo (queued) sobre
-- target_b, un segundo prepare_publication_retry(job_b1) debe rechazarse.
DO $retry_duplicate_blocked$
DECLARE
  v_owner uuid; v_job_b1 uuid; v_job_b2 uuid;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_job_b1 FROM p8b1_ids WHERE key = 'job_b1';
  SELECT value INTO v_job_b2 FROM p8b1_ids WHERE key = 'job_b2';

  IF v_job_b1 IS NULL OR v_job_b2 IS NULL THEN
    RAISE NOTICE 'RESULT: 9.6 [check #16] retry duplicado bloqueado = SKIPPED (falta job_b1/job_b2 -- dependencia de 9.1/9.5 no satisfecha)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  PERFORM public.prepare_publication_retry(v_job_b1, 'segundo intento, deberia rechazarse');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 9.6 [check #16] retry duplicado (target_b ya tiene job_b2 activo) = FAIL (¡se permitio, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'already has an active publication job' THEN
    RAISE NOTICE 'RESULT: 9.6 [check #16] retry duplicado bloqueado (target_b ya tiene job_b2 activo) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 9.6 [check #16] retry duplicado = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$retry_duplicate_blocked$;

-- 9.7 (check #16) prepare_publication_retry NUNCA aplica desde queued/
-- claimed/in_progress/unknown_outcome -- usa target_f (escenario dedicado,
-- SECCION 3) para poder llevar su propio job por cada uno de esos estados
-- sin interferir con ningun otro escenario.
DO $retry_invalid_states_f$
DECLARE
  v_owner uuid; v_target_f uuid; v_job_f uuid; v_attempt_f uuid;
  v_rejected_queued boolean := false;
  v_rejected_claimed boolean := false;
  v_rejected_in_progress boolean := false;
  v_rejected_unknown_outcome boolean := false;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_f FROM p8b1_ids WHERE key = 'target_f';

  IF v_target_f IS NULL THEN
    RAISE NOTICE 'RESULT: 9.7 [check #16] prepare_publication_retry rechazado desde queued/claimed/in_progress/unknown_outcome = SKIPPED (no hay target_f -- SECCION 3 no lo produjo)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  v_job_f := public.create_publication_job(v_target_f, NULL);
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8b1_ids (key, value) VALUES ('job_f1', v_job_f) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  -- Estado 1: queued.
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
    SET ROLE authenticated;
    PERFORM public.prepare_publication_retry(v_job_f, 'intento sobre job queued, deberia rechazarse');
    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
    IF SQLERRM ~* 'is not failed' THEN v_rejected_queued := true; END IF;
  END;

  SET ROLE service_role;
  PERFORM public.claim_publication_job(v_job_f, 'phase8b1-smoke-worker-retry-f');
  RESET ROLE;

  -- Estado 2: claimed.
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
    SET ROLE authenticated;
    PERFORM public.prepare_publication_retry(v_job_f, 'intento sobre job claimed, deberia rechazarse');
    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
    IF SQLERRM ~* 'is not failed' THEN v_rejected_claimed := true; END IF;
  END;

  SET ROLE service_role;
  PERFORM public.start_publication_job(v_job_f, 15);
  RESET ROLE;

  -- Estado 3: in_progress.
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
    SET ROLE authenticated;
    PERFORM public.prepare_publication_retry(v_job_f, 'intento sobre job in_progress, deberia rechazarse');
    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
    IF SQLERRM ~* 'is not failed' THEN v_rejected_in_progress := true; END IF;
  END;

  SET ROLE service_role;
  v_attempt_f := public.record_publication_attempt(v_job_f, 'phase8b1-smoke-attempt-f1');
  PERFORM public.mark_publication_job_unknown_outcome(v_job_f, v_attempt_f, 'Phase8B1 smoke: timeout sin confirmacion (escenario F)');
  RESET ROLE;

  -- Estado 4: unknown_outcome (NUNCA retry directo, exige reconciliar primero).
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
    SET ROLE authenticated;
    PERFORM public.prepare_publication_retry(v_job_f, 'intento sobre job unknown_outcome, deberia rechazarse');
    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
    IF SQLERRM ~* 'is not failed' THEN v_rejected_unknown_outcome := true; END IF;
  END;

  IF v_rejected_queued AND v_rejected_claimed AND v_rejected_in_progress AND v_rejected_unknown_outcome THEN
    RAISE NOTICE 'RESULT: 9.7 [check #16] prepare_publication_retry rechazado desde queued/claimed/in_progress/unknown_outcome (job_f1) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 9.7 [check #16] prepare_publication_retry desde estados invalidos = FAIL (queued=%, claimed=%, in_progress=%, unknown_outcome=%)',
      v_rejected_queued, v_rejected_claimed, v_rejected_in_progress, v_rejected_unknown_outcome;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 9.7 [check #16] setup/checks de estados invalidos (job_f1) = FAIL (error inesperado: %)', SQLERRM;
END;
$retry_invalid_states_f$;

-- =============================================================================
-- SECCION 10 — CHECK #14: unknown_outcome (target_c) — distinto de failed,
-- blind retry/reopen rechazado, reconciliacion solo via RPC dedicada.
-- =============================================================================

DO $unknown_outcome_setup$
DECLARE
  v_owner uuid; v_target_c uuid; v_job uuid; v_attempt uuid;
  v_job_status public.publication_job_status;
  v_target_status public.activation_target_status;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_c FROM p8b1_ids WHERE key = 'target_c';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  v_job := public.create_publication_job(v_target_c, NULL);
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  SET ROLE service_role;
  PERFORM public.claim_publication_job(v_job, 'phase8b1-smoke-worker-3');
  PERFORM public.start_publication_job(v_job, 15);
  v_attempt := public.record_publication_attempt(v_job, 'phase8b1-smoke-attempt-c1');
  PERFORM public.mark_publication_job_unknown_outcome(v_job, v_attempt, 'Phase8B1 smoke: timeout sin confirmacion');
  RESET ROLE;
  SELECT status INTO v_job_status FROM public.campaign_publication_jobs WHERE id = v_job;
  SELECT status INTO v_target_status FROM public.campaign_activation_targets WHERE id = v_target_c;

  INSERT INTO p8b1_ids (key, value) VALUES ('job_c1', v_job), ('attempt_c1', v_attempt)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  IF v_job_status = 'unknown_outcome' AND v_target_status = 'publishing' THEN
    RAISE NOTICE 'RESULT: 10.1 [check #14] mark_publication_job_unknown_outcome in_progress->unknown_outcome (NO terminal), target permanece publishing = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 10.1 [check #14] mark_publication_job_unknown_outcome = FAIL (job=%, target=%, se esperaba unknown_outcome/publishing)', v_job_status, v_target_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 10.1 [check #14] setup unknown_outcome = FAIL (error inesperado: %)', SQLERRM;
END;
$unknown_outcome_setup$;

-- 10.2 (check #14) FAIL esperado: cancel_publication_job sobre un job
-- unknown_outcome debe rechazarse ("blind reopen" via cancel bloqueado).
DO $unknown_outcome_no_cancel$
DECLARE
  v_owner uuid; v_job uuid;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_c1';

  IF v_job IS NULL THEN
    RAISE NOTICE 'RESULT: 10.2 [check #14] cancel_publication_job sobre unknown_outcome = SKIPPED (no hay job_c1 -- setup de SECCION 10.1 no lo produjo, dependencia no satisfecha)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  PERFORM public.cancel_publication_job(v_job, 'intento de cancelar unknown_outcome');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 10.2 [check #14] cancel_publication_job sobre unknown_outcome = FAIL (¡se permitio, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'must be reconciled before any further action' THEN
    RAISE NOTICE 'RESULT: 10.2 [check #14] cancel_publication_job sobre unknown_outcome (blind reopen bloqueado) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 10.2 [check #14] cancel_publication_job sobre unknown_outcome = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$unknown_outcome_no_cancel$;

-- 10.3 (check #14) FAIL esperado: mark_publication_job_failed directo (blind
-- retry/reopen vía una RPC de worker) sobre un job unknown_outcome — solo
-- reconcile_publication_job puede sacarlo de este estado.
DO $unknown_outcome_no_direct_fail$
DECLARE
  v_job uuid;
BEGIN
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_c1';

  IF v_job IS NULL THEN
    RAISE NOTICE 'RESULT: 10.3 [check #14] mark_publication_job_failed directo sobre unknown_outcome = SKIPPED (no hay job_c1 -- setup de SECCION 10.1 no lo produjo, dependencia no satisfecha)';
    RETURN;
  END IF;

  SET ROLE service_role;
  PERFORM public.mark_publication_job_failed(v_job, 'PROVIDER_REJECTED', NULL, NULL, 'intento directo, deberia rechazarse');
  RESET ROLE;

  RAISE NOTICE 'RESULT: 10.3 [check #14] mark_publication_job_failed directo sobre unknown_outcome = FAIL (¡se permitio, DEFECTO CRITICO — unknown_outcome se puede reinterpretar sin reconcile!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF SQLERRM ~* 'is not in_progress' THEN
    RAISE NOTICE 'RESULT: 10.3 [check #14] mark_publication_job_failed directo sobre unknown_outcome = PASS (rechazado, unica via de salida es reconcile_publication_job: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 10.3 [check #14] mark_publication_job_failed directo sobre unknown_outcome = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$unknown_outcome_no_direct_fail$;

-- =============================================================================
-- SECCION 11 — CHECK #11: ROLE MATRIX completo.
-- Usa las membresias desechables de la SECCION 4 (viewer_user/operator_user/
-- strategist_user). Cualquier sub-check cuyo rol no exista reporta
-- ESTRUCTURAL explicito (nunca un PASS fabricado), igual criterio que 8A.1
-- 11.3.
-- =============================================================================

-- Helper de reporte para "rol no disponible".
CREATE OR REPLACE FUNCTION pg_temp.p8b1_role_missing(p_label text, p_role text) RETURNS void
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE NOTICE 'RESULT: % = ESTRUCTURAL (no runtime: no hay un auth.users libre para asignarle el rol "%" -- ver 4.1. No se fabrica un PASS.)', p_label, p_role;
END;
$fn$;

-- 11.1 [check #11] viewer NO puede crear un job (create_publication_job).
DO $role_viewer_cannot_create$
DECLARE
  v_viewer uuid; v_target_d uuid;
BEGIN
  SELECT value INTO v_viewer FROM p8b1_ids WHERE key = 'viewer_user';
  IF v_viewer IS NULL THEN PERFORM pg_temp.p8b1_role_missing('11.1 [check #11] viewer no puede crear job', 'viewer'); RETURN; END IF;

  SELECT value INTO v_target_d FROM p8b1_ids WHERE key = 'target_d';

  PERFORM set_config('request.jwt.claim.sub', v_viewer::text, false);
  SET ROLE authenticated;
  PERFORM public.create_publication_job(v_target_d, NULL);
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 11.1 [check #11] viewer no puede crear job = FAIL (¡se permitio, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'lacks operator\+ role' THEN
    RAISE NOTICE 'RESULT: 11.1 [check #11] viewer no puede crear job (viewer no puede mutar) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 11.1 [check #11] viewer no puede crear job = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$role_viewer_cannot_create$;

-- 11.2 [check #11] operator SI puede crear un job -- job_d1 (queued) sobre target_d.
DO $role_operator_can_create$
DECLARE
  v_operator uuid; v_target_d uuid; v_job uuid;
BEGIN
  SELECT value INTO v_operator FROM p8b1_ids WHERE key = 'operator_user';
  IF v_operator IS NULL THEN PERFORM pg_temp.p8b1_role_missing('11.2 [check #11] operator puede crear job', 'operator'); RETURN; END IF;

  SELECT value INTO v_target_d FROM p8b1_ids WHERE key = 'target_d';

  PERFORM set_config('request.jwt.claim.sub', v_operator::text, false);
  SET ROLE authenticated;
  v_job := public.create_publication_job(v_target_d, NULL);
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  INSERT INTO p8b1_ids (key, value) VALUES ('job_d1', v_job) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  RAISE NOTICE 'RESULT: 11.2 [check #11] operator puede crear job (create_publication_job, operator+) = PASS (job=%)', v_job;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 11.2 [check #11] operator puede crear job = FAIL (error inesperado: %)', SQLERRM;
END;
$role_operator_can_create$;

-- 11.3 [check #11] operator SI puede cancelar job_d1 mientras esta queued.
DO $role_operator_can_cancel_queued$
DECLARE
  v_operator uuid; v_job uuid; v_status public.publication_job_status;
BEGIN
  SELECT value INTO v_operator FROM p8b1_ids WHERE key = 'operator_user';
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_d1';
  IF v_operator IS NULL OR v_job IS NULL THEN PERFORM pg_temp.p8b1_role_missing('11.3 [check #11] operator puede cancelar job queued', 'operator'); RETURN; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_operator::text, false);
  SET ROLE authenticated;
  PERFORM public.cancel_publication_job(v_job, 'Phase8B1 smoke: cancelacion por operator, job queued');
  SELECT status INTO v_status FROM public.campaign_publication_jobs WHERE id = v_job;
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  IF v_status = 'cancelled' THEN
    RAISE NOTICE 'RESULT: 11.3 [check #11] operator puede cancelar job queued/claimed (cancel_publication_job, operator+) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 11.3 [check #11] operator puede cancelar job queued = FAIL (status=%, esperado cancelled)', v_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 11.3 [check #11] operator puede cancelar job queued = FAIL (error inesperado: %)', SQLERRM;
END;
$role_operator_can_cancel_queued$;

-- 11.4/11.5 setup: job_e1 (target_e) hasta in_progress, para los sub-checks
-- de cancelacion cooperativa in_progress.
DO $role_matrix_in_progress_setup$
DECLARE
  v_owner uuid; v_target_e uuid; v_job uuid;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_e FROM p8b1_ids WHERE key = 'target_e';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  v_job := public.create_publication_job(v_target_e, NULL);
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  SET ROLE service_role;
  PERFORM public.claim_publication_job(v_job, 'phase8b1-smoke-worker-4');
  PERFORM public.start_publication_job(v_job, 15);
  RESET ROLE;

  INSERT INTO p8b1_ids (key, value) VALUES ('job_e1', v_job) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  RAISE NOTICE 'RESULT: 11.4 setup job_e1 in_progress (para role matrix cancel cooperativo) = PASS (job=%)', v_job;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 11.4 setup job_e1 in_progress = FAIL (error inesperado: %)', SQLERRM;
END;
$role_matrix_in_progress_setup$;

-- 11.5 [check #11] operator NO puede cancelar un job in_progress (requiere strategist+).
DO $role_operator_cannot_cancel_in_progress$
DECLARE
  v_operator uuid; v_job uuid; v_status_before public.publication_job_status;
BEGIN
  SELECT value INTO v_operator FROM p8b1_ids WHERE key = 'operator_user';
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_e1';
  IF v_operator IS NULL OR v_job IS NULL THEN PERFORM pg_temp.p8b1_role_missing('11.5 [check #11] operator NO puede cancelar job in_progress', 'operator'); RETURN; END IF;

  SELECT status INTO v_status_before FROM public.campaign_publication_jobs WHERE id = v_job;

  PERFORM set_config('request.jwt.claim.sub', v_operator::text, false);
  SET ROLE authenticated;
  PERFORM public.cancel_publication_job(v_job, 'intento de operator sobre job in_progress');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 11.5 [check #11] operator NO puede cancelar job in_progress = FAIL (¡se permitio, defecto real -- requiere strategist+!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'lacks strategist\+ role to cancel an in_progress job' THEN
    RAISE NOTICE 'RESULT: 11.5 [check #11] operator NO puede cancelar job in_progress (piso de rol correcto, status no cambio: %) = PASS (rechazado: %)', v_status_before, SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 11.5 [check #11] operator NO puede cancelar job in_progress = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$role_operator_cannot_cancel_in_progress$;

-- 11.6 [check #11] strategist+ SI puede cancelar (cooperativo) un job in_progress.
DO $role_strategist_can_cancel_in_progress$
DECLARE
  v_strategist uuid; v_job uuid; v_status public.publication_job_status; v_requested_by uuid;
BEGIN
  SELECT value INTO v_strategist FROM p8b1_ids WHERE key = 'strategist_user';
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_e1';
  IF v_strategist IS NULL OR v_job IS NULL THEN PERFORM pg_temp.p8b1_role_missing('11.6 [check #11] strategist puede cancelar (cooperativo) job in_progress', 'strategist'); RETURN; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_strategist::text, false);
  SET ROLE authenticated;
  PERFORM public.cancel_publication_job(v_job, 'Phase8B1 smoke: cancelacion cooperativa por strategist, job in_progress');
  SELECT status, cancellation_requested_by INTO v_status, v_requested_by FROM public.campaign_publication_jobs WHERE id = v_job;
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  IF v_status = 'in_progress' AND v_requested_by = v_strategist THEN
    RAISE NOTICE 'RESULT: 11.6 [check #11] strategist+ puede cancelar (cooperativo, NO transiciona status) job in_progress = PASS (status permanece %, cancellation_requested_by=%)', v_status, v_requested_by;
  ELSE
    RAISE NOTICE 'RESULT: 11.6 [check #11] strategist+ cancela job in_progress = FAIL (status=%, requested_by=%)', v_status, v_requested_by;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 11.6 [check #11] strategist+ cancela job in_progress = FAIL (error inesperado: %)', SQLERRM;
END;
$role_strategist_can_cancel_in_progress$;

-- 11.7 [check #11] operator NO puede reconciliar un job unknown_outcome (job_c1).
DO $role_operator_cannot_reconcile$
DECLARE
  v_operator uuid; v_job uuid;
BEGIN
  SELECT value INTO v_operator FROM p8b1_ids WHERE key = 'operator_user';
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_c1';
  IF v_operator IS NULL THEN PERFORM pg_temp.p8b1_role_missing('11.7 [check #11] operator NO puede reconciliar unknown_outcome', 'operator'); RETURN; END IF;
  IF v_job IS NULL THEN
    RAISE NOTICE 'RESULT: 11.7 [check #11] operator NO puede reconciliar unknown_outcome = SKIPPED (no hay job_c1 -- setup de SECCION 10.1 no lo produjo, dependencia no satisfecha)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_operator::text, false);
  SET ROLE authenticated;
  PERFORM public.reconcile_publication_job(v_job, 'not_published', 'intento de operator, deberia rechazarse');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 11.7 [check #11] operator NO puede reconciliar unknown_outcome = FAIL (¡se permitio, defecto real -- requiere strategist+!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'lacks strategist\+ role' THEN
    RAISE NOTICE 'RESULT: 11.7 [check #11] operator NO puede reconciliar unknown_outcome (accion mas sensible del diseno, piso strategist+) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 11.7 [check #11] operator NO puede reconciliar unknown_outcome = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$role_operator_cannot_reconcile$;

-- 11.8 [check #11 + #14] strategist+ SI puede reconciliar job_c1
-- (unknown_outcome -> failed via outcome=not_published, elegible para retry).
-- Verifica ademas que activation_c derive a 'failed' (target -> failed).
DO $role_strategist_can_reconcile$
DECLARE
  v_strategist uuid; v_job uuid; v_target_c uuid; v_activation_c uuid;
  v_job_status public.publication_job_status; v_failure_cat text;
  v_target_status public.activation_target_status;
  v_activation_status public.activation_status;
BEGIN
  SELECT value INTO v_strategist FROM p8b1_ids WHERE key = 'strategist_user';
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_c1';
  SELECT value INTO v_target_c FROM p8b1_ids WHERE key = 'target_c';
  SELECT value INTO v_activation_c FROM p8b1_ids WHERE key = 'activation_c';
  IF v_strategist IS NULL THEN PERFORM pg_temp.p8b1_role_missing('11.8 [check #11/#14] strategist reconcilia unknown_outcome', 'strategist'); RETURN; END IF;
  IF v_job IS NULL THEN
    RAISE NOTICE 'RESULT: 11.8 [check #11/#14] strategist+ reconcilia unknown_outcome = SKIPPED (no hay job_c1 -- setup de SECCION 10.1 no lo produjo, dependencia no satisfecha)';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_strategist::text, false);
  SET ROLE authenticated;
  PERFORM public.reconcile_publication_job(v_job, 'not_published', 'Phase8B1 smoke: reconciliado como no publicado');
  SELECT status, failure_category INTO v_job_status, v_failure_cat FROM public.campaign_publication_jobs WHERE id = v_job;
  SELECT status INTO v_target_status FROM public.campaign_activation_targets WHERE id = v_target_c;
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  SELECT status INTO v_activation_status FROM public.campaign_activations WHERE id = v_activation_c;

  IF v_job_status = 'failed' AND v_failure_cat = 'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED' AND v_target_status = 'failed' THEN
    RAISE NOTICE 'RESULT: 11.8a [check #11/#14] strategist+ reconcilia unknown_outcome->failed (UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED, elegible para retry) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 11.8a [check #11/#14] strategist+ reconcilia unknown_outcome = FAIL (job=%, cat=%, target=%)', v_job_status, v_failure_cat, v_target_status;
  END IF;

  IF v_activation_status = 'failed' THEN
    RAISE NOTICE 'RESULT: 11.8b [check #22] activation_c derivado a failed tras reconciliacion = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 11.8b [check #22] activation_c derivado a failed tras reconciliacion = FAIL (status=%)', v_activation_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 11.8 [check #11/#14] strategist+ reconcilia unknown_outcome = FAIL (error inesperado: %)', SQLERRM;
END;
$role_strategist_can_reconcile$;

-- =============================================================================
-- SECCION 11.9 — CHECK #16 (Run 4): prepare_publication_retry NUNCA aplica
-- desde succeeded/cancelled (los 2 estados terminales restantes que 9.7 no
-- pudo cubrir con target_f -- job_a1 llega a succeeded en SECCION 8,
-- job_d1 llega a cancelled en 11.3, ninguno existe todavia cuando corre la
-- SECCION 9, por eso se verifican aqui).
-- =============================================================================

DO $retry_invalid_from_succeeded$
DECLARE
  v_owner uuid; v_job_a1 uuid; v_status public.publication_job_status;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_job_a1 FROM p8b1_ids WHERE key = 'job_a1';

  IF v_job_a1 IS NULL THEN
    RAISE NOTICE 'RESULT: 11.9a [check #16] prepare_publication_retry rechazado desde succeeded = SKIPPED (no hay job_a1 -- dependencia de SECCION 8 no satisfecha)';
    RETURN;
  END IF;

  SELECT status INTO v_status FROM public.campaign_publication_jobs WHERE id = v_job_a1;
  IF v_status <> 'succeeded' THEN
    RAISE NOTICE 'RESULT: 11.9a [check #16] prepare_publication_retry rechazado desde succeeded = SKIPPED (job_a1.status=% -- no llego a succeeded en esta corrida, ver SECCION 8)', v_status;
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  PERFORM public.prepare_publication_retry(v_job_a1, 'intento sobre job succeeded, deberia rechazarse');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 11.9a [check #16] prepare_publication_retry sobre job succeeded = FAIL (¡se permitio, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is not failed' THEN
    RAISE NOTICE 'RESULT: 11.9a [check #16] prepare_publication_retry rechazado desde succeeded = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 11.9a [check #16] prepare_publication_retry desde succeeded = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$retry_invalid_from_succeeded$;

-- CORRECCION POST-RUN-5 (2026-08-27): la version original de 11.9b
-- dependia de job_d1 (SECCION 11.2/11.3), que a su vez depende de
-- operator_user -- un auth.users desechable del role matrix que puede no
-- existir en un Supabase local sin usuarios de sobra (residual ESTRUCTURAL
-- documentado desde 8A.1/8B.1). Cuando operator_user no existe, job_d1
-- nunca se crea y este check quedaba SKIPPED indefinidamente -- una
-- cobertura real (retry rechazado desde cancelled) terminaba acoplada a
-- un residual no relacionado. Fix: escenario G (SECCION 3), aislado y
-- nonce-isolado igual que el resto, usa UNICAMENTE el actor owner (ya
-- disponible en cualquier entorno local, nunca depende de auth.users de
-- sobra) para crear+cancelar su propio job -- este check ahora es
-- alcanzable siempre, sin importar el estado del role matrix.
DO $retry_invalid_from_cancelled$
DECLARE
  v_owner uuid; v_target_g uuid; v_job_g uuid; v_status public.publication_job_status;
BEGIN
  SELECT value INTO v_owner FROM p8b1_ids WHERE key = 'owner';
  SELECT value INTO v_target_g FROM p8b1_ids WHERE key = 'target_g';

  IF v_target_g IS NULL THEN
    RAISE NOTICE 'RESULT: 11.9b [check #16] prepare_publication_retry rechazado desde cancelled = SKIPPED (no hay target_g -- SECCION 3 no lo produjo)';
    RETURN;
  END IF;

  -- 1) crear el job (queued) como owner.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  v_job_g := public.create_publication_job(v_target_g, NULL);
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8b1_ids (key, value) VALUES ('job_g1', v_job_g) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  -- 2) cancelarlo mientras esta queued (estado valido para cancelar --
  -- cancel_publication_job exige solo operator+ para queued, y owner ya
  -- satisface operator+/strategist+ por la jerarquia has_organization_role).
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  PERFORM public.cancel_publication_job(v_job_g, 'Phase8B1 smoke: cancelacion deliberada (escenario G, Run 5)');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  SELECT status INTO v_status FROM public.campaign_publication_jobs WHERE id = v_job_g;

  IF v_status <> 'cancelled' THEN
    RAISE NOTICE 'RESULT: 11.9b [check #16] setup escenario G (cancelar job_g1) = FAIL (status=%, esperado cancelled)', v_status;
    RETURN;
  END IF;

  RAISE NOTICE 'RESULT: 11.9b-setup [check #14/#16] job_g1 queued->cancelled (escenario G, owner-only) = PASS';

  -- 3) prepare_publication_retry sobre un job cancelled debe rechazarse.
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;
  PERFORM public.prepare_publication_retry(v_job_g, 'intento sobre job cancelled, deberia rechazarse');
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  RAISE NOTICE 'RESULT: 11.9b [check #16] prepare_publication_retry sobre job cancelled = FAIL (¡se permitio, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is not failed' THEN
    RAISE NOTICE 'RESULT: 11.9b [check #16] prepare_publication_retry rechazado desde cancelled (escenario G, independiente del role matrix) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 11.9b [check #16] prepare_publication_retry desde cancelled = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$retry_invalid_from_cancelled$;

-- =============================================================================
-- SECCION 12 — CHECK #19/#20: webhook receipt (dedupe/replay) + no doble
-- aplicacion de efectos autoritativos.
-- =============================================================================

-- 12.1 (check #19) primera recepcion: is_new = true, status = received.
DO $webhook_receipt_first$
DECLARE
  v_id uuid; v_is_new boolean; v_status text; v_nonce text; v_external_event_id text;
BEGIN
  SELECT value INTO v_nonce FROM p8b1_meta_text WHERE key = 'run_nonce';
  v_external_event_id := 'phase8b1-smoke-webhook-event-1-' || v_nonce;

  SET ROLE service_role;
  SELECT r.id, r.is_new, r.status INTO v_id, v_is_new, v_status
  FROM public.record_publication_webhook_receipt(
    'meta', v_external_event_id,
    encode(sha256('phase8b1-smoke-payload-1'::bytea), 'hex')
  ) r;
  RESET ROLE;

  INSERT INTO p8b1_ids (key, value) VALUES ('webhook_1', v_id) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  INSERT INTO p8b1_meta_text (key, value) VALUES ('webhook_1_external_event_id', v_external_event_id)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  IF v_is_new = true AND v_status = 'received' THEN
    RAISE NOTICE 'RESULT: 12.1 [check #19] primera recepcion de webhook (is_new=true, status=received) = PASS (id=%)', v_id;
  ELSE
    RAISE NOTICE 'RESULT: 12.1 [check #19] primera recepcion de webhook = FAIL (is_new=%, status=%)', v_is_new, v_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'RESULT: 12.1 [check #19] primera recepcion de webhook = FAIL (error inesperado: %)', SQLERRM;
END;
$webhook_receipt_first$;

-- 12.2 (check #19) replay: mismo (provider, external_event_id) -> is_new =
-- false, MISMO id, sin fila duplicada.
DO $webhook_receipt_replay$
DECLARE
  v_id uuid; v_is_new boolean; v_original_id uuid; v_count int; v_external_event_id text;
BEGIN
  SELECT value INTO v_original_id FROM p8b1_ids WHERE key = 'webhook_1';
  SELECT value INTO v_external_event_id FROM p8b1_meta_text WHERE key = 'webhook_1_external_event_id';

  SET ROLE service_role;
  SELECT r.id, r.is_new INTO v_id, v_is_new
  FROM public.record_publication_webhook_receipt(
    'meta', v_external_event_id,
    encode(sha256('phase8b1-smoke-payload-1-REPLAY-different-hash'::bytea), 'hex')
  ) r;
  RESET ROLE;

  SELECT count(*) INTO v_count FROM public.campaign_publication_webhook_events
  WHERE provider = 'meta' AND external_event_id = v_external_event_id;

  IF v_is_new = false AND v_id = v_original_id AND v_count = 1 THEN
    RAISE NOTICE 'RESULT: 12.2 [check #19] replay de webhook (mismo provider+external_event_id) = PASS (is_new=false, id sin cambiar=%, count=1 -- sin fila duplicada, incluso con payload_hash distinto)', v_id;
  ELSE
    RAISE NOTICE 'RESULT: 12.2 [check #19] replay de webhook = FAIL (is_new=%, id=% (esperado %), count=% (esperado 1))', v_is_new, v_id, v_original_id, v_count;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'RESULT: 12.2 [check #19] replay de webhook = FAIL (error inesperado: %)', SQLERRM;
END;
$webhook_receipt_replay$;

-- 12.3 (check #8/#20 aplicado a webhooks) provider invalido/manual en webhook.
DO $webhook_invalid_provider$
BEGIN
  SET ROLE service_role;
  PERFORM public.record_publication_webhook_receipt('not_a_real_provider', 'phase8b1-smoke-webhook-event-invalid', encode(sha256('x'::bytea), 'hex'));
  RESET ROLE;
  RAISE NOTICE 'RESULT: 12.3 [check #8, superficie webhook] provider invalido en record_publication_webhook_receipt = FAIL (¡se permitio, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF SQLERRM ~* 'invalid provider' OR SQLSTATE = '22P02' THEN
    RAISE NOTICE 'RESULT: 12.3 [check #8, superficie webhook] provider invalido en record_publication_webhook_receipt = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 12.3 [check #8, superficie webhook] provider invalido = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$webhook_invalid_provider$;

DO $webhook_manual_provider$
BEGIN
  SET ROLE service_role;
  PERFORM public.record_publication_webhook_receipt('manual', 'phase8b1-smoke-webhook-event-manual', encode(sha256('x'::bytea), 'hex'));
  RESET ROLE;
  RAISE NOTICE 'RESULT: 12.4 [check #2, superficie webhook] provider manual en record_publication_webhook_receipt = FAIL (¡se permitio, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF SQLERRM ~* 'provider manual does not emit webhooks' THEN
    RAISE NOTICE 'RESULT: 12.4 [check #2, superficie webhook] provider manual en record_publication_webhook_receipt = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 12.4 [check #2, superficie webhook] provider manual = FAIL (rechazado pero por razon incorrecta: %)', SQLERRM;
  END IF;
END;
$webhook_manual_provider$;

-- 12.5 (check #20) idempotencia real de mark_webhook_event_processed: Run 2
-- encontro que llamar esta RPC dos veces con el mismo webhook_event_id
-- duplicaba el evento de auditoria 'webhook_received' (antes=0, tras 1a
-- llamada=1, tras 2a llamada=2) -- CONFIRMADO como defecto real de
-- persistencia (no diferible a 8B.3), corregido hacia adelante en
-- 20260827090000_phase8b1_publication_domain_hardening.sql: la RPC ahora
-- lee el status ACTUAL del webhook event y es un NO-OP si ya esta
-- processed|failed (no reinserta el evento). Este check ahora AFIRMA la
-- idempotencia (PASS/FAIL real), no solo la reporta informativamente. El
-- efecto AUTORITATIVO del job (status) nunca dependio de este INSERT --
-- esta protegido por separado por los guards de estado de las RPCs de
-- transicion de job (ver 8.7b: un job ya succeeded rechaza un segundo
-- mark_publication_job_succeeded).
DO $webhook_processed_twice$
DECLARE
  v_webhook_id uuid; v_org_a uuid; v_job uuid;
  v_events_before int; v_events_after_1 int; v_events_after_2 int;
BEGIN
  SELECT value INTO v_webhook_id FROM p8b1_ids WHERE key = 'webhook_1';
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_job FROM p8b1_ids WHERE key = 'job_a1'; -- se espera succeeded (SECCION 8)

  IF v_webhook_id IS NULL OR v_org_a IS NULL OR v_job IS NULL THEN
    RAISE NOTICE 'RESULT: 12.5 [check #20] mark_webhook_event_processed llamado 2x sobre el mismo webhook = SKIPPED (falta webhook_1/org_a/job_a1 -- dependencia de SECCION 8/12.1 no satisfecha)';
    RETURN;
  END IF;

  SELECT count(*) INTO v_events_before FROM public.campaign_publication_events WHERE job_id = v_job AND event_type = 'webhook_received';

  -- CORRECCION POST-RUN-1 (2026-08-27): la version original dejaba estas 2
  -- SELECT de diagnostico DENTRO de la ventana `SET ROLE service_role` (solo
  -- se hacia RESET ROLE al final, tras ambas). campaign_publication_events
  -- tiene `REVOKE ALL ... FROM service_role` explicito (SECCION H de la
  -- migracion -- service_role NO tiene ningun grant de tabla, solo puede
  -- escribir via las RPCs SECURITY DEFINER) + `GRANT SELECT` unicamente a
  -- `authenticated` -- por diseno, ni siquiera SELECT directo. Al ejecutar
  -- el SELECT de diagnostico "como" service_role (por el SET ROLE aun
  -- activo), Postgres devolvia genuinamente "permission denied for table
  -- campaign_publication_events" -- 100% defecto de la FIXTURE (harness),
  -- confirmado por lectura de la migracion (REVOKE ALL ... FROM ...,
  -- service_role) -- la migracion/RPC estan correctas: el diseno
  -- deliberado es que service_role NO tenga acceso ambiental directo a
  -- esta tabla, solo a traves de la RPC (que corre SECURITY DEFINER como
  -- su owner, no como el caller). Fix: SET ROLE/RESET ROLE ahora envuelven
  -- SOLO la llamada a la RPC; los SELECT de diagnostico corren con el rol
  -- de sesion original (mismo criterio que v_events_before, arriba).
  SET ROLE service_role;
  PERFORM public.mark_webhook_event_processed(v_webhook_id, 'processed', NULL, v_job, v_org_a, NULL);
  RESET ROLE;
  SELECT count(*) INTO v_events_after_1 FROM public.campaign_publication_events WHERE job_id = v_job AND event_type = 'webhook_received';

  SET ROLE service_role;
  PERFORM public.mark_webhook_event_processed(v_webhook_id, 'processed', NULL, v_job, v_org_a, NULL);
  RESET ROLE;
  SELECT count(*) INTO v_events_after_2 FROM public.campaign_publication_events WHERE job_id = v_job AND event_type = 'webhook_received';

  -- El efecto AUTORITATIVO real (status del job) no puede duplicarse -- ya
  -- verificado en 8.7b (mark_publication_job_succeeded rechaza un job ya
  -- succeeded). Aqui solo reportamos el conteo de eventos de auditoria
  -- 'webhook_received' -- informativo, no lo tratamos como el criterio de
  -- PASS/FAIL de "no duplicar autoridad" (ese ya esta cubierto por 8.7b).
  IF v_events_after_1 = v_events_before + 1 AND v_events_after_2 = v_events_after_1 THEN
    RAISE NOTICE 'RESULT: 12.5 [check #20] mark_webhook_event_processed llamado 2x sobre el mismo webhook = PASS (idempotente: antes=%, tras 1a llamada=% (+1, procesamiento real), tras 2a llamada=% (sin cambio, NO-OP por status ya terminal))',
      v_events_before, v_events_after_1, v_events_after_2;
  ELSE
    RAISE NOTICE 'RESULT: 12.5 [check #20] mark_webhook_event_processed llamado 2x sobre el mismo webhook = FAIL (no idempotente: antes=%, tras 1a llamada=%, tras 2a llamada=% -- se esperaba %/%/% )',
      v_events_before, v_events_after_1, v_events_after_2, v_events_before, v_events_before + 1, v_events_before + 1;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE NOTICE 'RESULT: 12.5 [check #20] mark_webhook_event_processed x2 = FAIL (error inesperado: %)', SQLERRM;
END;
$webhook_processed_twice$;

-- =============================================================================
-- SECCION 13 — CHECK #24: sin side-effects fuera de alcance (tasks/alerts/
-- n8n/HTTP). Solo verificable en SQL a nivel de tablas de dominio + ausencia
-- de triggers de la migracion que las toquen -- el comportamiento de la capa
-- de aplicacion (Server Actions/n8n) esta fuera del alcance de un fixture
-- SQL y debe verificarse por separado (nota explicita, no se omite el punto).
-- =============================================================================

DO $no_side_effects$
DECLARE
  v_tasks_count int; v_alerts_count int; v_exec_count int; v_webhook_automation_count int;
  v_org_a uuid; v_org_b uuid; v_run_start timestamptz;
BEGIN
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_org_b FROM p8b1_ids WHERE key = 'org_b';
  SELECT value INTO v_run_start FROM p8b1_meta WHERE key = 'run_start';

  SELECT count(*) INTO v_tasks_count FROM public.tasks
    WHERE title ILIKE '%Phase8B1%' OR title ILIKE '%phase8b1%'
       OR description ILIKE '%phase8b1%'
       OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE '%phase8b1%');

  SELECT count(*) INTO v_alerts_count FROM public.alerts
    WHERE metadata::text ILIKE '%phase8b1%' OR alert_key ILIKE '%phase8b1%';

  SELECT count(*) INTO v_exec_count FROM public.automation_executions
    WHERE (organization_id = v_org_b)
       OR (organization_id = v_org_a AND created_at >= v_run_start)
       OR input_metadata::text ILIKE '%phase8b1%'
       OR output_metadata::text ILIKE '%phase8b1%';

  BEGIN
    SELECT count(*) INTO v_webhook_automation_count FROM public.automation_webhook_events
      WHERE (organization_id = v_org_b)
         OR (organization_id = v_org_a AND created_at >= v_run_start);
  EXCEPTION WHEN undefined_table THEN
    v_webhook_automation_count := 0;
  END;

  IF v_tasks_count = 0 AND v_alerts_count = 0 AND v_exec_count = 0 AND v_webhook_automation_count = 0 THEN
    RAISE NOTICE 'RESULT: 13.1 [check #24, parcial] ningun side-effect en tasks/alerts/automation_executions/automation_webhook_events = PASS (todos en 0)';
  ELSE
    RAISE NOTICE 'RESULT: 13.1 [check #24, parcial] side-effects en tablas fuera de alcance = FAIL (tasks=%, alerts=%, executions=%, automation_webhooks=%)',
      v_tasks_count, v_alerts_count, v_exec_count, v_webhook_automation_count;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RESULT: 13.1 [check #24, parcial] side-effects en tablas fuera de alcance = FAIL (error inesperado en la query del harness: %)', SQLERRM;
END;
$no_side_effects$;

DO $no_trigger_leakage$
DECLARE
  v_leak_count int;
BEGIN
  -- Ningun trigger definido POR ESTA MIGRACION debe apuntar a tasks/alerts/
  -- n8n/http -- inspeccion de las funciones de trigger reales creadas en
  -- 20260825120000 (prefijo *_publication_*), buscando texto de fuente que
  -- referencie esas tablas/dominios fuera de alcance.
  SELECT count(*) INTO v_leak_count
  FROM pg_proc p
  JOIN pg_trigger t ON t.tgfoid = p.oid
  JOIN pg_class rel ON rel.oid = t.tgrelid
  WHERE rel.relname LIKE 'campaign_publication_%'
    AND (pg_get_functiondef(p.oid) ILIKE '%public.tasks%'
      OR pg_get_functiondef(p.oid) ILIKE '%public.alerts%'
      OR pg_get_functiondef(p.oid) ILIKE '%n8n%'
      OR pg_get_functiondef(p.oid) ILIKE '%http%');

  IF v_leak_count = 0 THEN
    RAISE NOTICE 'RESULT: 13.2 [check #24] ningun trigger de las 4 tablas de 8B.1 referencia tasks/alerts/n8n/http = PASS. NOTA: esto SOLO cubre la capa de triggers/DB -- efectos de la capa de aplicacion (Server Actions futuras de 8B.2/8B.3, n8n, adapters HTTP reales) NO son verificables desde este fixture SQL y deben revisarse por separado (fuera de alcance de este script).';
  ELSE
    RAISE NOTICE 'RESULT: 13.2 [check #24] triggers de publication referencian tablas/dominios fuera de alcance = FAIL (count=%)', v_leak_count;
  END IF;
END;
$no_trigger_leakage$;

\else
\echo 'RESULT: 4-13 (role matrix + ciclo de vida de job + fallo/retry + unknown_outcome + role matrix completo + webhook + side-effects, ~40 checks) = SKIPPED (guarda de setup de SECCION 3.5 en FAIL -- ver 3.1/3.4 para la causa raiz; ningun check individual de estas secciones se considera FAIL de forma independiente)'
\endif

-- =============================================================================
-- SECCION 14 — LIMPIEZA DE DATOS TRANSITORIOS DE ESTE SCRIPT (role matrix)
-- Borra UNICAMENTE las membresias desechables creadas en la SECCION 4 --
-- esto es seguro (organization_members no tiene ninguna proteccion de
-- append-only ni trigger que lo impida) y no deja huerfanos: ningun job/
-- evento de publicacion referencia organization_members directamente (usan
-- auth.users via created_by/actor_user_id, que NO se tocan aqui). NO borra
-- ningun auth.users, ninguna organizacion, ni ninguna fila de negocio
-- (activations/targets/jobs/attempts/events smoke quedan como historico
-- permanente -- ver cabecera del archivo y phase8b1_local_runtime_validation_cleanup.sql).
-- =============================================================================

DO $role_matrix_teardown$
DECLARE
  v_org_a uuid; v_viewer uuid; v_operator uuid; v_strategist uuid; v_deleted int;
BEGIN
  SELECT value INTO v_org_a FROM p8b1_ids WHERE key = 'org_a';
  SELECT value INTO v_viewer FROM p8b1_ids WHERE key = 'viewer_user';
  SELECT value INTO v_operator FROM p8b1_ids WHERE key = 'operator_user';
  SELECT value INTO v_strategist FROM p8b1_ids WHERE key = 'strategist_user';

  DELETE FROM public.organization_members
  WHERE organization_id = v_org_a
    AND user_id IN (v_viewer, v_operator, v_strategist);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RAISE NOTICE 'RESULT: 14.1 limpieza de membresias desechables del role matrix = PASS (filas borradas=%)', v_deleted;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RESULT: 14.1 limpieza de membresias desechables del role matrix = FAIL (error inesperado: %)', SQLERRM;
END;
$role_matrix_teardown$;

-- =============================================================================
-- SECCION 15 — INVENTARIO DE SMOKE DATA (para el reporte y para el cleanup)
-- =============================================================================

\echo '--- 15.1 Inventario completo de ids (para el reporte y el cleanup) ---'
SELECT key, value FROM p8b1_ids ORDER BY key;

\echo '--- 15.2 Jobs de publicacion creados por esta corrida (por organization_id + created_at >= run_start) ---'
SELECT j.id, j.status, j.provider, j.channel, j.failure_category, j.idempotency_key
FROM public.campaign_publication_jobs j, p8b1_meta m
WHERE m.key = 'run_start' AND j.created_at >= m.value
  AND j.organization_id = (SELECT value FROM p8b1_ids WHERE key = 'org_a')
ORDER BY j.created_at;

\echo '=== FIN phase8b1_local_runtime_validation.sql — extraer resultados con: grep RESULT: <output> ==='
