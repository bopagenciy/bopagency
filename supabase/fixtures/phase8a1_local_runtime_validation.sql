-- =============================================================================
-- Phase 8A.1 — Local runtime validation script
-- Archivo: supabase/fixtures/phase8a1_local_runtime_validation.sql
--
-- PROPÓSITO
--   Verificar el comportamiento REAL en runtime (no solo texto de la
--   migración) de las 3 tablas / 5 RPCs / RLS / triggers de Phase 8A.1
--   contra Supabase LOCAL. Complementa (no reemplaza) los tests de
--   contrato de texto de packages/infrastructure.
--
-- ALCANCE / GARANTÍAS
--   - Solo LOCAL: aborta si detecta que no está corriendo contra
--     Supabase local (SECCIÓN 0, mismo patrón que
--     supabase/fixtures/phase6_local_staging_fixtures.sql).
--   - No usa Supabase cloud, no usa `db push`/`db reset`.
--   - No modifica migraciones existentes ni `supabase/config.toml`.
--   - Todos los fixtures llevan el marcador 'phase8a1-local' en metadata o
--     el prefijo 'Phase8A1 Smoke' en su nombre — ver
--     phase8a1_local_runtime_validation_cleanup.sql para limpieza.
--   - Cada bloque de comportamiento negativo (debe fallar) está envuelto en
--     su propio DO $$ ... EXCEPTION WHEN OTHERS ... $$ para que un fallo
--     ESPERADO no aborte el resto del script.
--   - Salida: cada verificación emite exactamente una línea
--       RESULT: <sección>.<n> <descripción> = PASS | FAIL <detalle>
--     Extraer todas las líneas con: grep '^RESULT:' <output>
--
-- USO (ejecutar EN LA MÁQUINA DEL USUARIO, no desde este puente — no hay
-- ruta de red desde el sandbox de Claude hacia el Postgres local):
--   docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=0 \
--     < supabase/fixtures/phase8a1_local_runtime_validation.sql \
--     | tee /tmp/phase8a1_runtime_output.txt
--
--   (ON_ERROR_STOP=0 es intencional: algunos statements de la SECCIÓN 1/2
--   son solo de inspección y no deben abortar el script si alguna columna
--   difiere; todo comportamiento negativo real ya está capturado dentro de
--   sus propios DO blocks con EXCEPTION.)
--
-- CLEANUP: ver phase8a1_local_runtime_validation_cleanup.sql (entrega el
-- SQL exacto — no se ejecuta automáticamente).
-- =============================================================================

-- =============================================================================
-- SECCIÓN 0 — GUARDA DE ENTORNO LOCAL
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
      'ABORT phase8a1_local_runtime_validation: inet_server_addr()=% no es loopback.',
      v_server_addr;
  END IF;

  IF v_database ILIKE '%prod%' THEN
    RAISE EXCEPTION
      'ABORT phase8a1_local_runtime_validation: current_database()=% parece producción.',
      v_database;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organizations WHERE name = 'BopAgency Local'
  ) INTO v_org_exists;

  IF NOT v_org_exists THEN
    RAISE EXCEPTION
      'ABORT phase8a1_local_runtime_validation: no existe organización '
      '"BopAgency Local". Aborta sin escribir nada.';
  END IF;

  RAISE NOTICE 'RESULT: 0.1 guarda de entorno local = PASS (server_addr=%, database=%)',
    COALESCE(v_server_addr::text, '(socket local)'), v_database;
END;
$guard$;

-- =============================================================================
-- SECCIÓN 0b — Tabla temporal para pasar IDs de fixtures entre bloques DO
-- (vive solo durante esta sesión/conexión de psql — se descarta sola)
-- =============================================================================
CREATE TEMP TABLE IF NOT EXISTS p8a1_ids (key text PRIMARY KEY, value uuid);
GRANT SELECT, INSERT, UPDATE ON p8a1_ids TO authenticated;

-- p8a1_meta: guarda el instante de arranque de ESTA corrida. automation_executions y
-- automation_webhook_events no tienen ninguna columna de tag/fixture -- la correlación
-- mas fuerte disponible con columnas reales es organization_id (org_b es creada de cero
-- por este script, org_a es "BopAgency Local" real) + ventana temporal desde el arranque
-- de esta corrida (created_at >= run_start), usada en SECCION 12.
CREATE TEMP TABLE IF NOT EXISTS p8a1_meta (key text PRIMARY KEY, value timestamptz);
INSERT INTO p8a1_meta (key, value) VALUES ('run_start', clock_timestamp())
  ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- SECCIÓN 1 — INSPECCIÓN ESTRUCTURAL (solo lectura)
-- =============================================================================

\echo '--- 1a. Columnas ---'
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('campaign_activations', 'campaign_activation_targets', 'campaign_activation_events')
ORDER BY table_name, ordinal_position;

\echo '--- 1b. Constraints (PK/FK/UNIQUE/CHECK) ---'
SELECT tc.table_name, tc.constraint_name, tc.constraint_type
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('campaign_activations', 'campaign_activation_targets', 'campaign_activation_events')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

\echo '--- 1b2. CHECK constraint definitions ---'
-- FIX (harness issue #3): conrelid::regclass::text renders UNQUALIFIED
-- ('campaign_activations', not 'public.campaign_activations') whenever the
-- object's schema is on search_path (true by default for 'public') -- the
-- old IN-list of fully-qualified names could never match, hence 0 rows.
-- Join pg_namespace explicitly and filter by nspname instead.
SELECT rel.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE ns.nspname = 'public'
  AND rel.relname IN ('campaign_activations', 'campaign_activation_targets', 'campaign_activation_events')
  AND con.contype = 'c'
ORDER BY 1, 2;

\echo '--- 1c. Indexes ---'
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('campaign_activations', 'campaign_activation_targets', 'campaign_activation_events')
ORDER BY tablename, indexname;

\echo '--- 1d. RLS enabled ---'
SELECT relname AS table_name, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname IN ('campaign_activations', 'campaign_activation_targets', 'campaign_activation_events')
  AND relnamespace = 'public'::regnamespace;

\echo '--- 1e. Policies ---'
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('campaign_activations', 'campaign_activation_targets', 'campaign_activation_events')
ORDER BY tablename, cmd;

\echo '--- 1f. Triggers ---'
SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('campaign_activations', 'campaign_activation_targets', 'campaign_activation_events')
ORDER BY event_object_table, trigger_name;

\echo '--- 1g. Grants (table-level) ---'
SELECT table_name, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('campaign_activations', 'campaign_activation_targets', 'campaign_activation_events')
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

\echo '--- 1g2. Column-level UPDATE grants ---'
SELECT table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name IN ('campaign_activations', 'campaign_activation_targets')
  AND privilege_type = 'UPDATE'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY table_name, grantee, column_name;

-- =============================================================================
-- SECCIÓN 2 — INSPECCIÓN DE RPCs
-- =============================================================================

\echo '--- 2a. Metadata de las 5 RPCs ---'
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS security_definer,
  p.proconfig AS config,
  r.rolname AS owner
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'prepare_activation_target', 'mark_activation_target_ready',
    'mark_activation_target_published', 'cancel_activation_target',
    'cancel_campaign_activation'
  )
ORDER BY p.proname;

\echo '--- 2b. EXECUTE grants de las 5 RPCs ---'
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'prepare_activation_target', 'mark_activation_target_ready',
    'mark_activation_target_published', 'cancel_activation_target',
    'cancel_campaign_activation'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY routine_name, grantee;

DO $rpc_count$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN (
      'prepare_activation_target', 'mark_activation_target_ready',
      'mark_activation_target_published', 'cancel_activation_target',
      'cancel_campaign_activation'
    );
  IF v_count = 5 THEN
    RAISE NOTICE 'RESULT: 2.1 las 5 RPCs existen y compilan = PASS (count=%)', v_count;
  ELSE
    RAISE NOTICE 'RESULT: 2.1 las 5 RPCs existen y compilan = FAIL (count=%, esperado 5)', v_count;
  END IF;
END;
$rpc_count$;

-- =============================================================================
-- SECCIÓN 3 — FIXTURES: organización/cliente locales + organización "foránea"
-- =============================================================================

DO $fixtures$
DECLARE
  v_org_a_id uuid;
  v_owner_id uuid;
  v_owner_role text;
  v_client_a_id uuid;
  v_org_b_id uuid;
  v_client_b_id uuid;
  v_integration_b_id uuid;
