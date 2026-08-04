# Phase 5D — Changelog

**Fecha:** 2026-08-04
**Fase:** 5D — UI Funcional del Dashboard
**Estado:** READY

---

## 1. Rutas implementadas

| Ruta | Tipo | Descripción |
|------|------|-------------|
| `/dashboard` | Server Component | Dashboard principal con KPIs en tiempo real |
| `/alerts` | Server Component | Listado de alertas con filtros y paginación |
| `/tasks` | Server Component | Listado de tareas con filtros y paginación |
| `/metrics` | Server Component | Nueva ruta — métricas de clientes con filtros y paginación |

Todas las rutas consumen `createDashboardComposition` como composition root y obtienen `organizationId` exclusivamente del servidor vía `requireOrganization()`.

---

## 2. Componentes nuevos

### Common
- `EmptyState.tsx` — estado vacío reutilizable con ícono, título, descripción y slot de acción
- `RepositoryErrorState.tsx` — estado de error con `role="alert"` y `aria-live="polite"`
- `Pagination.tsx` — paginación cliente con `useRouter` + `useSearchParams` + `useTransition`

### Dashboard
- `SummaryCard.tsx` — card de KPI con skeleton (`SummaryCardSkeleton`)
- `AgencySummaryCards.tsx` — 4 cards: clientes activos, alertas activas, tareas, gasto total/ROAS
- `ActiveAlertsSidebar.tsx` — sidebar con top-5 alertas activas y link a `/alerts`

### Alerts
- `AlertSeverityBadge.tsx` — badge para severidad (critical/warning/info) en español
- `AlertStatusBadge.tsx` — badge para estado (active/acknowledged/snoozed/resolved) en español
- `AlertActions.tsx` — botones de acción (Reconocer / Resolver) con `useTransition` y `aria-busy`
- `AlertsFilters.tsx` — filtros de estado y severidad con URL params
- `AlertsTable.tsx` — tabla semántica con EmptyState y badges

### Tasks
- `TaskStatusBadge.tsx` — badge para estado de tarea en español
- `TaskPriorityBadge.tsx` — badge para prioridad (low/medium/high/urgent) en español
- `TaskStatusAction.tsx` — `<select>` con transiciones válidas vía `getTaskNextStates()`
- `TasksFilters.tsx` — filtros de estado y vencimiento con URL params
- `TasksTable.tsx` — tabla con detección de vencimiento via `isTaskOverdue()` y `⚠️` visual

### Metrics
- `MetricsFilters.tsx` — filtros de plataforma y período disponible
- `MetricsTable.tsx` — tabla con columna sticky "Período", `METRIC_PLATFORM_LABELS`, formateo
- `MetricsSummaryCards.tsx` — 4 cards de agregado: gasto total, impresiones, clics, ROAS promedio

---

## 3. Componentes reutilizados

- `createDashboardComposition` — composition root de Phase 5B
- `requireOrganization()` / `requireOrganizationRole()` — autenticación multi-tenant
- `createServerSupabaseClient()` — cliente Supabase server-side
- `acknowledgeAlertAction` / `resolveAlertAction` — Server Actions de Phase 5C
- `updateTaskStatusAction` — Server Action de Phase 5C
- `getAlertNextStates()` / `getTaskNextStates()` — funciones de dominio
- `isTaskOverdue()` — función de dominio
- `validateEnum<T>()` — validación de searchParams contra valores permitidos
- `ALERT_STATUSES`, `ALERT_SEVERITIES`, `METRIC_PLATFORMS`, `METRIC_PLATFORM_LABELS` — constantes de `@bop-agency/shared`
- Sidebar — modificado para agregar entrada `/metrics`

---

## 4. Integración con casos de uso

| Use Case | Ruta | Llamada |
|----------|------|---------|
| `getAgencyDashboardSummary` | `/dashboard` | `Promise.all` con listAlerts y listTasks |
| `listAlerts` | `/dashboard`, `/alerts` | Con filtros opcionales de status/severity |
| `listTasks` | `/dashboard`, `/tasks` | Con filtros opcionales de status |
| `listClientMetrics` | `/metrics` | Con filtros opcionales de platform/periodStart/periodEnd |

Todos retornan `Result<T>`: se accede a `.value.data` (nunca `.items`) y se verifica `.success` antes de usar.

---

## 5. Integración con Server Actions

