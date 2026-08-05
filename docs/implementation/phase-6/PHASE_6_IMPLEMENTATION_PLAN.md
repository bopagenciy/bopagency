# Phase 6 — Plan de Implementación
**Fecha:** 2026-08-04  
**Rama base:** feat/phase-6-automation-runtime  
**Restricciones activas:**
- NO modificar Supabase remoto sin aprobación explícita
- NO ejecutar migraciones automáticamente
- NO usar service_role fuera de la webhook route
- NO crear nuevas RPCs sin diseño previo
- NO hacer commit automáticamente
- organizationId siempre del servidor

---

## Visión General de Subfases

| Subfase | Nombre | Objetivo | Prerequisito |
|---------|--------|----------|-------------|
| 6A | Domain y Contratos | Entidades, repositorios, estados canónicos | Auditoría completa (✅) | ✅ COMPLETE 2026-08-04 |
| 6B | DB y Repositorios | Migraciones Supabase + adapters Supabase | 6A |
| 6C | Gateway n8n | N8nWebhookDispatcher + webhook route | 6B |
| 6D | Orquestación | Use cases de dispatch, cancel, retry | 6C |
| 6E | Admin UI | `/automations` funcional: lista, detalle, logs | 6D |
| 6F | Integración Alertas/Tareas | Alerta automática cuando automation falla | 6D |
| 6G | Seguridad, Tests y Cierre | Tests E2E, auditoría, documentación de cierre | 6E + 6F |

**Duración estimada total:** 8-12 días de desarrollo efectivo.

---

## Phase 6A — Domain y Contratos

**Objetivo:** Resolver todas las divergencias de tipos y completar las entidades de dominio y sus repositorios. CERO código de infraestructura. Solo TypeScript puro.

**Criterio de aceptación:**
- `npm run typecheck` pasa en todos los paquetes
- Vitest pasa con nuevos tests de domain
- Dominio no tiene dependencias de Supabase, n8n, o Express

### Archivos a crear/modificar

| Archivo | Acción | Contenido |
|---------|--------|-----------|
| `packages/domain/src/entities/automation.ts` | MODIFICAR | Añadir `organizationId`, `clientId?`, `triggerConfig`, `retryPolicy`, `n8nWorkflowId?`. Alinear `AutomationStatus` con DB: `draft\|active\|paused\|archived` |
| `packages/domain/src/entities/automation-execution.ts` | CREAR | `AutomationExecution`, `AutomationExecutionId`, `AutomationExecutionStatus` |
| `packages/domain/src/repositories/automation.repository.ts` | MODIFICAR | Añadir `create`, `delete`, `organizationId` como parámetro en `findById`/`update`/`findAll` |
| `packages/domain/src/repositories/automation-execution.repository.ts` | CREAR | `AutomationExecutionRepository` con 5 métodos |
| `packages/domain/src/index.ts` | MODIFICAR | Re-exportar nuevas entidades |
| `packages/domain/src/__tests__/automation-status.test.ts` | CREAR | Tests de transiciones de estado válidas/inválidas |
| `packages/automation-engine/src/__tests__/retry-policy.test.ts` | CREAR | Tests de `computeDelay` con backoff |
| `packages/automation-engine/src/__tests__/idempotency-key.test.ts` | CREAR | Tests de `idempotencyKey()` |

### Tests a escribir en 6A

```typescript
// automation-status.test.ts
describe('AutomationStatus transitions', () => {
  it('draft → active es válido')
  it('active → paused es válido')
  it('paused → active es válido')
  it('active → archived es válido')
  it('archived → active NO es válido')
  it('draft → archived es válido')
})

// retry-policy.test.ts
describe('computeDelay', () => {
  it('primer intento usa initialDelayMs')
  it('segundo intento aplica backoffMultiplier')
  it('retorna maxDelayMs si el calculado excede')
  it('DEFAULT_RETRY_POLICY tiene valores esperados')
})
```

**Riesgos:**
- El cambio de `AutomationStatus` puede romper `listAutomations` use case existente → actualizar mapper
- Si `packages/shared` exporta tipos de automation, actualizarlos también

**Rollback:** Solo archivos TypeScript — revertir con `git checkout`.

---

## Phase 6B — Base de Datos y Repositorios

**Objetivo:** Crear las migraciones SQL necesarias e implementar los repositorios Supabase. Integración real con la DB.

**IMPORTANTE:** Las migraciones se crean pero NO se ejecutan hasta revisión manual.

**Criterio de aceptación:**
- 3 migraciones SQL creadas y revisadas
- `SupabaseAutomationRepository` implementado con tests
- `SupabaseAutomationExecutionRepository` implementado con tests
- Vitest pasa: 0 failed

### Archivos a crear