BEGIN
  SELECT id INTO v_org_a_id FROM public.organizations WHERE name = 'BopAgency Local';
  IF v_org_a_id IS NULL THEN
    RAISE EXCEPTION 'ABORT: organización "BopAgency Local" no encontrada (revalidado).';
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
    RAISE EXCEPTION 'ABORT: no se encontró ningún miembro de "BopAgency Local".';
  END IF;

  RAISE NOTICE 'RESULT: 3.1 organización/actor local resueltos = PASS (org_a=%, owner=%, role=%)',
    v_org_a_id, v_owner_id, v_owner_role;

  -- Cliente A (dedupe por slug)
  SELECT id INTO v_client_a_id FROM public.clients
  WHERE organization_id = v_org_a_id AND slug = 'phase8a1-smoke-client-a';
  IF v_client_a_id IS NULL THEN
    INSERT INTO public.clients (organization_id, name, slug, created_by, metadata)
    VALUES (v_org_a_id, 'Phase8A1 Smoke Client A', 'phase8a1-smoke-client-a', v_owner_id,
            '{"fixture":"phase8a1-local"}'::jsonb)
    RETURNING id INTO v_client_a_id;
  END IF;
  RAISE NOTICE 'RESULT: 3.2 cliente A (org propia) = PASS (client_a=%)', v_client_a_id;

  -- Organización B "foránea" (dedupe por slug)
  SELECT id INTO v_org_b_id FROM public.organizations WHERE slug = 'phase8a1-smoke-org-b';
  IF v_org_b_id IS NULL THEN
    INSERT INTO public.organizations (name, slug)
    VALUES ('Phase8A1 Smoke Org B', 'phase8a1-smoke-org-b')
    RETURNING id INTO v_org_b_id;
  END IF;
  RAISE NOTICE 'RESULT: 3.3 organización B (foránea, cross-tenant) = PASS (org_b=%)', v_org_b_id;

  SELECT id INTO v_client_b_id FROM public.clients
  WHERE organization_id = v_org_b_id AND slug = 'phase8a1-smoke-client-b';
  IF v_client_b_id IS NULL THEN
    INSERT INTO public.clients (organization_id, name, slug, created_by, metadata)
    VALUES (v_org_b_id, 'Phase8A1 Smoke Client B', 'phase8a1-smoke-client-b', v_owner_id,
            '{"fixture":"phase8a1-local"}'::jsonb)
    RETURNING id INTO v_client_b_id;
  END IF;
  RAISE NOTICE 'RESULT: 3.4 cliente B (org foránea) = PASS (client_b=%)', v_client_b_id;

  SELECT id INTO v_integration_b_id FROM public.client_integrations
  WHERE organization_id = v_org_b_id AND external_account_id = 'phase8a1-smoke-integration-b';
  IF v_integration_b_id IS NULL THEN
    INSERT INTO public.client_integrations
      (organization_id, client_id, provider, external_account_id, configuration, status)
    VALUES
      (v_org_b_id, v_client_b_id, 'meta', 'phase8a1-smoke-integration-b',
       '{"fixture":"phase8a1-local"}'::jsonb, 'active')
    RETURNING id INTO v_integration_b_id;
  END IF;
  RAISE NOTICE 'RESULT: 3.5 client_integration B (org foránea, para test cross-org) = PASS (integration_b=%)', v_integration_b_id;

  INSERT INTO p8a1_ids (key, value) VALUES
    ('org_a', v_org_a_id), ('owner', v_owner_id), ('client_a', v_client_a_id),
    ('org_b', v_org_b_id), ('client_b', v_client_b_id), ('integration_b', v_integration_b_id)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END;
$fixtures$;

