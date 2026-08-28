-- =============================================================================
-- Phase 8A.1 — Cleanup de smoke data de phase8a1_local_runtime_validation.sql
-- Archivo: supabase/fixtures/phase8a1_local_runtime_validation_cleanup.sql
--
-- Borra ÚNICAMENTE filas creadas por el script de validación runtime,
-- identificadas por el marcador 'phase8a1-local' en metadata o por el
-- prefijo 'Phase8A1 Smoke' en name/slug/external_account_id. NO ejecutado
-- automáticamente — el usuario decide cuándo correrlo.
--
-- Orden: hijos antes que padres (FKs). No borra la organización local
-- "BopAgency Local" ni su membresía (preexistentes, fuera de alcance).
--
-- LIMITACIÓN CONOCIDA (documentada en Round E, NO corregida bypasseando
-- triggers): el trigger check_activation_target_deletable de la migración
-- Phase 8A.1 prohíbe (correctamente) borrar directamente un
-- campaign_activation_target una vez que su activation salió de 'pending'
-- ("cannot delete target once the activation left 'pending' ... Use
-- cancel_activation_target instead"). Desde Round E, phase8a1_local_
-- runtime_validation.sql SIEMPRE deja target_ok en 'published' y
-- activation_ok en 'completed' (terminal) al final de cada corrida exitosa
-- -- por diseño, para probar la derivación automática a completed (10.4b) y
-- la inmutabilidad post-terminal (10.5). Eso significa que el DELETE del
-- paso 2 más abajo FALLARÁ con ese mismo error para targets/activations
-- terminales -- es el comportamiento CORRECTO del dominio, no un bug de
-- este cleanup script. Este script NO deshabilita triggers ni bypassea esa
-- protección para "hacer que el DELETE funcione". Si se necesita limpiar
-- filas smoke Phase8A1 realmente, las opciones legítimas son: (a) dejarlas
-- como histórico permanente (la postura por defecto desde Round E -- el
-- harness de validación ya las ignora vía ids capturados por corrida, ver
-- SECCIÓN 5 de phase8a1_local_runtime_validation.sql), o (b) transicionarlas
-- explícitamente a un estado borrable llamando a las RPCs reales
-- (cancel_activation_target / cancel_campaign_activation) ANTES de correr
-- este script -- nunca vía UPDATE/DELETE directo ni deshabilitando triggers.
--
-- USO:
--   docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 \
--     < supabase/fixtures/phase8a1_local_runtime_validation_cleanup.sql
-- =============================================================================

BEGIN;

-- 1. Eventos (append-only, pero DELETE directo como postgres/superuser sí puede
--    limpiar fixtures — bypassa el GRANT restrictivo por ser superuser).
DELETE FROM public.campaign_activation_events
WHERE activation_id IN (
  SELECT id FROM public.campaign_activations WHERE metadata->>'fixture' = 'phase8a1-local'
);

-- 2. Targets. VER LIMITACIÓN CONOCIDA arriba: esto falla con
--    "cannot delete target once the activation left pending" para cualquier
--    target cuya activation ya no esté en 'pending' (el caso normal desde
--    Round E). Es esperado -- no se debe forzar.
DELETE FROM public.campaign_activation_targets
WHERE activation_id IN (
  SELECT id FROM public.campaign_activations WHERE metadata->>'fixture' = 'phase8a1-local'
);

-- 3. Activations. Mismo trigger/limitación que el paso 2 puede aplicar aquí
--    también según el estado de la activation.
DELETE FROM public.campaign_activations
WHERE metadata->>'fixture' = 'phase8a1-local';

-- 4. Campaign approvals (de las campañas smoke).
DELETE FROM public.campaign_approvals
WHERE campaign_id IN (
  SELECT id FROM public.campaigns WHERE name LIKE 'Phase8A1 Smoke Campaign%'
);

-- 5. Campañas smoke.
DELETE FROM public.campaigns
WHERE name LIKE 'Phase8A1 Smoke Campaign%';

-- 6. Client integration fixture (org B).
DELETE FROM public.client_integrations
WHERE external_account_id = 'phase8a1-smoke-integration-b';

-- 7. Clientes smoke (A y B).
DELETE FROM public.clients
WHERE slug IN ('phase8a1-smoke-client-a', 'phase8a1-smoke-client-b');

-- 8. Organización B (foránea, creada solo para pruebas de tenencia).
DELETE FROM public.organizations
WHERE slug = 'phase8a1-smoke-org-b';

-- NOTA: la organización "BopAgency Local", su membresía, y el usuario owner
-- NO se tocan — son fixtures preexistentes de otras fases, fuera de alcance
-- de esta limpieza.

COMMIT;

-- Verificación post-cleanup (debe devolver 0 filas en todas):
SELECT 'campaign_activation_events' AS tbl, count(*) FROM public.campaign_activation_events ce
  JOIN public.campaign_activations ca ON ca.id = ce.activation_id WHERE ca.metadata->>'fixture' = 'phase8a1-local'
UNION ALL
SELECT 'campaign_activations', count(*) FROM public.campaign_activations WHERE metadata->>'fixture' = 'phase8a1-local'
UNION ALL
SELECT 'campaigns', count(*) FROM public.campaigns WHERE name LIKE 'Phase8A1 Smoke Campaign%'
UNION ALL
SELECT 'clients', count(*) FROM public.clients WHERE slug IN ('phase8a1-smoke-client-a', 'phase8a1-smoke-client-b')
UNION ALL
SELECT 'organizations (org B)', count(*) FROM public.organizations WHERE slug = 'phase8a1-smoke-org-b';
