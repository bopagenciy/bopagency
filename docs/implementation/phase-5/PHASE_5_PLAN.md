# PHASE 5 PLAN

## BopIAgency — Dashboard Principal

**Fecha:** 2026-07-31  
**Estado:** Planificación completa — pendiente de implementación

---

## 1. RESUMEN EJECUTIVO

Phase 5 convierte el dashboard en modo placeholder a un dashboard funcional con datos reales de Supabase. Incluye:

- Corregir desalineaciones de tipos entre `shared` y la DB
- Crear 3 repositorios Supabase (Metrics, Alerts, Tasks)
- Crear 5 use cases de aplicación
- Reemplazar `/dashboard` con datos reales
- Implementar `/alerts`, `/tasks`, `/metrics` como páginas funcionales
- Server Actions para mutaciones (acknowledge/resolve alerta, cambio de status de tarea)

**Restricciones inamovibles:**

- NO ejecutar migraciones SQL
- NO borrar datos
- NO hacer commit hasta que el usuario valide
- NO modificar Supabase directamente

---

## 2. TAREAS DEL ROADMAP — 5.1 a 5.15

Extraídas de `docs/architecture/IMPLEMENTATION_ROADMAP.md`:

| ID   | Tarea                                                | Dependencias |
| ---- | ---------------------------------------------------- | ------------ |
| 5.1  | Corregir TaskStatus y AlertStatus en shared          | ninguna      |
| 5.2  | Crear entidad Metric en domain                       | 5.1          |
| 5.3  | Expandir TaskRepository y AlertRepository interfaces | 5.1          |
| 5.4  | Crear MetricsRepository interface                    | 5.2          |
| 5.5  | Crear SupabaseMetricsRepository                      | 5.4          |
| 5.6  | Crear SupabaseAlertRepository                        | 5.3          |
| 5.7  | Crear SupabaseTaskRepository                         | 5.3          |
| 5.8  | Crear use case getAgencyDashboardSummary             | 5.6, 5.7     |
| 5.9  | Crear use case listClientMetrics                     | 5.5          |
| 5.10 | Crear use cases acknowledgeAlert / resolveAlert      | 5.6          |
| 5.11 | Crear use case updateTaskStatus                      | 5.7          |
| 5.12 | Reemplazar /dashboard con datos reales               | 5.8          |
| 5.13 | Implementar /metrics                                 | 5.9          |
| 5.14 | Implementar /alerts                                  | 5.10         |
| 5.15 | Implementar /tasks                                   | 5.11         |

---

## 3. ORDEN DE IMPLEMENTACIÓN

```
BLOQUE 1 — FUNDAMENTOS (shared + domain)
  5.1  Fix TaskStatus + AlertStatus
  5.2  Entidad Metric
  5.3  Expandir TaskRepository + AlertRepository interfaces
  5.4  MetricsRepository interface

BLOQUE 2 — INFRAESTRUCTURA (repositorios Supabase)
  5.5  SupabaseMetricsRepository
  5.6  SupabaseAlertRepository
  5.7  SupabaseTaskRepository

BLOQUE 3 — USE CASES (application)
  5.8  getAgencyDashboardSummary
  5.9  listClientMetrics
  5.10 acknowledgeAlert + resolveAlert
  5.11 updateTaskStatus + listTasks + listAlerts (ampliados)

BLOQUE 4 — UI (Server Components + Server Actions)
  5.12 /dashboard con datos reales
  5.13 /metrics página nueva
  5.14 /alerts página funcional
  5.15 /tasks página funcional
```

---

## 4. ESTRUCTURA DE ARCHIVOS A CREAR/MODIFICAR

### 4.1 `packages/shared/src/constants/status.ts` — MODIFICAR

```
TaskStatus: 'pending' | 'in_progress' | 'done' | 'cancelled' | 'blocked'
AlertStatus: 'active' | 'acknowledged' | 'snoozed' | 'resolved'
```

