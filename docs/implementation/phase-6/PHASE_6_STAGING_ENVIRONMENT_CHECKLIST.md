# Phase 6 — Staging Environment Checklist

> **Propósito:** Lista de verificación operacional antes de iniciar cualquier smoke test de Phase 6 en staging.
> **Restricción:** Completar todos los items BLOCKER antes de avanzar.
> **Fecha de preparación:** 2026-08-05

---

## Sección 1 — Repositorio

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| 1.1 | Branch `feat/phase-6-automation-runtime` activa | ✅ PASS | Confirmado |
| 1.2 | Working tree clean (`git status`) | ✅ PASS | Confirmado |
| 1.3 | Commit de cierre Phase 6 presente (`d14158e`) | ✅ PASS | Confirmado |
| 1.4 | `.env.local` en `.gitignore` y no trackeado | ✅ PASS | Confirmado |
| 1.5 | No hay archivos `.env.*` reales trackeados | ✅ PASS | Solo `.env.example` trackeado |
| 1.6 | `test-results/`, `playwright-report/`, `.next/` no trackeados | ✅ PASS | Confirmado |

---

## Sección 2 — Validaciones de Código

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| 2.1 | `lint` `@bop-agency/web` | ✅ PASS | Sin errores |
| 2.2 | `typecheck` `@bop-agency/web` | ✅ PASS | Sin errores |
| 2.3 | `typecheck` `@bop-agency/domain` | ✅ PASS | Sin errores |
| 2.4 | `typecheck` `@bop-agency/application` | ✅ PASS | Sin errores |
| 2.5 | `typecheck` `@bop-agency/infrastructure` | ✅ PASS | Sin errores |
| 2.6 | Tests `@bop-agency/web` (39/39) | ✅ PASS | 21 + 18 tests |
| 2.7 | Tests `@bop-agency/domain` (169/169) | ✅ PASS | 7 test files |
| 2.8 | Tests `@bop-agency/application` (207/207) | ✅ PASS | 18 test files |
| 2.9 | Tests `@bop-agency/infrastructure` (275/275) | ✅ PASS | 14 test files |
| 2.10 | Tests `scripts/migrations/phase-4` (317/317) | ✅ PASS | 11 test files |
| 2.11 | `npm run build` (`@bop-agency/web`) | ⚠️ NO EJECUTADO EN SANDBOX | Bus error en Linux sandbox — PASS verificado en Windows local (según closure report) |

**Total tests verificados:** 807 tests / 807 — 100% PASS

---

## Sección 3 — Supabase Staging

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| 3.1 | Proyecto Supabase staging identificado y separado de producción | ⬜ MANUAL REQUIRED | Confirmar project ref |
| 3.2 | `supabase link --project-ref <STAGING_REF>` exitoso | ⬜ MANUAL REQUIRED | |
| 3.3 | Conectividad verificada (`supabase db remote changes`) | ⬜ MANUAL REQUIRED | |
| 3.4 | Tablas base Phase 2–5 presentes (`organizations`, `users`, `automations`, `clients`) | ⬜ MANUAL REQUIRED | |
| 3.5 | Enum `automation_status` existente contiene valores base | ⬜ MANUAL REQUIRED | Verificar con query §3 del Integration Plan |
| 3.6 | Migración `20260804000000` NO aplicada previamente | ⬜ MANUAL REQUIRED | |
| 3.7 | Backup de schema pre-migración generado | ⬜ MANUAL REQUIRED | `supabase db dump --linked --schema-only` |
| 3.8 | Backup de tabla `automations` generado | ⬜ MANUAL REQUIRED | `supabase db dump --linked --data-only --table automations` |
| 3.9 | Migración `20260804000000_phase6b_automation_runtime.sql` aplicada | ⬜ MANUAL REQUIRED | Solo después de 3.1–3.8 |
| 3.10 | Tablas Phase 6B presentes post-migración | ⬜ MANUAL REQUIRED | |
| 3.11 | RLS habilitado en las 4 tablas nuevas | ⬜ MANUAL REQUIRED | |
| 3.12 | Enum contiene `draft` y `archived` post-migración | ⬜ MANUAL REQUIRED | |
| 3.13 | Triggers `set_updated_at` activos en tablas nuevas | ⬜ MANUAL REQUIRED | |
| 3.14 | Tipos TypeScript regenerados (`supabase gen types`) | ⬜ MANUAL REQUIRED | |
| 3.15 | Diff de tipos revisado y correcto | ⬜ MANUAL REQUIRED | |