-- =============================================================================
-- SECCIÓN 4 — CAMPAÑAS + LINKAGE DE APROBACIÓN (state-aware, REPETIBLE)
--
-- ROUND E ROOT CAUSE (evidencia real de Round D, dos corridas consecutivas):
-- el pre-clean DELETE de Round D (antigua SECCIÓN 3.5) chocó con una
-- protección de dominio CORRECTA -- campaign_activation_targets prohíbe
-- borrar un target una vez que su activation salió de "pending" ("Use
-- cancel_activation_target instead"), y una activation/target completed es
-- legítimamente terminal/inmutable. Ese trigger es correcto y NO se toca.
-- Tras el fallo del pre-clean, las campañas smoke seguían con su estado de
-- la corrida anterior (p.ej. 'approved') y esta sección volvía a llamar
-- approve_campaign()/reject_campaign() incondicionalmente -> "is not in
-- review (current status: approved)" -> excepción sin manejar -> rollback
-- del bloque completo -> IDs nunca persistidos -> NULLs corriente abajo.
--
-- ESTRATEGIA (Round E, reemplaza el pre-clean DELETE de Round D): (B) REUSO
-- STATE-AWARE. abandona por completo el borrado determinístico. Cada una de
-- las 5 campañas smoke vive en su PROPIO bloque DO independiente (así un
-- estado inesperado en una no aborta ni contamina a las otras 4), y cada
-- bloque resuelve su estado ANTES de decidir qué RPC (si acaso) invocar:
--   - ausente            -> crear en draft, mover a review por el camino
--                            válido, y recién ahí aprobar/rechazar UNA VEZ.
--   - draft (encontrada) -> mover a review, luego aprobar/rechazar.
--   - review             -> aprobar/rechazar directamente.
--   - approved/rejected  -> REUSAR: nunca se vuelve a llamar
--                            approve_campaign/reject_campaign; se resuelve
--                            la fila real de campaign_approvals ya existente.
--   - cualquier otro estado (active/paused/completed, o rejected donde se
--     esperaba approved, etc.) -> FAIL explícito del harness (RAISE
--     EXCEPTION con el estado real) -- nunca se muta un estado histórico
--     de forma arbitraria para "hacerlo pasar".
-- La resolución de la fila de campaign_approvals NUNCA fabrica un id: se
-- hace SIEMPRE por (campaign_id, action) y se exige encontrar EXACTAMENTE 1
-- fila -- 0 o >1 es un FAIL explícito del harness (invariante: cada campaña
-- smoke solo se aprueba/rechaza una única vez en toda su vida, por
-- construcción de esta misma lógica state-aware).
--
-- campaign_draft/campaign_review NO tienen ninguna RPC de aprobación que
-- las mueva de estado entre corridas (nada más las toca), así que su
-- dedupe-por-nombre existente ya las hace repetibles sin lógica adicional
-- -- solo se asegura que existan en el estado esperado la primera vez.
-- =============================================================================

-- 4.1 Campaign APPROVED #1 (state-aware: crea-o-reusa, aprueba UNA sola vez).
DO $campaign_approved1$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid;
  v_campaign_id uuid; v_status public.campaign_status;
  v_approval_id uuid; v_approval_count int;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  SELECT id, status INTO v_campaign_id, v_status FROM public.campaigns
    WHERE organization_id = v_org_a AND name = 'Phase8A1 Smoke Campaign Approved 1';

  IF v_campaign_id IS NULL THEN
    INSERT INTO public.campaigns (organization_id, client_id, name, objective, platform, budget, status, created_by, updated_by, metadata)
    VALUES (v_org_a, v_client_a, 'Phase8A1 Smoke Campaign Approved 1', 'conversions', 'meta_ads', 1000, 'draft', v_owner, v_owner, '{"fixture":"phase8a1-local"}'::jsonb)
    RETURNING id, status INTO v_campaign_id, v_status;
  END IF;

  IF v_status = 'draft' THEN
    UPDATE public.campaigns SET status = 'review', submitted_for_review_at = now(), updated_by = v_owner
      WHERE id = v_campaign_id AND status = 'draft';
    v_status := 'review';
  END IF;

  IF v_status = 'review' THEN
    PERFORM public.approve_campaign(v_campaign_id);
  ELSIF v_status = 'approved' THEN
    NULL; -- reuso: ya aprobada por una corrida previa -- NO se vuelve a llamar approve_campaign.
  ELSE
    RAISE EXCEPTION 'harness: campaign "Approved 1" (%) en estado inesperado/incompatible % (se esperaba draft/review/approved)', v_campaign_id, v_status;
  END IF;

  SELECT count(*) INTO v_approval_count FROM public.campaign_approvals
    WHERE campaign_id = v_campaign_id AND action = 'approved';
  IF v_approval_count <> 1 THEN
    RAISE EXCEPTION 'harness: se esperaba exactamente 1 campaign_approval "approved" para campaign % (encontrados %)', v_campaign_id, v_approval_count;
  END IF;
  SELECT id INTO v_approval_id FROM public.campaign_approvals
    WHERE campaign_id = v_campaign_id AND action = 'approved';

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8a1_ids (key, value) VALUES ('campaign_approved1', v_campaign_id), ('approval1', v_approval_id)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  RAISE NOTICE 'RESULT: 4.1 campaign approved #1 (state-aware, crea-o-reusa) + approval real = PASS (campaign=%, approval=%)',
    v_campaign_id, v_approval_id;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 4.1 campaign approved #1 (state-aware, crea-o-reusa) + approval real = FAIL (%: %)', SQLSTATE, SQLERRM;
END;
$campaign_approved1$;

-- 4.2 Campaign APPROVED #2 (para el test "approval de otra campaña").
DO $campaign_approved2$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid;
  v_campaign_id uuid; v_status public.campaign_status;
  v_approval_id uuid; v_approval_count int;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  SELECT id, status INTO v_campaign_id, v_status FROM public.campaigns
    WHERE organization_id = v_org_a AND name = 'Phase8A1 Smoke Campaign Approved 2';

  IF v_campaign_id IS NULL THEN
    INSERT INTO public.campaigns (organization_id, client_id, name, objective, platform, budget, status, created_by, updated_by, metadata)
    VALUES (v_org_a, v_client_a, 'Phase8A1 Smoke Campaign Approved 2', 'traffic', 'google_ads', 500, 'draft', v_owner, v_owner, '{"fixture":"phase8a1-local"}'::jsonb)
    RETURNING id, status INTO v_campaign_id, v_status;
  END IF;

  IF v_status = 'draft' THEN
    UPDATE public.campaigns SET status = 'review', submitted_for_review_at = now(), updated_by = v_owner
      WHERE id = v_campaign_id AND status = 'draft';
    v_status := 'review';
  END IF;

  IF v_status = 'review' THEN
    PERFORM public.approve_campaign(v_campaign_id);
  ELSIF v_status = 'approved' THEN
    NULL; -- reuso.
  ELSE
    RAISE EXCEPTION 'harness: campaign "Approved 2" (%) en estado inesperado/incompatible % (se esperaba draft/review/approved)', v_campaign_id, v_status;
  END IF;

  SELECT count(*) INTO v_approval_count FROM public.campaign_approvals
    WHERE campaign_id = v_campaign_id AND action = 'approved';
  IF v_approval_count <> 1 THEN
    RAISE EXCEPTION 'harness: se esperaba exactamente 1 campaign_approval "approved" para campaign % (encontrados %)', v_campaign_id, v_approval_count;
  END IF;
  SELECT id INTO v_approval_id FROM public.campaign_approvals
    WHERE campaign_id = v_campaign_id AND action = 'approved';

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8a1_ids (key, value) VALUES ('campaign_approved2', v_campaign_id), ('approval2', v_approval_id)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  RAISE NOTICE 'RESULT: 4.2 campaign approved #2 (state-aware, crea-o-reusa) + approval real = PASS (campaign=%, approval=%)',
    v_campaign_id, v_approval_id;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 4.2 campaign approved #2 (state-aware, crea-o-reusa) + approval real = FAIL (%: %)', SQLSTATE, SQLERRM;
END;
$campaign_approved2$;

-- 4.3 Campaign DRAFT: se asegura que exista en draft. Ninguna otra parte del
-- script llama approve_campaign/reject_campaign sobre ella, así que su
-- dedupe por nombre ya es repetible sin lógica de estado adicional. Si en
-- una corrida futura apareciera en un estado inesperado, NO se fuerza de
-- vuelta a draft silenciosamente (per spec) -- se reporta el estado real
-- encontrado; los tests 5.2/5.3 (draft/review rechazadas por "is not
-- approved") siguen siendo válidos con cualquier estado != approved.
DO $campaign_draft$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid;
  v_campaign_id uuid; v_status public.campaign_status;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  SELECT id, status INTO v_campaign_id, v_status FROM public.campaigns
    WHERE organization_id = v_org_a AND name = 'Phase8A1 Smoke Campaign Draft';

  IF v_campaign_id IS NULL THEN
    INSERT INTO public.campaigns (organization_id, client_id, name, objective, platform, budget, status, created_by, updated_by, metadata)
    VALUES (v_org_a, v_client_a, 'Phase8A1 Smoke Campaign Draft', 'reach', 'meta_ads', 300, 'draft', v_owner, v_owner, '{"fixture":"phase8a1-local"}'::jsonb)
    RETURNING id, status INTO v_campaign_id, v_status;
  END IF;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8a1_ids (key, value) VALUES ('campaign_draft', v_campaign_id)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  IF v_status = 'draft' THEN
    RAISE NOTICE 'RESULT: 4.3 campaign draft (sin aprobar, crea-o-reusa) = PASS (campaign=%)', v_campaign_id;
  ELSE
    RAISE NOTICE 'RESULT: 4.3 campaign draft (sin aprobar, crea-o-reusa) = PASS (campaign=%, NOTA: encontrada en estado %, no draft -- no se fuerza silenciosamente, sigue sirviendo para 5.2/5.3 mientras != approved)', v_campaign_id, v_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 4.3 campaign draft (sin aprobar, crea-o-reusa) = FAIL (%: %)', SQLSTATE, SQLERRM;
END;
$campaign_draft$;

-- 4.4 Campaign REVIEW (enviada a revisión, sin decidir). Igual que 4.3:
-- ninguna otra parte del script la aprueba/rechaza, así que permanece en
-- review de forma natural entre corridas.
DO $campaign_review$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid;
  v_campaign_id uuid; v_status public.campaign_status;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  SELECT id, status INTO v_campaign_id, v_status FROM public.campaigns
    WHERE organization_id = v_org_a AND name = 'Phase8A1 Smoke Campaign Review';

  IF v_campaign_id IS NULL THEN
    INSERT INTO public.campaigns (organization_id, client_id, name, objective, platform, budget, status, created_by, updated_by, metadata)
    VALUES (v_org_a, v_client_a, 'Phase8A1 Smoke Campaign Review', 'engagement', 'meta_ads', 400, 'draft', v_owner, v_owner, '{"fixture":"phase8a1-local"}'::jsonb)
    RETURNING id, status INTO v_campaign_id, v_status;
  END IF;

  IF v_status = 'draft' THEN
    UPDATE public.campaigns SET status = 'review', submitted_for_review_at = now(), updated_by = v_owner
      WHERE id = v_campaign_id AND status = 'draft';
    v_status := 'review';
  END IF;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8a1_ids (key, value) VALUES ('campaign_review', v_campaign_id)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  IF v_status = 'review' THEN
    RAISE NOTICE 'RESULT: 4.4 campaign en review (sin decidir, crea-o-reusa) = PASS (campaign=%)', v_campaign_id;
  ELSE
    RAISE NOTICE 'RESULT: 4.4 campaign en review (sin decidir, crea-o-reusa) = PASS (campaign=%, NOTA: encontrada en estado %, no review -- no se fuerza silenciosamente, sigue sirviendo mientras != approved)', v_campaign_id, v_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 4.4 campaign en review (sin decidir, crea-o-reusa) = FAIL (%: %)', SQLSTATE, SQLERRM;
END;
$campaign_review$;

-- 4.5 Campaign REJECTED (state-aware: crea-o-reusa, rechaza UNA sola vez).
DO $campaign_rejected$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid;
  v_campaign_id uuid; v_status public.campaign_status;
  v_rejection_id uuid; v_rejection_count int;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  SELECT id, status INTO v_campaign_id, v_status FROM public.campaigns
    WHERE organization_id = v_org_a AND name = 'Phase8A1 Smoke Campaign Rejected';

  IF v_campaign_id IS NULL THEN
    INSERT INTO public.campaigns (organization_id, client_id, name, objective, platform, budget, status, created_by, updated_by, metadata)
    VALUES (v_org_a, v_client_a, 'Phase8A1 Smoke Campaign Rejected', 'lead_generation', 'meta_ads', 200, 'draft', v_owner, v_owner, '{"fixture":"phase8a1-local"}'::jsonb)
    RETURNING id, status INTO v_campaign_id, v_status;
  END IF;

  IF v_status = 'draft' THEN
    UPDATE public.campaigns SET status = 'review', submitted_for_review_at = now(), updated_by = v_owner
      WHERE id = v_campaign_id AND status = 'draft';
    v_status := 'review';
  END IF;

  IF v_status = 'review' THEN
    PERFORM public.reject_campaign(v_campaign_id, 'Phase8A1 smoke fixture — rechazo de prueba, no real');
  ELSIF v_status = 'rejected' THEN
    NULL; -- reuso: ya rechazada por una corrida previa -- NO se vuelve a llamar reject_campaign.
  ELSE
    RAISE EXCEPTION 'harness: campaign "Rejected" (%) en estado inesperado/incompatible % (se esperaba draft/review/rejected)', v_campaign_id, v_status;
  END IF;

  SELECT count(*) INTO v_rejection_count FROM public.campaign_approvals
    WHERE campaign_id = v_campaign_id AND action = 'rejected';
  IF v_rejection_count <> 1 THEN
    RAISE EXCEPTION 'harness: se esperaba exactamente 1 campaign_approval "rejected" para campaign % (encontrados %)', v_campaign_id, v_rejection_count;
  END IF;
  SELECT id INTO v_rejection_id FROM public.campaign_approvals
    WHERE campaign_id = v_campaign_id AND action = 'rejected';

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8a1_ids (key, value) VALUES ('campaign_rejected', v_campaign_id), ('rejection1', v_rejection_id)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  RAISE NOTICE 'RESULT: 4.5 campaign rejected (state-aware, crea-o-reusa) + rejection audit real = PASS (campaign=%, rejection=%)',
    v_campaign_id, v_rejection_id;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 4.5 campaign rejected (state-aware, crea-o-reusa) + rejection audit real = FAIL (%: %)', SQLSTATE, SQLERRM;
END;
$campaign_rejected$;

-- =============================================================================
-- SECCIÓN 5 — CREACIÓN DE ACTIVATION: PASS + 4 casos FAIL (linkage de aprobación)
--
-- ACTIVATIONS SIEMPRE NUEVAS POR CORRIDA (Round E, punto 4): a diferencia de
-- las campañas (SECCIÓN 4, state-aware), 5.1 sigue insertando una activation
-- NUEVA en cada corrida (sin dedupe) -- eso NUNCA cambió. Lo que las hace
-- seguras de repetir es que uq_campaign_activations_active_per_campaign solo
-- bloquea una SEGUNDA activation no-terminal CONCURRENTE para la misma
-- campaña; una activation completed/cancelled histórica no cuenta para ese
-- índice parcial. Y esta corrida SIEMPRE deja su propia activation_ok en un
-- estado terminal antes de terminar: SECCIÓN 10 la lleva por
-- pending -> preparing -> ready -> published, momento en el que el trigger
-- de Phase 8A.1 deriva automáticamente activation.status a 'completed'
-- (10.4b) -- así que para la SIGUIENTE corrida, la activation de esta
-- corrida ya es terminal y 5.1 puede insertar otra sin colisionar. Lo mismo
-- aplica a activation_cancelled (10.6/10.7): cancelled es terminal.
--
-- Por eso NO existe (ni existió antes de Round D) ningún preámbulo de
-- limpieza de activations aquí -- el ciclo de vida normal del script ya las
-- deja terminales. (La antigua "SECCIÓN 4.5" de Round B/C intentaba resolver
-- un síntoma distinto -- una corrida ABORTADA a mitad de camino por el bug
-- de campañas de Round B/C/D podía dejar una activation atascada en
-- 'pending'; con SECCIÓN 4 ahora state-aware y sin abortar, ese escenario ya
-- no ocurre en una corrida normal, así que esa sección fue eliminada en
-- Round D y nunca reintroducida.)
--
-- Las activations/targets/events smoke de corridas anteriores permanecen en
-- la base (histórico, terminal, inmutable por diseño) y NO afectan los
-- asserts de esta corrida: SECCIÓN 6-11 solo leen/escriben vía los ids
-- capturados en p8a1_ids DURANTE esta ejecución (activation_ok, target_ok,
-- event_ok, activation_cancelled), nunca por conteo global de filas
-- Phase8A1 -- ver también SECCIÓN 8 (eventos) y SECCIÓN 13 (inventario).
-- =============================================================================

-- 5.1 PASS: campaña approved + approval real → debe funcionar.
DO $act_pass$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_campaign uuid; v_approval uuid; v_activation_id uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_approved1';
  SELECT value INTO v_approval FROM p8a1_ids WHERE key = 'approval1';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by, metadata)
  VALUES
    (v_org_a, v_client_a, v_campaign, v_approval,
     jsonb_build_object(
       'schemaVersion', 'activation-snapshot-v1',
       'campaign', jsonb_build_object('id', v_campaign, 'name', 'Phase8A1 Smoke Campaign Approved 1', 'objective', 'conversions', 'platform', 'meta_ads', 'budget', 1000, 'currency', 'COP', 'startDate', null, 'endDate', null),
       'generatedContent', null,
       'metadata', '{}'::jsonb,
       'approval', jsonb_build_object('campaignApprovalId', v_approval, 'approvedAt', now(), 'approvedBy', v_owner)
     ),
     v_owner, '{"fixture":"phase8a1-local"}'::jsonb)
  RETURNING id INTO v_activation_id;

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);

  INSERT INTO p8a1_ids (key, value) VALUES ('activation_ok', v_activation_id)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RAISE NOTICE 'RESULT: 5.1 PASS campaña approved + approval real -> activation creada = PASS (activation=%)', v_activation_id;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 5.1 PASS campaña approved + approval real -> activation creada = FAIL (error inesperado: %)', SQLERRM;
