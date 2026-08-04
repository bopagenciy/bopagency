# Phase 5A Quality Report

**Fecha:** 2026-07-31  
**Bloque:** 5A — Dashboard Principal (dominio + aplicación + mappers)

---

## 1. Resultados de validación

### Typecheck (`tsc --noEmit`)

| Paquete | Estado | Notas |
|---|---|---|
| `packages/shared` | ✅ CLEAN | — |
| `packages/domain` | ✅ CLEAN | Fix en `repositories/index.ts` (export `AvailablePeriod` en lugar de `MetricsPeriod`) |
| `packages/application` | ✅ CLEAN | Fix spread condicional `exactOptionalPropertyTypes` en 3 use cases |
| `packages/infrastructure` | ✅ CLEAN | Fix spread condicional en `MetricValues`, `CampaignMetric`, `DataQuality` |
| `apps/web` | ✅ CLEAN | Sin cambios en la app |

### Lint (`eslint --max-warnings 0`)

| Scope | Estado |
|---|---|
| Todos los paquetes (`packages/*/src`) | ✅ CLEAN — 0 warnings, 0 errors |

### Tests

| Suite | Archivos | Tests | Estado |
|---|---|---|---|
| `packages/domain` | 5 | 67 | ✅ PASSED |
| `packages/application` | 6 | 42 | ✅ PASSED |
| `packages/infrastructure` | 6 | 66 | ✅ PASSED |
| `scripts/migrations/phase-4` | 11 | 317 | ✅ PASSED |
| **Total** | **28** | **492** | **✅ 492/492** |

> Phase 4: esbuild binario Linux instalado en sandbox (`@esbuild/linux-x64@0.21.5`) para compatibilidad de entorno. No afecta al código de producción.

### Formato (`prettier --check`)

| Estado |
|---|
| ✅ CLEAN — 14 archivos formateados con `--write`, verificado con `--check` |

---

## 2. Problemas encontrados y resoluciones

### P1 — Desalineación `TaskStatus` vs DB enum `task_status`

**Severidad:** CRÍTICA  
**Síntoma:** `'completed'` y `'on_hold'` en shared no existen en la DB; cualquier filtro por status devolvería 0 resultados.  
**Fix:** `status.ts` — `'completed'` → `'done'`; `'on_hold'` → `'blocked'`; añadido `'blocked'`.

### P2 — Desalineación `AlertStatus` vs DB enum `alert_status`

**Severidad:** CRÍTICA  
**Síntoma:** `'open'` y `'suppressed'` no existen en DB; `'snoozed'` faltaba.  
**Fix:** `status.ts` — `'open'` → `'active'`; `'suppressed'` → `'snoozed'`; orden ajustado.

### P3 — `MetricPlatform` inexistente

**Severidad:** ALTA  
**Síntoma:** No había tipo para el CHECK constraint `(meta, google, tiktok, linkedin, twitter, other)` de `client_metrics`. Se usaba `AdPlatform` incorrectamente.  
**Fix:** `platforms.ts` — nuevo `METRIC_PLATFORMS` + `MetricPlatform` + `METRIC_PLATFORM_LABELS`.

### P4 — `Alert` entity faltaba 10+ campos de DB

**Severidad:** ALTA  
**Síntoma:** `message` en lugar de `description`; faltaban `organizationId`, `alertKey`, `alertType`, `accountId`, `acknowledgedBy`, `resolvedBy`, `snoozedUntil`, `detectedAt`.  
**Fix:** Entidad completamente reemplazada con campos exactos de DB.

### P5 — `Task` entity tenía campos que no existen en DB

**Severidad:** ALTA  
**Síntoma:** `assigneeId`, `requiresApproval`, `completedAt` en la entidad; no existen en DB.  
**Fix:** Eliminados. Añadidos `organizationId`, `tags`, `createdBy`, `updatedBy`, `deletedAt`.

### P6 — `exactOptionalPropertyTypes` violations (TS2375)

**Severidad:** MEDIA — type error en compilación  
**Síntoma:** Asignar `undefined` a propiedades opcionales en objetos literales con `exactOptionalPropertyTypes: true`.  
**Fix:** Spread condicional en todos los sitios:
```typescript
...(value !== undefined && { key: value })
```
Afectó: `list-alerts.use-case`, `list-tasks.use-case`, `list-client-metrics.use-case`, `metric.mapper.ts` (×3 objetos).

### P7 — `noUncheckedIndexedAccess` violations (TS2532)

**Severidad:** BAJA — type error en tests  
**Síntoma:** `array[0]` en tests con `noUncheckedIndexedAccess` activo.  
**Fix:** `.at(0)?.` en todos los accesos de array en tests.

### P8 — `paginate()` no hace slice

**Severidad:** MEDIA — tests fallaban  
**Síntoma:** La función `paginate()` de shared solo envuelve metadata, no corta los datos. Los fake repos en tests pasaban el array completo y los tests de paginación fallaban.  
**Fix:** Fake repos ahora aplican `slice((page-1)*pageSize, page*pageSize)` antes de llamar a `paginate()`.

---

## 3. Decisiones técnicas

| Decisión | Razón |
|---|---|
| `MetricSummary = Omit<Metric, 'campaigns'>` | `campaigns` puede tener 55+ items (magic-bungalow); excluirlo en listas evita cargar JSONB pesado innecesariamente |
| Parsers JSONB lanzan en campo inválido (no silent fallback) | Datos silenciosamente incorrectos son más peligrosos que un error en runtime; el caller puede capturar y reportar |
| `overdueTasks = 0` en dashboard (diferido) | Requiere query con filtro `due_date < now AND status NOT IN (done, cancelled)`; mejor con índice dedicado en Phase 5B |
| `acknowledge`/`resolve` en `AlertRepository` → RPC | La tabla `alerts` tiene trigger `trg_alerts_70_audit_fields` que protege campos de auditoría; solo las RPCs `acknowledge_alert`/`resolve_alert` pueden actualizar `acknowledged_at`/`resolved_at` correctamente |
| `OrganizationId` siempre del servidor | Alineado con el modelo de seguridad: ningún filtro de organización acepta input del cliente |

---

## 4. Cobertura de tests Phase 5A

| Área | Tests | Casos cubiertos |
|---|---|---|
| Alert transitions | 15 | Todos los estados válidos, transiciones inválidas, `canTransitionAlert`, `getAlertNextStates` |
| Task transitions | 24 | Estados válidos, transiciones inválidas, `isTaskOverdue` con/sin fecha, `canTransitionTask` |
| Metric validation | 8 | `validateMetricValues` (valores negativos, NaN, Infinity), `validateMetricPeriod` |
| Metric mapper | 17 | Campos básicos, traffic/engagement/conversations, null handling, plataforma inválida, 55+ campaigns |
| Alert mapper | 15 | Status válidos, severity, platform, campos opcionales null, status inválido lanza |
| Task mapper | 13 | Todos los campos, `deletedAt`, status válidos e inválidos, tags array |
| listAlerts use case | 7 | Filtro por org, status, severity, paginación, error propagation |
| listTasks use case | 6 | Filtro por org, status, soft-delete, paginación, error propagation |

---

## 5. Pendiente para Phase 5B

- Implementar `SupabaseMetricsRepository`, `SupabaseAlertRepository`, `SupabaseTaskRepository`
- Implementar `listClientMetrics` con test de integración Supabase
- Implementar `overdueTasks` real (índice en `tasks(due_date, status)`)
- Crear Server Actions para dashboard
- Implementar páginas y componentes
- Añadir `GetClientDashboardSummary` use case (por cliente individual)