| Archivo | Acción |
|---------|--------|
| `supabase/migrations/20260804000000_phase6_automation_executions.sql` | CREAR — `automation_executions` + `automation_execution_logs` + `automation_webhook_events` + `automation_secrets_metadata` |
| `supabase/migrations/20260804010000_phase6_automation_status_enum.sql` | CREAR — Añadir `paused` al ENUM + migrar `inactive` → `draft` + columnas adicionales en `automations` |
| `supabase/migrations/20260804020000_phase6_automation_indexes.sql` | CREAR — Índices adicionales y políticas RLS |
| `packages/infrastructure/src/supabase/repositories/supabase-automation.repository.ts` | CREAR |
| `packages/infrastructure/src/supabase/repositories/supabase-automation-execution.repository.ts` | CREAR |
| `packages/infrastructure/src/supabase/mappers/automation.mapper.ts` | CREAR |
| `packages/infrastructure/src/supabase/mappers/automation-execution.mapper.ts` | CREAR |
| `packages/infrastructure/src/supabase/repositories/__tests__/supabase-automation.repository.test.ts` | CREAR |
| `packages/infrastructure/src/supabase/repositories/__tests__/supabase-automation-execution.repository.test.ts` | CREAR |

### Tests de repositorios (mocks de Supabase, igual que Phase 5B)

```typescript
// supabase-automation.repository.test.ts
describe('SupabaseAutomationRepository', () => {
  describe('findById', () => {
    it('retorna automation si pertenece a la org')
    it('retorna NOT_FOUND si no pertenece a la org')
    it('retorna NOT_FOUND si deleted')
  })
  describe('create', () => {
    it('inserta con organizationId correcto')
    it('retorna error si ya existe legacy_id duplicado')
  })
  describe('findAll', () => {
    it('solo retorna automations de la org')
    it('respeta paginación')
    it('filtra por status si se provee')
  })
})

// supabase-automation-execution.repository.test.ts
describe('SupabaseAutomationExecutionRepository', () => {
  describe('create', () => {
    it('crea execution con status queued')
    it('falla si idempotency_key duplicado')
  })
  describe('updateStatus', () => {
    it('actualiza status y timestamps')
    it('no permite actualizar execution de otra org')
  })
  describe('findByIdempotencyKey', () => {
    it('retorna null si no existe')
    it('retorna execution si existe')
  })
})
```

**Riesgos:**
- El ENUM `automation_status ADD VALUE` no es transaccional en PostgreSQL — no puede estar dentro de un bloque BEGIN/COMMIT. Debe ser una migración separada.
- RLS en `automation_executions` debe sincronizarse con el patrón de Phase 4 (sin subquery de `user_preferences`, usar `organization_members` directamente)

**Rollback:** Las migraciones tienen `DROP TABLE IF EXISTS` en su encabezado para entornos de desarrollo. En producción, se aplica tras aprobación manual.

---

## Phase 6C — Gateway n8n

**Objetivo:** Implementar el adapter `N8nWebhookDispatcher` y la webhook route. La capa de comunicación entre BopIAgency y n8n.

**Criterio de aceptación:**
- `N8nWebhookDispatcher` implementado con tests (mocks de fetch)
- `/api/webhooks/n8n` rechaza requests sin HMAC válido
- `/api/webhooks/n8n` es idempotente ante reentrega del mismo evento
- Typecheck pasa

### Archivos a crear

| Archivo | Acción |
|---------|--------|
| `packages/infrastructure/src/n8n/n8n-webhook-dispatcher.ts` | CREAR — `N8nWebhookDispatcher` |
| `packages/infrastructure/src/n8n/n8n-webhook-dispatcher.test.ts` | CREAR |
| `packages/infrastructure/src/index.ts` | MODIFICAR — re-exportar dispatcher |
| `apps/web/src/app/api/webhooks/n8n/route.ts` | CREAR — POST handler con HMAC |
| `apps/web/src/app/api/webhooks/n8n/__tests__/route.test.ts` | CREAR |
| `apps/web/src/lib/webhooks/hmac.ts` | CREAR — `verifyWebhookSignature()` helper |

### Tests del gateway

```typescript
// n8n-webhook-dispatcher.test.ts
describe('N8nWebhookDispatcher', () => {
  it('construye URL correctamente para el webhook de la automation')
  it('envía idempotency-key en header')
  it('retorna err("N8N_TIMEOUT") si fetch lanza AbortError')
  it('retorna err("N8N_ERROR") si n8n responde 4xx/5xx')
  it('retorna ok(AutomationRun) si n8n responde 200')
  it('cancel llama a DELETE /api/v1/executions/{runId}')
})

// route.test.ts
describe('POST /api/webhooks/n8n', () => {
  it('retorna 401 si falta X-N8N-Signature')
  it('retorna 403 si HMAC inválido')
  it('retorna 400 si payload inválido (schema)')
  it('retorna 200 idempotente si ya fue procesado')
  it('actualiza execution a succeeded')
  it('crea alerta si status = failed')
  it('retorna 200 si organizationId mismatch pero con log de seguridad')
})
```

