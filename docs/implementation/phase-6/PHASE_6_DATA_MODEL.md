# Phase 6 — Modelo de Datos
**Fecha:** 2026-08-04  
**Motor:** PostgreSQL 15 vía Supabase  
**Nota:** No crear migraciones hasta Phase 6B. Este documento es el diseño lógico.

---

## 1. Divergencia de Estados — Resolución

La tabla `public.automations` creada en Phase 4 define el ENUM:

```sql
CREATE TYPE public.automation_status AS ENUM ('active', 'inactive', 'draft', 'archived');
```

El dominio actual (`packages/domain/src/entities/automation.ts`) define:
```typescript
type AutomationStatus = 'active' | 'paused' | 'error' | 'disabled';
```

**Resolución en Phase 6B (migración SQL):**

1. Añadir `'paused'` al ENUM existente (ADD VALUE es seguro y no requiere reescritura de filas)
2. Eliminar `'error'` y `'disabled'` del dominio — son estados derivados, no persistidos:
   - El "error" se infiere del último execution con `status = 'failed'`
   - `'disabled'` → usar `'archived'`
3. Deprecar `'inactive'` → migrar filas existentes a `'draft'`

**Estado canónico final para `public.automations.status`:**

| Valor | Semántica |
|-------|-----------|
| `draft` | Creada, no activada. No ejecutable. |
| `active` | Programada y ejecutable (schedule activo). |
| `paused` | Suspendida temporalmente. El schedule no dispara. |
| `archived` | Desactivada permanentemente. Solo lectura. |

**Migration SQL (Phase 6B):**
```sql
-- Seguro: ADD VALUE no requiere LOCK TABLE en PostgreSQL 14+
ALTER TYPE public.automation_status ADD VALUE IF NOT EXISTS 'paused';

-- Migrar filas 'inactive' → 'draft'
UPDATE public.automations SET status = 'draft' WHERE status = 'inactive';

-- No DROP 'inactive' todavía — las vistas pueden referenciarlo
-- Deprecar en Phase 6E cuando no haya más referencias
```

---

## 2. Tablas Propuestas

### 2.1 `public.automations` — MODIFICAR (existente de Phase 4)

La tabla existe. Añadir columnas y actualizar ENUM según sección 1.

**Columnas a añadir en Phase 6B:**

```sql
ALTER TABLE public.automations
  ADD COLUMN IF NOT EXISTS trigger_config   jsonb     NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retry_policy     jsonb     NOT NULL DEFAULT '{"maxAttempts":3,"initialDelayMs":1000,"backoffMultiplier":2,"maxDelayMs":30000}',
  ADD COLUMN IF NOT EXISTS last_execution_id uuid     REFERENCES automation_executions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_executed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_status       text,     -- denormalizado para dashboard rápido
  ADD COLUMN IF NOT EXISTS is_manual_only    boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS n8n_workflow_id   text,     -- ID del workflow en n8n (vinculación)
  ADD COLUMN IF NOT EXISTS metadata          jsonb     NOT NULL DEFAULT '{}';
```

**Columnas existentes relevantes:**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid | PK |
| `organization_id` | uuid | FK organizations — multi-tenant |
| `client_id` | uuid | FK clients (nullable — automatización global o de cliente) |
| `name` | text | Nombre legible |
| `description` | text | Descripción |
| `status` | automation_status | draft/active/paused/archived |
| `schedule` | jsonb | `{ type: 'cron', cron: '0 6 * * *' }` o `{ type: 'manual' }` o `{ type: 'webhook', path: '/...' }` |
| `created_at`, `updated_at` | timestamptz | Auditoría |

**Índices adicionales:**
```sql
CREATE INDEX IF NOT EXISTS idx_automations_status_active
  ON public.automations(organization_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_automations_n8n_workflow
  ON public.automations(n8n_workflow_id)
  WHERE n8n_workflow_id IS NOT NULL;
```

**RLS:** Hereda de Phase 4 — `organization_id` del JWT controla acceso.

---

### 2.2 `public.automation_executions` — CREAR

**Propósito:** Registrar cada intento de ejecución de una automatización. Fuente de verdad del runtime. n8n es el ejecutor; Supabase es el registro persistente.