END;
$act_pass$;

-- 5.2 FAIL: campaña draft → debe ser rechazada por check_activation_source.
DO $act_fail_draft$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_campaign uuid; v_approval uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_draft';
  SELECT value INTO v_approval FROM p8a1_ids WHERE key = 'approval1'; -- approval real, pero de OTRA campaña

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_a, v_client_a, v_campaign, v_approval, '{"schemaVersion":"activation-snapshot-v1"}'::jsonb, v_owner);

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 5.2 FAIL campaña draft -> activation debe ser rechazada = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is not approved' THEN
    RAISE NOTICE 'RESULT: 5.2 FAIL campaña draft -> activation debe ser rechazada = PASS (rechazada como se esperaba: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 5.2 FAIL campaña draft -> activation debe ser rechazada = FAIL (rechazada pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$act_fail_draft$;

-- 5.3 FAIL: campaña en review (sin decidir) → debe ser rechazada.
DO $act_fail_review$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_campaign uuid; v_approval uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_review';
  SELECT value INTO v_approval FROM p8a1_ids WHERE key = 'approval1';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_a, v_client_a, v_campaign, v_approval, '{"schemaVersion":"activation-snapshot-v1"}'::jsonb, v_owner);

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 5.3 FAIL campaña review -> activation debe ser rechazada = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is not approved' THEN
    RAISE NOTICE 'RESULT: 5.3 FAIL campaña review -> activation debe ser rechazada = PASS (rechazada como se esperaba: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 5.3 FAIL campaña review -> activation debe ser rechazada = FAIL (rechazada pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$act_fail_review$;

-- 5.4 FAIL: campaña rejected, usando la fila de rechazo (action='rejected') como si autorizara.
DO $act_fail_rejected$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_campaign uuid; v_rejection uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_rejected';
  SELECT value INTO v_rejection FROM p8a1_ids WHERE key = 'rejection1';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_a, v_client_a, v_campaign, v_rejection, '{"schemaVersion":"activation-snapshot-v1"}'::jsonb, v_owner);

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 5.4 FAIL rejection audit row usada como approval source = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  -- Round C finding #1: check_activation_source valida PRIMERO campaign.status = approved
  -- y SOLO DESPUÉS valida que la campaign_approval referenciada sea una decisión de
  -- aprobación (action = 'approve'). La campaña de este fixture fue rechazada vía
  -- reject_campaign, así que su status ya es 'rejected' -- el trigger nunca llega a
  -- inspeccionar la fila de auditoría de rechazo como "approval source" porque el primer
  -- guard ya cortó la ejecución. La propiedad que este test debe probar es "una fila de
  -- auditoría de rechazo NO puede usarse para crear una activation", y esa propiedad
  -- queda probada por CUALQUIERA de las dos rutas de rechazo semánticamente válidas --
  -- no se reordena ni se debilita check_activation_source solo para forzar la ruta B;
  -- se acepta la ruta A tal como el motor la produce hoy.
  --   ruta A: campaign.status != approved (current status: rejected)
  --   ruta B: campaign_approval referenciada no es una decisión de aprobación (action != approve)
  IF SQLERRM ~* 'is not approved' OR SQLERRM ~* 'current status: rejected' OR SQLERRM ~* 'is not an approval' THEN
    RAISE NOTICE 'RESULT: 5.4 FAIL rejection audit row usada como approval source = PASS (rechazada como se esperaba -- ruta A [campaign no aprobada] o ruta B [approval no es "approve"]: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 5.4 FAIL rejection audit row usada como approval source = FAIL (rechazada pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$act_fail_rejected$;

