-- =============================================================================
-- Phase 6 — Fixtures locales de staging técnico (Automation Runtime QA)
-- Archivo: supabase/fixtures/phase6_local_staging_fixtures.sql
--
-- PROPÓSITO
--   Poblar el Supabase LOCAL (Docker) con el mínimo de datos necesarios para
--   validar manualmente /automations en Phase 6: una automatización draft, una
--   automatización active, una ejecución failed, un log de ejecución sanitizado,
--   una alerta y una tarea operativa.
--
-- ALCANCE / GARANTÍAS
--   - Solo LOCAL: el script aborta si detecta que no está corriendo contra
--     Supabase local (ver SECCIÓN 0).
--   - No usa Supabase cloud, no usa `supabase link`, no usa `db push`/`db reset`.
--   - No modifica migraciones existentes.
--   - No inserta datos reales de clientes: client_id = NULL en todos los fixtures.
--   - No hardcodea UUIDs reales: la organización y el usuario local se
--     RESUELVEN en tiempo de ejecución por nombre / membresía existente.
--   - Idempotente: puede ejecutarse N veces sin duplicar filas. Usa ON CONFLICT
--     sobre constraints/índices únicos REALES que ya existen en el esquema
--     (ver comentarios junto a cada INSERT). Para `automation_execution_logs`,
--     que no tiene una constraint única aplicable, se usa un guard
--     `WHERE NOT EXISTS (...)` en vez de ON CONFLICT.
--   - Todos los registros llevan el marcador `fixture = "phase6-local"` en su
--     columna `metadata` (jsonb) cuando la tabla tiene esa columna. La tabla
--     `tasks` no tiene columna `metadata`, así que el marcador equivalente es
--     el tag `fixture:phase6-local` en su columna `tags` (text[]).
--   - SEGURIDAD: no se guardan payloads crudos, secretos, headers, HMAC ni
--     stack traces en ninguna columna. `error_message` y los mensajes de log
--     son texto sanitizado y corto, describiendo el fixture, no un error real.
--
-- PRECONDICIONES (deben existir ANTES de correr este script)
--   - Migraciones aplicadas: 20260730000000_phase2_auth_and_tenancy.sql,
--     20260730150000_phase4_data_migration_targets.sql,
--     20260804000000_phase6b_automation_runtime.sql.
--   - Una organización con name = 'BopAgency Local'.
--   - Un usuario local con sesión iniciada, con membresía en esa organización
--     (idealmente rol 'owner'; si no hay 'owner', se usa el miembro más antiguo).
--
-- USO
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/fixtures/phase6_local_staging_fixtures.sql
--
-- CLEANUP
--   Ver supabase/fixtures/phase6_local_staging_cleanup.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- SECCIÓN 0 — GUARDA DE ENTORNO: abortar si no parece Supabase local
-- =============================================================================
--
-- Capas de protección (todas deben pasar; basta que UNA falle para abortar):
--   1. Si la conexión llegó por TCP, la IP del servidor debe ser loopback
--      (127.0.0.1 / ::1). Conexiones por socket Unix devuelven NULL en
--      inet_server_addr() y se consideran locales también (caso típico de
--      `supabase db` corriendo en el mismo host).
--   2. El nombre de la base de datos no debe contener "prod".
--   3. Debe existir una organización cuyo nombre sea EXACTAMENTE
--      'BopAgency Local' (marcador de datos de desarrollo local; un proyecto
--      productivo no debería tener una organización con este nombre).
--
DO $guard$
DECLARE
  v_server_addr inet := inet_server_addr();
  v_database    text := current_database();
  v_org_exists  boolean;
BEGIN
  IF v_server_addr IS NOT NULL
     AND v_server_addr NOT IN ('127.0.0.1'::inet, '::1'::inet) THEN
    RAISE EXCEPTION
      'ABORT phase6_local_staging_fixtures: inet_server_addr()=% no es loopback. '
      'Este script SOLO puede ejecutarse contra Supabase LOCAL (127.0.0.1). '
      'No se realizó ninguna escritura.', v_server_addr;
  END IF;

  IF v_database ILIKE '%prod%' THEN
    RAISE EXCEPTION
      'ABORT phase6_local_staging_fixtures: current_database()=% parece un '
      'entorno de producción. No se realizó ninguna escritura.', v_database;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organizations WHERE name = 'BopAgency Local'
  ) INTO v_org_exists;

  IF NOT v_org_exists THEN
    RAISE EXCEPTION
      'ABORT phase6_local_staging_fixtures: no existe una organización con '
      'name = ''BopAgency Local''. Verifique que Supabase local esté '
      'corriendo con los datos esperados antes de reintentar.';
  END IF;

  RAISE NOTICE 'Guarda de entorno local: OK (server_addr=%, database=%)',
    COALESCE(v_server_addr::text, '(socket local)'), v_database;