**Columnas:**

| Columna | Tipo | Restricciones | Descripción |
|---------|------|---------------|-------------|
| `id` | uuid | PK DEFAULT gen_random_uuid() | ID único de la ejecución |
| `automation_id` | uuid | NOT NULL FK automations(id) ON DELETE CASCADE | Automatización que se ejecutó |
| `organization_id` | uuid | NOT NULL FK organizations(id) | Tenant |
| `status` | text | NOT NULL CHECK IN ('queued','running','succeeded','failed','cancelled','retrying') | Estado actual |
| `attempt` | integer | NOT NULL DEFAULT 1 CHECK > 0 | Número de intento (1 = primero) |
| `idempotency_key` | text | NOT NULL UNIQUE | Clave de deduplicación |
| `triggered_by` | text | NOT NULL CHECK IN ('schedule','manual','webhook','retry') | Origen |
| `triggered_by_user_id` | uuid | FK auth.users(id) ON DELETE SET NULL | Usuario si fue manual |
| `n8n_execution_id` | text | | ID de ejecución en n8n para drill-down |
| `queued_at` | timestamptz | NOT NULL DEFAULT now() | Cuando se encoló |
| `started_at` | timestamptz | | Cuando n8n inició |
| `completed_at` | timestamptz | | Cuando n8n terminó |
| `duration_ms` | integer | CHECK >= 0 | Duración en ms |
| `input_payload` | jsonb | NOT NULL DEFAULT '{}' | Datos de entrada (sin secretos) |
| `output_payload` | jsonb | DEFAULT NULL | Datos de salida (limitado) |
| `error_message` | text | CHECK length <= 500 | Mensaje de error (sin stack trace) |
| `error_code` | text | | Código de error del dominio |
| `parent_execution_id` | uuid | FK automation_executions(id) | Si es retry de otra ejecución |
| `created_at` | timestamptz | NOT NULL DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() | |

**Índices:**
```sql
CREATE UNIQUE INDEX uq_execution_idempotency
  ON public.automation_executions(idempotency_key);

CREATE INDEX idx_executions_automation
  ON public.automation_executions(automation_id, queued_at DESC);

CREATE INDEX idx_executions_org_status
  ON public.automation_executions(organization_id, status);

CREATE INDEX idx_executions_org_recent
  ON public.automation_executions(organization_id, queued_at DESC);

CREATE INDEX idx_executions_n8n_id
  ON public.automation_executions(n8n_execution_id)
  WHERE n8n_execution_id IS NOT NULL;

-- Para cleanup por retención
CREATE INDEX idx_executions_created_at
  ON public.automation_executions(created_at);
```

**RLS:**
```sql
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

-- SELECT: miembros activos de la organización
CREATE POLICY exec_select ON public.automation_executions
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

-- INSERT: solo via webhook route con service_role o miembro operator+
CREATE POLICY exec_insert ON public.automation_executions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
      AND role IN ('operator', 'strategist', 'admin', 'owner')
  ));

-- UPDATE: solo service_role (webhook route) o admin+
CREATE POLICY exec_update ON public.automation_executions
  FOR UPDATE TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND status = 'active'
      AND role IN ('admin', 'owner')
  ));
```

**Estrategia de idempotencia:**
- El `idempotency_key` se construye con `automationId:runId:attempt:date`
- Si n8n dispara el mismo webhook dos veces, el segundo INSERT falla con violación de UNIQUE
- La webhook route maneja el error como idempotente y retorna 200

**Estrategia de retención:**
- Ejecuciones con `created_at < now() - interval '90 days'` son candidatas a archivo
- Implementar con pg_cron (Phase 6G) o con un job n8n de limpieza
- `output_payload` se trunca a 10KB al escribir para evitar acumulación

---

### 2.3 `public.automation_execution_logs` — CREAR

**Propósito:** Registro de eventos línea por línea dentro de una ejecución. Similar a stdout de un proceso. Útil para debugging.

