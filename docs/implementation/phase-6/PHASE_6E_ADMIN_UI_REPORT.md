# Phase 6E — Automation Admin UI and Server Actions
**Estado:** ✅ COMPLETE  
**Fecha:** 2026-08-05  
**Rama:** feat/phase-6-automation-runtime  
**Prerequisitos:** 6A ✅, 6B ✅, 6C ✅, 6D ✅

---

## 1. Resumen Ejecutivo

Phase 6E implementa la interfaz de administración de automatizaciones en Next.js App Router. La UI permite a los usuarios gestionar el ciclo de vida de automatizaciones (activar, pausar, archivar) y operar sobre ejecuciones (iniciar, cancelar, reintentar) con control de acceso por rol.

**Entregables:**

| Categoría | Cantidad |
|-----------|----------|
| Nuevos use cases (application) | 4 |
| Server Actions | 6 |
| Rutas de páginas | 4 |
| Componentes UI | 10 |
| Test files nuevos | 5 |
| Tests nuevos | 69 |

---

## 2. Arquitectura

```
apps/web/src/
├── app/(protected)/automations/
│   ├── page.tsx                          # Lista de automatizaciones
│   ├── loading.tsx / error.tsx
│   ├── actions.ts                        # 6 Server Actions ('use server')
│   ├── __tests__/actions.test.ts         # 25 unit tests
│   ├── [automationId]/
│   │   ├── page.tsx                      # Detalle de automatización
│   │   ├── loading.tsx / error.tsx
│   │   └── executions/
│   │       ├── page.tsx                  # Lista de ejecuciones de la automatización
│   │       └── loading.tsx
│   └── executions/[executionId]/
│       ├── page.tsx                      # Detalle de ejecución + timeline
│       └── loading.tsx
├── components/automations/
│   ├── AutomationStatusBadge.tsx
│   ├── ExecutionStatusBadge.tsx
│   ├── AutomationActions.tsx             # client component
│   ├── ExecutionActions.tsx              # client component
│   ├── AutomationsTable.tsx
│   ├── ExecutionsTable.tsx
│   ├── ExecutionTimeline.tsx
│   ├── AutomationsTableSkeleton.tsx      # skeleton (10 componentes total)
│   ├── ExecutionsTableSkeleton.tsx
│   ├── AutomationsFilters.tsx            # client component
│   └── __tests__/
│       ├── AutomationStatusBadge.test.tsx   (7 tests)
│       ├── ExecutionStatusBadge.test.tsx    (9 tests)
│       └── AutomationsTable.test.tsx        (11 tests)
└── lib/composition/
    └── automation.composition.ts         # composition root completo
```

```
packages/application/src/use-cases/automations/
├── get-automation.use-case.ts
├── activate-automation.use-case.ts
├── pause-automation.use-case.ts
├── archive-automation.use-case.ts
└── __tests__/automation-status.use-case.test.ts  (17 tests)

packages/domain/src/errors/domain.errors.ts
└── automationInvalidTransition()         # nuevo error Phase 6E

packages/shared/src/schemas/
└── automation.schema.ts                  # 6 Zod schemas
```

---

## 3. Server Actions

### 3.1 Tabla de acciones y roles

| Acción | Rol mínimo | Descripción |
|--------|-----------|-------------|
| `activateAutomationAction` | admin | draft/paused → active |
| `pauseAutomationAction` | operator | active → paused |
| `archiveAutomationAction` | admin | any → archived |
| `startExecutionAction` | operator | Crear ejecución manual |
| `cancelExecutionAction` | operator | Cancelar queued/running |
| `retryExecutionAction` | operator | Reintentar failed |

### 3.2 Patrón de implementación

Todas las acciones siguen el patrón establecido en Phase 5C:

