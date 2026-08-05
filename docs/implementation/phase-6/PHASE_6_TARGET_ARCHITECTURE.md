# Phase 6 — Arquitectura Objetivo
**Fecha:** 2026-08-04  
**Rama:** feat/phase-6-automation-runtime  
**Scope:** Motor de Automatización — definiciones, ejecuciones, gateway n8n, orquestación

---

## 1. Visión General

Phase 6 implementa el **Automation Runtime**: la capa que permite definir, activar, disparar, monitorear y reintentar automatizaciones de negocio desde la UI web con autenticación real, aislamiento multi-tenant y persistencia en Supabase.

El sistema se organiza en tres planos:

```
┌─────────────────────────────────────────────────────────────┐
│  PLANO DE CONTROL          apps/web + Server Actions        │
│  Definir / Activar / Pausar / Disparar manualmente          │
├─────────────────────────────────────────────────────────────┤
│  PLANO DE DATOS            Supabase PostgreSQL              │
│  automation_definitions / automation_executions / logs      │
├─────────────────────────────────────────────────────────────┤
│  PLANO DE EJECUCIÓN        n8n (vía WorkflowDispatcher)     │
│  Workflows reales: métricas Meta, alertas email, reportes   │
└─────────────────────────────────────────────────────────────┘
```

La separación es estricta: la UI no llama a n8n directamente. Toda comunicación pasa por los use cases del Application Layer, que usan el `WorkflowDispatcher` como puerto de salida hacia el n8n Gateway.

---

## 2. Principios de Diseño

| Principio | Aplicación en Phase 6 |
|-----------|----------------------|
| **Port & Adapter** | `WorkflowDispatcher` es el port; `N8nWebhookDispatcher` es el adapter |
| **Multi-tenancy** | `organizationId` en toda entidad; RLS en Supabase |
| **Idempotencia** | Clave compuesta `(organizationId, automationId, runId)` previene ejecuciones duplicadas |
| **Fail-safe** | Ejecución fallida genera alerta en `alerts` table, no silencia error |
| **No service_role en UI** | Server Actions usan sesión JWT; solo la webhook route puede usar service_role con validación HMAC |
| **Errores seguros** | El cliente nunca ve stack traces ni detalles de n8n |
| **Observabilidad** | Cada ejecución tiene estado, timestamps y logs línea por línea |
| **Rollback seguro** | Nueva migración SQL separada; nunca modifica datos de fases anteriores |

---

## 3. Capas y Responsabilidades

### 3.1 Domain Layer (`packages/domain`)

Entidades y contratos de negocio. Sin dependencias de infraestructura.

```
packages/domain/src/
├── entities/
│   ├── automation.ts          ← MODIFICAR: añadir organizationId, clientId opcional
│   └── automation-execution.ts ← CREAR: AutomationExecution, AutomationExecutionLog
├── repositories/
│   ├── automation.repository.ts       ← MODIFICAR: añadir create, delete, listByOrganization
│   └── automation-execution.repository.ts ← CREAR
└── value-objects/
    └── automation-status.ts           ← CREAR: resolver divergencia de estados
```

**Estados canónicos (ver Phase 6A para decisión de migración DB):**

Definiciones:
- `draft` — creada pero no activada
- `active` — programada / lista para ejecutarse
- `paused` — detenida temporalmente (el schedule no dispara)
- `archived` — desactivada permanentemente, solo lectura

Ejecuciones:
- `queued` — solicitada, pendiente de dispatch a n8n
- `running` — n8n ha iniciado la ejecución
- `succeeded` — completada exitosamente
- `failed` — terminó con error
- `cancelled` — cancelada antes de completar
- `retrying` — reintentando tras un fallo (derivado de `queued` + `attempt > 1`)

### 3.2 Automation Engine (`packages/automation-engine`)

Contratos de despacho y ejecución. Ya existe parcialmente — solo añadir tests y corregir README.

```
packages/automation-engine/src/
├── contracts/
│   ├── automation-definition.ts  ← EXISTENTE ✅ reusable
│   ├── automation-run.ts         ← EXISTENTE ✅ reusable
│   ├── workflow-dispatcher.ts    ← EXISTENTE ✅ reusable
│   ├── retry-policy.ts           ← EXISTENTE ✅ reusable
│   └── idempotency-key.ts        ← EXISTENTE ✅ reusable
└── __tests__/
    ├── retry-policy.test.ts      ← CREAR
    └── idempotency-key.test.ts   ← CREAR
```

### 3.3 Application Layer (`packages/application`)

Use cases orquestadores. Sin dependencias de HTTP ni Supabase directamente.