### 4.2 `packages/shared/src/constants/platforms.ts` — MODIFICAR

```
Añadir: METRIC_PLATFORMS y MetricPlatform
```

### 4.3 `packages/shared/src/schemas/` — CREAR

```
task.schema.ts     — Zod schemas para Task mutations
alert.schema.ts    — Zod schemas para Alert mutations
metric.schema.ts   — Zod schemas para Metric filters
```

### 4.4 `packages/domain/src/` — CREAR/MODIFICAR

```
entities/metric.ts                   — CREAR (Metric, MetricValues, CampaignMetric)
entities/task.ts                     — MODIFICAR (añadir organizationId, tags, deletedAt)
entities/alert.ts                    — MODIFICAR (añadir organizationId, alertKey, alertType, etc.)
repositories/task.repository.ts      — MODIFICAR (ampliar interfaz)
repositories/alert.repository.ts     — MODIFICAR (ampliar interfaz)
repositories/metrics.repository.ts   — MODIFICAR (ampliar interfaz)
```

### 4.5 `packages/infrastructure/src/supabase/` — CREAR

```
repositories/metrics.repository.ts   — SupabaseMetricsRepository
repositories/alert.repository.ts     — SupabaseAlertRepository
repositories/task.repository.ts      — SupabaseTaskRepository
mappers/metric.mapper.ts
mappers/alert.mapper.ts
mappers/task.mapper.ts
```

### 4.6 `packages/application/src/use-cases/` — CREAR/MODIFICAR

```
dashboard/get-agency-dashboard-summary.use-case.ts   — CREAR
metrics/list-client-metrics.use-case.ts              — CREAR
alerts/list-alerts.use-case.ts                       — MODIFICAR (añadir org filter)
alerts/acknowledge-alert.use-case.ts                 — CREAR
alerts/resolve-alert.use-case.ts                     — CREAR
tasks/list-tasks.use-case.ts                         — MODIFICAR (añadir org filter)
tasks/update-task-status.use-case.ts                 — CREAR
```

### 4.7 `apps/web/src/app/(protected)/` — CREAR/MODIFICAR

```
dashboard/page.tsx                   — MODIFICAR (datos reales)
dashboard/loading.tsx                — CREAR (Suspense skeleton)

metrics/page.tsx                     — CREAR
metrics/loading.tsx                  — CREAR

alerts/page.tsx                      — MODIFICAR (reemplazar UnderConstruction)
alerts/loading.tsx                   — CREAR
alerts/actions.ts                    — CREAR (acknowledgeAlertAction, resolveAlertAction)

tasks/page.tsx                       — MODIFICAR (reemplazar UnderConstruction)
tasks/loading.tsx                    — CREAR
tasks/actions.ts                     — CREAR (updateTaskStatusAction)
```

### 4.8 `apps/web/src/components/` — CREAR

```
dashboard/AgencySummaryCards.tsx
dashboard/ActiveAlertsSidebar.tsx

metrics/MetricsSummaryCards.tsx
metrics/MetricsFilters.tsx
metrics/MetricsTable.tsx
metrics/MetricsCharts.tsx            — Recharts (lazy, no SSR)

alerts/AlertsTable.tsx
alerts/AlertStatusBadge.tsx
alerts/AlertSeverityBadge.tsx

tasks/TasksTable.tsx
tasks/TaskStatusBadge.tsx
tasks/TaskStatusSelect.tsx
tasks/TaskFilters.tsx
```

---

## 5. INTERFACES DE REPOSITORIOS — DISEÑO COMPLETO

### MetricsRepository