-- 5.5 FAIL: approval real, pero de OTRA campaña (approved2's approval con approved1's campaign_id).
DO $act_fail_wrong_approval$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_campaign uuid; v_wrong_approval uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_approved1';
  SELECT value INTO v_wrong_approval FROM p8a1_ids WHERE key = 'approval2'; -- pertenece a approved2, no a approved1

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_a, v_client_a, v_campaign, v_wrong_approval, '{"schemaVersion":"activation-snapshot-v1"}'::jsonb, v_owner);

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 5.5 FAIL approval de otra campaña = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'does not belong to campaign' THEN
    RAISE NOTICE 'RESULT: 5.5 FAIL approval de otra campaña = PASS (rechazada como se esperaba: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 5.5 FAIL approval de otra campaña = FAIL (rechazada pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$act_fail_wrong_approval$;

-- 5.6 NEGATIVO EXTRA: campaign_approval_id inexistente/forjado (UUID aleatorio) — nunca debe aceptarse ciegamente.
DO $act_fail_forged$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_campaign uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_approved1';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_a, v_client_a, v_campaign, gen_random_uuid(), '{"schemaVersion":"activation-snapshot-v1"}'::jsonb, v_owner);

  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 5.6 FAIL campaign_approval_id forjado/inexistente = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'campaign_approval not found' THEN
    RAISE NOTICE 'RESULT: 5.6 FAIL campaign_approval_id forjado/inexistente = PASS (rechazado como se esperaba: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 5.6 FAIL campaign_approval_id forjado/inexistente = FAIL (rechazado pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$act_fail_forged$;

-- =============================================================================
-- SECCIÓN 6 — TENENCIA (mismatch de organization_id/client_id, cross-org integration)
-- =============================================================================

-- 6.1 FAIL: activation.organization_id != campaign.organization_id
DO $tenant_fail_org$
DECLARE
  v_org_b uuid; v_client_a uuid; v_owner uuid; v_campaign uuid; v_approval uuid;
BEGIN
  SELECT value INTO v_org_b FROM p8a1_ids WHERE key = 'org_b';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_approved1';
  SELECT value INTO v_approval FROM p8a1_ids WHERE key = 'approval1';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_b, v_client_a, v_campaign, v_approval, '{"schemaVersion":"activation-snapshot-v1"}'::jsonb, v_owner);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 6.1 FAIL activation.organization_id != campaign.organization_id = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'organization_id mismatch' THEN
    RAISE NOTICE 'RESULT: 6.1 FAIL activation.organization_id != campaign.organization_id = PASS (rechazada: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 6.1 FAIL activation.organization_id != campaign.organization_id = FAIL (rechazada pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$tenant_fail_org$;

-- 6.2 FAIL: activation.client_id != campaign.client_id
DO $tenant_fail_client$
DECLARE
  v_org_a uuid; v_client_b uuid; v_owner uuid; v_campaign uuid; v_approval uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_b FROM p8a1_ids WHERE key = 'client_b';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_approved1';
  SELECT value INTO v_approval FROM p8a1_ids WHERE key = 'approval1';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_a, v_client_b, v_campaign, v_approval, '{"schemaVersion":"activation-snapshot-v1"}'::jsonb, v_owner);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 6.2 FAIL activation.client_id != campaign.client_id = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'client_id mismatch' THEN
    RAISE NOTICE 'RESULT: 6.2 FAIL activation.client_id != campaign.client_id = PASS (rechazada: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 6.2 FAIL activation.client_id != campaign.client_id = FAIL (rechazada pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$tenant_fail_client$;

-- 6.3 PASS: target manual válido sobre activation_ok (necesario para 6.4/6.5 y SECCIÓN 9/10).
DO $target_ok$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_activation uuid; v_target_id uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activation_targets
    (activation_id, organization_id, client_id, channel, provider)
  VALUES
    (v_activation, v_org_a, v_client_a, 'manual', 'manual')
  RETURNING id INTO v_target_id;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8a1_ids (key, value) VALUES ('target_ok', v_target_id) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  RAISE NOTICE 'RESULT: 6.3 PASS target manual válido = PASS (target=%)', v_target_id;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 6.3 PASS target manual válido = FAIL (error inesperado: %)', SQLERRM;
END;
$target_ok$;

-- 6.4 FAIL: target.organization_id != activation.organization_id
DO $target_fail_org$
DECLARE
  v_org_b uuid; v_client_a uuid; v_owner uuid; v_activation uuid;
BEGIN
  SELECT value INTO v_org_b FROM p8a1_ids WHERE key = 'org_b';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activation_targets
    (activation_id, organization_id, client_id, channel, provider)
  VALUES
    (v_activation, v_org_b, v_client_a, 'manual', 'manual');

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 6.4 FAIL target.organization_id != activation.organization_id = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'organization_id mismatch' THEN
    RAISE NOTICE 'RESULT: 6.4 FAIL target.organization_id != activation.organization_id = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 6.4 FAIL target.organization_id != activation.organization_id = FAIL (rechazado pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$target_fail_org$;

-- 6.5 FAIL (Critical, R-ACT-04): client_integration_id de OTRA organización referenciado en un target.
DO $target_fail_cross_org_integration$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_activation uuid; v_integration_b uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';
  SELECT value INTO v_integration_b FROM p8a1_ids WHERE key = 'integration_b';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activation_targets
    (activation_id, organization_id, client_id, channel, provider, client_integration_id)
  VALUES
    (v_activation, v_org_a, v_client_a, 'meta_ads', 'meta', v_integration_b);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 6.5 FAIL cross-org client_integration_id en target (R-ACT-04) = FAIL (¡se creó sin error, DEFECTO CRÍTICO!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'does not belong to the same org/client' THEN
    RAISE NOTICE 'RESULT: 6.5 FAIL cross-org client_integration_id en target (R-ACT-04) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 6.5 FAIL cross-org client_integration_id en target (R-ACT-04) = FAIL (rechazado pero por razón incorrecta, DEFECTO POSIBLE: %)', SQLERRM;
  END IF;
END;
$target_fail_cross_org_integration$;

-- =============================================================================
-- SECCIÓN 7 — IDEMPOTENCIA (índices únicos parciales)
-- =============================================================================

-- 7.1 FAIL esperado: segunda activation NO-terminal para la MISMA campaña (uq_campaign_activations_active_per_campaign).
DO $idem_activation$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_campaign uuid; v_approval uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_approved1';
  SELECT value INTO v_approval FROM p8a1_ids WHERE key = 'approval1';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  -- activation_ok (5.1) ya existe y sigue no-terminal (status='pending') para esta misma campaña.
  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_a, v_client_a, v_campaign, v_approval, '{"schemaVersion":"activation-snapshot-v1"}'::jsonb, v_owner);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 7.1 FAIL segunda activation no-terminal misma campaña (idempotencia) = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLSTATE = '23505' THEN
    RAISE NOTICE 'RESULT: 7.1 FAIL segunda activation no-terminal misma campaña (idempotencia) = PASS (rechazada por unique_violation, sqlstate=%: %)', SQLSTATE, SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 7.1 FAIL segunda activation no-terminal misma campaña (idempotencia) = FAIL (rechazada pero NO por unique_violation, sqlstate=%: %)', SQLSTATE, SQLERRM;
  END IF;
END;
$idem_activation$;

