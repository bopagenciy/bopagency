-- =============================================================================
-- Phase 6 — Cleanup de fixtures locales de staging técnico
-- Archivo: supabase/fixtures/phase6_local_staging_cleanup.sql
--
-- PROPÓSITO
--   Revertir exactamente lo creado por phase6_local_staging_fixtures.sql.
--
-- QUÉ BORRA
--   Únicamente registros marcados con fixture = "phase6-local" (en `metadata`
--   donde exista esa columna, o en el tag `fixture:phase6-local` en `tasks`),
--   o que coincidan con las firmas/nombres EXACTOS de estos fixtures
--   (legacy_id, alert_key, idempotency_key, legacy_source+legacy_id).
--   Todo el borrado además queda acotado a la organización "BopAgency Local".
--
-- QUÉ NO BORRA (nunca)
--   - auth.users (usuario)
--   - public.organizations (organización)
--   - public.profiles (perfiles)
--   - public.organization_members (membresías)
--   - cualquier fila sin el marcador/firma de este fixture
--
-- ORDEN DE BORRADO (respeta foreign keys)
--   1. automation_execution_logs
--   2. alerts / tasks
--   3. automation_executions
--   4. automations
--
-- USO
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/fixtures/phase6_local_staging_cleanup.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECCIÓN 0 — GUARDA DE ENTORNO: misma protección que el script de fixtures
-- =============================================================================
DO $guard$
DECLARE
  v_server_addr inet := inet_server_addr();
  v_database    text := current_database();
BEGIN
  IF v_server_addr IS NOT NULL
     AND v_server_addr NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
    RAISE EXCEPTION
      'ABORT phase6_local_staging_cleanup: inet_server_addr()=% no es loopback. '
      'Este script SOLO puede ejecutarse contra Supabase LOCAL (127.0.0.1). '
      'No se realizó ningún borrado.', v_server_addr;
  END IF;

  IF v_database ILIKE '%prod%' THEN
    RAISE EXCEPTION
      'ABORT phase6_local_staging_cleanup: current_database()=% parece un '
      'entorno de producción. No se realizó ningún borrado.', v_database;
  END IF;
END;
$guard$;

-- =============================================================================
-- SECCIÓN 1 — BORRADO ACOTADO A fixture = "phase6-local"
-- =============================================================================
DO $cleanup$
DECLARE
  v_org_id           uuid;
  v_idempotency_key  text := 'phase6-local:local-active-automation:failed:attempt-1';
  v_n_logs           int;
  v_n_alerts         int;
  v_n_tasks          int;
  v_n_executions     int;
  v_n_automations    int;
BEGIN
  -- No abortar si la organización ya no existe: cleanup debe ser un no-op
  -- seguro en ese caso (nada que limpiar).
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE name = 'BopAgency Local';

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'phase6_local_staging_cleanup: organización "BopAgency Local" no encontrada — nada que limpiar.';
    RETURN;
  END IF;

  -- ── 1. automation_execution_logs ───────────────────────────────────────────
  WITH del AS (
    DELETE FROM public.automation_execution_logs
    WHERE organization_id = v_org_id
      AND (
        (metadata->>'fixture') = 'phase6-local'
        OR execution_id IN (
          SELECT id FROM public.automation_executions
          WHERE organization_id = v_org_id
            AND idempotency_key = v_idempotency_key
        )
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_n_logs FROM del;

  -- ── 2a. alerts ──────────────────────────────────────────────────────────────
  WITH del AS (
    DELETE FROM public.alerts
    WHERE organization_id = v_org_id
      AND (
        (metadata->>'fixture') = 'phase6-local'
        OR alert_key LIKE 'automation:' || v_org_id::text || ':%:execution-failed:WORKFLOW_TEST_FAILURE'
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_n_alerts FROM del;

  -- ── 2b. tasks ───────────────────────────────────────────────────────────────
  WITH del AS (
    DELETE FROM public.tasks
    WHERE organization_id = v_org_id
      AND (
        'fixture:phase6-local' = ANY (tags)
        OR (legacy_source = 'phase6_local_fixture' AND legacy_id = 'local-active-automation-failed-task')
        OR title = 'Revisar automatización local fallida'
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_n_tasks FROM del;

  -- ── 3. automation_executions ───────────────────────────────────────────────
  WITH del AS (
    DELETE FROM public.automation_executions
    WHERE organization_id = v_org_id
      AND (
        idempotency_key = v_idempotency_key
        OR (input_metadata->>'fixture') = 'phase6-local'
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_n_executions FROM del;

  -- ── 4. automations ──────────────────────────────────────────────────────────
  WITH del AS (
    DELETE FROM public.automations
    WHERE organization_id = v_org_id
      AND (
        (metadata->>'fixture') = 'phase6-local'
        OR legacy_id IN ('phase6-local-draft-automation', 'phase6-local-active-automation')
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_n_automations FROM del;

  RAISE NOTICE '=== Phase 6 local staging cleanup OK === org=% logs=% alerts=% tasks=% executions=% automations=%',
    v_org_id, v_n_logs, v_n_alerts, v_n_tasks, v_n_executions, v_n_automations;
END;
$cleanup$;

COMMIT;
