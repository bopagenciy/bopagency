# Phase 6F — Automation Alerts, Tasks and Operational Observability

**Status:** ⚠️ PENDIENTE VALIDACIÓN E2E LOCAL — unit tests + typecheck + lint + Phase 4 ✅; E2E Chromium requiere ejecución local  
**Branch:** `feat/phase-6-automation-runtime`  
**Preconditions met:** Phases 5, 6A–6E ✅

---

## 1. Objetivo

Crear alertas operativas y tareas cuando una automatización falla o requiere atención, con deduplicación, auto-resolución en recuperación, aislamiento multi-tenant y señales en el dashboard. Sin scheduler, cron, n8n workflow editing, secretos, ni notificaciones externas.

---

## 2. Archivos creados

### Dominio ampliado

| Archivo | Cambio |
|---------|--------|
| `packages/domain/src/repositories/alert.repository.ts` | + `CreateAlertInput`, `UpsertAlertResult`, `upsertByAlertKey()`, `findActiveByAlertKey()`, `resolveActiveByAlertKeyPrefixes()` |
| `packages/domain/src/repositories/task.repository.ts` | + `CreateTaskInput`, `create()`, `findActiveBySignatureTag()` |
| `packages/domain/src/repositories/automation-execution.repository.ts` | + `listStuckCandidates()` |

### Aplicación — nuevos use cases

| Archivo | Responsabilidad |
|---------|----------------|
| `packages/application/src/use-cases/automations/automation-incident-severity.ts` | Mapping centralizado: `AutomationIncidentType` → `AlertSeverity` / `TaskPriority` |
| `packages/application/src/use-cases/automations/automation-incident-signatures.ts` | Firmas determinísticas de `alert_key` y `signatureTag` |
| `packages/application/src/use-cases/automations/evaluate-automation-incident.use-case.ts` | Evaluador principal: dispatch_failed, execution_failed, max_attempts_reached, execution_succeeded |
| `packages/application/src/use-cases/automations/evaluate-stuck-automation-executions.use-case.ts` | Evaluador de ejecuciones atascadas con `ClockPort` inyectable |

### Infraestructura

| Archivo | Cambio |
|---------|--------|
| `packages/infrastructure/src/supabase/repositories/supabase-alert.repository.ts` | Implementa nuevos métodos de AlertRepository con upsert + LIKE prefixes |
| `packages/infrastructure/src/supabase/repositories/supabase-task.repository.ts` | Implementa `create()` y `findActiveBySignatureTag()` |
| `packages/infrastructure/src/supabase/repositories/supabase-automation-execution.repository.ts` | Implementa `listStuckCandidates()` paginado |

### Web — UI e integración

| Archivo | Cambio |
|---------|--------|
| `apps/web/src/components/dashboard/AutomationSignalsWidget.tsx` | Nuevo widget: señales operativas de automatizaciones en dashboard |
| `apps/web/src/components/alerts/AlertsTable.tsx` | Badge ⚙️ Auto, columna Automatización, enlaces a /automations/{id} |
| `apps/web/src/components/tasks/TasksTable.tsx` | Badge ⚙️ Auto, enlace a /automations/{id} desde tags |
| `apps/web/src/app/(protected)/dashboard/page.tsx` | Integra AutomationSignalsWidget con datos pre-fetched |
| `apps/web/src/app/api/webhooks/n8n/route.ts` | Paso 11b: evaluación de incidentes best-effort en webhook callback |
| `apps/web/src/lib/composition/dashboard.composition.ts` | + automationRepository, executionRepository, conteos |

---

## 3. Diseño de deduplicación

### Alertas — `alert_key` determinístico

```
automation:{orgId}:{automationId}:dispatch-failed
automation:{orgId}:{automationId}:execution-failed:{errorCode}
automation:{orgId}:{automationId}:max-attempts
automation:{orgId}:{automationId}:stuck:{queued|running}
```

Operación: `upsert` con `onConflict: 'organization_id,alert_key'`, `ignoreDuplicates: false` (actualiza `updated_at`).

### Tareas — `signatureTag` en `tags[]`

```
sig:{orgId}:{automationId}:{incident_type}
```

Antes de crear: `findActiveBySignatureTag()` busca tarea activa con ese tag. Si existe → `taskSkipped=true`.

---

## 4. Mappings de severidad/prioridad

| Tipo de incidente | AlertSeverity | TaskPriority | Crea tarea |
|-------------------|---------------|--------------|------------|
| DISPATCH_FAILED | warning | high | ✅ |
| MAX_ATTEMPTS_REACHED | warning | high | ✅ |
| EXECUTION_FAILED_CRITICAL | warning | high | ✅ |
| TIMEOUT | warning | high | ❌ |
| STUCK_RUNNING | warning | high | ✅ |
| STUCK_QUEUED | info | medium | ✅ |
| EXECUTION_FAILED_GENERIC | info | medium | ❌ |
| WEBHOOK_INVALID_REPEATED | critical | urgent | ❌ (reservado) |

---

## 5. Auto-resolución

