-- =============================================================================
-- Phase 8B.1 — Cleanup de smoke data de phase8b1_local_runtime_validation.sql
-- Archivo: supabase/fixtures/phase8b1_local_runtime_validation_cleanup.sql
--
-- Borra UNICAMENTE filas creadas por el script de validacion runtime,
-- identificadas por el marcador 'phase8b1-local' en metadata o por el
-- prefijo/slug 'Phase8B1 Smoke' / 'phase8b1-smoke-*'. NO ejecutado
-- automaticamente — el usuario decide cuando correrlo.
--
-- Orden: hijos antes que padres (FKs). No borra la organizacion local
-- "BopAgency Local" ni su membresia (preexistentes, fuera de alcance).
--
-- CORRECCION POST-RUN-1 (2026-08-27): el fixture principal ahora crea 6
-- campanas smoke aisladas (una por escenario: A/B/C/D/E/Manual), no 1 --
-- ver la seccion 3 de phase8b1_local_runtime_validation.sql para el porque.
-- Este cleanup usa LIKE 'Phase8B1 Smoke Campaign %' para cubrir las 6 de
-- una sola vez.
--
-- CORRECCION POST-RUN-2 (2026-08-27, Run 3 root cause -- ver R-PUB-11/
-- R-PUB-12 y reporte 8B.1 seccion 23): a partir de esta ronda, cada
-- ejecucion del fixture principal incrusta un nonce unico por corrida
-- (`p8b1_meta_text.run_nonce`, un gen_random_uuid()::text) en el nombre de
-- las 6 campanas -- p.ej. "Phase8B1 Smoke Campaign A (happy path)
-- [3f1e2a9c-...]" -- para que cada corrida cree campanas/activations/
-- targets FRESCOS e independientes, sin reusar (ni por tanto violar
-- uq_activation_targets_dedupe con) el estado ya mutado de una corrida
-- anterior. El patron `LIKE 'Phase8B1 Smoke Campaign %'` de este cleanup
-- ya cubre CUALQUIER numero de corridas acumuladas sin cambios (el nonce
-- es un sufijo, el prefijo fijo sigue siendo el mismo) -- confirmado, no
-- se requirio modificar el patron en si. Es normal y esperado que este
-- cleanup, si se corre, borre TODAS las corridas acumuladas de una sola
-- vez (no hay forma de aislar "solo la corrida N" por nombre -- si se
-- necesita conservar corridas especificas, no correr este cleanup hasta
-- terminar de revisarlas).
--
-- LIMITACION CONOCIDA / DECISION DELIBERADA (NO corregida deshabilitando
-- triggers ni RLS — instruccion explicita de esta tarea):
--   1. campaign_publication_jobs/attempts/events/webhook_events: la
--      migracion 20260825120000 NO otorga NINGUN grant de DELETE (ni
--      siquiera a service_role — SECCION I: "TODA escritura pasa por las
--      RPCs SECURITY DEFINER"). No existe ninguna RPC de borrado para estas
--      4 tablas (no se necesita ninguna para el alcance de 8B.1). Por lo
--      tanto, ni siquiera el superusuario "deberia" necesitar borrarlas por
--      diseno de producto (son historico de auditoria) — este script NO
--      intenta borrarlas ni con TRUNCATE ni deshabilitando triggers, aunque
--      tecnicamente un superusuario SI podria hacerlo vía bypass de GRANT.
--      Se dejan como historico permanente, igual criterio documentado que
--      8A.1 para campaign_activation_events.
--   2. campaign_activation_targets/campaign_activations: el trigger
--      check_activation_target_deletable (8A.1) prohibe borrar un target
--      una vez que su activation salio de 'pending' — TODOS los targets de
--      trabajo de este fixture terminan en 'ready'/'publishing'/'published'/
--      'failed'/'cancelled' (nunca 'pending') por diseno, para poder probar
--      el ciclo de vida real. Por tanto el DELETE de activations/targets de
--      este cleanup SIEMPRE fallara para las filas de trabajo del script —
--      es el comportamiento CORRECTO del dominio, no un bug de este
--      cleanup. Igual limitacion ya documentada en
--      phase8a1_local_runtime_validation_cleanup.sql.
--   3. Consecuencia práctica: este cleanup SOLO puede borrar de forma
--      segura la organizacion "foranea" (org B), sus clientes/integraciones,
--      y la campana+approval smoke de 8B.1 (que no tienen ninguna
--      proteccion de este tipo). Las activations/targets/jobs/attempts/
--      events quedan como historico permanente — documentado, no un
--      descuido. Si se necesita realmente limpiar esas filas, la unica via
--      legitima es transicionarlas explicitamente a un estado borrable
--      llamando a las RPCs reales ANTES de correr este cleanup (nunca vía
--      UPDATE/DELETE directo ni deshabilitando triggers).
--
-- USO:
--   docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=0 \
--     < supabase/fixtures/phase8b1_local_runtime_validation_cleanup.sql
-- =============================================================================

BEGIN;

-- 1. Intento de borrado de targets/activations (VER LIMITACION #2 arriba —
--    se espera que falle para las filas de trabajo del script; ON_ERROR_STOP=0
--    permite que el resto del cleanup continue igual).
DELETE FROM public.campaign_activation_targets
WHERE activation_id IN (
  SELECT id FROM public.campaign_activations WHERE metadata->>'fixture' = 'phase8b1-local'
);

DELETE FROM public.campaign_activations
WHERE metadata->>'fixture' = 'phase8b1-local';

-- 2. Campaign approvals + campana smoke (sin proteccion de este tipo, solo
--    fallan si alguna activation smoke las sigue referenciando vía FK
--    ON DELETE RESTRICT de campaign_activations.campaign_approval_id —
--    en ese caso, el paso 1 debe completarse primero).
DELETE FROM public.campaign_approvals
WHERE campaign_id IN (
  SELECT id FROM public.campaigns WHERE name LIKE 'Phase8B1 Smoke Campaign %'
);

DELETE FROM public.campaigns
WHERE name LIKE 'Phase8B1 Smoke Campaign %';

-- 3. Client integrations fixture (org A y org B).
DELETE FROM public.client_integrations
WHERE external_account_id IN ('phase8b1-smoke-integration-a', 'phase8b1-smoke-integration-b');

-- 4. Clientes smoke (A y B).
DELETE FROM public.clients
WHERE slug IN ('phase8b1-smoke-client-a', 'phase8b1-smoke-client-b');

-- 5. Organizacion B (forania, creada solo para pruebas de tenencia).
DELETE FROM public.organizations
WHERE slug = 'phase8b1-smoke-org-b';

-- NOTA: la organizacion "BopAgency Local", su membresia, y el usuario owner
-- NO se tocan — son fixtures preexistentes de otras fases, fuera de alcance
-- de esta limpieza. Las membresias desechables del role matrix (viewer/
-- operator/strategist) ya se auto-limpiaron dentro del propio
-- phase8b1_local_runtime_validation.sql (SECCION 14) — no requieren accion
-- aqui.

COMMIT;

-- Verificacion post-cleanup (organization/client/campaign deben devolver 0
-- filas; activations/targets/jobs es normal que NO lleguen a 0, ver
-- LIMITACION #2/#1 arriba — no es un fallo de este script):
SELECT 'campaigns' AS tbl, count(*) FROM public.campaigns WHERE name LIKE 'Phase8B1 Smoke Campaign %'
UNION ALL
SELECT 'clients', count(*) FROM public.clients WHERE slug IN ('phase8b1-smoke-client-a', 'phase8b1-smoke-client-b')
UNION ALL
SELECT 'organizations (org B)', count(*) FROM public.organizations WHERE slug = 'phase8b1-smoke-org-b'
UNION ALL
SELECT 'campaign_activations (historico esperado > 0)', count(*) FROM public.campaign_activations WHERE metadata->>'fixture' = 'phase8b1-local'
UNION ALL
SELECT 'campaign_publication_jobs (historico esperado > 0, sin DELETE posible por diseno)', count(*)
  FROM public.campaign_publication_jobs j
  JOIN public.campaign_activations a ON a.id = j.activation_id
  WHERE a.metadata->>'fixture' = 'phase8b1-local';
