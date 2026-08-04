# Phase 5B Changelog — Dashboard Principal (Bloque 5B)

**Fecha:** 2026-08-04  
**Rama:** main (sin commit — pendiente revisión)  
**Scope:** infrastructure · application · apps/web  
**Restricciones aplicadas:** NO Supabase remoto, NO Server Actions, NO páginas, NO commit, NO migraciones, NO RPC nuevas

---

## Resumen ejecutivo

Bloque 5B implementa la capa de infraestructura y composición para el Dashboard Principal. Se crearon tres repositorios Supabase (`SupabaseMetricsRepository`, `SupabaseAlertRepository`, `SupabaseTaskRepository`), un composition root para Server Components, y 62 tests nuevos que cubren tenant scope, paginación, JSONB parcial, errores y RPCs. Se actualizó el use case `getAgencyDashboardSummary` para calcular `overdueTasks` con una query real en lugar del placeholder `0`.

---

## 1. Archivos creados

| Archivo                                                                                           | Descripción                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `packages/infrastructure/src/supabase/repositories/supabase-metrics.repository.ts`                | SupabaseMetricsRepository — lectura de client_metrics        |
| `packages/infrastructure/src/supabase/repositories/supabase-alert.repository.ts`                  | SupabaseAlertRepository — lectura y mutación (RPC) de alerts |
| `packages/infrastructure/src/supabase/repositories/supabase-task.repository.ts`                   | SupabaseTaskRepository — lectura y updateStatus de tasks     |
| `packages/infrastructure/src/supabase/repositories/__tests__/supabase-metrics.repository.test.ts` | 20 tests unitarios para MetricsRepository                    |
| `packages/infrastructure/src/supabase/repositories/__tests__/supabase-alert.repository.test.ts`   | 19 tests unitarios para AlertRepository                      |
| `packages/infrastructure/src/supabase/repositories/__tests__/supabase-task.repository.test.ts`    | 23 tests unitarios para TaskRepository                       |
| `apps/web/src/lib/composition/dashboard.composition.ts`                                           | Composition root — factory de repos y use cases              |
| `apps/web/src/lib/composition/__tests__/dashboard.composition.test.ts`                            | 6 tests unitarios para el composition root                   |

---

## 2. Archivos modificados