---

## Sección 4 — Variables de Entorno

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| 4.1 | `NEXT_PUBLIC_SUPABASE_URL` apunta a staging (no producción) | ⬜ MANUAL REQUIRED | Verificar subdomain del project ref |
| 4.2 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` es de staging | ⬜ MANUAL REQUIRED | |
| 4.3 | `SUPABASE_SERVICE_ROLE_KEY` es de staging | ⬜ MANUAL REQUIRED | |
| 4.4 | `N8N_BASE_URL` apunta a instancia n8n de staging | ⬜ MANUAL REQUIRED | |
| 4.5 | `AUTOMATION_WEBHOOK_SECRET` generado con `openssl rand -hex 32` | ⬜ MANUAL REQUIRED | ≥ 32 chars, diferente al de producción |
| 4.6 | `AUTOMATION_WEBHOOK_SECRET` configurado en n8n staging | ⬜ MANUAL REQUIRED | Mismo valor que 4.5 |
| 4.7 | `NEXT_PUBLIC_APP_URL` apunta al host staging correcto | ⬜ MANUAL REQUIRED | |
| 4.8 | `E2E_TEST_EMAIL` existe en Supabase Auth staging | ⬜ MANUAL REQUIRED | Cuenta exclusiva de staging |
| 4.9 | `E2E_TEST_PASSWORD` configurado y funcional | ⬜ MANUAL REQUIRED | |
| 4.10 | Ninguna variable `NEXT_PUBLIC_` contiene datos sensibles | ⬜ MANUAL REQUIRED | Revisar `.env.staging` |
| 4.11 | `NODE_ENV=production` para build staging | ⬜ MANUAL REQUIRED | |

---

## Sección 5 — n8n Staging

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| 5.1 | Instancia n8n staging disponible | ⬜ MANUAL REQUIRED | Local o cloud |
| 5.2 | `curl http://<N8N_HOST>/healthz` responde 200 | ⬜ MANUAL REQUIRED | |
| 5.3 | Workflow de prueba staging importado | ⬜ MANUAL REQUIRED | Ver especificación en Integration Plan §10 |
| 5.4 | `AUTOMATION_WEBHOOK_SECRET` configurado en n8n | ⬜ MANUAL REQUIRED | Mismo valor que 4.5 |
| 5.5 | `callbackUrl` en workflow apunta a staging app | ⬜ MANUAL REQUIRED | `http://<STAGING_APP>/api/webhooks/n8n` |
| 5.6 | Workflow activado en n8n (modo test o producción staging) | ⬜ MANUAL REQUIRED | |
| 5.7 | Test manual de webhook n8n → app exitoso | ⬜ MANUAL REQUIRED | |
| 5.8 | `N8N_API_KEY` configurado si se quiere probar cancel (case 15) | Opcional | Solo para test de cancel |

---

## Sección 6 — RLS y Acceso

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| 6.1 | Usuario owner ve sus executions | ⬜ MANUAL REQUIRED | |
| 6.2 | Usuario operator puede crear executions | ⬜ MANUAL REQUIRED | |
| 6.3 | Usuario viewer solo tiene SELECT | ⬜ MANUAL REQUIRED | |
| 6.4 | Usuario de org-B no ve datos de org-A | ⬜ MANUAL REQUIRED | Case 20 |
| 6.5 | Usuario anon no accede a ninguna tabla | ⬜ MANUAL REQUIRED | |
| 6.6 | `automation_webhook_events` solo accessible por service_role | ⬜ MANUAL REQUIRED | |
| 6.7 | `automation_execution_logs` INSERT bloqueado para `authenticated` | ⬜ MANUAL REQUIRED | |

---

## Sección 7 — Observabilidad

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| 7.1 | Logs de execution visibles en UI | ⬜ MANUAL REQUIRED | |
| 7.2 | Logs no contienen raw payload | ⬜ MANUAL REQUIRED | |
| 7.3 | Logs no contienen headers HMAC | ⬜ MANUAL REQUIRED | |
| 7.4 | Logs no contienen stack traces | ⬜ MANUAL REQUIRED | |
| 7.5 | Logs no contienen secretos | ⬜ MANUAL REQUIRED | |
| 7.6 | Alertas visibles en dashboard | ⬜ MANUAL REQUIRED | |
| 7.7 | Tareas visibles en dashboard | ⬜ MANUAL REQUIRED | |
| 7.8 | `payload_hash` almacenado (no raw payload) | ⬜ MANUAL REQUIRED | |

