# Phase 6D — Automation Execution Orchestration
**Estado:** ✅ COMPLETE (revisión correctiva aplicada 2026-08-05)  
**Fecha:** 2026-08-05  
**Rama:** feat/phase-6-automation-runtime  
**Prerequisitos:** 6A ✅, 6B ✅, 6C ✅

---

## 1. Resumen Ejecutivo

Phase 6D implementa la capa de orquestación de ejecuciones de automatizaciones:

1. **StartAutomationExecution** — idempotencia por clave, sanitización de metadata, dispatch con manejo de fallos.
2. **CancelAutomationExecution** — cancelación segura: queued cancelado localmente; running requiere confirmación remota (H2).
3. **RetryAutomationExecution** — sólo desde `failed`, crea nueva fila con `attempt+1`, backoff exponencial con diferimiento seguro (H1).
4. **GetAutomationExecution / ListAutomationExecutions** — lectura multi-tenant con aislamiento de `organizationId`.
5. **WorkflowDispatcherPort** — abstracción de aplicación sobre n8n; `N8nDispatcherAdapter` en infraestructura.
6. **ExecutionLogRepository** — contrato de dominio + adaptador Supabase; logging best-effort, nunca interrumpe el flujo principal.
7. **Composition root** — `createAutomationExecutionComposition` en `apps/web/src/lib/composition/`.

No se implementa UI, scheduling, alertas, ni cambios al endpoint webhook de 6C.

---

## 2. Revisión Correctiva Pre-Commit (2026-08-05)

Se aplicaron cuatro correcciones antes del commit:

| # | Hallazgo | Archivo(s) afectados |
|---|----------|----------------------|
| H1 | Retry con backoff no debía crear ejecuciones sin consumidor | `retry-execution.use-case.ts` |
| H2 | Cancelación de running no debía proceder si el cancel remoto falla | `cancel-execution.use-case.ts` |
| H3 | Idempotency key de retry necesitaba validación de longitud, sanitización y recovery 23505 | `retry-execution.use-case.ts` |
| H4 | Sanitización usaba patrones demasiado amplios (`key`, `cred`, `name`) produciendo falsos positivos | `n8n-webhook-dispatcher.ts` |

---

## 3. Arquitectura de Capas

```
apps/web (composition root)
    └─ application (use cases, ports)
            ├─ ports/WorkflowDispatcherPort
            ├─ startAutomationExecution
            ├─ cancelAutomationExecution
            ├─ retryAutomationExecution
            ├─ getAutomationExecution
            └─ listAutomationExecutions
                    │  (depends on)
                    ▼
            domain (entities, repositories, errors)
                    │
infrastructure (Supabase adapters, N8nDispatcherAdapter)
```

La capa de aplicación no importa ningún tipo de `infrastructure` ni de `automation-engine` directamente. El bridge hacia `N8nWebhookDispatcher` (automation-engine) se realiza exclusivamente en infraestructura mediante `N8nDispatcherAdapter`.

---

## 4. Idempotencia y Concurrencia

### 4.1 Algoritmo de Start

```
1. findByIdempotencyKey(key, organizationId)
   → found: return { execution, created: false, duplicate: true }
2. executionRepository.create(input)
   → ok: proceed to dispatch
   → err code 23505 (unique violation): findByIdempotencyKey again → return duplicate
3. dispatch(automationId, payload)
   → ok: log dispatched
   → err: updateStatus(failed, DISPATCH_FAILED), log dispatch_failed
```

### 4.2 Idempotency Key de Retry (H3)

| Caso | Clave |
|------|-------|
| Primera ejecución | Proporcionada por el caller |
| Retry attempt N (sin backoff) | `{originalKey}:retry:{N}` (determinístico) |
| Retry con backoff activo | No se crea clave — no se crea ejecución (H1) |