**Columnas:**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid | PK |
| `execution_id` | uuid | FK automation_executions(id) ON DELETE CASCADE |
| `organization_id` | uuid | FK — para RLS sin JOIN |
| `level` | text | CHECK IN ('debug', 'info', 'warn', 'error') |
| `message` | text | NOT NULL CHECK length <= 2000 |
| `context` | jsonb | DEFAULT NULL — datos adicionales sin secretos |
| `step_name` | text | Nombre del paso en n8n (si disponible) |
| `occurred_at` | timestamptz | NOT NULL DEFAULT now() |

**Índices:**
```sql
CREATE INDEX idx_exec_logs_execution
  ON public.automation_execution_logs(execution_id, occurred_at DESC);

CREATE INDEX idx_exec_logs_org_level
  ON public.automation_execution_logs(organization_id, level)
  WHERE level IN ('warn', 'error');
```

**RLS:** SELECT para miembros activos de la org. INSERT solo desde webhook route (service_role).

**Retención:** Eliminar junto con la ejecución padre (CASCADE). Los logs de >30 días sin errores se pueden archivar.

**Límite por ejecución:** Máximo 500 líneas. El nodo de n8n que envía logs debe respetar este límite.

---

### 2.4 `public.automation_webhook_events` — CREAR

**Propósito:** Registro inmutable de webhooks entrantes de n8n, antes de procesar. Sirve para deduplicación, auditoría y replay ante crashes del servidor.

**Columnas:**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid | PK |
| `received_at` | timestamptz | NOT NULL DEFAULT now() — inmutable |
| `source` | text | NOT NULL DEFAULT 'n8n' |
| `idempotency_key` | text | UNIQUE — mismo key = mismo evento |
| `payload_hash` | text | SHA-256 del body para detección de duplicados |
| `raw_payload` | jsonb | NOT NULL — payload completo recibido |
| `processing_status` | text | CHECK IN ('received','processed','failed') |
| `processed_at` | timestamptz | |
| `error_message` | text | Si failed |
| `organization_id` | uuid | FK — del payload, no del JWT |

**Índices:**
```sql
CREATE UNIQUE INDEX uq_webhook_idempotency
  ON public.automation_webhook_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_webhook_events_received
  ON public.automation_webhook_events(received_at DESC);

CREATE INDEX idx_webhook_events_status
  ON public.automation_webhook_events(processing_status)
  WHERE processing_status = 'failed';
```

**RLS:** Sin RLS — acceso SOLO desde service_role (webhook route). `authenticated` no tiene acceso.

**Retención:** 7 días. Limpiar con pg_cron o job n8n semanal.

---

### 2.5 `public.automation_secrets_metadata` — CREAR

**Propósito:** Almacenar REFERENCIA a secretos en Supabase Vault (no los secretos en sí). Cada automatización puede tener secretos específicos (API keys de Meta, tokens OAuth) sin exponerlos en columnas JSONB.

**Columnas:**

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | uuid | PK |
| `automation_id` | uuid | FK automations(id) ON DELETE CASCADE |
| `organization_id` | uuid | FK — para RLS |
| `key_name` | text | NOT NULL — nombre lógico: 'meta_access_token', 'gmail_token' |
| `vault_secret_id` | uuid | NOT NULL — referencia a `vault.secrets` |
| `description` | text | Para UI de administración |
| `expires_at` | timestamptz | Para alertar antes del vencimiento |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
| `updated_at` | timestamptz | NOT NULL DEFAULT now() |

**Índices:**
```sql
CREATE UNIQUE INDEX uq_automation_secret_key
  ON public.automation_secrets_metadata(automation_id, key_name);

CREATE INDEX idx_secrets_expiry
  ON public.automation_secrets_metadata(expires_at)
  WHERE expires_at IS NOT NULL;
```

**RLS:** SELECT para admin/owner de la org. INSERT/UPDATE solo admin/owner. Los secretos del vault NUNCA son accesibles desde authenticated — solo desde funciones SECURITY DEFINER.

**Nota de seguridad:** El `vault_secret_id` apunta a `vault.secrets` de Supabase. El valor real del secreto solo puede leerlo n8n (via webhook con HMAC verificado) o una función SECURITY DEFINER en la DB.

---

## 3. Relaciones entre Tablas

