# Phase 6A — Domain and Contracts Report

**Fecha:** 2026-08-04  
**Rama:** feat/phase-6-automation-runtime  
**Alcance:** Solo TypeScript puro. Cero código de infraestructura, Supabase, n8n, webhooks o UI.  
**Prerequisito:** Phase 5 COMPLETE ✅ | Auditoría Phase 6 COMPLETE ✅

---

## 1. Resumen Ejecutivo

Phase 6A completa el modelo de dominio de automatizaciones y ejecuciones, unifica los estados con el ciclo de negocio real, y amplía los contratos de repositorio para que Phase 6B pueda implementar persistencia sin redefinir el dominio. Todos los checks de CI pasan: 169 tests domain + 85 tests application, typecheck y lint limpios en todos los paquetes.

---

## 2. Decisiones de Diseño

### 2.1 AutomationStatus — Ciclo Canónico

**Decisión:** `draft | active | paused | archived`

**Racional:**
- `draft` es necesario para automatizaciones en configuración antes de activarse.
- `active` es el estado operativo principal.
- `paused` reemplaza `inactive` (DB legacy) y `disabled` (dominio anterior). Semánticamente más preciso: "pausado" implica reversibilidad.
- `archived` reemplaza `disabled` como estado final. Es más claro en el contexto de ciclo de vida de un asset digital.
- `error` **eliminado** como estado de definición: no es un estado de la *automatización*, sino de su *ejecución*. Los errores se registran en `AutomationExecution`, no en la definición.

**Comparativa con versión anterior:**

| Estado anterior (domain) | Estado nuevo (domain) | Motivo del cambio |
|--------------------------|----------------------|-------------------|
| `active`                 | `active`             | Sin cambio        |
| `paused`                 | `paused`             | Sin cambio        |
| `error`                  | ❌ Eliminado          | Es estado de ejecución, no de definición |
| `disabled`               | `archived`           | Más preciso semánticamente |
| _(ausente)_              | `draft`              | Necesario para onboarding |

### 2.2 Tabla de Transiciones — AutomationStatus

```
draft ──────────────────► active
  │                          │
  │                          ▼
  └──────────────────────► paused ◄───────── active
                              │                  │
                              └──► archived ◄────┘
                              └──► archived ◄── draft
```

| Desde    | Hacia    | Permitido | Notas                                         |
|----------|----------|-----------|-----------------------------------------------|
| draft    | active   | ✅        | Activación — requiere rol admin               |
| draft    | archived | ✅        | Descartar borrador                            |
| active   | paused   | ✅        | Pausar — requiere rol operator                |
| active   | archived | ✅        | Archivar definitivamente                      |
| paused   | active   | ✅        | Reactivar                                     |
| paused   | archived | ✅        | Archivar desde pausa                          |
| archived | *        | ❌        | Estado final — restauración es operación explícita |
| draft    | paused   | ❌        | Nunca fue activo                              |
| active   | draft    | ❌        | No hay retroceso al borrador                  |

**Restricción de restauración:** Una automatización archivada NO puede activarse directamente. Requiere un use case de restauración explícita (fuera del scope de 6A, previsto en 6D). Esta restricción protege contra activación accidental de automatizaciones retiradas.

### 2.3 AutomationExecutionStatus — Ciclo de Ejecución

**Estados:** `queued | running | succeeded | failed | cancelled | retrying`

**`timed_out` — Justificación de exclusión en 6A:**  
Un timeout es detectado por el dispatcher n8n como un error con código específico (`TIMEOUT`) y se representa como `failed` con `errorCode='TIMEOUT'`. Si Phase 6C/6D demuestra que se necesita un estado diferenciado para reintentar solo timeouts de forma diferente a otros fallos, se añade en Phase 6D junto con la lógica de dispatch. Añadirlo ahora sin la lógica que lo consume sería gold-plating.

### 2.4 Tabla de Transiciones — AutomationExecutionStatus

```
queued ──► running ──► succeeded  (terminal)
  │           │
  │           ├──► failed ──► retrying ──► queued (nueva ejecución)
  │           │
  └───────────┴──► cancelled  (terminal)
```

