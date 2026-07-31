# DATA MODEL — PHASE 5

## BopIAgency — Dashboard Principal

**Fecha:** 2026-07-31

---

## 1. ENUMS — ALINEACIÓN DB ↔ DOMINIO

### task_status (DB enum)

```sql
'pending' | 'in_progress' | 'done' | 'cancelled' | 'blocked'
```

### TaskStatus (shared package — ACTUAL, INCORRECTO)

```typescript
'pending' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';
```

### TaskStatus (shared package — DEBE QUEDAR)

```typescript
// packages/shared/src/constants/status.ts — CAMBIO REQUERIDO
export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'done', // era 'completed' — alinear con DB
  'cancelled',
  'blocked', // era 'on_hold' — alinear con DB
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
```

> **IMPACTO:** Revisar todos los usos de `'completed'` y `'on_hold'` en tests y use cases existentes.

---

### alert_status (DB enum)

```sql
'active' | 'acknowledged' | 'snoozed' | 'resolved'
```

### AlertStatus (shared package — ACTUAL, INCORRECTO)

```typescript
'open' | 'acknowledged' | 'resolved' | 'suppressed';
```

### AlertStatus (shared package — DEBE QUEDAR)

```typescript
// packages/shared/src/constants/status.ts — CAMBIO REQUERIDO
export const ALERT_STATUSES = [
  'active', // era 'open'
  'acknowledged',
  'snoozed', // nuevo
  'resolved',
] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
```

> **IMPACTO:** `listAlerts` use case actual usa `findOpen` — renombrar a `findActive`.

---

### alert_severity (DB enum)

```sql
'info' | 'warning' | 'critical'
```

✅ Coincide con `AlertSeverity` en shared.

---

## 2. PLATAFORMAS — NORMALIZACIÓN

### DB CHECK constraint (client_metrics.platform, alerts.platform)

```sql
CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin', 'twitter', 'other'))
```

### AdPlatform en shared (para referencia)

```typescript
'meta_ads' | 'google_ads' | 'tiktok_ads' | 'linkedin_ads' | 'twitter_ads' | ...
```

### MetricPlatform — tipo específico para Phase 5

```typescript
// packages/shared/src/constants/platforms.ts — AÑADIR
export const METRIC_PLATFORMS = [
  'meta',
  'google',
  'tiktok',
  'linkedin',
  'twitter',
  'other',
] as const;
export type MetricPlatform = (typeof METRIC_PLATFORMS)[number];
```

> Usar `MetricPlatform` en `Metric` entity y `MetricsRepository`. `AdPlatform` sigue usándose en `Campaign`.

---

## 3. ENTIDADES DE DOMINIO — FASE 5

### 3.1 Metric (nueva entidad)

```typescript
// packages/domain/src/entities/metric.ts
import type { ClientId } from './client';
import type { MetricPlatform } from '@bop-agency/shared';

export type MetricId = string & { readonly _brand: 'MetricId' };

export type MetricValues = {
  readonly spend: number;
  readonly impressions: number;
  readonly reach: number;
  readonly clicks: number;
  readonly leads: number;
  readonly conversions: number;
  readonly revenue: number;
  readonly ctr: number;
  readonly cpc: number;
  readonly cpm: number;
  readonly cpl: number;
  readonly roas: number;
  // Nested (pueden ser null en métricas antiguas)
  readonly traffic?: {
    readonly linkClicks: number;
    readonly landingPageViews: number;
  };
  readonly engagement?: {
    readonly postReactions: number;
    readonly postEngagement: number;
    readonly pageEngagement: number;
  };
  readonly conversations?: {
    readonly started: number;
    readonly replied: number;
  };
  readonly purchases?: number;
};

export type Metric = {
  readonly id: MetricId;
  readonly clientId: ClientId;
  readonly organizationId: string;
  readonly platform: MetricPlatform;
  readonly accountId: string;
  readonly accountName: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly currency: string;
  readonly metrics: MetricValues;
  readonly campaigns: CampaignMetric[];
  readonly dataQuality: DataQuality | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CampaignMetric = {
  readonly id: string;
  readonly name: string;
  readonly status?: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly leads: number;
  readonly conversions: number;
  readonly revenue: number;
};

export type DataQuality = {
  readonly status: 'complete' | 'partial' | 'unavailable';
  readonly warnings: string[];
};
```