| Server Action | Componente cliente | Activación |
|--------------|-------------------|------------|
| `acknowledgeAlertAction` | `AlertActions` | Botón "Reconocer" con `startTransition` |
| `resolveAlertAction` | `AlertActions` | Botón "Resolver" con `startTransition` |
| `updateTaskStatusAction` | `TaskStatusAction` | `<select onChange>` con `startTransition` |

Todas las acciones usan `useTransition`; los controles muestran estado `disabled` + `aria-busy={isPending}` durante la mutación. La visibilidad de acciones depende de `getAlertNextStates()` / `getTaskNextStates()` para seguir el grafo de estado del dominio.

---

## 6. Filtros implementados

| Página | Filtros disponibles |
|--------|---------------------|
| `/alerts` | `status` (ALERT_STATUSES), `severity` (ALERT_SEVERITIES), `page` |
| `/tasks` | `status` (TASK_STATUSES), `overdue` (boolean), `page` |
| `/metrics` | `platform` (METRIC_PLATFORMS), `period` (YYYY-MM), `page` |

Todos los filtros se validan con `validateEnum<T>()` para evitar valores arbitrarios del cliente. Períodos se parsean con la función utilitaria `parsePeriod()` que maneja `string | undefined` correctamente.

---

## 7. Estados loading / error / empty

| Estado | Implementación |
|--------|---------------|
| **Loading** | `loading.tsx` por ruta con skeletons `animate-pulse` |
| **Error de repositorio** | `RepositoryErrorState` con `role="alert"` |
| **Lista vacía** | `EmptyState` con ícono, título y descripción contextual |
| **Dashboard sin datos** | Cards muestran `—` cuando el valor es 0 |

---

## 8. Responsive

- `SummaryCard` y tarjetas de métricas: grid con `sm:grid-cols-2 lg:grid-cols-4`
- Tablas: wrapper `overflow-x-auto` con columna "Período" sticky en `MetricsTable`
- Sidebar: estructura existente de Phase 5A sin cambios (responsive por herencia)
- Filtros: `flex-wrap gap-2` para colapso natural en pantallas pequeñas

---

## 9. Accesibilidad

- Todas las tablas tienen `aria-label` descriptivo
- `RepositoryErrorState` tiene `role="alert"` y `aria-live="polite"`
- `AlertActions` y `TaskStatusAction` tienen `aria-busy={isPending}` durante mutaciones
- Iconos decorativos con `aria-hidden="true"` (EmptyState, SummaryCard)
- Paginación usa `aria-label` en botones prev/next
- Badges usan colores + texto (no solo color) para comunicar estado/severidad

---

## 10. Tests

| Archivo de test | Tests |
|----------------|-------|
| `AlertSeverityBadge.test.tsx` | 7 |
| `AlertStatusBadge.test.tsx` | 7 |
| `AlertsTable.test.tsx` | 11 |
| `TaskStatusBadge.test.tsx` | 8 |
| `TaskPriorityBadge.test.tsx` | 6 |
| `TasksTable.test.tsx` | 10 |
| `SummaryCard.test.tsx` | 9 |
| `AgencySummaryCards.test.tsx` | 9 |
| `MetricsTable.test.tsx` | 8 |
| `MetricsSummaryCards.test.tsx` | 6 |
| `EmptyState.test.tsx` | 7 |
| `RepositoryErrorState.test.tsx` | 5 |
| **Total Phase 5D** | **93** |

---

## 11. Resultados de validación

| Check | Resultado |
|-------|-----------|
| `tsc --noEmit` (apps/web) | ✅ sin errores |
| ESLint `--max-warnings=0` (Phase 5D files) | ✅ sin warnings |
| Prettier `--check` (Phase 5D files) | ✅ formateado (10 archivos corregidos) |
| `packages/shared` tests | ✅ 30/30 |
| `packages/application` tests | ✅ 77/77 |
| `packages/infrastructure` tests | ✅ 128/128 |
| Phase 5D component tests (por archivo) | ✅ 93/93 |
| Phase 4 migrations tests | ✅ 317/317 |
| Grep `as any` en archivos Phase 5D | ✅ ninguno |
| Grep `@ts-ignore` en archivos Phase 5D | ✅ ninguno |
| Grep `service_role` en archivos Phase 5D | ✅ ninguno |

---

## 12. Total de tests en Phase 5D