| Desde     | Hacia     | Permitido | Notas                                     |
|-----------|-----------|-----------|-------------------------------------------|
| queued    | running   | ✅        | Dispatcher toma la ejecución              |
| queued    | cancelled | ✅        | Cancelación antes de comenzar             |
| running   | succeeded | ✅        | Completó exitosamente                     |
| running   | failed    | ✅        | Error en la ejecución                     |
| running   | cancelled | ✅        | Cancelación durante ejecución             |
| failed    | retrying  | ✅        | Se programó un reintento                  |
| retrying  | queued    | ✅        | Reintento encolado (conceptualmente nueva ejecución) |
| succeeded | *         | ❌        | Terminal — no se re-ejecuta lo exitoso    |
| cancelled | *         | ❌        | Terminal                                  |
| failed    | running   | ❌        | Debe pasar por `retrying → queued`        |

---

## 3. Estrategia `inactive` → `paused` para Phase 6B

El ENUM de Supabase actual es: `active | inactive | draft | archived`.

El dominio Phase 6A establece: `draft | active | paused | archived`.

**Incompatibilidad:** El valor `inactive` de la DB no existe en el dominio. El valor `paused` del dominio no existe en la DB.

### Estrategia Phase 6B: Mapper Transitorio + Migración

**Paso 1 (Phase 6B, inmediato):** Mapper en `SupabaseAutomationRepository`:
```typescript
// automation.mapper.ts
function mapDbStatusToDomain(dbStatus: string): AutomationStatus {
  if (dbStatus === 'inactive') return 'paused'; // mapper transitorio
  return dbStatus as AutomationStatus;
}

function mapDomainStatusToDb(status: AutomationStatus): string {
  if (status === 'paused') return 'inactive'; // hasta que se ejecute la migración
  return status;
}
```

**Paso 2 (Phase 6B, migración SQL — NO ejecutar automáticamente):**
```sql
-- Migración Phase 6B: Extender ENUM y migrar datos
-- IMPORTANTE: ADD VALUE no es transaccional en PostgreSQL
-- Debe ser migración separada sin BEGIN/COMMIT

ALTER TYPE public.automation_status ADD VALUE IF NOT EXISTS 'paused';

-- En migración separada (después de ADD VALUE):
UPDATE public.automations SET status = 'paused' WHERE status = 'inactive';
```

**Paso 3 (Phase 6B, después de migración):** Eliminar el mapper transitorio y usar valores directos.

**Rollback Phase 6B:** El mapper transitorio permite rollback seguro: si la migración falla, el sistema sigue funcionando con `inactive` en DB y `paused` en dominio.

---

## 4. Multi-Tenancy

**Principio:** `organizationId` es requerido en **todas** las firmas de repositorio. No existe ningún método que permita acceder a datos sin `organizationId`.

**Implementación:**
- `AutomationRepository.findById(id, organizationId)` — nunca `findById(id)` solo
- `AutomationRepository.findByOrganization(filter, pagination)` — `filter.organizationId` es obligatorio en el tipo `AutomationFilter`
- `AutomationExecutionRepository` — mismo patrón en todos los métodos
- `listAutomations` use case — `organizationId` movido a input obligatorio (breaking change controlado: no había consumidores reales)

---

## 5. clientId — Nullable y Racional

`clientId` es `ClientId | null` en ambas entidades.

**`null`** → Automatización global de la organización (ej: "Generar Reporte Mensual de la Agencia").  
**`non-null`** → Automatización vinculada a un cliente específico (ej: "Sincronizar Métricas Meta — Magic Bungalow").

Los workflows existentes en n8n (W-02, W-03) son por cliente, por lo que `clientId` no nulo es el caso dominante hoy. El campo nullable permite automatizaciones cross-client en el futuro.

---

## 6. Relación Domain vs. Automation-Engine

| Responsabilidad          | Paquete            | Tipo/Función                    |
|--------------------------|--------------------|---------------------------------|
| AutomationId branded type | domain            | `AutomationId`                  |
| AutomationTrigger type   | domain             | `AutomationTrigger` (inline)    |
| AutomationRetryPolicy type | domain           | `AutomationRetryPolicy` (inline)|
| AutomationExecutionId    | domain             | `AutomationExecutionId`         |
| IdempotencyKey type      | domain             | `IdempotencyKey` (mismo brand)  |
| idempotencyKey() generator | automation-engine | `idempotencyKey()`            |
| AutomationDefinition     | automation-engine  | Referencia a runtime n8n        |
| WorkflowDispatcher       | automation-engine  | Puerto de despacho              |
| RetryPolicy + computeDelay | automation-engine | Lógica de backoff             |