### 3.2 Task — extensión del existente

```typescript
// packages/domain/src/entities/task.ts — ACTUALIZACIÓN REQUERIDA
// Cambiar: TaskStatus ya no importa de shared directamente
// Agregar: softDelete support

export type Task = {
  readonly id: TaskId;
  readonly organizationId: string; // AÑADIR (necesario para multi-tenant)
  readonly clientId?: ClientId;
  readonly assigneeId?: UserId;
  readonly title: string;
  readonly description?: string;
  readonly status: TaskStatus; // 'pending'|'in_progress'|'done'|'cancelled'|'blocked'
  readonly priority: TaskPriority;
  readonly dueDate?: Date;
  readonly tags: string[]; // AÑADIR
  readonly requiresApproval: boolean;
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date; // AÑADIR (soft-delete)
};
```

### 3.3 Alert — extensión del existente

```typescript
// packages/domain/src/entities/alert.ts — ACTUALIZACIÓN REQUERIDA
export type Alert = {
  readonly id: AlertId;
  readonly organizationId: string; // AÑADIR
  readonly clientId?: ClientId;
  readonly alertKey: string; // AÑADIR (clave única de dedup)
  readonly alertType: string; // libre (no enum cerrado en DB)
  readonly platform?: MetricPlatform;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus; // 'active'|'acknowledged'|'snoozed'|'resolved'
  readonly title: string | null;
  readonly description: string | null;
  readonly metadata: Record<string, unknown>;
  readonly detectedAt?: Date;
  readonly acknowledgedAt?: Date;
  readonly acknowledgedBy?: string;
  readonly snoozedUntil?: Date;
  readonly resolvedAt?: Date;
  readonly resolvedBy?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

---

## 4. STRUCTURE DE METRICS JSONB

### Campo `metrics` (JSONB en client_metrics)

```json
{
  "spend": 77053,
  "impressions": 10704,
  "reach": 6808,
  "clicks": 715,
  "traffic": { "linkClicks": 41, "landingPageViews": 0 },
  "engagement": { "postReactions": 16, "postEngagement": 3054, "pageEngagement": 3056 },
  "conversations": { "started": 0, "replied": 0 },
  "leads": 0,
  "purchases": 0,
  "conversions": 0,
  "revenue": 0,
  "ctr": 0.067,
  "cpc": 107.8,
  "cpm": 7.19,
  "cpl": 0,
  "conversionRate": 0,
  "roas": 0
}
```

### Campo `campaigns` (JSONB array en client_metrics)

```json
[
  {
    "id": "120208823630090658",
    "name": "Campaña ejemplo",
    "status": "unknown",
    "spend": 77053,
    "impressions": 10704,
    "reach": 6808,
    "clicks": 715,
    "traffic": { "linkClicks": 41, "landingPageViews": 0 },
    "engagement": { ... },
    "conversations": { ... },
    "leads": 0,
    "purchases": 0,
    "conversions": 0,
    "revenue": 0,
    "ctr": 0.067,
    "cpc": 107.8
  }
]
```

> **ADVERTENCIA:** magic-bungalow tiene 55 campañas por período. Nunca cargar `campaigns` en queries de lista. Solo en vista de detalle.

---

## 5. KPIs DEL DASHBOARD

Basados exclusivamente en datos reales disponibles en Supabase:

### Panel de Agencia (summary)

| KPI               | Fuente    | Columna                                                    |
| ----------------- | --------- | ---------------------------------------------------------- |
| Clientes activos  | `clients` | `status = 'active' AND deleted_at IS NULL`                 |
| Alertas activas   | `alerts`  | `status = 'active'`                                        |
| Tareas pendientes | `tasks`   | `status = 'pending' AND deleted_at IS NULL`                |
| Tareas vencidas   | `tasks`   | `status IN ('pending','in_progress') AND due_date < now()` |
| Reportes este mes | `reports` | `period_start >= date_trunc('month', now())`               |

### Panel de Métricas (por período)

| KPI          | Campo JSONB                         |
| ------------ | ----------------------------------- |
| Gasto total  | `metrics->>'spend'`                 |
| Impresiones  | `metrics->>'impressions'`           |
| Alcance      | `metrics->>'reach'`                 |
| Clics        | `metrics->>'clicks'`                |
| Link Clicks  | `metrics->'traffic'->>'linkClicks'` |
| Leads        | `metrics->>'leads'`                 |
| Conversiones | `metrics->>'conversions'`           |
| Revenue      | `metrics->>'revenue'`               |
| CTR          | `metrics->>'ctr'`                   |
| CPC          | `metrics->>'cpc'`                   |
| CPL          | `metrics->>'cpl'`                   |
| ROAS         | `metrics->>'roas'`                  |

> No inventar métricas que no existan. Verificar antes de mostrar si el campo es null/0.

---

## 6. PERÍODOS DISPONIBLES

```
legalink-col:   2026-06, 2026-07
magic-bungalow: 2026-06, 2026-07
```

El selector de período debe construirse dinámicamente desde `SELECT DISTINCT period_start, period_end FROM client_metrics WHERE organization_id = $1 ORDER BY period_start DESC`.

---

## 7. MAPPERS REQUERIDOS

### MetricRow → Metric

```typescript
// packages/infrastructure/src/supabase/mappers/metric.mapper.ts
export type MetricRow = Database['public']['Tables']['client_metrics']['Row'];