**Riesgos:**
- `host.docker.internal:3101` no funcionará en Linux. El dispatcher usará `N8N_WEBHOOK_BASE_URL` como variable de entorno — en desarrollo local apunta a `http://localhost:5678`.
- El timeout de 10s puede ser corto si n8n está bajo carga — ajustable por env var `N8N_DISPATCH_TIMEOUT_MS`.

---

## Phase 6D — Orquestación de Ejecuciones

**Objetivo:** Implementar todos los use cases de orquestación con lógica de negocio completa.

**Criterio de aceptación:**
- 8 use cases implementados con tests
- `dispatchAutomation` verifica idempotencia, ownership y status
- `retryExecution` respeta `maxAttempts` del `RetryPolicy`
- Vitest pasa en `packages/application`

### Use cases a implementar

| Use Case | Input | Output | Validaciones |
|----------|-------|--------|-------------|
| `listAutomations` | organizationId, pagination | PaginatedResult<Automation> | Existente — solo añadir orgId |
| `createAutomation` | name, trigger, orgId | Result<Automation> | Rol admin; trigger válido |
| `activateAutomation` | automationId, orgId | Result<Automation> | Rol operator; status != archived |
| `pauseAutomation` | automationId, orgId | Result<Automation> | Rol operator; status = active |
| `dispatchAutomation` | automationId, orgId, payload | Result<AutomationExecution> | Rol operator; status active\|paused; idempotencia |
| `cancelExecution` | executionId, orgId | Result<void> | Rol operator; status running\|queued |
| `retryExecution` | executionId, orgId | Result<AutomationExecution> | Rol operator; status failed; attempt < maxAttempts |
| `getExecutionHistory` | automationId, orgId, pagination | PaginatedResult<AutomationExecution> | Rol viewer |

### Tests clave

```typescript
// dispatch-automation.use-case.test.ts
describe('dispatchAutomation', () => {
  it('retorna AUTOMATION_NOT_FOUND si no pertenece a la org')
  it('retorna AUTOMATION_NOT_DISPATCHABLE si status = draft')
  it('retorna AUTOMATION_NOT_DISPATCHABLE si status = archived')
  it('crea execution con status queued antes de dispatch')
  it('actualiza execution a running si dispatch exitoso')
  it('actualiza execution a failed si dispatcher lanza error')
  it('retorna execution existente si idempotency_key duplicado')
})

// retry-execution.use-case.test.ts
describe('retryExecution', () => {
  it('retorna EXECUTION_NOT_FOUND si no pertenece a la org')
  it('retorna CANNOT_RETRY si status != failed')
  it('retorna MAX_ATTEMPTS_EXCEEDED si attempt >= maxAttempts')
  it('crea nueva execution con attempt incremental')
  it('vincula parentExecutionId a la execution fallida')
})
```

---

## Phase 6E — Admin UI

**Objetivo:** Implementar `/automations` completo: lista, detalle con historial de ejecuciones, acciones de control.

**Criterio de aceptación:**
- `/automations` muestra lista con estado y acciones
- `/automations/[id]` muestra detalle + historial paginado
- Acciones (dispatch, pause, activate) requieren rol correcto
- 20+ unit tests de componentes
- E2E básico: lista visible, acción de dispatch funciona

### Rutas y componentes

```
apps/web/src/app/(protected)/automations/
├── page.tsx                        ← Lista paginada con filtros (status, category)
├── loading.tsx                     ← Skeleton de lista
├── [automationId]/
│   ├── page.tsx                    ← Detalle: info + 10 últimas ejecuciones
│   └── executions/
│       └── page.tsx                ← Historial paginado con filtros
└── actions.ts                      ← dispatchAutomationAction, pauseAction, activateAction, retryAction, cancelAction

apps/web/src/components/automations/
├── AutomationsTable.tsx            ← Tabla con estado, schedule, última ejecución, acciones
├── AutomationStatusBadge.tsx       ← draft/active/paused/archived con colores
├── AutomationHealthBadge.tsx       ← healthy/warning/error/never_run
├── AutomationActions.tsx           ← Botones contextuales según estado y rol
├── ExecutionsTable.tsx             ← Tabla de ejecuciones con estado, duración, trigger
├── ExecutionStatusBadge.tsx        ← queued/running/succeeded/failed/cancelled/retrying
├── ExecutionDetail.tsx             ← Detalle de una ejecución con logs
└── DispatchConfirmModal.tsx        ← Modal de confirmación antes de dispatch manual
```

### Server Actions