```
organizations (1)
  └── (N) automations
        ├── (N) automation_executions
        │     └── (N) automation_execution_logs
        └── (N) automation_secrets_metadata

automation_executions
  └── (N) automation_webhook_events  [via n8n_execution_id, no FK directo]
```

---

## 4. Resumen de Datos Sensibles

| Tabla | Campo sensible | Estrategia |
|-------|---------------|-----------|
| `automation_secrets_metadata` | `vault_secret_id` | Referencia al Vault, nunca el secreto |
| `automation_executions` | `input_payload`, `output_payload` | Filtrar claves: secret, token, key, password, auth, cred |
| `automation_execution_logs` | `context` | Mismo filtro — prohibido loguear valores de secretos |
| `automation_webhook_events` | `raw_payload` | service_role only — sin RLS para authenticated |

---

## 5. Entidades de Dominio a Crear/Modificar

### 5.1 `Automation` (modificar)

```typescript
export type Automation = {
  readonly id: AutomationId;
  readonly organizationId: OrganizationId;       // ← AÑADIR
  readonly clientId?: ClientId;                   // ← AÑADIR (opcional)
  readonly name: string;
  readonly description: string;
  readonly status: AutomationStatus;              // 'draft'|'active'|'paused'|'archived'
  readonly triggerConfig: AutomationTrigger;      // ← AÑADIR
  readonly retryPolicy: RetryPolicy;              // ← AÑADIR
  readonly n8nWorkflowId?: string;                // ← AÑADIR
  readonly lastExecutionId?: AutomationExecutionId; // ← AÑADIR
  readonly lastExecutedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
```

### 5.2 `AutomationExecution` (crear)

```typescript
export type AutomationExecutionId = string & { readonly _brand: 'AutomationExecutionId' };

export type AutomationExecutionStatus =
  | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'retrying';

export type AutomationExecution = {
  readonly id: AutomationExecutionId;
  readonly automationId: AutomationId;
  readonly organizationId: OrganizationId;
  readonly status: AutomationExecutionStatus;
  readonly attempt: number;
  readonly idempotencyKey: string;
  readonly triggeredBy: 'schedule' | 'manual' | 'webhook' | 'retry';
  readonly triggeredByUserId?: UserId;
  readonly n8nExecutionId?: string;
  readonly queuedAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly durationMs?: number;
  readonly inputPayload: Record<string, unknown>;
  readonly outputPayload?: Record<string, unknown>;
  readonly errorMessage?: string;
  readonly errorCode?: string;
  readonly parentExecutionId?: AutomationExecutionId;
};
```

### 5.3 `AutomationRepository` (modificar)

```typescript
export interface AutomationRepository {
  findById(id: AutomationId, organizationId: OrganizationId): Promise<Result<Automation>>; // ← AÑADIR organizationId
  findAll(organizationId: OrganizationId, pagination: PaginationParams): Promise<PaginatedResult<Automation>>; // ← MODIFICAR
  create(data: CreateAutomationInput, organizationId: OrganizationId): Promise<Result<Automation>>; // ← AÑADIR
  update(id: AutomationId, organizationId: OrganizationId, data: Partial<Automation>): Promise<Result<Automation>>; // ← MODIFICAR
  delete(id: AutomationId, organizationId: OrganizationId): Promise<Result<void>>; // ← AÑADIR
}
```

### 5.4 `AutomationExecutionRepository` (crear)

```typescript
export interface AutomationExecutionRepository {
  create(execution: Omit<AutomationExecution, 'id' | 'queuedAt'>): Promise<Result<AutomationExecution>>;
  findById(id: AutomationExecutionId, organizationId: OrganizationId): Promise<Result<AutomationExecution>>;
  findByAutomation(automationId: AutomationId, organizationId: OrganizationId, pagination: PaginationParams): Promise<PaginatedResult<AutomationExecution>>;
  updateStatus(id: AutomationExecutionId, organizationId: OrganizationId, status: AutomationExecutionStatus, extra?: Partial<AutomationExecution>): Promise<Result<AutomationExecution>>;
  findByIdempotencyKey(key: string): Promise<Result<AutomationExecution | null>>;
}
```