| Archivo                                                                                 | Cambio                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/infrastructure/src/index.ts`                                                  | Exporta los 3 repositorios nuevos                                                                |
| `packages/application/src/use-cases/dashboard/get-agency-dashboard-summary.use-case.ts` | Calcula `overdueTasks` con query real vía `taskRepository.findByOrganization({ overdue: true })` |

---

## 3. Repositorios implementados

### SupabaseMetricsRepository

Implementa `MetricsRepository` completo. Filtra siempre por `organization_id`.

**Nota de diseño:** `findByClient` delega a `findByOrganization` con `clientId` en el filtro — evita duplicación de lógica de paginación y ordenamiento.

**getOrganizationSummary:** Agrega JSONB `metrics` en TypeScript (no RPC). Documentado con límite `MAX_SUMMARY_ROWS = 500`. Ver sección Deuda Técnica.

### SupabaseAlertRepository

Implementa `AlertRepository` completo incluyendo `acknowledge` y `resolve` via RPC.

**Seguridad RPC:** Ambas mutaciones verifican que la alerta pertenezca a la organización (`findById` con `organization_id`) **antes** de llamar la RPC. Esto garantiza que un usuario no pueda reconocer alertas de otra organización incluso si conoce el ID.

### SupabaseTaskRepository

Implementa `TaskRepository` completo incluyendo `updateStatus`.

**Overdue:** El filtro `overdue: true` en `findByOrganization` aplica `.lt('due_date', now)` + `.not('due_date', 'is', null)` + `.in('status', ACTIVE_TASK_STATUSES)`. El campo `now` se toma de `new Date()` en el momento de la query (no inyectable externamente — ver Deuda Técnica).

---

## 4. Métodos implementados por repositorio

### MetricsRepository

| Método                   | Query                                                                                   | Devuelve                            |
| ------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------- |
| `findById`               | `SELECT * WHERE id = ? AND org = ?`                                                     | `Result<Metric>` (con campaigns)    |
| `findByOrganization`     | `SELECT summary_fields WHERE org = ? [+ filtros]`                                       | `PaginatedResult<MetricSummary>`    |
| `findByClient`           | Delega a `findByOrganization` con clientId                                              | `PaginatedResult<MetricSummary>`    |
| `findLatestByClient`     | `SELECT summary_fields WHERE client = ? AND org = ? ORDER BY period_start DESC LIMIT 1` | `Result<MetricSummary \| null>`     |
| `getAvailablePeriods`    | `SELECT period_start, period_end WHERE org = ? ORDER BY period_start DESC`              | `Result<AvailablePeriod[]>`         |
| `getOrganizationSummary` | `SELECT summary_fields WHERE org = ? LIMIT 500` + agregación TS                         | `Result<MetricOrganizationSummary>` |

### AlertRepository

| Método                     | Query                                                           | Devuelve                       |
| -------------------------- | --------------------------------------------------------------- | ------------------------------ |
| `findById`                 | `SELECT * WHERE id = ? AND org = ?`                             | `Result<Alert>`                |
| `findByOrganization`       | `SELECT * WHERE org = ? [+ filtros] ORDER BY detected_at DESC`  | `PaginatedResult<Alert>`       |
| `findActiveByOrganization` | `findByOrganization` con `status='active'`                      | `PaginatedResult<Alert>`       |
| `findByClient`             | `findByOrganization` con `clientId`                             | `PaginatedResult<Alert>`       |
| `countBySeverity`          | `SELECT severity WHERE org = ? AND status='active'` + conteo TS | `Result<AlertCountBySeverity>` |
| `acknowledge`              | Verificar org → RPC `acknowledge_alert(p_alert_id)`             | `Result<void>`                 |
| `resolve`                  | Verificar org → RPC `resolve_alert(p_alert_id)`                 | `Result<void>`                 |

### TaskRepository

| Método               | Query                                                                   | Devuelve                    |
| -------------------- | ----------------------------------------------------------------------- | --------------------------- |
| `findById`           | `SELECT * WHERE id = ? AND org = ?`                                     | `Result<Task>`              |
| `findByOrganization` | `SELECT * WHERE org = ? [+ filtros] ORDER BY due_date ASC`              | `PaginatedResult<Task>`     |
| `findByClient`       | `findByOrganization` con `clientId`                                     | `PaginatedResult<Task>`     |
| `findUpcoming`       | `SELECT * WHERE org = ? AND due_date <= future AND status NOT IN final` | `Result<Task[]>`            |
| `countByStatus`      | `SELECT status WHERE org = ? AND deleted_at IS NULL` + conteo TS        | `Result<TaskCountByStatus>` |
| `updateStatus`       | `UPDATE tasks SET status = ?, updated_by = ?, updated_at = ?`           | `Result<Task>`              |

---

## 5. Consultas usadas

### Campos excluidos de listas (campaigns JSONB)

```typescript
const METRIC_SUMMARY_FIELDS =
  'id, organization_id, client_id, platform, account_id, account_name, ' +
  'period_start, period_end, currency, metrics, data_quality, created_at, updated_at';
// campaigns NO incluido — magic-bungalow tiene 55 campañas por período
```

### Overdue tasks

```typescript
query
  .lt('due_date', now.toISOString())
  .not('due_date', 'is', null)
  .in('status', ['pending', 'in_progress', 'blocked']);
```

### Upcoming tasks

```typescript
query
  .is('deleted_at', null)
  .not('due_date', 'is', null)
  .not('status', 'in', '("done","cancelled")')
  .lte('due_date', future.toISOString())
  .order('due_date', { ascending: true });
