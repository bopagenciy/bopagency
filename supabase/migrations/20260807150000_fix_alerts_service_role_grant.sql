-- =============================================================================
-- Migración correctiva — GRANT service_role sobre public.alerts
-- Archivo: 20260807150000_fix_alerts_service_role_grant.sql
-- Rama: feat/phase-6-automation-runtime
--
-- CONTEXTO:
--   Cierre de pendientes técnicos de Phase 6 local staging. Validación E2E
--   posterior a la corrección de `resolved_by` (uuid) mostró que el recovery
--   best-effort de alertas seguía fallando con INTERNAL_ERROR:
--
--     [webhook/n8n/6F] evaluateAutomationIncident ...
--     incidentType: 'RECOVERY'
--     errorCode: 'INTERNAL_ERROR'
--
--   pese a que el callback principal respondía 200 y la ejecución terminaba
--   `succeeded` correctamente en `automation_executions`.
--
-- CAUSA RAÍZ (segundo defecto, independiente del fix de `resolved_by`):
--   `supabase/migrations/20260730150000_phase4_data_migration_targets.sql`
--   (líneas 907-928) otorga permisos sobre `public.alerts` únicamente a
--   `authenticated`:
--
--     REVOKE ALL ON public.alerts FROM anon, authenticated;
--     GRANT SELECT, INSERT, UPDATE ON public.alerts TO authenticated;
--
--   Nunca existió un GRANT explícito a `service_role`. `service_role`
--   bypasea RLS por diseño de Supabase, pero el bypass de RLS es un
--   mecanismo INDEPENDIENTE del sistema de privilegios GRANT/REVOKE de
--   PostgreSQL — sin el GRANT, PostgREST devuelve
--   `42501 permission denied for table alerts` en cualquier SELECT/UPDATE/
--   INSERT que el rol `service_role` intente sobre esta tabla, sin importar
--   el contenido del payload. Por eso el fix anterior sobre `resolved_by`
--   (necesario, corrige un defecto real de tipo uuid) no era suficiente:
--   el UPDATE nunca llegaba a validar ese valor, fallaba antes por permisos.
--
--   `SupabaseAlertRepository` se instancia con el cliente admin
--   (`service_role`, tras verificación HMAC) en
--   `apps/web/src/app/api/webhooks/n8n/route.ts` para dos operaciones:
--     - `upsertByAlertKey`   → INSERT ... ON CONFLICT DO UPDATE + SELECT de retorno
--     - `resolveActiveByAlertKeyPrefixes` (recovery) → UPDATE + SELECT de retorno
--
--   Es exactamente el mismo patrón de defecto ya diagnosticado y corregido
--   para las 4 tablas de Phase 6B en
--   `supabase/migrations/20260804000000_phase6b_automation_runtime.sql`
--   (secciones C5b, D3b, E4) — pero `alerts` es de Phase 4, una migración
--   anterior a ese descubrimiento que nunca recibió el GRANT equivalente.
--
-- POR QUÉ ES UNA MIGRACIÓN NUEVA Y NO UNA EDICIÓN IN-PLACE:
--   A diferencia de `20260804000000_phase6b_automation_runtime.sql` (rama
--   local, no mergeada a `main`, no aplicada en ningún ambiente),
--   `20260730150000_phase4_data_migration_targets.sql` YA está en `main`
--   (`git log`/`git ls-tree main` la confirman) y se asume aplicada donde
--   corresponda. Editarla in-place violaría el patrón de rollback documentado
--   ("Nueva migración SQL separada; nunca modifica datos de fases
--   anteriores"). Esta migración es aditiva, idempotente y no toca datos.
--
-- ALCANCE MÍNIMO:
--   Solo agrega los privilegios que el código real ejecuta vía adminClient:
--   SELECT (retorno post-INSERT/UPDATE vía .select()), INSERT (upsertByAlertKey),
--   UPDATE (upsertByAlertKey y resolveActiveByAlertKeyPrefixes). NO se otorga
--   DELETE (ningún código borra alertas) ni GRANT ALL. RLS permanece habilitado
--   y sin cambios — service_role sigue bypaseándolo por diseño; authenticated
--   y anon no reciben ningún privilegio nuevo.
--
-- RIESGO DE APLICAR EN PRODUCCIÓN:
--   Bajo. Es un GRANT puro, no modifica filas, columnas, constraints, triggers
--   ni RLS. Reversible con:
--     REVOKE SELECT, INSERT, UPDATE ON public.alerts FROM service_role;
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON public.alerts TO service_role;

COMMENT ON TABLE public.alerts IS
  'Phase 4: alertas operativas de la agencia. RLS habilitado (policies '
  'alerts_select/alerts_insert/alerts_update, TO authenticated). service_role '
  'tiene SELECT/INSERT/UPDATE explícito desde 20260807150000 — requerido por '
  'SupabaseAlertRepository.upsertByAlertKey y '
  'resolveActiveByAlertKeyPrefixes (recovery best-effort de automation '
  'incidents, invocados vía adminClient en el callback de n8n). Sin DELETE '
  'para ningún rol operativo.';