export function rowToMetric(row: MetricRow): Metric {
  return {
    id: row.id as MetricId,
    clientId: row.client_id as ClientId,
    organizationId: row.organization_id,
    platform: row.platform as MetricPlatform,
    accountId: row.account_id,
    accountName: row.account_name,
    periodStart: new Date(row.period_start),
    periodEnd: new Date(row.period_end),
    currency: row.currency,
    metrics: row.metrics as MetricValues,
    campaigns: (row.campaigns as CampaignMetric[]) ?? [],
    dataQuality: row.data_quality as DataQuality | null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
```

### AlertRow → Alert

```typescript
// packages/infrastructure/src/supabase/mappers/alert.mapper.ts
export type AlertRow = Database['public']['Tables']['alerts']['Row'];

export function rowToAlert(row: AlertRow): Alert {
  return {
    id: row.id as AlertId,
    organizationId: row.organization_id,
    clientId: row.client_id as ClientId | undefined,
    alertKey: row.alert_key,
    alertType: row.alert_type,
    platform: row.platform as MetricPlatform | undefined,
    severity: row.severity as AlertSeverity,
    status: row.status as AlertStatus,
    title: row.title,
    description: row.description,
    metadata: row.metadata as Record<string, unknown>,
    detectedAt: row.detected_at ? new Date(row.detected_at) : undefined,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
    acknowledgedBy: row.acknowledged_by ?? undefined,
    snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until) : undefined,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
    resolvedBy: row.resolved_by ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
```

### TaskRow → Task

```typescript
// packages/infrastructure/src/supabase/mappers/task.mapper.ts
export type TaskRow = Database['public']['Tables']['tasks']['Row'];

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id as TaskId,
    organizationId: row.organization_id,
    clientId: row.client_id as ClientId | undefined,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    tags: row.tags ?? [],
    requiresApproval: false, // tasks table no tiene esta columna — default false
    createdBy: row.created_by ?? undefined,
    updatedBy: row.updated_by ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
  };
}
```