**Restricciones de la clave:**
- Longitud máxima: 500 caracteres (límite DB: `CHECK (char_length(idempotency_key) BETWEEN 1 AND 500)`)
- Sanitización: se eliminan caracteres de control `\x00-\x1F\x7F` y se aplica trim
- Scoped por `organizationId` — la unicidad es `(organization_id, idempotency_key)`, nunca global
- Recovery 23505: si `create` falla con `CONFLICT`, se recupera la ejecución existente vía `findByIdempotencyKey` sin re-despachar

---

## 5. Sanitización de Metadata (H4)

Los campos de metadata de entrada se sanitizan antes de enviarse a n8n. Se usa coincidencia de **palabra completa** (camelCase y snake_case normalizados), no coincidencia de subcadena genérica.

### 5.1 Palabras individuales prohibidas
`secret`, `token`, `password`, `authorization`, `credential`, `credentials`, `bearer`, `oauth`, `email`, `phone`, `ssn`

### 5.2 Compuestos exactos prohibidos (snake_case)
`access_token`, `refresh_token`, `api_key`, `private_key`

### 5.3 Claves que se CONSERVAN (sin falsos positivos)
`keyboardLayout`, `primaryKeyName`, `campaignId`, `attemptNumber`, `reportId`

Antes de H4 se usaban patrones de subcadena (`key`, `cred`, `name`, `auth`) que producían falsos positivos sobre claves legítimas como `keyboardLayout` o `primaryKeyName`.

La sanitización es recursiva: aplica también sobre objetos anidados dentro del metadata.

---

## 6. Backoff Exponencial y Retry Diferido (H1)

```typescript
function computeBackoffDelay(attempt: number, policy: RetryPolicy): number {
  if (attempt <= 1) return 0;
  return Math.min(policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 2), policy.maxDelayMs);
}
```

| Attempt | Ejemplo (initialDelayMs=1000, backoffMultiplier=2, maxDelayMs=30000) |
|---------|----------------------------------------------------------------------|
| 1 | 0 ms |
| 2 | 1 000 ms |
| 3 | 2 000 ms |
| 4 | 4 000 ms |
| 5 | 8 000 ms |

### Comportamiento por resultado del backoff

| Resultado | Comportamiento |
|-----------|----------------|
| `delayMs = 0` | Crear ejecución + dispatch inmediato → `{ retryDeferred: false }` |
| `delayMs > 0` | **No crear ejecución, no despachar** → `{ retryDeferred: true, nextEligibleAt }` |

**Garantía H1:** cuando `retryDeferred: true`, no se persiste ninguna fila en `automation_executions`. No quedan ejecuciones huérfanas sin consumidor. El caller (o el scheduler futuro de Phase 6E) debe reinvocar `retryAutomationExecution` a partir de `nextEligibleAt`.

El output es un discriminated union:
```typescript
type RetryAutomationExecutionOutput =
  | { retryDeferred: true; nextEligibleAt: Date; previousExecutionId }
  | { retryDeferred: false; execution; attempt; dispatched; nextEligibleAt: null }
```

---

## 7. Manejo de Estado de Cancelación (H2)

| Estado previo | Gateway | Resultado |
|---------------|---------|-----------|
| `queued` | — | `cancelled` (cancelación local, sin dispatcher) |
| `running` | ausente | `CANCEL_NOT_SUPPORTED` — ejecución permanece `running` |
| `running` | ok (confirmado) | `cancelled` localmente tras confirmación remota |
| `running` | falla / timeout | `EXTERNAL_SERVICE_ERROR` — ejecución permanece `running` |
| `cancelled` | — | Idempotente: ok sin actualizar |
| `succeeded` / `failed` / `retrying` | — | `VALIDATION_ERROR` (cancelNotAllowed) |

**Garantía H2:** nunca se marca una ejecución `running` como `cancelled` sin confirmación remota. Antes de H2, cualquier fallo del gateway o ausencia de dispatcher producía un cancel local silencioso, dejando el estado de n8n y el estado local divergentes.

Nuevos códigos de error en dominio:
- `CANCEL_NOT_SUPPORTED` — no hay gateway disponible para running
- `EXTERNAL_SERVICE_ERROR` — cancel remoto falló/timeout (ya existía)