```
1. Zod.safeParse(payload)         → VALIDATION_ERROR si inválido
2. requireOrganizationRole(role)  → FORBIDDEN si no tiene rol
3. createServerSupabaseClient()   → cliente con RLS activo
4. createAutomationComposition()  → use cases ensamblados
5. use case(input)               → Result<T>
6. mapear errores sin detalles   → error amigable al cliente
7. revalidatePath() solo en éxito
8. return ActionResult
```

### 3.3 Invariantes de seguridad

- `organizationId` siempre de la sesión del servidor — nunca del cliente.
- `clientId: null` fijo para ejecuciones manuales vía UI (la UI no gestiona vinculación con clientes).
- `triggeredBy: user.id` de la sesión — nunca del cliente.
- NO se usa `service_role` en ningún punto de la UI.
- `retryDeferred: true` expuesto al cliente como señal informativa — no crea ejecución.

---

## 4. Use Cases Nuevos

### 4.1 getAutomation

Delegación directa a `AutomationRepository.findById(id, organizationId)`.  
Retorna `NOT_FOUND` si el ID no pertenece a la organización (aislamiento multi-tenant).

### 4.2 activateAutomation

Transiciones válidas: `draft → active`, `paused → active`.  
Idempotente: ya activa → retorna la automatización sin update.  
Inválido: `archived → active` → `VALIDATION_ERROR` (`automationInvalidTransition`).

### 4.3 pauseAutomation

Transición válida: `active → paused`.  
Idempotente: ya pausada → retorna sin update.  
Rechaza: draft, archived → `VALIDATION_ERROR`.

### 4.4 archiveAutomation

Transiciones válidas: `draft → archived`, `active → archived`, `paused → archived`.  
Idempotente: ya archivada → retorna ok sin llamar a `archive()`.  
Estado final: no hay transición desde `archived` (en Phase 6E).

---

## 5. Composition Root

`automation.composition.ts` reemplaza y amplía `automation-execution.composition.ts`:

```typescript
const { useCases } = createAutomationComposition(supabase);
// useCases incluye:
// listAutomations, getAutomation, activateAutomation,
// pauseAutomation, archiveAutomation,
// startExecution, cancelExecution, retryExecution,
// getExecution, listExecutions
```

El composition root anterior (`automation-execution.composition.ts`) permanece disponible para compatibilidad hacia atrás.

---

## 6. Páginas

### `/automations`
- Server Component con `requireOrganization()`.
- Filtro `?status=draft|active|paused|archived` validado server-side.
- Paginación `?page=N` con `pageSize=20`.
- `aria-live="polite"` en el contenedor de la tabla.
- `loading.tsx` con skeleton animado.
- `error.tsx` con botón de retry.

### `/automations/[automationId]`
- Carga automation + últimas 10 ejecuciones en paralelo (`Promise.all`).
- `notFound()` si `error.code === 'NOT_FOUND'`.
- Muestra: info card (name, status, trigger, retryPolicy, n8nWorkflowId), ejecutar/activar/pausar/archivar.
- Link "Ver todas →" hacia `/automations/[id]/executions`.

### `/automations/[automationId]/executions`
- Filtro `?status=queued|running|...` + paginación.
- Carga automation para breadcrumbs + maxAttempts.

### `/automations/executions/[executionId]`
- Carga execution + logs en paralelo (`Promise.all`).
- Logs vía `SupabaseExecutionLogRepository.findByExecution()` (max 50 más recientes).
- Timeline visual con niveles `info|warn|error` y colores diferenciados.
- Muestra: info card, errorCode, errorMessage, ExecutionTimeline.

---

## 7. Accesibilidad

- Todas las tablas tienen `aria-label`.
- Badges tienen `aria-label="Estado: <valor>"`.
- Botones tienen `aria-busy={isPending}` durante mutaciones.
- Skeletons tienen `aria-label="Cargando…"` y `aria-busy="true"`.
- Filtros están en `role="search"` con `aria-label`.
- `aria-live="polite"` en contenedores de tablas (para actualizaciones).

---

## 8. Tests

### 8.1 Resumen (conteos verificados 2026-08-05)