-- 7.2 FAIL esperado: target duplicado (mismo activation_id + channel + provider + placement).
DO $idem_target$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_activation uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  -- Duplicado exacto del target manual creado en 6.3.
  INSERT INTO public.campaign_activation_targets
    (activation_id, organization_id, client_id, channel, provider)
  VALUES
    (v_activation, v_org_a, v_client_a, 'manual', 'manual');

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 7.2 FAIL target duplicado (dedupe) = FAIL (¡se creó sin error, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLSTATE = '23505' THEN
    RAISE NOTICE 'RESULT: 7.2 FAIL target duplicado (dedupe) = PASS (rechazado por unique_violation, sqlstate=%: %)', SQLSTATE, SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 7.2 FAIL target duplicado (dedupe) = FAIL (rechazado pero NO por unique_violation, sqlstate=%: %)', SQLSTATE, SQLERRM;
  END IF;
END;
$idem_target$;

-- =============================================================================
-- SECCIÓN 8 — APPEND-ONLY de campaign_activation_events
-- =============================================================================

DO $append_only$
DECLARE
  v_owner uuid; v_activation uuid; v_event_id uuid; v_event_count int;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  -- 8.1: SELECT debe funcionar (evento 'activation_created' insertado por el trigger en 5.1).
  SELECT count(*) INTO v_event_count FROM public.campaign_activation_events WHERE activation_id = v_activation;
  SELECT id INTO v_event_id FROM public.campaign_activation_events WHERE activation_id = v_activation ORDER BY created_at ASC LIMIT 1;
  IF v_event_count > 0 THEN
    RAISE NOTICE 'RESULT: 8.1 SELECT de eventos (authenticated, org-scoped) = PASS (count=%)', v_event_count;
  ELSE
    RAISE NOTICE 'RESULT: 8.1 SELECT de eventos (authenticated, org-scoped) = FAIL (0 eventos, se esperaba al menos activation_created)';
  END IF;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  INSERT INTO p8a1_ids (key, value) VALUES ('event_ok', v_event_id) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 8.1 SELECT de eventos (authenticated, org-scoped) = FAIL (error inesperado: %)', SQLERRM;
END;
$append_only$;

-- 8.2 FAIL esperado: UPDATE directo sobre un evento como authenticated → debe ser denegado.
DO $append_only_update$
DECLARE
  v_owner uuid; v_event_id uuid;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_event_id FROM p8a1_ids WHERE key = 'event_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  UPDATE public.campaign_activation_events SET note = 'tampering attempt' WHERE id = v_event_id;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 8.2 FAIL UPDATE directo de evento (authenticated) = FAIL (¡se permitió, DEFECTO! append-only violado)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'RESULT: 8.2 FAIL UPDATE directo de evento (authenticated) = PASS (denegado por insufficient_privilege, sqlstate=%: %)', SQLSTATE, SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 8.2 FAIL UPDATE directo de evento (authenticated) = FAIL (denegado pero NO por insufficient_privilege, sqlstate=%: %)', SQLSTATE, SQLERRM;
  END IF;
END;
$append_only_update$;

-- 8.3 FAIL esperado: DELETE directo sobre un evento como authenticated → debe ser denegado.
DO $append_only_delete$
DECLARE
  v_owner uuid; v_event_id uuid;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_event_id FROM p8a1_ids WHERE key = 'event_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  DELETE FROM public.campaign_activation_events WHERE id = v_event_id;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 8.3 FAIL DELETE directo de evento (authenticated) = FAIL (¡se permitió, DEFECTO! append-only violado)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLSTATE = '42501' THEN
    RAISE NOTICE 'RESULT: 8.3 FAIL DELETE directo de evento (authenticated) = PASS (denegado por insufficient_privilege, sqlstate=%: %)', SQLSTATE, SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 8.3 FAIL DELETE directo de evento (authenticated) = FAIL (denegado pero NO por insufficient_privilege, sqlstate=%: %)', SQLSTATE, SQLERRM;
  END IF;
END;
$append_only_delete$;

-- 8.4 Confirmar (como postgres/table-owner) que el evento sigue exactamente igual — nadie lo mutó.
DO $append_only_verify_intact$
DECLARE
  v_event_id uuid; v_note text;
BEGIN
  SELECT value INTO v_event_id FROM p8a1_ids WHERE key = 'event_ok';
  SELECT note INTO v_note FROM public.campaign_activation_events WHERE id = v_event_id;
  IF v_note IS NULL THEN
    RAISE NOTICE 'RESULT: 8.4 evento permanece inmutable tras 8.2/8.3 = PASS (note sigue NULL)';
  ELSE
    RAISE NOTICE 'RESULT: 8.4 evento permanece inmutable tras 8.2/8.3 = FAIL (note=%, se mutó)', v_note;
  END IF;
END;
$append_only_verify_intact$;

-- =============================================================================
-- SECCIÓN 9 — SNAPSHOT: inspección del persistido + separación domain/Zod vs Postgres
-- =============================================================================

\echo '--- 9.1 Snapshot persistido de activation_ok (inspección visual) ---'
SELECT approved_snapshot
FROM public.campaign_activations
WHERE id = (SELECT value FROM p8a1_ids WHERE key = 'activation_ok');

DO $snapshot_shape$
DECLARE
  v_activation uuid; v_snapshot jsonb; v_has_forbidden_key boolean;
BEGIN
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';
  SELECT approved_snapshot INTO v_snapshot FROM public.campaign_activations WHERE id = v_activation;

  -- Estructura esperada presente (schemaVersion, campaign, approval).
  IF v_snapshot ? 'schemaVersion' AND v_snapshot ? 'campaign' AND v_snapshot ? 'approval' THEN
    RAISE NOTICE 'RESULT: 9.1 snapshot tiene forma estructurada (schemaVersion/campaign/approval) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 9.1 snapshot tiene forma estructurada (schemaVersion/campaign/approval) = FAIL (keys=%)', jsonb_object_keys(v_snapshot);
  END IF;

  -- Búsqueda de nombres de clave típicos de secretos/credenciales en TODO el snapshot (recursiva por texto).
  SELECT v_snapshot::text ~* '"(secret|token|password|api_?key|access_?token|credential|bearer|oauth)"'
    INTO v_has_forbidden_key;
  IF NOT v_has_forbidden_key THEN
    RAISE NOTICE 'RESULT: 9.2 snapshot sin claves de secretos/tokens/credenciales = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 9.2 snapshot sin claves de secretos/tokens/credenciales = FAIL (se encontró un patrón sospechoso)';
  END IF;
END;
$snapshot_shape$;

-- 9.3: la validación fuerte de FORMA (versión, tipos, enums, budget>=0) es Zod/domain, NO Postgres.
-- Postgres SOLO valida que sea un objeto JSON (jsonb_typeof = 'object') — demostrado aquí.
DO $snapshot_db_boundary$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_campaign uuid; v_approval uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_approved2';
  SELECT value INTO v_approval FROM p8a1_ids WHERE key = 'approval2';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  -- Postgres SÍ debe rechazar esto: approved_snapshot no es un objeto (es un string JSON).
  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_a, v_client_a, v_campaign, v_approval, '"esto no es un objeto"'::jsonb, v_owner);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 9.3 Postgres rechaza approved_snapshot no-objeto (jsonb_typeof CHECK) = FAIL (¡se creó sin error!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLSTATE = '23514' THEN
    RAISE NOTICE 'RESULT: 9.3 Postgres rechaza approved_snapshot no-objeto (jsonb_typeof CHECK) = PASS (rechazado por check_violation, sqlstate=%: %). '
      'NOTA: esto SOLO prueba el CHECK de forma jsonb — el schema Zod completo (versión, tipos de campo, enums, budget>=0, campos extra) NUNCA se evalúa en Postgres, se evalúa en packages/shared antes de llegar aquí.', SQLSTATE, SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 9.3 Postgres rechaza approved_snapshot no-objeto (jsonb_typeof CHECK) = FAIL (rechazado pero NO por check_violation, sqlstate=%: %)', SQLSTATE, SQLERRM;
  END IF;
END;
$snapshot_db_boundary$;

-- =============================================================================
-- SECCIÓN 10 — TRANSICIONES (RPCs reales) — activation y target
-- =============================================================================

-- 10.1 PASS: prepare_activation_target (pending -> preparing) sobre target_ok.
DO $trans_prepare$
DECLARE
  v_owner uuid; v_target uuid; v_status public.activation_target_status;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_target FROM p8a1_ids WHERE key = 'target_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  PERFORM public.prepare_activation_target(v_target, '{"assetsReady":true}'::jsonb);
  SELECT status INTO v_status FROM public.campaign_activation_targets WHERE id = v_target;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF v_status = 'preparing' THEN
    RAISE NOTICE 'RESULT: 10.1 prepare_activation_target pending->preparing = PASS (status=%)', v_status;
  ELSE
    RAISE NOTICE 'RESULT: 10.1 prepare_activation_target pending->preparing = FAIL (status=%, esperado preparing)', v_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 10.1 prepare_activation_target pending->preparing = FAIL (error inesperado: %)', SQLERRM;
END;
$trans_prepare$;

-- 10.2 FAIL esperado: mark_activation_target_published directo desde 'preparing' (salta ready/scheduled) → RPC debe rechazar.
DO $trans_invalid_skip$
DECLARE
  v_owner uuid; v_target uuid;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_target FROM p8a1_ids WHERE key = 'target_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  PERFORM public.mark_activation_target_published(v_target, NULL, NULL);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 10.2 mark_published desde preparing (salto inválido) = FAIL (¡se permitió, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is not ready/scheduled' THEN
    RAISE NOTICE 'RESULT: 10.2 mark_published desde preparing (salto inválido) = PASS (rechazado: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 10.2 mark_published desde preparing (salto inválido) = FAIL (rechazado pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$trans_invalid_skip$;

-- 10.3 PASS: mark_activation_target_ready (preparing -> ready).
DO $trans_ready$
DECLARE
  v_owner uuid; v_target uuid; v_status public.activation_target_status;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_target FROM p8a1_ids WHERE key = 'target_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  PERFORM public.mark_activation_target_ready(v_target);
  SELECT status INTO v_status FROM public.campaign_activation_targets WHERE id = v_target;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF v_status = 'ready' THEN
    RAISE NOTICE 'RESULT: 10.3 mark_activation_target_ready preparing->ready = PASS (status=%)', v_status;
  ELSE
    RAISE NOTICE 'RESULT: 10.3 mark_activation_target_ready preparing->ready = FAIL (status=%)', v_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 10.3 mark_activation_target_ready preparing->ready = FAIL (error inesperado: %)', SQLERRM;
END;
$trans_ready$;

-- 10.4 PASS: mark_activation_target_published (camino manual: ready -> published directo).
-- Verifica también que el status de la ACTIVATION se derive automáticamente a 'completed'
-- (compute_campaign_activation_status trigger) y que campaign.status NO cambie.
DO $trans_publish$
DECLARE
  v_owner uuid; v_target uuid; v_activation uuid; v_campaign uuid;
  v_target_status public.activation_target_status;
  v_activation_status public.activation_status;
  v_campaign_status public.campaign_status;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_target FROM p8a1_ids WHERE key = 'target_ok';
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_approved1';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  PERFORM public.mark_activation_target_published(v_target, 'phase8a1-smoke-external-ref', 'Publicado manualmente (smoke)');
  SELECT status INTO v_target_status FROM public.campaign_activation_targets WHERE id = v_target;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);

  SELECT status INTO v_activation_status FROM public.campaign_activations WHERE id = v_activation;
  SELECT status INTO v_campaign_status FROM public.campaigns WHERE id = v_campaign;

  IF v_target_status = 'published' THEN
    RAISE NOTICE 'RESULT: 10.4a mark_activation_target_published ready->published (manual) = PASS (status=%)', v_target_status;
  ELSE
    RAISE NOTICE 'RESULT: 10.4a mark_activation_target_published ready->published (manual) = FAIL (status=%)', v_target_status;
  END IF;

  IF v_activation_status = 'completed' THEN
    RAISE NOTICE 'RESULT: 10.4b activation.status derivado automáticamente a completed = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 10.4b activation.status derivado automáticamente a completed = FAIL (status=%)', v_activation_status;
  END IF;

  IF v_campaign_status = 'approved' THEN
    RAISE NOTICE 'RESULT: 10.4c campaign.status permanece approved (NO auto-transiciona a active) = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 10.4c campaign.status permanece approved (NO auto-transiciona a active) = FAIL (status=%, DEBERÍA seguir approved)', v_campaign_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 10.4 mark_activation_target_published (manual) = FAIL (error inesperado: %)', SQLERRM;