---

## 8. Archivos Modificados / Creados

### Shared
| Archivo | Cambio |
|---------|--------|
| `packages/shared/src/types/errors.ts` | +`CANCEL_NOT_SUPPORTED` en `ErrorCode` |

### Domain
| Archivo | Cambio |
|---------|--------|
| `packages/domain/src/repositories/execution-log.repository.ts` | +`'execution.retry_deferred'` en `ExecutionLogEventType` |
| `packages/domain/src/errors/domain.errors.ts` | +`cancelNotSupported`, `cancelRemoteFailed` |

### Application
| Archivo | Cambio |
|---------|--------|
| `packages/application/src/use-cases/automations/retry-execution.use-case.ts` | H1: retry diferido sin ejecución; H3: validación longitud, sanitización key, recovery 23505; output discriminado |
| `packages/application/src/use-cases/automations/cancel-execution.use-case.ts` | H2: running requiere cancel remoto confirmado |

### Infrastructure
| Archivo | Cambio |
|---------|--------|
| `packages/infrastructure/src/n8n/n8n-webhook-dispatcher.ts` | H4: sanitización con palabra completa, recursiva |

### Tests
| Archivo | Cambio |
|---------|--------|
| `packages/application/src/use-cases/automations/__tests__/retry-execution.use-case.test.ts` | Reescrito completo — 20 tests (H1: C10-C13; H3: C9b, C9c, C14-C16) |
| `packages/application/src/use-cases/automations/__tests__/cancel-execution.use-case.test.ts` | Reescrito completo — 14 tests (H2: B3, B4, B4b, B12) |
| `packages/infrastructure/src/n8n/n8n-webhook-dispatcher.test.ts` | B11 corregido, +B11b (recursividad) — 19 tests (H4) |
| `packages/application/src/use-cases/automations/__tests__/composition.test.ts` | RetryOutput shape actualizado al discriminated union |

---

## 9. Modelo de Seguridad

- **Multi-tenant**: `organizationId` en todas las llamadas a repositorio. Cliente Supabase user-scoped (RLS activo).
- **No `service_role`** fuera de la ruta webhook (sin cambios en Phase 6D).
- **No secretos en metadata**: sanitización activa en `start` y en logs, con patrones delimitados (H4).
- **No PII**: la clave de idempotencia nunca contiene datos de usuario.
- **Cancelación segura**: nunca se falsifica el estado `cancelled` para ejecuciones en vuelo (H2).

---

## 10. Restricciones Cumplidas

- Sin UI de administración (→ 6E)
- Sin scheduling automático (→ 6E; `nextEligibleAt` ya devuelto por retryDeferred)
- Sin alertas automáticas por fallo (→ 6F)
- Sin nuevas dependencias de paquete
- Sin commits
- Sin cambios a la ruta webhook de 6C

---

## 11. Rollback

Para deshabilitar el dispatch sin revertir código, sustituir `N8nDispatcherAdapter` en el composition root por:

```typescript
const dispatcher: WorkflowDispatcherPort = {
  dispatch: async () => ok({ externalRunId: null, dispatchedAt: new Date() }),
  cancel:   async () => ok(undefined),
};
```

---

## 12. Resultados de Validación

| Validación | Resultado |
|------------|-----------|
| `npm run test --workspace=@bop-agency/application` | ✅ 153/153 |
| `npm run test --workspace=@bop-agency/domain` | ✅ 169/169 |
| `npm run test --workspace=@bop-agency/infrastructure` | ✅ 275/275 |
| `npm run test --workspace=@bop-agency/automation-engine` | ✅ (passWithNoTests) |
| `npm --prefix scripts/migrations/phase-4 run test` | ✅ 317/317 |
| `npm run typecheck` (todos los workspaces) | ✅ sin errores |
| `npm run lint` (paquetes modificados) | ✅ sin errores |
| `npm run build --workspace=packages/*` | ✅ todos los paquetes |