```typescript
export interface MetricsRepository {
  findByOrganization(
    organizationId: string,
    filters: {
      clientId?: ClientId;
      platform?: MetricPlatform;
      periodStart?: Date;
      periodEnd?: Date;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Metric>>;

  findByClient(
    clientId: ClientId,
    organizationId: string,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Metric>>;

  findLatestByClient(clientId: ClientId, organizationId: string): Promise<Result<Metric | null>>;

  getAvailablePeriods(organizationId: string): Promise<
    Result<
      Array<{
        periodStart: Date;
        periodEnd: Date;
      }>
    >
  >;

  getSummaryByOrganization(organizationId: string): Promise<
    Result<{
      totalSpend: number;
      totalLeads: number;
      totalConversions: number;
      avgRoas: number;
    }>
  >;
}
```

### AlertRepository (actualizado)

```typescript
export interface AlertRepository {
  findById(id: AlertId): Promise<Result<Alert>>;
  findActive(
    organizationId: string,
    filters: { clientId?: ClientId; severity?: AlertSeverity },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>>;
  findByOrganization(
    organizationId: string,
    filters: { status?: AlertStatus; clientId?: ClientId },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>>;
  countBySeverity(organizationId: string): Promise<Result<Record<AlertSeverity, number>>>;
  acknowledge(alertId: AlertId): Promise<Result<void>>; // llama RPC
  resolve(alertId: AlertId): Promise<Result<void>>; // llama RPC
  create(data: Omit<Alert, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Alert>>;
}
```

### TaskRepository (actualizado)

```typescript
export interface TaskRepository {
  findById(id: TaskId, organizationId: string): Promise<Result<Task>>;
  findByOrganization(
    organizationId: string,
    filters: {
      clientId?: ClientId;
      status?: TaskStatus;
      assigneeId?: UserId;
      overdue?: boolean;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Task>>;
  countByStatus(organizationId: string): Promise<Result<Record<TaskStatus, number>>>;
  findUpcoming(organizationId: string, days: number): Promise<Result<Task[]>>;
  updateStatus(id: TaskId, status: TaskStatus, organizationId: string): Promise<Result<Task>>;
  softDelete(id: TaskId, organizationId: string): Promise<Result<void>>;
  create(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Task>>;
}
```

---

## 6. USE CASES — FIRMAS

### getAgencyDashboardSummary

```typescript
type DashboardSummary = {
  clientsActive: number;
  alertsActive: number;
  alertsBySeverity: Record<AlertSeverity, number>;
  tasksPending: number;
  tasksOverdue: number;
  reportsThisMonth: number;
};

async function getAgencyDashboardSummary(
  input: { organizationId: string },
  deps: {
    alertRepository: AlertRepository;
    taskRepository: TaskRepository;
    clientRepository: ClientRepository;
    reportRepository: ReportRepository;
    logger: Logger;
  },
): Promise<Result<DashboardSummary>>;
```

### listClientMetrics

```typescript
type ListClientMetricsInput = {
  organizationId: string;
  clientId?: string;
  platform?: MetricPlatform;
  periodStart?: Date;
  periodEnd?: Date;
  pagination: PaginationParams;
};

async function listClientMetrics(
  input: ListClientMetricsInput,
  deps: { metricsRepository: MetricsRepository; logger: Logger },
): Promise<Result<PaginatedResult<Metric>>>;
```

### acknowledgeAlert

```typescript
async function acknowledgeAlert(
  input: { alertId: string; userId: string; organizationId: string },
  deps: { alertRepository: AlertRepository; logger: Logger },
): Promise<Result<void>>;
```

### resolveAlert

```typescript
async function resolveAlert(
  input: { alertId: string; userId: string; organizationId: string },
  deps: { alertRepository: AlertRepository; logger: Logger },
): Promise<Result<void>>;
```

### updateTaskStatus

```typescript
async function updateTaskStatus(
  input: { taskId: string; status: TaskStatus; organizationId: string },
  deps: { taskRepository: TaskRepository; logger: Logger },
): Promise<Result<Task>>;
```

---

## 7. PATRONES DE DATOS — QUERIES CLAVE

### Dashboard Summary (aproximación)