```
packages/application/src/use-cases/automations/
├── list-automations.use-case.ts          ← EXISTENTE ✅
├── create-automation.use-case.ts         ← CREAR
├── update-automation.use-case.ts         ← CREAR
├── activate-automation.use-case.ts       ← CREAR
├── pause-automation.use-case.ts          ← CREAR
├── dispatch-automation.use-case.ts       ← CREAR (orquesta idempotencia + dispatcher)
├── cancel-execution.use-case.ts          ← CREAR
├── retry-execution.use-case.ts           ← CREAR
├── get-execution-history.use-case.ts     ← CREAR
└── __tests__/
    ├── list-automations.use-case.test.ts ← CREAR
    ├── dispatch-automation.use-case.test.ts ← CREAR (crítico — valida idempotencia)
    └── retry-execution.use-case.test.ts  ← CREAR
```

**Flujo de `dispatchAutomation`:**
```
1. requireOrganizationRole('operator')
2. findById(automationId, organizationId) → 404 si no pertenece a la org
3. Verificar status === 'active' || status === 'paused' → 400 si 'draft' o 'archived'
4. generateIdempotencyKey(automationId, runId, date)
5. Crear AutomationExecution con status 'queued' en Supabase
6. WorkflowDispatcher.dispatch(automationId, { idempotencyKey, payload })
7. Si dispatch falla: actualizar execution a 'failed', publicar evento 'automation.dispatch.failed'
8. Si dispatch éxito: actualizar execution a 'running'
9. Retornar { executionId, status: 'running' }
```

### 3.4 Infrastructure Layer (`packages/infrastructure`)

Adaptadores de Supabase y n8n. Implementan los puertos del dominio.

```
packages/infrastructure/src/
├── supabase/
│   ├── repositories/
│   │   ├── supabase-automation.repository.ts      ← CREAR
│   │   └── supabase-automation-execution.repository.ts ← CREAR
│   └── mappers/
│       ├── automation.mapper.ts                   ← CREAR
│       └── automation-execution.mapper.ts         ← CREAR
└── n8n/
    └── n8n-webhook-dispatcher.ts                  ← CREAR
```

**`N8nWebhookDispatcher`** (adapter del puerto `WorkflowDispatcher`):
```typescript
class N8nWebhookDispatcher implements WorkflowDispatcher {
  async dispatch(automationId, options): Promise<Result<AutomationRun>> {
    // 1. Construir URL: process.env.N8N_WEBHOOK_BASE_URL + '/webhook/' + automationId
    // 2. POST con headers: { 'X-Idempotency-Key': options.idempotencyKey, 'X-Organization-Id': orgId }
    // 3. Timeout: 10s — n8n puede tardar en aceptar el webhook
    // 4. Si timeout: retornar err('N8N_TIMEOUT') → execution queda 'queued' para retry
    // 5. Si 2xx: retornar ok({ id: runId, status: 'running', ... })
    // 6. NUNCA exponer URL interna de n8n al cliente
  }

  async cancel(runId): Promise<Result<void>> {
    // DELETE /api/v1/executions/{runId} usando N8N_API_KEY
    // Solo marcará como cancelled en Supabase — n8n puede no cancelar mid-flight
  }
}
```

### 3.5 Presentation Layer (`apps/web`)

Server Components + Server Actions + Rutas de webhooks.

```
apps/web/src/
├── app/(protected)/automations/
│   ├── page.tsx                              ✅ 6E — lista paginada con filtros
│   ├── loading.tsx / error.tsx               ✅ 6E
│   ├── actions.ts                            ✅ 6E — activate, pause, archive, startExecution, cancelExecution, retryExecution
│   ├── [automationId]/
│   │   ├── page.tsx                          ✅ 6E — detalle + últimas 10 ejecuciones + acciones
│   │   ├── loading.tsx / error.tsx           ✅ 6E
│   │   └── executions/
│   │       ├── page.tsx                      ✅ 6E — historial paginado con filtros
│   │       └── loading.tsx                   ✅ 6E
│   └── executions/[executionId]/
│       ├── page.tsx                          ✅ 6E — detalle ejecución + timeline de logs
│       └── loading.tsx                       ✅ 6E
└── app/api/webhooks/
    └── n8n/
        └── route.ts                          ← CREAR (recibe callbacks de n8n)
```

**Webhook route (`/api/webhooks/n8n`):**
```
POST /api/webhooks/n8n
Headers: X-N8N-Signature: hmac-sha256(secret, body)

Body:
{
  "executionId": "...",
  "automationId": "...",
  "organizationId": "...",
  "status": "succeeded" | "failed",
  "startedAt": "...",
  "completedAt": "...",
  "error": "...",
  "output": { ... }
}

Proceso:
1. Verificar HMAC con AUTOMATION_WEBHOOK_SECRET
2. Usar service_role (único lugar permitido) para actualizar execution
3. Si status = 'failed': crear alerta en alerts table
4. Si status = 'succeeded': publicar evento vía EventBus
5. Retornar 200 inmediatamente — procesamiento asíncrono
```

---

## 4. Flujos Principales

### 4.1 Dispatch Manual desde UI