En `execution_succeeded`: se llama `resolveActiveByAlertKeyPrefixes()` con los prefijos recuperables de esa automation:
- `automation:{orgId}:{automationId}:dispatch-failed`
- `automation:{orgId}:{automationId}:execution-failed`
- `automation:{orgId}:{automationId}:max-attempts`
- `automation:{orgId}:{automationId}:stuck`

Resultado: alertas con esos prefijos pasan a `status='resolved'`. Operación best-effort.

---

## 6. Puntos de integración

| Caller | Evento | Condición |
|--------|--------|-----------|
| `start-execution.use-case.ts` | `dispatch_failed` | después de marcar ejecución como failed |
| `retry-execution.use-case.ts` | `max_attempts_reached` | antes de devolver error MaxAttemptsReached |
| `apps/web/src/app/api/webhooks/n8n/route.ts` | `execution_failed` / `execution_succeeded` | Paso 11b, post-log, best-effort |

---

## 7. Principios de seguridad aplicados

- **Sin secretos persistidos**: `safeErrorMessage` limitada a 200 chars, sin tokens/HMAC.
- **Sin stack traces visibles**: `buildSafeAlertContent()` usa textos fijos por tipo.
- **Trigger `trg_alerts_70_audit_fields`**: service_role (`auth.uid() IS NULL`) puede INSERT/UPDATE directo; usuario autenticado no puede tocar `resolved_at` etc.
- **Multi-tenant**: todas las queries filtran por `organizationId`; `alert_key` incluye `orgId`.

---

## 8. Tests

### Unitarios — `@bop-agency/application`
- `evaluate-automation-incident.use-case.test.ts`: 21 tests (dispatch, deduplicación, severidad, recuperación, aislamiento, best-effort)
- `evaluate-stuck-automation-executions.use-case.test.ts`: 16 tests (umbrales, clock, deduplicación, aislamiento, resiliencia)

### UI — `@bop-agency/web`
- `AutomationSignalsWidget.test.tsx`: 16 tests (renderizado, estados, accesibilidad)
- `AlertsTable.test.tsx`: +11 tests Phase 6F (badge, enlaces, no-leak, mixto)
- `TasksTable.test.tsx`: +8 tests Phase 6F (badge, enlace, no-leak, mixto)

### Resultados de validación (2026-08-05)

| Check | Resultado |
|-------|-----------|
| `typecheck` — `tsc --noEmit` todos los workspaces | ✅ 0 errores |
| `eslint` — archivos Phase 6F | ✅ 0 errores, 0 warnings |
| `@bop-agency/shared` tests | ✅ 30/30 (3 archivos) |
| `@bop-agency/domain` tests | ✅ 169/169 (7 archivos) |
| `@bop-agency/application` tests | ✅ 207/207 (18 archivos) |
| `@bop-agency/infrastructure` tests | ✅ 275/275 (14 archivos) |
| `@bop-agency/web` component tests | ✅ 173/173 (19 archivos) |
| **Total tests** | **✅ 854/854** |
| Phase 4 migrations tests | ✅ 317/317 (17.12s) |
| `npm run build` (packages) | ✅ EXIT:0 |
| `npm run build --workspace=@bop-agency/web` | ❌ Bus error (EXIT:135) — CONFIRMADO PRE-EXISTENTE (mismo crash antes de 6F en git stash) |
| E2E Chromium | 🔒 BLOQUEADO — sin credenciales E2E en sandbox; requiere ejecución local con `E2E_TEST_EMAIL`/`E2E_TEST_PASSWORD` |

> **Nota Build:** el Bus error en `next build` es un fallo de OOM del sandbox de CI, no introducido por Phase 6F. Confirmado con `git stash` + `next build` (mismo crash). El `tsc --noEmit` de `apps/web` pasa con 0 errores.

> **Nota E2E:** los 15 nuevos tests en `automations.e2e.ts` usan `skipIfNoCredentials()`. El requisito "no considerar válido si los tests están skipped por falta de credenciales" es correcto — la suite E2E **debe ejecutarse localmente** con credenciales configuradas antes del commit.

---

## 9. E2E (Playwright)

Tests añadidos en `apps/web/e2e/automations.e2e.ts`:
- Alerta de automatización muestra badge ⚙️ Auto
- Badge no expone datos técnicos (stack trace, sig:, token)
- Columna plataforma muestra "Automatización"
- Enlace Ver automatización apunta a `/automations/{uuid}`
- Enlace Ver ejecución apunta a `/automations/{uuid}/executions`
- Tarea de automatización muestra badge ⚙️ Auto
- Tarea no expone signatureTag ni orgId en texto visible
- Widget de automatizaciones visible en dashboard
- Señales tienen `role=list` accesible
- Link "Ver todas" apunta a `/automations`

Todos usan `skipIfNoCredentials()` — se omiten sin credenciales E2E.

---

## 10. Restricciones respetadas

- ❌ NO scheduler, cron, n8n workflow editing, secretos, Sentry, Prometheus
- ❌ NO se modificaron: migraciones Phase 6B, Docker, HMAC protocol, producción
- ❌ NO se instalaron dependencias nuevas
- ❌ NO se ejecutaron workflows reales
- ❌ NO se hizo commit
- ❌ NO se inició Phase 6G