```typescript
// En SupabaseTaskRepository.countByStatus
const { data } = await supabase
  .from('tasks')
  .select('status')
  .eq('organization_id', organizationId)
  .is('deleted_at', null);

// Agregar en memoria para evitar múltiples queries:
const counts = data.reduce(
  (acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  },
  {} as Record<TaskStatus, number>,
);
```

### Metrics List (sin campaigns)

```typescript
// En SupabaseMetricsRepository.findByOrganization
// IMPORTANTE: excluir campaigns del SELECT
const { data } = await supabase
  .from('client_metrics')
  .select(
    `
    id, client_id, organization_id, platform, account_id, account_name,
    period_start, period_end, currency, metrics, data_quality,
    created_at, updated_at
  `,
  )
  // NO incluir campaigns aquí — solo en detalle
  .eq('organization_id', organizationId);
```

### Alerts Active

```typescript
const { data } = await supabase
  .from('alerts')
  .select('*')
  .eq('organization_id', organizationId)
  .eq('status', 'active')
  .order('created_at', { ascending: false });
```

### Tasks con Overdue

```typescript
const { data: overdue } = await supabase
  .from('tasks')
  .select('id')
  .eq('organization_id', organizationId)
  .in('status', ['pending', 'in_progress'])
  .lt('due_date', new Date().toISOString())
  .is('deleted_at', null);
```

---

## 8. PÁGINAS — DISEÑO DE COMPONENTES

### `/dashboard`

```
DashboardPage (Server Component)
├── AgencySummaryCards          ← clientsActive, alertsActive, tasksPending, tasksOverdue
├── ActiveAlertsSidebar         ← top 5 alertas activas
├── ClientsActiveList           ← reutilizar desde Phase 3
└── RecentReportsList           ← listado de últimos 5 reportes
```

### `/metrics`

```
MetricsPage (Server Component)
├── MetricsFilters              ← period, client, platform (Client Component)
├── MetricsSummaryCards         ← spend, leads, conversions, roas
├── MetricsTable                ← tabla por plataforma/período
└── MetricsCharts               ← lazy import (Client, Recharts)
    ├── SpendLineChart
    ├── LeadsBarChart
    └── RoasTrendChart
```

### `/alerts`

```
AlertsPage (Server Component)
├── AlertsTable                 ← lista de alertas con badges (Client Component)
│   ├── AlertStatusBadge
│   ├── AlertSeverityBadge
│   ├── AcknowledgeButton       ← llama acknowledgeAlertAction
│   └── ResolveButton           ← llama resolveAlertAction
└── AlertsFilters               ← status, severity, client (Client Component)
```

### `/tasks`

```
TasksPage (Server Component)
├── TasksTable                  ← lista de tareas (Client Component)
│   ├── TaskStatusBadge
│   ├── TaskStatusSelect        ← llama updateTaskStatusAction
│   └── DueDateBadge            ← rojo si vencida
└── TaskFilters                 ← status, client, assignee (Client Component)
```

---

## 9. DEPENDENCIAS EXTERNAS A INSTALAR

```bash
# En apps/web/
npm install recharts
npm install @types/recharts -D  # si no hay tipos incluidos

# Verificar que zod ya está:
# packages/shared/package.json → zod: "^3.x" ✅ (asumido desde Phase 2)
```

---

## 10. DECISIONES DE DISEÑO ABIERTAS

| Decisión                        | Opciones                                          | Recomendación                                                                        |
| ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Paginación en dashboard         | Mostrar top-N sin paginar vs. paginación completa | Top-5 para dashboard; paginación en /alerts y /tasks                                 |
| Caché de métricas               | `cache: 'force-cache'` con revalidate vs. ISR     | `revalidate: 300` (5 min) — métricas no cambian en tiempo real                       |
| Selector de período en /metrics | URL search param vs. state local                  | URL search param (`?period=2026-06`) — linkeable y server-side                       |
| MetricsCharts renderizado       | SSR vs. CSR                                       | `dynamic(() => import('./MetricsCharts'), { ssr: false })` — Recharts no soporta SSR |
| Toasts para Server Actions      | `sonner` vs. toast nativo                         | `sonner` si ya está instalado; si no, usar `useFormState` con mensaje inline         |
| Snooze de alertas               | Implementar en Phase 5 vs. diferir                | Diferir a Phase 6 — no hay UI para elegir duración de snooze                         |