```

### Dashboard Summary — queries paralelas (Promise.all)

1. `clientRepository.findAll({ status: 'active' }, { pageSize: 1 })` — total de clientes activos
2. `alertRepository.countBySeverity(organizationId)` — alertas activas por severidad
3. `taskRepository.countByStatus(organizationId)` — conteo de tareas por estado
4. `taskRepository.findByOrganization({ overdue: true }, { pageSize: 1 })` — conteo de overdue
5. `metricsRepository.getOrganizationSummary(organizationId)` — métricas agregadas

Total: **5 queries paralelas**, sin N+1.

---

## 6. Estrategia multi-tenant

- Todos los repositorios reciben el Supabase client del usuario con RLS activo.
- **Nunca** se usa `service_role` en esta capa.
- Cada método de repositorio aplica `.eq('organization_id', organizationId)` como primera condición.
- Para mutaciones via RPC (`acknowledge`, `resolve`): se verifica primero que el recurso pertenezca a la organización con un `findById` antes de llamar la RPC. Esto garantiza tenant isolation aunque la RPC solo reciba el ID del recurso.
- El composition root recibe el client como parámetro — nunca lo crea internamente ni lee variables de entorno.

---

## 7. Estrategia de errores

| Tipo de error          | Código           | Cuándo                                                      |
| ---------------------- | ---------------- | ----------------------------------------------------------- |
| Recurso no encontrado  | `NOT_FOUND`      | `findById` cuando `data === null` o `error` de Supabase     |
| Error de base de datos | `INTERNAL_ERROR` | Cualquier error de Supabase en queries de lectura/escritura |
| Acceso denegado (RPC)  | `FORBIDDEN`      | RPC retorna mensaje con 'permission' o 'role'               |
| Error de mapping       | `INTERNAL_ERROR` | JSONB inválido al mapear entidad                            |

**Comportamiento en listas:** `findByOrganization` y similares retornan `PaginatedResult` vacío (no `Result`) — ante error, devuelven `{ data: [], total: 0, ... }`. Esto evita que un error de BD rompa el dashboard completo.

**Filas individuales inválidas:** La función `mapSafe` descarta filas que fallen el mapper sin propagar el error. En producción, monitorizar via logger en el use case.

Los errores de Supabase no se exponen directamente — se envuelven en mensajes descriptivos sin tokens ni URLs sensibles.

---

## 8. Composition root

**Ubicación:** `apps/web/src/lib/composition/dashboard.composition.ts`

**Patrón:** Factory function `createDashboardComposition(supabase: SupabaseClient)` que:

- Instancia los 4 repositorios con el client recibido
- Pre-enlaza los 4 use cases con sus dependencias
- Retorna `{ repositories, useCases }` tipado

**Uso desde Server Component:**

```typescript
const supabase = await createServerSupabaseClient();
const { useCases } = createDashboardComposition(supabase);
const result = await useCases.getAgencyDashboardSummary({ organizationId });
```

**Use cases pre-enlazados:**

- `getAgencyDashboardSummary`
- `listAlerts`
- `listTasks`
- `listClientMetrics`

---

## 9. Tests agregados

| Suite              | Archivo                               | Tests nuevos |
| ------------------ | ------------------------------------- | ------------ |
| MetricsRepository  | `supabase-metrics.repository.test.ts` | 20           |
| AlertRepository    | `supabase-alert.repository.test.ts`   | 19           |
| TaskRepository     | `supabase-task.repository.test.ts`    | 23           |
| Composition root   | `dashboard.composition.test.ts`       | 6            |
| **Total Phase 5B** |                                       | **68**       |

---

## 10. Resultados de validación

| Check                                 | Resultado               |
| ------------------------------------- | ----------------------- |
| `typecheck` — packages/shared         | ✅ CLEAN                |
| `typecheck` — packages/domain         | ✅ CLEAN                |
| `typecheck` — packages/application    | ✅ CLEAN                |
| `typecheck` — packages/infrastructure | ✅ CLEAN                |
| `typecheck` — apps/web                | ✅ CLEAN                |
| `lint` — repositorios nuevos          | ✅ 0 errors, 0 warnings |
| `lint` — composition root             | ✅ 0 errors, 0 warnings |
| `format:check` — archivos modificados | ✅ CLEAN                |
| `test` — packages/domain              | ✅ 67/67                |
| `test` — packages/application         | ✅ 42/42                |
| `test` — packages/infrastructure      | ✅ 128/128              |
| `test` — apps/web (composition)       | ✅ 6/6                  |
| `test` — scripts/migrations/phase-4   | ✅ 317/317              |

---

## 11. Total de tests

| Paquete                    | Tests Phase 5A | Tests Phase 5B | Total   |
| -------------------------- | -------------- | -------------- | ------- |
| packages/domain            | 67             | 0              | 67      |
| packages/application       | 42             | 0              | 42      |
| packages/infrastructure    | 66             | 62             | 128     |
| apps/web                   | —              | 6              | 6       |
| scripts/migrations/phase-4 | 317            | 0              | 317     |
| **TOTAL**                  | **492**        | **68**         | **560** |

> Phase 4 sigue en **317 passed** — sin regresiones.  
> Phase 5A sigue estable — **175 passed** en domain + application + infrastructure (mappers).

---

## 12. Riesgos

| Riesgo                                                          | Probabilidad     | Impacto | Estado                                      |
| --------------------------------------------------------------- | ---------------- | ------- | ------------------------------------------- |
| `getOrganizationSummary` carga > 500 filas                      | Baja (actual: 4) | Medio   | Mitigado con límite documentado             |
| `countBySeverity` / `countByStatus` lentos con muchos registros | Baja             | Bajo    | Candidatos a RPC                            |
| `now` en overdue no inyectable externamente                     | Media            | Bajo    | Documentado como deuda técnica              |
| RPC `acknowledge_alert` falla por RLS                           | Baja             | Medio   | Manejo de error tipado en repositorio       |
| `mapSafe` oculta errores de JSONB corrupto                      | Media            | Bajo    | Loguear a través del use case en producción |

---

## 13. Deuda técnica

1. **`getOrganizationSummary` — RPC futura:** La agregación JSONB en TypeScript con límite de 500 filas es funcional para el volumen actual (~4 filas). Cuando el volumen crezca, crear `get_org_metrics_summary(p_org_id uuid)` en Supabase que use operadores JSONB de PostgreSQL.

2. **`countBySeverity` / `countByStatus` — RPC futura:** Actualmente carga todas las filas de `severity` / `status` en memoria. Para organizaciones con cientos de alertas/tareas, crear RPCs dedicadas.

3. **`overdueTasks` — `now` no inyectable:** La fecha actual se toma de `new Date()` en el momento de la query. Para tests de integración que necesiten controlar la fecha, se requeriría inyección de `Clock`. Los tests unitarios actuales verifican el comportamiento del filtro (que se llama `.lt('due_date', someString)`) sin necesitar inyectar una fecha específica.

4. **`findUpcoming` — formato de NOT IN:** La exclusión de estados finales usa `.not('status', 'in', '("done","cancelled")')`. Si Supabase cambia su sintaxis de NOT IN, hay un punto frágil. Alternativa: `.not('status', 'in', FINAL_TASK_STATUSES)` con el array correcto — verificar comportamiento real en integración.

5. **Composition root — ReportRepository no incluido:** `getAgencyDashboardSummary` no incluye `reportsThisMonth` porque `ReportRepository` no tiene `countByOrganization`. Se puede añadir en Phase 5C si el dashboard lo requiere.

---

## 14. Recomendaciones para Phase 5C

1. **Páginas del dashboard:** Con los repositorios y composition root listos, implementar `/dashboard/page.tsx` usando `createDashboardComposition(await createServerSupabaseClient())`.

2. **Server Actions para mutaciones:** `acknowledgeAlertAction`, `resolveAlertAction`, `updateTaskStatusAction` — usando los repositorios ya implementados.

3. **RPC `get_org_metrics_summary`:** Implementar cuando el dashboard de métricas requiera mayor performance o más de 50 filas por organización.

4. **SupabaseReportRepository:** Si se añade `countByOrganization` al contrato, el dashboard summary puede incluir `reportsThisMonth`.

5. **Test de integración contra Supabase local:** Phase 5B tiene 100% tests unitarios con mocks. En Phase 5C, añadir tests de integración contra Supabase local con `supabase start` para verificar que las queries reales funcionan con los datos migrados.

6. **Métricas de performance:** Añadir timing logs en `getAgencyDashboardSummary` para medir latencia real de las 5 queries paralelas contra Supabase.

---

## 15. git status --short

```
 M packages/application/src/use-cases/dashboard/get-agency-dashboard-summary.use-case.ts
 M packages/infrastructure/src/index.ts
?? apps/web/src/lib/composition/
?? packages/infrastructure/src/supabase/repositories/
```

---

## 16. Veredicto

**READY**

- ✅ Typecheck limpio en todos los paquetes
- ✅ Lint 0 errores en archivos nuevos y modificados
- ✅ Format limpio
- ✅ 560 tests pasando (68 nuevos en Phase 5B)
- ✅ Phase 4 estable (317/317)
- ✅ Phase 5A estable (175/175 en domain + application + infrastructure mappers)
- ✅ Tenant scope obligatorio en todos los repositorios
- ✅ RPCs para acknowledge/resolve (no UPDATE directo)
- ✅ campaigns JSONB excluido de queries de lista
- ✅ Composition root listo para Server Components
- ✅ Sin llamadas a service_role
- ✅ Sin modificaciones a Supabase remoto
- ✅ Sin migraciones SQL
- ✅ Sin páginas ni Server Actions
- ✅ Sin commit automático