```
Usuario → /automations → [Ejecutar] → Server Action dispatchAutomationAction()
  → requireOrganizationRole('operator')
  → dispatchAutomation use case
    → validate ownership
    → create execution (queued)
    → N8nWebhookDispatcher.dispatch()
      → POST n8n webhook
    → update execution (running)
  → revalidatePath('/automations/[id]')
  → UI muestra execution en estado "running"
```

### 4.2 Callback de n8n (ejecución completada)

```
n8n workflow completa → POST /api/webhooks/n8n
  → route.ts verifica HMAC
  → updateExecution(id, { status: 'succeeded'|'failed', completedAt, output })
  → Si 'failed': insertAlert({ severity: 'critical', type: 'AUTOMATION_FAILED', ... })
  → retorna 200
  → UI (polling o revalidation) actualiza estado
```

### 4.3 Retry de Ejecución Fallida

```
Usuario → /automations/[id]/executions → [Reintentar] → retryExecutionAction()
  → requireOrganizationRole('operator')
  → retryExecution use case
    → findExecution(executionId, organizationId)
    → verificar status === 'failed'
    → verificar attempt < maxAttempts (policy)
    → nuevo idempotencyKey con intento incremental
    → crear nueva execution (queued) con parentExecutionId
    → dispatch()
  → revalidatePath
```

---

## 5. Observabilidad

Cada `AutomationExecution` expone:
- `id` — UUID de la ejecución
- `automationId` — FK a `automations`
- `organizationId` — para RLS
- `status` — queued/running/succeeded/failed/cancelled/retrying
- `attempt` — número de intento (1 = primera vez, 2+ = retry)
- `idempotencyKey` — para deduplicación
- `startedAt`, `completedAt`, `durationMs`
- `triggeredBy` — 'schedule'|'manual'|'webhook'
- `triggeredByUserId` — UUID del usuario si fue manual
- `inputPayload` — datos de entrada (sin secretos)
- `outputPayload` — datos de salida (sin secretos, limitado a 10KB)
- `error` — mensaje de error (sin stack trace, max 500 chars)
- `n8nExecutionId` — ID de ejecución en n8n (para drill-down)

---

## 6. Composition Root (apps/web)

El composition root instancia todos los repositorios y use cases con sus dependencias reales:

```typescript
// apps/web/src/lib/composition-root/automation.ts
export function createAutomationCompositionRoot(supabase: SupabaseClient) {
  const automationRepo = new SupabaseAutomationRepository(supabase);
  const executionRepo = new SupabaseAutomationExecutionRepository(supabase);
  const dispatcher = new N8nWebhookDispatcher({
    baseUrl: process.env.N8N_WEBHOOK_BASE_URL!,
    apiKey: process.env.N8N_API_KEY!,
  });
  const logger = new ConsoleLogger();

  return {
    listAutomations: (input) => listAutomations(input, { automationRepo: automationRepo, logger }),
    dispatchAutomation: (input) => dispatchAutomation(input, { automationRepo, executionRepo, dispatcher, logger }),
    retryExecution: (input) => retryExecution(input, { executionRepo, dispatcher, logger }),
    // ...
  };
}
```


| `evaluateAutomationIncident()` en capa application (no infrastructure) | El evaluador es puro dominio: recibe repositorios por inyección, sin Supabase/Next.js. Determinístico y testeable en aislamiento. |
| Best-effort para alertas/tareas: nunca bloquean el flujo principal | Un fallo al crear una alerta no debe romper dispatch/retry/webhook. Usa try/catch en el caller. Consistencia eventual. |
| `alert_key` determinístico sin timestamps ni executionId | La clave de deduplicación debe ser idempotente para el mismo tipo de incidente de una automation. executionId varía en cada intento — no pertenece a la clave. |
| `ClockPort` inyectable en EvaluateStuckAutomationExecutions | Permite tests determinísticos sin mocks de Date.now(). El clock se inyecta como interfaz, no como dependencia global. |
| Phase 6G como responsable del scheduler | El evaluador de ejecuciones atascadas existe pero no tiene scheduler en 6F. Phase 6G lo conectará a un cron o task runner. |

---

## 7. Decisiones de Arquitectura

| Decisión | Rationale |
|----------|-----------|
| n8n sigue siendo el ejecutor (no Inngest) | n8n ya está en producción y operativo. Phase 6 lo adapta, no lo reemplaza. Inngest queda como opción futura. |
| Webhook push desde n8n (no polling) | Polling crea latencia y carga. n8n llama de vuelta al webhook route cuando termina. |
| HMAC para autenticación del webhook | API keys en query params son vulnerables a logs. HMAC sobre body es el estándar. |
| `service_role` SOLO en webhook route | La única excepción justificada: n8n no tiene JWT de usuario, pero sí HMAC verificado. Documentado. |
| `inputPayload`/`outputPayload` en Supabase, NO en n8n | n8n es efímero. La fuente de verdad de las ejecuciones es Supabase. |
| Separación entre `automations` (config) y `automation_executions` (runtime) | Sigue el patrón del legado (`automationService` + archivos de ejecución). Evita mutación de la definición al ejecutar. |