```typescript
// actions.ts
'use server'

export async function dispatchAutomationAction(automationId: string): Promise<ActionResult>
export async function pauseAutomationAction(automationId: string): Promise<ActionResult>
export async function activateAutomationAction(automationId: string): Promise<ActionResult>
export async function retryExecutionAction(executionId: string): Promise<ActionResult>
export async function cancelExecutionAction(executionId: string): Promise<ActionResult>
```

Todas las actions siguen el patrón Phase 5:
1. `requireOrganizationRole(role)`
2. Obtener `organizationId` del JWT
3. Llamar al use case con el composition root
4. `revalidatePath`
5. Retornar `{ success: boolean, error?: string }`

**Health computation:** La "salud" de una automatización se calcula dinámicamente en el Server Component, igual que en el legado:
- `never_run` → sin executions
- `healthy` → última execution succeeded y dentro del intervalo esperado
- `warning` → última execution succeeded pero hace más tiempo del esperado (según schedule)
- `error` → última execution failed

---

## Phase 6F — Integración con Alertas y Tareas

**Objetivo:** Conectar el runtime de automatizaciones con el sistema de alertas existente. Cuando una automatización falla, se genera una alerta automáticamente.

**Criterio de aceptación:**
- Webhook route crea alerta cuando `status = 'failed'`
- Alerta incluye `automationId`, `executionId`, `errorMessage`
- Alerta aparece en `/alerts` con severity apropiada
- Tests: webhook de fallo → alerta creada

### Lógica de generación de alertas

```typescript
// En webhook route, cuando status = 'failed':
await supabase.from('alerts').insert({
  organization_id: execution.organization_id,
  client_id: automation.client_id, // nullable
  severity: 'critical',
  type: 'AUTOMATION_FAILED',
  title: `Automatización fallida: ${automation.name}`,
  message: execution.error_message ?? 'Error desconocido',
  detected_at: new Date().toISOString(),
  status: 'open',
  metadata: {
    automation_id: automation.id,
    execution_id: execution.id,
    attempt: execution.attempt,
    n8n_execution_id: execution.n8n_execution_id,
  }
});
```

**Regla de severidad:**
- `attempt === 1`: `warning`
- `attempt >= maxAttempts`: `critical`
- `attempt > 1 && attempt < maxAttempts`: `warning`

---

## Phase 6G — Seguridad, Tests y Cierre

**Objetivo:** Validación final completa, auditoría de seguridad, documentación de cierre.

**Criterio de aceptación:**
- Playwright E2E: lista de automations visible, dispatch funciona, historial actualiza
- Vitest: 0 failed en todos los paquetes
- TypeScript, lint, Prettier: sin errores
- Build de producción exitoso
- PHASE_6_CLOSURE.md creado

### Tests E2E para Phase 6G

```
apps/web/e2e/automations.e2e.ts:
  - lista de automations es visible en /automations
  - badge de estado refleja status real
  - botón de dispatch es visible para operator
  - dispatch manual crea nueva execution
  - ejecución aparece en historial con status running/succeeded/failed
  - reintentar ejecución fallida crea nueva entrada
  - usuario sin rol operator no ve botón de dispatch
```

### Validaciones finales

```bash
# Desde raíz del monorepo:
npm run test          # packages/* + apps/web
npm run typecheck     # todos los paquetes
npm run lint          # ESLint
npm run format:check  # Prettier
npm run build         # apps/web

# E2E:
npm run test:e2e --workspace=@bop-agency/web
```

---

## Resumen de Archivos por Subfase

| Subfase | Archivos nuevos | Archivos modificados |
|---------|----------------|---------------------|
| 6A | 5 | 4 |
| 6B | 8 | 2 |
| 6C | 5 | 1 |
| 6D | 8 | 1 |
| 6E | 12 | 1 |
| 6F | 1 | 1 |
| 6G | 4 (docs + E2E) | 3 |
| **Total** | **~43** | **~13** |

---

## Acciones Manuales Pre-Phase 6 (No en código)

Antes de comenzar Phase 6A, Francisco debe realizar estas acciones manualmente:

1. **Verificar historial de git para `n8n-local/.env`:**
   ```bash
   git log --all --full-history -- n8n-local/.env
   ```
   Si aparece en el historial → rotar `N8N_ENCRYPTION_KEY` y todas las credenciales de n8n.

2. **Exportar W-05, W-06, W-07 desde n8n:**  
   n8n UI → Workflows → seleccionar cada uno → Export → guardar en `backups/n8n-workflows/`

3. **Confirmar Account ID de Meta para Magic Bungalow:**  
   Revisar en n8n el nodo httpRequest de W-03 para obtener el `act_XXXXXXXX`.

4. **Crear rama:**
   ```bash
   git checkout -b feat/phase-6-automation-runtime
   ```