---

## Sección 8 — Smoke Tests

| # | Check | Estado | Notas |
|---|-------|--------|-------|
| 8.1 | Case 01 — Dispatch válido | ⬜ PENDIENTE | |
| 8.2 | Case 02 — Callback running | ⬜ PENDIENTE | |
| 8.3 | Case 03 — Callback succeeded | ⬜ PENDIENTE | |
| 8.4 | Case 04 — Callback failed | ⬜ PENDIENTE | |
| 8.5 | Case 05 — Duplicate callback | ⬜ PENDIENTE | |
| 8.6 | Case 06 — eventId duplicado | ⬜ PENDIENTE | |
| 8.7 | Case 07 — Firma inválida → 401 | ⬜ PENDIENTE | |
| 8.8 | Case 08 — Timestamp vencido → 401 | ⬜ PENDIENTE | |
| 8.9 | Case 09 — Payload inválido → 400 | ⬜ PENDIENTE | |
| 8.10 | Case 10 — organizationId incorrecto | ⬜ PENDIENTE | |
| 8.11 | Case 11 — Retry elegible | ⬜ PENDIENTE | |
| 8.12 | Case 12 — Retry no elegible | ⬜ PENDIENTE | |
| 8.13 | Case 13 — Max attempts | ⬜ PENDIENTE | |
| 8.14 | Case 14 — Cancel confirmado | ⬜ PENDIENTE | |
| 8.15 | Case 15 — Cancel no soportado | ⬜ PENDIENTE | |
| 8.16 | Case 16 — Timeout n8n | ⬜ PENDIENTE | |
| 8.17 | Case 17 — Alertas generadas | ⬜ PENDIENTE | |
| 8.18 | Case 18 — Tareas generadas | ⬜ PENDIENTE | |
| 8.19 | Case 19 — Recuperación de alerta | ⬜ PENDIENTE | |
| 8.20 | Case 20 — Aislamiento multi-tenant | ⬜ PENDIENTE | |

---

## Queries de Verificación de Observabilidad

```sql
-- Ver execution logs sin exponer datos sensibles
SELECT
  el.id,
  el.execution_id,
  el.level,
  el.event_type,
  el.message,
  el.occurred_at
FROM public.automation_execution_logs el
WHERE el.organization_id = '<STAGING_ORG_ID>'
ORDER BY el.occurred_at DESC
LIMIT 50;

-- Verificar webhook events (service_role only)
SELECT
  id,
  source,
  event_type,
  external_event_id,
  status,
  received_at,
  processed_at,
  error_code
FROM public.automation_webhook_events
ORDER BY received_at DESC
LIMIT 20;

-- Verificar estado de executions
SELECT
  id,
  automation_id,
  status,
  attempt,
  trigger_type,
  queued_at,
  started_at,
  completed_at
FROM public.automation_executions
WHERE organization_id = '<STAGING_ORG_ID>'
ORDER BY created_at DESC
LIMIT 20;

-- Verificar que payload_hash está presente y raw body ausente
SELECT
  id,
  payload_hash IS NOT NULL AS has_hash,
  char_length(payload_hash) AS hash_length
FROM public.automation_webhook_events
ORDER BY received_at DESC
LIMIT 5;
-- Expected: has_hash=true, hash_length=64
```

---

## Criterio de GO/NO-GO para producción

**GO** requiere:
- Secciones 1–2: 100% PASS
- Secciones 3–5: 100% completado manualmente
- Secciones 6–7: 100% verificado
- Sección 8: 20/20 cases PASS (sin excepción en security cases 07, 08, 10, 20)

**NO-GO automático si:**
- Case 07 (firma inválida) no retorna 401
- Case 08 (timestamp vencido) no retorna 401
- Case 10 (org incorrecto) no bloquea acceso
- Case 20 (multi-tenant) retorna datos cross-tenant
- Cualquier secreto o PII visible en logs de DB

---

*Checklist preparado para Phase 6 Staging. Marcar cada item manualmente al completar.*