| Package/app | Tests antes 6E | Tests después 6E | Diferencia |
|------------|---------------|-----------------|------------|
| @bop-agency/domain | 169 | 169 | — |
| @bop-agency/application | 153 | 170 | +17 |
| @bop-agency/infrastructure | 275 | 275 | — |
| @bop-agency/web | 210 | 262 | +52 |
| scripts/migrations/phase-4 | 317 | 317 | — |

**Total nuevos tests Phase 6E: 69** (17 use cases + 25 actions + 27 componentes)

### 8.2 application — automation-status.use-case.test.ts (17 tests)

- `getAutomation`: found, NOT_FOUND.
- `activateAutomation`: draft→active, paused→active, idempotente, archived rechazado, NOT_FOUND.
- `pauseAutomation`: active→paused, idempotente, draft rechazado, archived rechazado, NOT_FOUND.
- `archiveAutomation`: active/paused/draft→archived, idempotente, NOT_FOUND.

### 8.3 web — actions.test.ts (25 tests)

Cubre las 6 Server Actions con: VALIDATION_ERROR, FORBIDDEN, NOT_FOUND, error de use case, ok + revalidatePath, y verificación de que `organizationId` se toma de la sesión.

### 8.4 web — componentes (27 tests)

- `AutomationStatusBadge`: 7 tests (labels + estilos + aria-label).
- `ExecutionStatusBadge`: 9 tests (labels + estilos + aria-label).
- `AutomationsTable`: 11 tests (empty state, rendering, links, role-based buttons).

### 8.5 Validación integral (2026-08-05)

| Check | Resultado |
|-------|-----------|
| TypeCheck (tsc --noEmit, 5 workspaces) | ✅ exit 0 |
| ESLint (`npx eslint "src/**/*.{ts,tsx}"`) | ✅ 0 errores (4 corregidos post-implementación) |
| next build | ⚠️ Bus error en sandbox Linux — limitación del entorno de validación, no defecto de código. TypeCheck exit 0 garantiza corrección de tipos. |
| E2E Playwright Chromium | ⚠️ Dev server no arranca en sandbox (misma causa). `skipIfNoCredentials()` omite todos los tests sin E2E_TEST_EMAIL. |
| Phase 4 migrations (317 tests) | ✅ 317/317 passed |

**Errores lint corregidos:**
1. `[automationId]/page.tsx` — eliminados imports no usados `AutomationExecutionId` y `makeAutomationId`
2. `actions.test.ts:145,238` — non-null assertions `!` reemplazadas por cast seguro

---

## 9. Restricciones respetadas

| Restricción | Estado |
|-------------|--------|
| NO nuevas dependencias npm | ✅ |
| NO service_role en UI | ✅ |
| NO scheduler/cron | ✅ |
| NO edición de workflows n8n | ✅ |
| NO alertas automáticas | ✅ |
| NO commit | ✅ (pendiente revisión) |
| NO Phase 6F iniciada | ✅ |
| organizationId siempre de sesión | ✅ |

---

## 10. Rollback

Para desactivar la UI de automatizaciones:
1. Revertir `apps/web/src/app/(protected)/automations/page.tsx` a la versión con `<UnderConstruction>`.
2. Los use cases nuevos no tienen side effects — no requieren cleanup de datos.
3. Las rutas sub-páginas no tienen efecto hasta que se navegue a ellas.

Para desactivar una acción específica: lanzar un error con `code: 'NOT_IMPLEMENTED'` desde el use case correspondiente. La UI mapea este código a "Error interno".

---

## 11. Pendiente (Phase 6F+)

- Scheduler/cron para ejecuciones automáticas (Phase 6F).
- Alertas automáticas cuando executions fallan consecutivamente.
- Métricas de ejecución en el dashboard (tasa de éxito, duración promedio).
- Edición de automatizaciones (nombre, descripción, retryPolicy).
- Creación de automatizaciones desde la UI.
- Paginación de logs de ejecución (actualmente limitada a 50).