END;
$trans_publish$;

-- 10.5 FAIL esperado: mark_activation_target_ready sobre un target YA terminal (published) — no debe volver a moverse.
DO $trans_terminal_guard$
DECLARE
  v_owner uuid; v_target uuid;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_target FROM p8a1_ids WHERE key = 'target_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  PERFORM public.mark_activation_target_ready(v_target);

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 10.5 transición inválida desde estado terminal (published) = FAIL (¡se permitió, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is not preparing' THEN
    RAISE NOTICE 'RESULT: 10.5 transición inválida desde estado terminal (published) = PASS (rechazada: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 10.5 transición inválida desde estado terminal (published) = FAIL (rechazada pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$trans_terminal_guard$;

-- 10.6 PASS: cancel_campaign_activation sobre una activation FRESCA (pending, sin targets) — camino de cancelación limpio.
DO $trans_cancel_fresh$
DECLARE
  v_org_a uuid; v_client_a uuid; v_owner uuid; v_campaign uuid; v_approval uuid; v_fresh_activation uuid;
  v_status public.activation_status;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_client_a FROM p8a1_ids WHERE key = 'client_a';
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_campaign FROM p8a1_ids WHERE key = 'campaign_approved2';
  SELECT value INTO v_approval FROM p8a1_ids WHERE key = 'approval2';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  INSERT INTO public.campaign_activations
    (organization_id, client_id, campaign_id, campaign_approval_id, approved_snapshot, created_by)
  VALUES
    (v_org_a, v_client_a, v_campaign, v_approval, '{"schemaVersion":"activation-snapshot-v1"}'::jsonb, v_owner)
  RETURNING id INTO v_fresh_activation;

  PERFORM public.cancel_campaign_activation(v_fresh_activation, 'Phase8A1 smoke fixture — cancelación de prueba');
  SELECT status INTO v_status FROM public.campaign_activations WHERE id = v_fresh_activation;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  INSERT INTO p8a1_ids (key, value) VALUES ('activation_cancelled', v_fresh_activation) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  IF v_status = 'cancelled' THEN
    RAISE NOTICE 'RESULT: 10.6 cancel_campaign_activation sobre activation fresca = PASS (status=%)', v_status;
  ELSE
    RAISE NOTICE 'RESULT: 10.6 cancel_campaign_activation sobre activation fresca = FAIL (status=%)', v_status;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 10.6 cancel_campaign_activation sobre activation fresca = FAIL (error inesperado: %)', SQLERRM;
END;
$trans_cancel_fresh$;

-- 10.7 FAIL esperado: cancelar de nuevo una activation ya cancelled (terminal).
DO $trans_cancel_terminal$
DECLARE
  v_owner uuid; v_activation uuid;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_cancelled';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  PERFORM public.cancel_campaign_activation(v_activation, 'segundo intento de cancelación');

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 10.7 cancelar activation ya terminal (cancelled) = FAIL (¡se permitió, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF SQLERRM ~* 'is already terminal' THEN
    RAISE NOTICE 'RESULT: 10.7 cancelar activation ya terminal (cancelled) = PASS (rechazada: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 10.7 cancelar activation ya terminal (cancelled) = FAIL (rechazada pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$trans_cancel_terminal$;

-- 10.8 FAIL esperado: actor spoofing — intentar pasar un actor_user_id como parámetro no existe en ninguna RPC;
-- se verifica indirectamente comprobando que auth.uid() NULL (sin sesión) es rechazado.
DO $trans_no_actor$
DECLARE
  v_target uuid;
BEGIN
  SELECT value INTO v_target FROM p8a1_ids WHERE key = 'target_ok';

  PERFORM set_config('request.jwt.claim.sub', '', false); -- sin actor
  SET ROLE authenticated;

  PERFORM public.cancel_activation_target(v_target, 'intento sin auth.uid()');

  RESET ROLE;
  RAISE NOTICE 'RESULT: 10.8 RPC sin auth.uid() (actor NULL) = FAIL (¡se permitió, defecto real!)';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  IF SQLERRM ~* 'authentication required' THEN
    RAISE NOTICE 'RESULT: 10.8 RPC sin auth.uid() (actor NULL) = PASS (rechazada: %)', SQLERRM;
  ELSE
    RAISE NOTICE 'RESULT: 10.8 RPC sin auth.uid() (actor NULL) = FAIL (rechazada pero por razón incorrecta: %)', SQLERRM;
  END IF;
END;
$trans_no_actor$;

-- =============================================================================
-- SECCIÓN 11 — RLS / CONTEXTO DE AUTENTICACIÓN
-- =============================================================================

-- 11.1 PASS: miembro de la organización puede SELECT su propia activation.
DO $rls_own_org$
DECLARE
  v_owner uuid; v_activation uuid; v_count int;
BEGIN
  SELECT value INTO v_owner FROM p8a1_ids WHERE key = 'owner';
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.campaign_activations WHERE id = v_activation;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF v_count = 1 THEN
    RAISE NOTICE 'RESULT: 11.1 org member SELECT su propia activation = PASS';
  ELSE
    RAISE NOTICE 'RESULT: 11.1 org member SELECT su propia activation = FAIL (count=%)', v_count;
  END IF;
END;
$rls_own_org$;

-- 11.2 FAIL esperado: actor SIN membresía (UUID aleatorio, no existe en organization_members) no puede ver la activation.
DO $rls_non_member$
DECLARE
  v_activation uuid; v_count int; v_fake_user uuid := gen_random_uuid();
BEGIN
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';

  PERFORM set_config('request.jwt.claim.sub', v_fake_user::text, false);
  SET ROLE authenticated;

  SELECT count(*) INTO v_count FROM public.campaign_activations WHERE id = v_activation;

  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  IF v_count = 0 THEN
    RAISE NOTICE 'RESULT: 11.2 actor sin membresía NO ve la activation (RLS) = PASS (count=0)';
  ELSE
    RAISE NOTICE 'RESULT: 11.2 actor sin membresía NO ve la activation (RLS) = FAIL (count=%, RLS no está filtrando)', v_count;
  END IF;
END;
$rls_non_member$;

-- 11.3 FAIL esperado: un actor con rol operator (piso, por debajo de strategist+) NO debe poder cancelar.
-- Fixture-driven: reutiliza un auth.users existente que AÚN NO es miembro de "BopAgency Local" (org_a),
-- le crea una membresía DESECHABLE con role='operator' (NO crea ningún auth.users nuevo), corre el
-- negative test, y AUTO-LIMPIA esa membresía al final (éxito o excepción) para dejar el estado igual
-- que antes de correr el script (repetible). Solo si genuinamente no existe ningún auth.users libre
-- se reporta un resultado explícitamente ESTRUCTURAL (nunca "SKIPPED") con la razón indicada.
DO $rls_role_floor$
DECLARE
  v_org_a uuid; v_activation uuid; v_spare_user uuid; v_membership_id uuid;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_activation FROM p8a1_ids WHERE key = 'activation_ok';

  -- Busca cualquier auth.users existente que NO sea ya miembro de org_a (candidato desechable).
  SELECT u.id INTO v_spare_user
  FROM auth.users u
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_org_a AND om.user_id = u.id
  )
  ORDER BY u.created_at ASC
  LIMIT 1;

  IF v_spare_user IS NULL THEN
    RAISE NOTICE 'RESULT: 11.3 rol operator no puede cancelar activation = ESTRUCTURAL (no runtime: no existe ningún auth.users disponible que no sea ya miembro de "BopAgency Local", y esta validación NO debe crear un auth.users nuevo; el piso de rol strategist+ está garantizado por el check "actor lacks strategist+ role" en cancel_campaign_activation, verificado por lectura de código, no por ejecución)';
    RETURN;
  END IF;

  -- Membresía desechable role=operator (por debajo del piso strategist+ que exige la RPC).
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_a, v_spare_user, 'operator')
  RETURNING id INTO v_membership_id;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_spare_user::text, false);
    SET ROLE authenticated;

    PERFORM public.cancel_campaign_activation(v_activation, 'intento con rol insuficiente');

    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
    DELETE FROM public.organization_members WHERE id = v_membership_id;
    RAISE NOTICE 'RESULT: 11.3 rol operator no puede cancelar activation = FAIL (¡se permitió, defecto real!)';
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
    DELETE FROM public.organization_members WHERE id = v_membership_id;
    IF SQLERRM ~* 'lacks strategist\+ role' THEN
      RAISE NOTICE 'RESULT: 11.3 rol operator no puede cancelar activation = PASS (rechazado: %)', SQLERRM;
    ELSE
      RAISE NOTICE 'RESULT: 11.3 rol operator no puede cancelar activation = FAIL (rechazado pero por razón incorrecta: %)', SQLERRM;
    END IF;
  END;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE; PERFORM set_config('request.jwt.claim.sub', '', false);
  RAISE NOTICE 'RESULT: 11.3 rol operator no puede cancelar activation = FAIL (error inesperado en fixture: %)', SQLERRM;