**Sin dependencias circulares:** automation-engine importa de domain (AutomationId). Domain NO importa de automation-engine. Los tipos `AutomationTrigger` y `AutomationRetryPolicy` están duplicados inline en domain con semántica equivalente — esto es intencional para mantener el límite limpio.

**Compatibilidad estructural de IdempotencyKey:** Tanto domain como automation-engine definen `IdempotencyKey = string & { readonly _brand: 'IdempotencyKey' }`. El brand literal es idéntico, por lo que TypeScript los considera el mismo tipo estructuralmente. No hay conversión necesaria.

---

## 7. Contratos Creados / Modificados

### 7.1 Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `packages/domain/src/entities/automation.ts` | Reescrito: AutomationStatus unificado, organizationId, clientId, triggerConfig, retryPolicy, n8nWorkflowId, metadata, helpers de transición, validaciones |
| `packages/domain/src/repositories/automation.repository.ts` | Reescrito: create, update, archive, findById(id, orgId), findByOrganization, findByClient, existsByName, countByStatus |
| `packages/domain/src/repositories/index.ts` | Añadidas exportaciones de automation-execution.repository |
| `packages/domain/src/index.ts` | Exportaciones de Automation y AutomationExecution entities + repositories |
| `packages/application/src/use-cases/automations/list-automations.use-case.ts` | organizationId obligatorio, filtros opcionales clientId/status, logger contextual |

### 7.2 Archivos Creados

| Archivo | Contenido |
|---------|-----------|
| `packages/domain/src/entities/automation-execution.ts` | AutomationExecution entity, AutomationExecutionId, IdempotencyKey, estados, helpers de transición |
| `packages/domain/src/repositories/automation-execution.repository.ts` | AutomationExecutionRepository con create, updateStatus, findById, findByIdempotencyKey, findByAutomation, findByOrganization, countByStatus |
| `packages/domain/src/__tests__/automation-transitions.test.ts` | 45 tests de AutomationStatus |
| `packages/domain/src/__tests__/automation-execution-transitions.test.ts` | 57 tests de AutomationExecutionStatus |
| `packages/application/src/use-cases/automations/__tests__/list-automations.use-case.test.ts` | 8 tests del use case |

---

## 8. Tests

### Resultados

```
@bop-agency/domain    — 7 test files, 169 tests: ✅ 169 passed, 0 failed
@bop-agency/application — 10 test files, 85 tests: ✅ 85 passed, 0 failed
@bop-agency/shared    — 3 test files, 30 tests: ✅ 30 passed, 0 failed
@bop-agency/automation-engine — 0 test files (no tests en scope 6A): ✅ pass
```

### Cobertura de tests Phase 6A

| Suite | Tests | Qué verifica |
|-------|-------|-------------|
| automation-transitions | 45 | Todas las transiciones válidas/inválidas de AutomationStatus, helpers canActivate/canPause/canArchive, isTerminal, isValidName, factory automationId, DEFAULT_RETRY_POLICY |
| automation-execution-transitions | 57 | Todas las transiciones de AutomationExecutionStatus, isTerminal, canRetry (con maxAttempts), canCancel, validateExecutionDates, isValidAttemptNumber, factories |
| list-automations (application) | 8 | organizationId propagado, filtros opcionales, resultado del repositorio, logger contextual |

### Typecheck

```
@bop-agency/shared       — tsc --noEmit: ✅
@bop-agency/domain       — tsc --noEmit: ✅
@bop-agency/automation-engine — tsc --noEmit: ✅
@bop-agency/application  — tsc --noEmit: ✅
@bop-agency/infrastructure — tsc --noEmit: ✅
```

### Lint (ESLint)

```
@bop-agency/domain       — eslint src: ✅ 0 errores
@bop-agency/application  — eslint src: ✅ 0 errores
@bop-agency/infrastructure — eslint src: ✅ 0 errores
```

---

## 9. Limitaciones y Decisiones Aplazadas

