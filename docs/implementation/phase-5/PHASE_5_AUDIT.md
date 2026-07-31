# PHASE 5 AUDIT

## BopIAgency — Dashboard Principal

**Fecha:** 2026-07-31  
**Estado:** Planificación — pendiente de implementación  
**Auditor:** Sesión de planificación técnica

---

## 1. ESTADO ACTUAL

### Working tree

```
git status: limpio (sin cambios sin commitar)
Último commit: 42b91d7 feat: complete phase 4 data migration
```

### Fases completadas

- Fase 0 (Seguridad) ✅
- Fase 1 (Setup Monorepo) ✅
- Fase 2 (Auth + Multi-tenant) ✅
- Fase 3 (Gestión de Clientes) ✅
- Fase 4 (Migración de Datos) ✅ — ejecutada en Supabase

### Datos migrados en Supabase

- 2 clientes activos: `legalink-col`, `magic-bungalow`
- 4 filas en `client_metrics` (2 clientes × 2 períodos: 2026-06, 2026-07)
- 1 alerta migrada
- 9 reportes migrados
- 22 documentos de cliente migrados
- 16 agentes, 32 skills, 17 templates, 7 automations

---

## 2. CÓDIGO REUTILIZABLE IDENTIFICADO

### 2.1 Domain — `packages/domain/src/`

| Artefacto                          | Archivo                              | Estado                                                                    |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `Task` entity                      | `entities/task.ts`                   | ✅ COMPLETO                                                               |
| `Alert` entity                     | `entities/alert.ts`                  | ✅ COMPLETO                                                               |
| `TaskRepository` interface         | `repositories/task.repository.ts`    | ⚠️ PARCIAL (falta filterByOrg, filterByClient, softDelete, countByStatus) |
| `AlertRepository` interface        | `repositories/alert.repository.ts`   | ⚠️ PARCIAL (falta acknowledge, resolve, findByOrg, countBySeverity)       |
| `MetricsRepository` interface      | `repositories/metrics.repository.ts` | ⚠️ PARCIAL (muy minimalista — falta findByOrg, getSummary, getPeriods)    |
| `TaskStatus`                       | `@bop-agency/shared`                 | ✅ (`pending`, `in_progress`, `completed`, `cancelled`, `on_hold`)        |
| `AlertSeverity`                    | `@bop-agency/shared`                 | ✅ (`critical`, `warning`, `info`)                                        |
| `AlertStatus`                      | `@bop-agency/shared`                 | ✅ (`open`, `acknowledged`, `resolved`, `suppressed`)                     |
| `AdPlatform`                       | `@bop-agency/shared`                 | ✅ (14 plataformas)                                                       |
| `Money`, `DateRange`, `Percentage` | value-objects                        | ✅ COMPLETO                                                               |

> **GAP CRÍTICO:** `TaskStatus` en shared tiene `completed` pero la DB tiene `done`. Requiere alineación.

### 2.2 Application — `packages/application/src/`

| Use Case      | Archivo                                      | Estado                                              |
| ------------- | -------------------------------------------- | --------------------------------------------------- |
| `listAlerts`  | `use-cases/alerts/list-alerts.use-case.ts`   | ⚠️ STUB (solo llama `findOpen`, sin filtros de org) |
| `listTasks`   | `use-cases/tasks/list-tasks.use-case.ts`     | ⚠️ STUB (sin filtros de org/client)                 |
| `listReports` | `use-cases/reports/list-reports.use-case.ts` | ⚠️ STUB                                             |

> No existen: `acknowledgeAlert`, `resolveAlert`, `updateTaskStatus`, `getAgencyDashboardSummary`, `listClientMetrics`.

### 2.3 Infrastructure — `packages/infrastructure/src/`

| Artefacto                        | Estado                                               |
| -------------------------------- | ---------------------------------------------------- |
| `SupabaseClientRepository`       | ✅ COMPLETO (patrón de referencia para nuevos repos) |
| `SupabaseOrganizationRepository` | ✅ COMPLETO                                          |
| `SupabaseUserProfileRepository`  | ✅ COMPLETO                                          |
| `InMemoryClientRepository`       | ✅ (para tests)                                      |
| `consoleLogger`                  | ✅                                                   |
| Mappers client/org/user          | ✅                                                   |

> No existen: `SupabaseMetricsRepository`, `SupabaseAlertRepository`, `SupabaseTaskRepository`.

### 2.4 Web App — `apps/web/src/`

| Artefacto                 | Estado                                                               |
| ------------------------- | -------------------------------------------------------------------- |
| Route group `(protected)` | ✅ COMPLETO (auth, layout, AppShell, sidebar, mobile nav)            |
| `/dashboard/page.tsx`     | ⚠️ PLACEHOLDER con datos demo (`placeholder-data.ts`)                |
| `/alerts/page.tsx`        | ⚠️ `UnderConstruction` stub                                          |
| `/tasks/page.tsx`         | ⚠️ `UnderConstruction` stub                                          |
| `/reports/page.tsx`       | ⚠️ `UnderConstruction` stub                                          |
| `/metrics/page.tsx`       | ❌ NO EXISTE                                                         |
| Componentes clients       | ✅ `ClientForm`, `ClientList`, `ClientStatusBadge`, `DocumentEditor` |
| `Header` component        | ✅ (con breadcrumbs)                                                 |
| `UnderConstruction`       | ✅ (reutilizable para estado de carga parcial)                       |
| `DemoBanner`              | ✅ (mostrar hasta que datos reales estén disponibles)                |

### 2.5 Legacy Dashboard — `agency-dashboard/src/`