---

## 11. RIESGOS Y MITIGACIONES

| Riesgo                                             | Probabilidad | Impacto | Mitigación                                                                      |
| -------------------------------------------------- | ------------ | ------- | ------------------------------------------------------------------------------- |
| `TaskStatus` renaming rompe tests existentes       | Alta         | Medio   | Ejecutar tests en Windows antes de empezar; grep de `'completed'` y `'on_hold'` |
| SupabaseAlertRepository llama UPDATE en vez de RPC | Media        | Alto    | Test estructural que verifica que el código usa `.rpc('acknowledge_alert')`     |
| MetricsCharts SSR error en Next.js 14              | Alta         | Bajo    | `{ ssr: false }` en dynamic import                                              |
| Recharts + Tailwind conflict en estilos            | Baja         | Bajo    | Recharts usa inline styles — no hay conflicto                                   |
| `campaigns` JSONB cargado en lista queries         | Media        | Alto    | Code review explícito + test que verifica que SELECT no incluye `campaigns`     |
| organizationId tomado del cliente (input)          | Baja         | Crítico | SECURITY_MODEL.md + code review en Server Actions                               |
| Tipos DB desactualizados (`database.types.ts`)     | Baja         | Bajo    | No regenerar — Phase 5 no añade migraciones                                     |

---

## 12. ESTIMACIÓN

| Bloque                     | Tareas    | Esfuerzo estimado |
| -------------------------- | --------- | ----------------- |
| Bloque 1 — Shared + Domain | 5.1–5.4   | ~2h               |
| Bloque 2 — Infraestructura | 5.5–5.7   | ~3h               |
| Bloque 3 — Use Cases       | 5.8–5.11  | ~3h               |
| Bloque 4 — UI              | 5.12–5.15 | ~6h               |
| Tests                      | —         | ~3h               |
| **Total**                  |           | **~17h**          |

---

## 13. CHECKLIST PRE-IMPLEMENTACIÓN

Ejecutar en Windows antes de empezar Phase 5:

```powershell
# 1. Confirmar que Phase 4 tests pasan
cd scripts/migrations/phase-4
npx vitest run __tests__/importers-phase4.test.ts

# 2. Confirmar typecheck global
cd ../../../
npx tsc --build

# 3. Confirmar lint
npx eslint packages/ apps/ --max-warnings=0

# 4. Grep de usos actuales de 'completed' y 'on_hold' para evaluar impacto del rename
grep -r "'completed'" packages/ apps/ --include="*.ts" --include="*.tsx"
grep -r "'on_hold'" packages/ apps/ --include="*.ts" --include="*.tsx"
grep -r "'open'" packages/ apps/ --include="*.ts" --include="*.tsx" | grep -i alert

# 5. Confirmar working tree limpio
git status
```

---

## 14. PRÓXIMOS PASOS (cuando se inicie implementación)

1. Corregir `status.ts` en shared (5.1) — impacta todo, va primero
2. Crear `metric.ts` entity (5.2)
3. Expandir interfaces de repositorios (5.3, 5.4)
4. Implementar los 3 repositorios Supabase con sus mappers (5.5–5.7)
5. Crear use cases con dependency injection (5.8–5.11)
6. Reemplazar placeholders en web app (5.12–5.15)
7. Instalar recharts y crear MetricsCharts
8. Ejecutar suite completa de tests
9. Verificar en browser con datos reales de Supabase