| Ítem | Estado | Acción en Phase |
|------|--------|----------------|
| `timed_out` como estado de ejecución | Documentado, no implementado | 6D si Phase 6C lo justifica |
| Restauración de automatización archivada | No implementada (bloqueada intencionalmente) | 6D — use case explícito `restoreAutomation` |
| Unicidad de nombre por organización | Contrato definido (`existsByName`) | Implementación en 6B (adapter Supabase) |
| `parentExecutionId` para vincular reintentos | No en entidad (campo opcional en metadata) | 6D cuando se implemente `retryExecution` use case |
| Migración SQL `inactive` → `paused` | Mapper documentado | 6B — NO ejecutar automáticamente |
| Use cases create/update/activate/pause/dispatch | No en scope 6A | 6D per plan aprobado |
| Tests E2E automations | No en scope 6A | 6G |

---

## 10. Rollback

Phase 6A es **solo TypeScript puro**. Rollback completo sin impacto en DB, Supabase, n8n o UI:

```bash
git checkout HEAD -- packages/domain/src/entities/automation.ts
git checkout HEAD -- packages/domain/src/repositories/automation.repository.ts
git checkout HEAD -- packages/domain/src/repositories/index.ts
git checkout HEAD -- packages/domain/src/index.ts
git checkout HEAD -- packages/application/src/use-cases/automations/list-automations.use-case.ts
git rm packages/domain/src/entities/automation-execution.ts
git rm packages/domain/src/repositories/automation-execution.repository.ts
git rm packages/domain/src/__tests__/automation-transitions.test.ts
git rm packages/domain/src/__tests__/automation-execution-transitions.test.ts
git rm packages/application/src/use-cases/automations/__tests__/list-automations.use-case.test.ts
```

Impacto: ZERO en runtime. Los adaptadores Supabase aún no existen; las entidades de dominio no tienen dependencias en producción activa.

---

## 11. Riesgos Pendientes

| ID | Riesgo | Severidad | Mitigación |
|----|--------|-----------|------------|
| R-01 | `listAutomations` es un breaking change de API (organizationId obligatorio) | Baja | No hay consumidores reales en producción (UI es stub) |
| R-02 | Mapper transitorio `inactive→paused` puede ocultar datos inconsistentes en DB | Media | Phase 6B debe incluir asserción en tests de integración |
| R-03 | `AutomationTrigger` duplicado entre domain y automation-engine podría divergir | Baja | Añadir ADR sobre punto canónico si se añaden nuevos tipos de trigger |
| R-04 | `timed_out` omitido podría requerir migración de datos en Phase 6D | Baja | Campo `errorCode='TIMEOUT'` en `failed` cubre el caso sin cambio de schema |
| R-05 | `parentExecutionId` ausente dificulta trazabilidad de reintentos | Media | Usar `idempotencyKey` como trazador mientras tanto; añadir campo en 6D |

---

## 12. Recomendación de Commit

```bash
git add \
  packages/domain/src/entities/automation.ts \
  packages/domain/src/entities/automation-execution.ts \
  packages/domain/src/repositories/automation.repository.ts \
  packages/domain/src/repositories/automation-execution.repository.ts \
  packages/domain/src/repositories/index.ts \
  packages/domain/src/index.ts \
  packages/domain/src/__tests__/automation-transitions.test.ts \
  packages/domain/src/__tests__/automation-execution-transitions.test.ts \
  packages/application/src/use-cases/automations/list-automations.use-case.ts \
  packages/application/src/use-cases/automations/__tests__/list-automations.use-case.test.ts \
  docs/implementation/phase-6/PHASE_6A_DOMAIN_REPORT.md

git commit -m "feat(domain): Phase 6A — automation domain model and contracts

- Unify AutomationStatus: draft|active|paused|archived (remove error/disabled)
- Add organizationId, clientId, triggerConfig, retryPolicy, n8nWorkflowId to Automation entity
- Add transition helpers: canActivate/canPause/canArchive/isTerminal
- Create AutomationExecution entity with 6 execution states and transition guards
- Create AutomationExecutionId and IdempotencyKey branded types
- Expand AutomationRepository: create/update/archive/findByOrg/findByClient/countByStatus
- Create AutomationExecutionRepository contract with idempotency support
- Add mandatory organizationId to listAutomations use case
- Document inactive→paused mapper strategy for Phase 6B
- 169 domain tests + 85 application tests: all passing
- typecheck and lint: clean across all packages

BREAKING CHANGE: ListAutomationsInput now requires organizationId
Phase 6B can implement Supabase adapters without redefining domain"
```