END;
$guard$;

-- =============================================================================
-- SECCIÓN 1 — RESOLUCIÓN Y CREACIÓN DE FIXTURES (todo en un solo bloque
-- procedural para poder encadenar los IDs resueltos entre INSERTs)
-- =============================================================================

DO $fixtures$
DECLARE
  v_org_id              uuid;
  v_owner_user_id       uuid;
  v_owner_role          text;
  v_draft_automation_id uuid;
  v_active_automation_id uuid;
  v_execution_id        uuid;
  v_alert_id            uuid;
  v_task_id             uuid;
  v_log_exists          boolean;
  v_idempotency_key     text := 'phase6-local:local-active-automation:failed:attempt-1';
BEGIN
  -- ── 1.1 Resolver organización local existente ("BopAgency Local") ─────────
  SELECT id INTO v_org_id
  FROM public.organizations
  WHERE name = 'BopAgency Local';

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'ABORT: organización "BopAgency Local" no encontrada (revalidado).';
  END IF;

  -- ── 1.2 Resolver usuario local existente con membresía en la organización ──
  -- Preferimos el miembro con rol 'owner'; si no existe, usamos el miembro
  -- activo más antiguo como fallback (no se crea ninguna membresía nueva).
  SELECT om.user_id, om.role INTO v_owner_user_id, v_owner_role
  FROM public.organization_members om
  WHERE om.organization_id = v_org_id
    AND om.role = 'owner'
  ORDER BY om.joined_at ASC
  LIMIT 1;

  IF v_owner_user_id IS NULL THEN
    SELECT om.user_id, om.role INTO v_owner_user_id, v_owner_role
    FROM public.organization_members om
    WHERE om.organization_id = v_org_id
    ORDER BY om.joined_at ASC
    LIMIT 1;
  END IF;

  IF v_owner_user_id IS NULL THEN
    RAISE EXCEPTION
      'ABORT: no se encontró ningún miembro (organization_members) para la '
      'organización "BopAgency Local" (org_id=%). Inicie sesión localmente y '
      'confirme la membresía antes de reintentar.', v_org_id;
  END IF;

  RAISE NOTICE 'Organización resuelta: id=% | Usuario resuelto: id=% (role=%)',
    v_org_id, v_owner_user_id, v_owner_role;

  -- ==========================================================================
  -- A. Automation DRAFT — "Local Draft Automation"
  -- Idempotencia: ON CONFLICT (organization_id, legacy_id) — índice único
  -- real `uq_automations_legacy` (Phase 4). legacy_id actúa como clave de
  -- deduplicación estable para este fixture.
  -- ==========================================================================
  INSERT INTO public.automations (
    organization_id, client_id, legacy_id, name, description, category,
    provider, workflow_id, status, trigger_config, retry_policy,
    n8n_workflow_id, metadata, is_manual_only
  ) VALUES (
    v_org_id,
    NULL,
    'phase6-local-draft-automation',
    'Local Draft Automation',
    'Fixture de staging técnico Phase 6 — automatización en borrador, sin activar. Sin datos reales.',
    'phase6-local-fixture',
    'n8n',
    NULL,
    'draft',
    '{"type":"manual"}'::jsonb,
    DEFAULT,
    NULL,
    '{"fixture":"phase6-local","purpose":"phase6_local_staging_validation"}'::jsonb,
    true
  )
  ON CONFLICT (organization_id, legacy_id) DO UPDATE
    SET updated_at = now(),
        status     = EXCLUDED.status,
        metadata   = EXCLUDED.metadata
  RETURNING id INTO v_draft_automation_id;

  RAISE NOTICE 'Automation DRAFT: id=%', v_draft_automation_id;

  -- ==========================================================================
  -- B. Automation ACTIVE — "Local Active Automation"
  -- Idempotencia: ON CONFLICT (organization_id, legacy_id) — mismo índice
  -- único real que en A.
  -- ==========================================================================
  INSERT INTO public.automations (
    organization_id, client_id, legacy_id, name, description, category,
    provider, workflow_id, status, trigger_config, retry_policy,
    n8n_workflow_id, metadata, is_manual_only
  ) VALUES (
    v_org_id,
    NULL,
    'phase6-local-active-automation',
    'Local Active Automation',
    'Fixture de staging técnico Phase 6 — automatización activa de prueba, referencia de workflow ficticia. Sin datos reales.',
    'phase6-local-fixture',
    'n8n',
    NULL,
    'active',
    '{"type":"schedule","cron":"0 * * * *"}'::jsonb,
    DEFAULT,
    'local-fixture-workflow-active',
    '{"fixture":"phase6-local","purpose":"phase6_local_staging_validation"}'::jsonb,
    false
  )
  ON CONFLICT (organization_id, legacy_id) DO UPDATE
    SET updated_at = now(),
        status     = EXCLUDED.status,
        metadata   = EXCLUDED.metadata
  RETURNING id INTO v_active_automation_id;

  RAISE NOTICE 'Automation ACTIVE: id=%', v_active_automation_id;

  -- ==========================================================================
  -- C. Failed execution — asociada a "Local Active Automation"
  -- Idempotencia: ON CONFLICT (organization_id, idempotency_key) — índice
  -- único real `uq_exec_org_idempotency` (Phase 6B).
  -- ==========================================================================
  INSERT INTO public.automation_executions (
    organization_id, automation_id, client_id, status, attempt,
    idempotency_key, triggered_by, trigger_type,
    input_metadata, output_metadata,
    error_code, error_message,
    queued_at, started_at, completed_at
  ) VALUES (
    v_org_id,
    v_active_automation_id,
    NULL,
    'failed',
    1,
    v_idempotency_key,
    'phase6-local-fixture',
    'manual',
    '{"fixture":"phase6-local"}'::jsonb,
    NULL,
    'WORKFLOW_TEST_FAILURE',
    'Fallo simulado de prueba local (fixture phase6-local): workflow ficticio no disponible en staging. Sin datos reales.',
    now(),
    now(),
    now()
  )
  ON CONFLICT (organization_id, idempotency_key) DO UPDATE
    SET updated_at = now(),
        status     = EXCLUDED.status
  RETURNING id INTO v_execution_id;

  RAISE NOTICE 'Execution FAILED: id=%', v_execution_id;

  -- ==========================================================================
  -- D. Execution log — sanitizado, sin payload crudo
  -- Idempotencia: NO existe constraint única aplicable en
  -- automation_execution_logs (solo PK). Se usa guard WHERE NOT EXISTS en
  -- vez de ON CONFLICT, tal como exige la restricción del script.
  -- ==========================================================================
  SELECT EXISTS (
    SELECT 1
    FROM public.automation_execution_logs
    WHERE execution_id = v_execution_id
      AND event_type   = 'execution_failed_test'
      AND (metadata->>'fixture') = 'phase6-local'
  ) INTO v_log_exists;

  IF NOT v_log_exists THEN
    INSERT INTO public.automation_execution_logs (
      organization_id, execution_id, level, event_type, message, metadata, occurred_at
    ) VALUES (
      v_org_id,
      v_execution_id,
      'error',
      'execution_failed_test',
      'Ejecución de prueba local finalizada con error simulado (fixture phase6-local). Sin payload crudo, sin secretos, sin stack trace.',
      '{"fixture":"phase6-local","errorCode":"WORKFLOW_TEST_FAILURE"}'::jsonb,
      now()
    );
    RAISE NOTICE 'Execution log: creado';
  ELSE
    RAISE NOTICE 'Execution log: ya existía (sin duplicar)';
  END IF;

  -- ==========================================================================
  -- E. Alert — vinculada a automation/execution vía el mecanismo REAL
  -- existente en el dominio (ver
  -- packages/application/src/use-cases/automations/automation-incident-signatures.ts
  -- y evaluate-automation-incident.use-case.ts):
  --   - alert_key determinístico con forma
  --     "automation:{orgId}:{automationId}:execution-failed:{errorCode}"
  --   - metadata jsonb con automationId / executionId / incidentType
  -- La tabla alerts NO tiene columna automation_id/execution_id propia — el
  -- vínculo real se hace por convención de alert_key + metadata, que es
  -- exactamente el mecanismo que usa el caso de uso de producción.
  --
  -- Nota de severidad: el enum public.alert_severity solo admite
  -- 'info' | 'warning' | 'critical' (no existe 'high'). Se usa 'critical'
  -- como equivalente válido más cercano a "high" para validar el estado de
  -- severidad alta en la UI, tal como pide el fixture.
  --
  -- Idempotencia: ON CONFLICT (organization_id, alert_key) — índice único
  -- real `uq_alerts_key` (Phase 4).
  -- ==========================================================================
  INSERT INTO public.alerts (
    organization_id, client_id, alert_key, alert_type, severity, status,
    title, description, platform, account_id, detected_at, metadata
  ) VALUES (
    v_org_id,
    NULL,
    'automation:' || v_org_id::text || ':' || v_active_automation_id::text || ':execution-failed:WORKFLOW_TEST_FAILURE',
    'automation.execution_failed_critical',
    'critical',
    'active',
    'Fallo simulado en automatización local (fixture)',
    'Ejecución de prueba en "Local Active Automation" falló de forma simulada para validar Phase 6. Sin datos reales, sin secretos.',
    NULL,
    NULL,
    now(),
    jsonb_build_object(
      'fixture', 'phase6-local',
      'automationId', v_active_automation_id::text,
      'executionId', v_execution_id::text,
      'incidentType', 'EXECUTION_FAILED_CRITICAL',
      'errorCategory', 'EXECUTION_FAILED_CRITICAL'
    )
  )
  ON CONFLICT (organization_id, alert_key) DO UPDATE
    SET updated_at = now(),
        metadata   = EXCLUDED.metadata,
        status     = EXCLUDED.status
  RETURNING id INTO v_alert_id;

  RAISE NOTICE 'Alert: id=%', v_alert_id;

  -- ==========================================================================
  -- F. Task — tarea operativa pendiente, vinculada por tags (mecanismo real:
  -- ver buildTaskTags()/buildTaskSignatureTag() en
  -- automation-incident-signatures.ts). La tabla tasks NO tiene columna
  -- automation_id/execution_id/metadata; el vínculo real en el dominio se
  -- hace por tags[] con formato:
  --   automation | org:{orgId} | automation-id:{automationId} |
  --   incident:{incidentType} | sig:{orgId}:{automationId}:{incidentType}
  -- Se añade además el tag 'fixture:phase6-local' como marcador de limpieza.
  --
  -- Idempotencia: ON CONFLICT (organization_id, legacy_source, legacy_id)
  -- WHERE ... — índice único parcial real `uq_tasks_legacy` (Phase 4),
  -- reutilizado aquí como clave de deduplicación del fixture.
  -- ==========================================================================
  INSERT INTO public.tasks (
    organization_id, client_id, title, description, status, priority,
    due_date, tags, legacy_source, legacy_id, created_by, updated_by
  ) VALUES (
    v_org_id,
    NULL,
    'Revisar automatización local fallida',
    'Fixture de staging técnico Phase 6: la ejecución de prueba de "Local Active Automation" falló de forma simulada (WORKFLOW_TEST_FAILURE). Revisar el flujo de alertas/tareas de automatización. Sin datos reales.',
    'pending',
    'high',
    (now() + interval '2 days')::date,
    ARRAY[
      'automation',
      'fixture:phase6-local',
      'org:' || v_org_id::text,
      'automation-id:' || v_active_automation_id::text,
      'incident:execution_failed_critical',
      'sig:' || v_org_id::text || ':' || v_active_automation_id::text || ':execution_failed_critical'
    ],
    'phase6_local_fixture',
    'local-active-automation-failed-task',
    v_owner_user_id,
    v_owner_user_id
  )
  ON CONFLICT (organization_id, legacy_source, legacy_id)
    WHERE legacy_source IS NOT NULL AND legacy_id IS NOT NULL AND deleted_at IS NULL
  DO UPDATE
    SET updated_at = now(),
        tags       = EXCLUDED.tags,
        status     = EXCLUDED.status
  RETURNING id INTO v_task_id;

  RAISE NOTICE 'Task: id=%', v_task_id;

  RAISE NOTICE '=== Phase 6 local staging fixtures OK === org=% draft_automation=% active_automation=% execution=% alert=% task=%',
    v_org_id, v_draft_automation_id, v_active_automation_id, v_execution_id, v_alert_id, v_task_id;
END;
$fixtures$;

COMMIT;
