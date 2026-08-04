# Phase 5A Changelog — Dashboard Principal (Bloque 5A)

**Fecha:** 2026-07-31  
**Rama:** main (sin commit — pendiente revisión)  
**Scope:** shared · domain · application · infrastructure  
**Restricciones aplicadas:** NO Supabase, NO Server Actions, NO páginas, NO commit, NO migraciones

---

## Resumen ejecutivo

Bloque 5A implementa la capa de dominio, aplicación e infraestructura (mappers) para el Dashboard Principal de BopIAgency. Se corrigieron desalineaciones críticas entre los tipos compartidos y el esquema real de base de datos, se crearon tres entidades nuevas/actualizadas, cuatro contratos de repositorio, cuatro use cases de lectura, tres mappers de infraestructura con validación estricta de JSONB, y 10 suites de tests unitarios.

---

## 1. `packages/shared`

### `src/constants/status.ts` — MODIFICADO

**Problema:** `TASK_STATUSES` usaba `'completed'` y `'on_hold'` que no existen en el enum `task_status` de la DB. `ALERT_STATUSES` usaba `'open'` y `'suppressed'` que tampoco existen en `alert_status`.

**Cambios:**
- `TASK_STATUSES`: `'completed'` → `'done'`; `'on_hold'` → `'blocked'` (alineado con DB enum `task_status`)
- `ALERT_STATUSES`: `'open'` → `'active'`; `'suppressed'` eliminado; añadido `'snoozed'` (alineado con DB enum `alert_status`)

### `src/constants/platforms.ts` — MODIFICADO

**Problema:** `MetricPlatform` no existía — la DB tiene CHECK constraint `(meta, google, tiktok, linkedin, twitter, other)`, distinto de `AdPlatform` (14 valores).

**Añadido:**
```typescript
export const METRIC_PLATFORMS = ['meta','google','tiktok','linkedin','twitter','other'] as const;
export type MetricPlatform = (typeof METRIC_PLATFORMS)[number];
export const METRIC_PLATFORM_LABELS: Record<MetricPlatform, string> = { ... };
```

### `src/index.ts` — MODIFICADO

Exporta `METRIC_PLATFORMS`, `METRIC_PLATFORM_LABELS`, `MetricPlatform`.

---

## 2. `packages/domain`

### `src/entities/metric.ts` — NUEVO

Entidad completa para `client_metrics`. Tipos exportados:

- `MetricId` (branded string)
- `MetricTraffic`, `MetricEngagement`, `MetricConversations` — sub-objetos opcionales del JSONB `metrics`
- `MetricValues` — 13 campos numéricos obligatorios + 4 opcionales
- `CampaignMetric` — ítem del array JSONB `campaigns`
- `DataQuality` — objeto JSONB `data_quality`
- `Metric` — entidad completa (incluye `campaigns`)
- `MetricSummary = Omit<Metric, 'campaigns'>` — para listas (evita cargar JSONB pesado)

Funciones de dominio exportadas:
- `validateMetricValues(m: MetricValues): string[]`
- `validateMetricPeriod(start: Date, end: Date): boolean`

### `src/entities/alert.ts` — REEMPLAZADO

**Cambios críticos vs. versión anterior:**
- Añadidos: `organizationId`, `alertKey`, `alertType`, `accountId`, `description` (no `message`), `snoozedUntil`, `acknowledgedBy`, `resolvedBy`, `detectedAt`
- `clientId` ahora `ClientId | null`
- Eliminado: `AlertRuleType` (no existe en DB)
- Corregido: `AlertStatus` usa valores DB (`active/acknowledged/snoozed/resolved`)
- Añadidos: grafo de transiciones y funciones de dominio:
  ```typescript
  canTransitionAlert(from, to): boolean
  getAlertNextStates(status): AlertStatus[]
  ```

### `src/entities/task.ts` — REEMPLAZADO

**Cambios críticos vs. versión anterior:**
- Añadidos: `organizationId`, `tags`, `createdBy`, `updatedBy`, `deletedAt`
- `clientId` ahora `ClientId | null`
- Eliminados: `requiresApproval`, `assigneeId` (no existen en DB)
- Corregido: `TaskStatus` usa valores DB (`done/blocked` en lugar de `completed/on_hold`)
- Añadidos: grafo de transiciones y funciones de dominio:
  ```typescript
  canTransitionTask(from, to): boolean
  getTaskNextStates(status): TaskStatus[]
  isTaskOverdue(task, now?): boolean
  ```

### `src/repositories/metrics.repository.ts` — REEMPLAZADO

Interfaz `MetricsRepository` con filtros tipados (`MetricFilter`) y métodos:
- `findById`, `findByOrganization`, `findByClient`, `findLatestByClient`
- `getAvailablePeriods`, `getOrganizationSummary`

Tipos auxiliares: `AvailablePeriod`, `MetricOrganizationSummary`, `MetricFilter`.

### `src/repositories/alert.repository.ts` — REEMPLAZADO

Interfaz `AlertRepository` con filtros tipados y métodos:
- `findById`, `findByOrganization`, `findActiveByOrganization`, `findByClient`
- `countBySeverity`, `acknowledge` (→ RPC), `resolve` (→ RPC)