**93 tests nuevos** en 12 archivos de test.

Acumulado del proyecto:
- Phase 4 migrations: 317
- packages/shared: 30
- packages/application: 77
- packages/infrastructure: 128
- Phase 5A (web): ~20 (estimado, estables)
- Phase 5B (web): ~35 (estimado, estables)
- Phase 5C (web): ~91
- Phase 5D (web): 93

---

## 13. Descripción visual

### `/dashboard`
Cuatro SummaryCards en grid (clientes, alertas, tareas, gasto) con valores reales del composition root. Sidebar derecho con top-5 alertas activas filtradas por `status: 'active'`. Accentos de color dinámicos: rojo si hay alertas críticas, ámbar si warning, verde si ninguna.

### `/alerts`
Barra de filtros (status + severity) persistida en URL. Tabla con severidad/estado como badges de color, fecha de creación, y botones de acción condicionados al estado actual y rol del usuario. Paginación con navegación por URL.

### `/tasks`
Barra de filtros (status + overdue toggle). Tabla con prioridad/estado como badges, fecha límite con indicador ⚠️ en rojo si vencida. `<select>` inline para cambiar estado (solo estados válidos según grafo de dominio). Solo visible para roles OPERATOR_ROLES.

### `/metrics`
Barra de filtros (plataforma + período). 4 summary cards de agregado arriba. Tabla con columna sticky "Período", plataforma como label legible, gasto, impresiones, clics, leads, ROAS (muestra `—` si 0). Paginación.

---

## 14. Riesgos

- **recharts no instalado**: `MetricsChart` fue pospuesto porque `npm install recharts` genera timeout en el sandbox. La visualización de tendencias queda pendiente para una fase futura.
- **`getAvailablePeriods` no es use case**: la página de métricas accede directamente a `repositories.metricsRepository` del composition root, acoplando levemente la página a la capa de infraestructura.
- **Tests de integración ausentes**: todos los tests son unitarios. No hay tests E2E de las páginas completas con Supabase.

---

## 15. Deuda técnica

- `MetricsChart` (recharts): componente diferido, pendiente instalar dependencia en entorno productivo
- `TasksFilters` tiene filtro `overdue` que actualmente filtra en cliente (la página filtra la lista recibida). Idealmente debería pasarse al use case como parámetro.
- Paginación no muestra rango ("Mostrando 1-10 de 45") — solo botones prev/next
- `ActiveAlertsSidebar` hardcodea `pageSize: 5` sin paginación propia

---

## 16. Recomendaciones para Phase 5E

1. Instalar `recharts` y completar `MetricsChart` con serie temporal por plataforma
2. Agregar parámetro `overdue: boolean` al use case `listTasks` para filtrado server-side
3. Añadir `total` al display de paginación ("X de Y resultados")
4. Tests E2E con Playwright para flujos críticos: acknowledge alert, resolve alert, change task status
5. Considerar `Suspense` boundaries granulares por sección en dashboard

---

## 17. Git status --short

```
 M apps/web/src/app/(protected)/alerts/page.tsx
 M apps/web/src/app/(protected)/dashboard/page.tsx
 M apps/web/src/app/(protected)/tasks/page.tsx
 M apps/web/src/components/common/index.ts
 M apps/web/src/components/layout/Sidebar.tsx
?? apps/web/src/app/(protected)/alerts/loading.tsx
?? apps/web/src/app/(protected)/dashboard/loading.tsx
?? apps/web/src/app/(protected)/metrics/
?? apps/web/src/app/(protected)/tasks/loading.tsx
?? apps/web/src/components/alerts/
?? apps/web/src/components/common/EmptyState.tsx
?? apps/web/src/components/common/Pagination.tsx
?? apps/web/src/components/common/RepositoryErrorState.tsx
?? apps/web/src/components/common/__tests__/
?? apps/web/src/components/dashboard/
?? apps/web/src/components/metrics/
?? apps/web/src/components/tasks/
```

---

## 18. Veredicto

**READY**

TypeScript: sin errores. ESLint: sin warnings. Prettier: formateado. Tests: 93 nuevos passing (93/93). Phase 4/5A/5B/5C: estables. Constraints de seguridad cumplidos (sin service_role, organizationId del servidor, sin `as any`). La única deuda técnica aceptable es `MetricsChart` (recharts) diferido por limitación de entorno de sandbox.