END;
$rls_role_floor$;

-- =============================================================================
-- SECCIÓN 12 — SIN EFECTOS SECUNDARIOS
-- =============================================================================

DO $no_side_effects$
DECLARE
  v_tasks_count int; v_alerts_count int; v_exec_count int; v_webhook_count int;
  v_org_a uuid; v_org_b uuid; v_run_start timestamptz;
BEGIN
  SELECT value INTO v_org_a FROM p8a1_ids WHERE key = 'org_a';
  SELECT value INTO v_org_b FROM p8a1_ids WHERE key = 'org_b';
  SELECT value INTO v_run_start FROM p8a1_meta WHERE key = 'run_start';

  -- tasks: real schema has no metadata column (confirmed -- Phase 7F campaign task
  -- correlation uses title/description/tags, not metadata). Query real columns only.
  SELECT count(*) INTO v_tasks_count FROM public.tasks
    WHERE title ILIKE '%Phase8A1%' OR title ILIKE '%phase8a1%'
       OR description ILIKE '%phase8a1%'
       OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE '%phase8a1%');

  -- alerts: real schema genuinely has a metadata jsonb column plus alert_key.
  SELECT count(*) INTO v_alerts_count FROM public.alerts
    WHERE metadata::text ILIKE '%phase8a1%' OR alert_key ILIKE '%phase8a1%';

  -- automation_executions: real columns are input_metadata/output_metadata (NOT
  -- "metadata"). Phase 8A.1 has no automation trigger and tags nothing on this table,
  -- so the strongest reliable correlation from real columns is: any row scoped to our
  -- fixture orgs (org_b is created from zero by this script; org_a is the real
  -- "BopAgency Local" org so we additionally require created_at >= run_start to avoid
  -- flagging the org's pre-existing/unrelated automation history) OR an explicit
  -- phase8a1 marker inside input_metadata/output_metadata if one were ever added.
  SELECT count(*) INTO v_exec_count FROM public.automation_executions
    WHERE (organization_id = v_org_b)
       OR (organization_id = v_org_a AND created_at >= v_run_start)
       OR input_metadata::text ILIKE '%phase8a1%'
       OR output_metadata::text ILIKE '%phase8a1%';

  -- automation_webhook_events: real columns have NO "payload" column at all (only
  -- payload_hash, source, event_type, organization_id) -- the prior query referenced a
  -- non-existent column, which raises undefined_column (NOT undefined_table), so the
  -- EXCEPTION WHEN undefined_table handler never caught it and the whole 12.1 RESULT
  -- line was silently lost. Uses the same org+time correlation as automation_executions.
  BEGIN
    SELECT count(*) INTO v_webhook_count FROM public.automation_webhook_events
      WHERE (organization_id = v_org_b)
         OR (organization_id = v_org_a AND created_at >= v_run_start);
  EXCEPTION WHEN undefined_table THEN
    v_webhook_count := 0;
  END;

  IF v_tasks_count = 0 AND v_alerts_count = 0 AND v_exec_count = 0 AND v_webhook_count = 0 THEN
    RAISE NOTICE 'RESULT: 12.1 ningún efecto secundario en tasks/alerts/automation_executions/webhook_events = PASS (todos en 0)';
  ELSE
    RAISE NOTICE 'RESULT: 12.1 ningún efecto secundario en tasks/alerts/automation_executions/webhook_events = FAIL (tasks=%, alerts=%, executions=%, webhooks=%)',
      v_tasks_count, v_alerts_count, v_exec_count, v_webhook_count;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RESULT: 12.1 ningún efecto secundario en tasks/alerts/automation_executions/webhook_events = FAIL (error inesperado en la query del harness: %)', SQLERRM;
END;
$no_side_effects$;

-- =============================================================================
-- SECCIÓN 13 — INVENTARIO DE SMOKE DATA
-- =============================================================================

\echo '--- 13.1 Inventario completo (para el reporte y para el cleanup) ---'
SELECT key, value FROM p8a1_ids ORDER BY key;

\echo '--- 13.2 Filas reales creadas por este script ---'
SELECT 'organizations' AS tbl, id, name FROM public.organizations WHERE slug = 'phase8a1-smoke-org-b'
UNION ALL
SELECT 'clients', id, name FROM public.clients WHERE slug IN ('phase8a1-smoke-client-a', 'phase8a1-smoke-client-b')
UNION ALL
SELECT 'client_integrations', id, external_account_id FROM public.client_integrations WHERE external_account_id = 'phase8a1-smoke-integration-b'
UNION ALL
SELECT 'campaigns', id, name FROM public.campaigns WHERE name LIKE 'Phase8A1 Smoke Campaign%'
UNION ALL
SELECT 'campaign_approvals', id, action::text FROM public.campaign_approvals WHERE campaign_id IN (SELECT id FROM public.campaigns WHERE name LIKE 'Phase8A1 Smoke Campaign%')
UNION ALL
SELECT 'campaign_activations', id, status::text FROM public.campaign_activations WHERE created_by = (SELECT value FROM p8a1_ids WHERE key = 'owner') AND metadata->>'fixture' = 'phase8a1-local'
UNION ALL
SELECT 'campaign_activation_targets', id, status::text FROM public.campaign_activation_targets WHERE activation_id IN (SELECT id FROM public.campaign_activations WHERE metadata->>'fixture' = 'phase8a1-local')
UNION ALL
SELECT 'campaign_activation_events', id, event_type::text FROM public.campaign_activation_events WHERE activation_id IN (SELECT id FROM public.campaign_activations WHERE metadata->>'fixture' = 'phase8a1-local')
ORDER BY 1, 2;

\echo '=== FIN phase8a1_local_runtime_validation.sql — extraer resultados con: grep RESULT: <output> ==='