| Componente legacy         | Migrar a                                          |
| ------------------------- | ------------------------------------------------- |
| `SummaryPage.tsx`         | `(protected)/dashboard/page.tsx`                  |
| `MetricsPage.tsx`         | `(protected)/metrics/page.tsx`                    |
| `AlertsPage.tsx`          | `(protected)/alerts/page.tsx`                     |
| `TasksPage.tsx`           | `(protected)/tasks/page.tsx`                      |
| `MetricsSummaryCards.tsx` | `components/metrics/MetricsSummaryCards.tsx`      |
| `MetricsFilters.tsx`      | `components/metrics/MetricsFilters.tsx`           |
| `MetricsTable.tsx`        | `components/metrics/MetricsTable.tsx`             |
| `TaskBadges.tsx`          | `components/tasks/TaskStatusBadge.tsx`            |
| `TaskTable.tsx`           | `components/tasks/TasksTable.tsx`                 |
| `TaskFilters.tsx`         | `components/tasks/TaskFilters.tsx`                |
| `TaskSummaryCards.tsx`    | `components/tasks/TaskSummaryCards.tsx`           |
| `MetricsCharts.tsx`       | `components/metrics/MetricsCharts.tsx` (Recharts) |

> **NOTA:** El legacy usa Vite+React SPA con Express API. La migración requiere convertir a Server Components + Server Actions + Supabase directo.

### 2.6 Recharts

El legacy no usa Recharts directamente — usa composición manual de cards. El roadmap menciona Recharts para gráficas. **No está instalado todavía en `apps/web/`.**

---

## 3. BRECHAS

### 3.1 Desalineación de tipos

| Tipo                     | En `shared`                     | En DB (SQL)                                                       | Impacto                           |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| `TaskStatus.completed`   | `'completed'`                   | `'done'`                                                          | ❌ ROTO — mapper fallará          |
| `AlertStatus.open`       | `'open'`                        | `'active'`                                                        | ❌ ROTO — mapper fallará          |
| `AlertStatus.suppressed` | `'suppressed'`                  | No existe en DB                                                   | ❌ Valor inválido si se escribe   |
| `AdPlatform`             | 14 plataformas (ej. `meta_ads`) | CHECK: `meta`, `google`, `tiktok`, `linkedin`, `twitter`, `other` | ⚠️ Desconexión — mapper necesario |

### 3.2 Repositorios faltantes

- `SupabaseMetricsRepository` (no existe)
- `SupabaseAlertRepository` (no existe)
- `SupabaseTaskRepository` (no existe)

### 3.3 Use cases faltantes

- `acknowledgeAlert` / `resolveAlert` (deben llamar RPCs, no UPDATE directo)
- `updateTaskStatus` (con validación de transición)
- `getAgencyDashboardSummary` (agrega clients + metrics + alerts + tasks)
- `listClientMetrics` (con filtros por cliente, período, plataforma)

### 3.4 Página /metrics no existe

El roadmap referencia `(dashboard)/metrics/page.tsx` pero la app usa `(protected)`. La página no existe.

### 3.5 Recharts no instalado

```
apps/web/package.json — recharts no aparece como dependencia
```

Requiere `npm install recharts` antes de usarlo.

### 3.6 JSONB campaigns puede ser grande

magic-bungalow tiene **55 campañas** por período. Cargar campaigns JSONB completo en lista podría ser costoso. Evaluar:

- `SELECT metrics` sin `campaigns` para la lista
- `campaigns` solo en vista de detalle

### 3.7 Tipos no regenerados

`database.types.ts` refleja las tablas Phase 4 pero **no está sincronizado** con las migraciones del documento local (no se han aplicado las de Phase 5 porque no existen todavía). Estado actual es correcto para los datos migrados.

### 3.8 Route group discrepancia

Roadmap dice `(dashboard)` pero la app usa `(protected)`. Todas las rutas de Phase 5 deben ir en `(protected)`.

---

## 4. DATABASE TYPES — VERIFICACIÓN

```
database.types.ts incluye:
✅ alerts          (SELECT, INSERT, UPDATE rows tipados)
✅ client_metrics  (SELECT, INSERT, UPDATE rows tipados)
✅ tasks           (SELECT, INSERT, UPDATE rows tipados)
✅ acknowledge_alert  (RPC — Args: { p_alert_id: string })
✅ resolve_alert      (RPC — Args: { p_alert_id: string })
```

**No regenerar** — los tipos actuales son correctos para las tablas existentes.

---

## 5. RESULTADO DE VALIDACIONES

```
git status --short:  LIMPIO (sin cambios)
git log --oneline:   42b91d7 feat: complete phase 4 data migration

typecheck:           No ejecutado en sandbox (esbuild Windows/Linux mismatch)
lint:                No ejecutado en sandbox
test:                No ejecutado en sandbox
format:check:        No ejecutado en sandbox
```

> Ejecutar en Windows antes de iniciar implementación:
>
> ```powershell
> cd apps/web && npx tsc --noEmit
> npm run lint
> npm run test
> npm run format:check
> ```

---

## 6. VEREDICTO

**READY para planificación.**  
**NOT READY para implementación** hasta resolver:

1. Desalineación `TaskStatus.completed` vs DB `done`
2. Desalineación `AlertStatus.open` vs DB `active`
3. Instalar `recharts` en `apps/web/`
4. Crear `SupabaseMetricsRepository`, `SupabaseAlertRepository`, `SupabaseTaskRepository`
5. Expandir interfaces de repositorios para cubrir filtros por organización