Tipo auxiliar: `AlertCountBySeverity`, `AlertFilter`.

### `src/repositories/task.repository.ts` — REEMPLAZADO

Interfaz `TaskRepository` con filtros tipados y métodos:
- `findById`, `findByOrganization`, `findByClient`, `findUpcoming`
- `countByStatus`, `updateStatus`

Tipos auxiliares: `TaskCountByStatus`, `TaskFilter` (con `includeDeleted: boolean`).

### `src/repositories/index.ts` — MODIFICADO

Re-exporta `AvailablePeriod`, `MetricOrganizationSummary` (elimina `MetricsPeriod` obsoleto).

### `src/index.ts` — MODIFICADO

Exporta todas las nuevas entidades, funciones de dominio, contratos de repositorio y tipos auxiliares.

### Tests nuevos

| Archivo | Tests |
|---|---|
| `src/__tests__/alert-transitions.test.ts` | 15 |
| `src/__tests__/task-transitions.test.ts` | 24 |
| `src/__tests__/metric-validation.test.ts` | 8 |

---

## 3. `packages/application`

### `src/use-cases/alerts/list-alerts.use-case.ts` — REEMPLAZADO

- Añade `organizationId` obligatorio (siempre del servidor, nunca del cliente)
- Fix `exactOptionalPropertyTypes`: spread condicional para `status` y `severity`
- Logger con firma correcta: `logger.error(message, error, context)`

### `src/use-cases/tasks/list-tasks.use-case.ts` — REEMPLAZADO

- Añade `organizationId` obligatorio
- Fix `exactOptionalPropertyTypes`: spread condicional para `status` y `overdue`
- `includeDeleted: false` por defecto en el filtro

### `src/use-cases/metrics/list-client-metrics.use-case.ts` — NUEVO

Use case de lectura de métricas por organización/cliente:
- Input: `{ organizationId, clientId?, platform?, periodStart?, periodEnd?, pagination }`
- Output: `Result<PaginatedResult<MetricSummary>>`
- Fix `exactOptionalPropertyTypes` en todos los campos opcionales del filtro

### `src/use-cases/dashboard/get-agency-dashboard-summary.use-case.ts` — NUEVO

Use case central del dashboard:
- Output: `AgencyDashboardSummary { activeClients, activeAlerts, alertsBySeverity, pendingTasks, overdueTasks, inProgressTasks, totalSpend, avgRoas }`
- Ejecuta 3 queries en paralelo (`Promise.all`) con fallback a ceros en error
- `overdueTasks = 0` (diferido a Phase 5B — requiere query dedicada con índice)

### `src/index.ts` — MODIFICADO

Exporta `listClientMetrics`, `getAgencyDashboardSummary`, `AgencyDashboardSummary` y sus tipos de input/deps.

### Tests nuevos

| Archivo | Tests |
|---|---|
| `src/__tests__/list-alerts-phase5.test.ts` | 7 |
| `src/__tests__/list-tasks-phase5.test.ts` | 6 |

---

## 4. `packages/infrastructure`

### `src/supabase/mappers/metric.mapper.ts` — NUEVO

Mapper DB → dominio para `client_metrics`:
- `MetricRow` / `MetricSummaryRow` — tipos de fila Supabase
- `rowToMetricSummary(row)` — excluye campaigns (para listas)
- `rowToMetric(row)` — incluye campaigns (para detalle)
- Parsers JSONB estrictos: lanzan error descriptivo en campo inválido, NO coercionan null→0
- Fix `exactOptionalPropertyTypes` en todos los campos opcionales de `MetricValues`, `CampaignMetric` y `DataQuality`
- Soporta 55+ campañas por fila (caso magic-bungalow)

### `src/supabase/mappers/alert.mapper.ts` — NUEVO

- `AlertRow` — tipo de fila Supabase (columnas exactas de DB, sin `message`)
- `rowToAlert(row)` — valida status/severity/platform contra enums reales; lanza en valores inválidos

### `src/supabase/mappers/task.mapper.ts` — NUEVO

- `TaskRow` — tipo de fila Supabase (sin `assignee_id`, sin `completed_at`)
- `rowToTask(row)` — rechaza explícitamente valores obsoletos `'completed'` y `'on_hold'`

### `src/index.ts` — MODIFICADO

Exporta los 3 mapper functions y sus tipos de fila.

### Tests nuevos

| Archivo | Tests |
|---|---|
| `src/supabase/mappers/__tests__/metric.mapper.test.ts` | 17 |
| `src/supabase/mappers/__tests__/alert.mapper.test.ts` | 15 |
| `src/supabase/mappers/__tests__/task.mapper.test.ts` | 13 |

---

## Resumen de archivos

| Tipo | Cantidad |
|---|---|
| Archivos nuevos | 16 |
| Archivos modificados | 14 |
| Archivos de test nuevos | 10 |

---

## Fuera de scope (Phase 5B)

- `SupabaseMetricsRepository`, `SupabaseAlertRepository`, `SupabaseTaskRepository`
- Server Actions
- Páginas y componentes de dashboard
- `overdueTasks` con query real (diferido — requiere índice en `due_date + status`)
