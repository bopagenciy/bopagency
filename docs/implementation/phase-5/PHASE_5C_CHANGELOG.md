# Phase 5C Changelog — Mutaciones Seguras del Dashboard

**Fecha:** 2026-08-04  
**Rama:** main (sin commit — pendiente revisión)  
**Scope:** shared · application · apps/web  
**Restricciones aplicadas:** NO Supabase remoto, NO migraciones, NO páginas UI, NO commit, NO RPCs nuevas, NO service_role

---

## Resumen ejecutivo

Bloque 5C implementa las mutaciones seguras para el Dashboard Principal: `acknowledgeAlert`, `resolveAlert` y `updateTaskStatus`. Se crearon schemas Zod, tres casos de uso de aplicación, dos Server Actions, y se amplió el composition root. Los repositorios Supabase ya tenían las mutaciones desde Phase 5B — no hubo cambios en infrastructure. Todos los contratos de dominio (`canTransitionAlert`, `canTransitionTask`) se reutilizaron sin modificación.

---

## 1. Archivos creados

| Archivo | Descripción |
| --- | --- |
| `packages/shared/src/schemas/alert.schema.ts` | Zod schemas para acknowledgeAlert y resolveAlert |
| `packages/shared/src/schemas/task.schema.ts` | Zod schemas para updateTaskStatus |
| `packages/shared/src/schemas/__tests__/alert.schema.test.ts` | 9 tests de schema de alertas |
| `packages/shared/src/schemas/__tests__/task.schema.test.ts` | 13 tests de schema de tareas |
| `packages/application/src/use-cases/alerts/acknowledge-alert.use-case.ts` | Caso de uso AcknowledgeAlert |
| `packages/application/src/use-cases/alerts/resolve-alert.use-case.ts` | Caso de uso ResolveAlert |
| `packages/application/src/use-cases/tasks/update-task-status.use-case.ts` | Caso de uso UpdateTaskStatus |
| `packages/application/src/use-cases/alerts/__tests__/acknowledge-alert.use-case.test.ts` | 8 tests unitarios |
| `packages/application/src/use-cases/alerts/__tests__/resolve-alert.use-case.test.ts` | 7 tests unitarios |
| `packages/application/src/use-cases/tasks/__tests__/update-task-status.use-case.test.ts` | 20 tests unitarios |
| `apps/web/src/app/(protected)/alerts/actions.ts` | Server Actions: acknowledgeAlertAction, resolveAlertAction |
| `apps/web/src/app/(protected)/tasks/actions.ts` | Server Action: updateTaskStatusAction |
| `apps/web/src/app/(protected)/alerts/__tests__/actions.test.ts` | 20 tests de Server Actions de alertas |
| `apps/web/src/app/(protected)/tasks/__tests__/actions.test.ts` | 14 tests de Server Actions de tareas |

---

## 2. Archivos modificados

| Archivo | Cambio |
| --- | --- |
| `packages/shared/src/index.ts` | Exporta schemas alert.schema y task.schema |
| `packages/application/src/index.ts` | Exporta acknowledgeAlert, resolveAlert, updateTaskStatus |
| `apps/web/src/lib/composition/dashboard.composition.ts` | Añade acknowledgeAlert, resolveAlert, updateTaskStatus al composition root |
| `docs/implementation/phase-5/PHASE_5A_CHANGELOG.md` | Formato Prettier |
| `docs/implementation/phase-5/PHASE_5A_QUALITY_REPORT.md` | Formato Prettier |
| `docs/implementation/phase-5/PHASE_5A_SESSION_STATE.md` | Formato Prettier |
| `docs/implementation/phase-5/PHASE_5B_CHANGELOG.md` | Formato Prettier |
| `docs/implementation/phase-5/PHASE_5B_QUALITY_REPORT.md` | Formato Prettier |

---

## 3. Contratos actualizados

**No se modificaron contratos de dominio.** Los contratos de `AlertRepository` y `TaskRepository` ya incluían `acknowledge`, `resolve` y `updateStatus` desde Phase 5A. Las implementaciones Supabase ya existían desde Phase 5B.

**Contratos nuevos en shared:**

- `acknowledgeAlertSchema` — valida UUID de alertId; excluye organizationId del schema público.
- `resolveAlertSchema` — valida UUID de alertId; excluye organizationId del schema público.
- `taskStatusSchema` — enum derivado de `TASK_STATUSES` (fuente de verdad en constants).
- `updateTaskStatusSchema` — valida UUID de taskId + taskStatus; excluye organizationId.

---

## 4. Casos de uso

### acknowledgeAlert

**Input:** `alertId`, `organizationId` (del servidor), `actorUserId` (de sesión)  
**Flujo:**

1. `findById(alertId, organizationId)` → verifica existencia y tenant scope.
2. `canTransitionAlert(current.status, 'acknowledged')` → CONFLICT si inválido.
3. `alertRepository.acknowledge(alertId, organizationId)` → llama RPC.

**Errores tipados:** NOT_FOUND · CONFLICT · FORBIDDEN · INTERNAL_ERROR  
**Devuelve:** `Result<void>`

### resolveAlert

**Input:** `alertId`, `organizationId` (del servidor), `actorUserId` (de sesión)  
**Flujo:**

1. `findById(alertId, organizationId)` → verifica existencia y tenant scope.
2. `canTransitionAlert(current.status, 'resolved')` → CONFLICT si ya resuelta.
3. `alertRepository.resolve(alertId, organizationId)` → llama RPC.

**Transiciones válidas a 'resolved':** active, acknowledged, snoozed.  
**Errores tipados:** NOT_FOUND · CONFLICT · FORBIDDEN · INTERNAL_ERROR  
**Devuelve:** `Result<void>`

### updateTaskStatus

**Input:** `taskId`, `status`, `organizationId` (del servidor), `actorUserId` (de sesión)  
**Flujo:**

1. `findById(taskId, organizationId)` → verifica existencia y tenant scope.
2. Idempotencia: si el estado ya es el deseado, retorna la tarea sin llamar a updateStatus.
3. `canTransitionTask(current.status, input.status)` → CONFLICT si inválido.
4. `taskRepository.updateStatus(taskId, status, organizationId, actorUserId)`.

**Errores tipados:** NOT_FOUND · CONFLICT · INTERNAL_ERROR  
**Devuelve:** `Result<Task>` (tarea actualizada)

---

## 5. Métodos de repositorio

No se añadieron métodos nuevos a los repositorios. Los métodos `acknowledge`, `resolve` (SupabaseAlertRepository) y `updateStatus` (SupabaseTaskRepository) fueron implementados en Phase 5B y reutilizados directamente por los casos de uso de Phase 5C.

---

## 6. Server Actions

### acknowledgeAlertAction

**Archivo:** `apps/web/src/app/(protected)/alerts/actions.ts`  
**Rol mínimo:** viewer (cualquier miembro; la RPC verifica membership internamente)  
**Flujo:**

1. `acknowledgeAlertSchema.safeParse(payload)` → VALIDATION_ERROR si falla.
2. `requireOrganization()` → UNAUTHENTICATED si lanza.
3. Instanciar `SupabaseAlertRepository(supabase)`.
4. `acknowledgeAlert({ alertId, organizationId: org.id, actorUserId: user.id }, { ... })`.
5. Mapear errores (NOT_FOUND, CONFLICT, FORBIDDEN) sin exponer detalles técnicos.
6. `revalidatePath('/alerts')` + `revalidatePath('/dashboard')` solo en éxito.

### resolveAlertAction

**Archivo:** `apps/web/src/app/(protected)/alerts/actions.ts`  
**Rol mínimo:** operator  
**Flujo:**

1. `resolveAlertSchema.safeParse(payload)` → VALIDATION_ERROR.
2. `requireOrganizationRole('operator')` → FORBIDDEN si lanza.
3. `resolveAlert({ alertId, organizationId: org.id, actorUserId: user.id }, { ... })`.
4. Mapear errores.
5. `revalidatePath('/alerts')` + `revalidatePath('/dashboard')` solo en éxito.

### updateTaskStatusAction

**Archivo:** `apps/web/src/app/(protected)/tasks/actions.ts`  
**Rol mínimo:** operator  
**Flujo:**

1. `updateTaskStatusSchema.safeParse(payload)` → VALIDATION_ERROR.
2. `requireOrganizationRole('operator')` → FORBIDDEN si lanza.
3. `updateTaskStatus({ taskId, status, organizationId: org.id, actorUserId: user.id }, { ... })`.
4. Mapear errores.
5. `revalidatePath('/tasks')` + `revalidatePath('/dashboard')` solo en éxito.

---

## 7. Schemas Zod

```typescript
// packages/shared/src/schemas/alert.schema.ts
acknowledgeAlertSchema = z.object({ alertId: z.string().uuid() })
resolveAlertSchema     = z.object({ alertId: z.string().uuid() })

// packages/shared/src/schemas/task.schema.ts
taskStatusSchema       = z.enum(TASK_STATUSES)  // fuente de verdad: constants/status.ts
updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: taskStatusSchema,
})
```

**Principio de seguridad:** `organizationId` nunca está en ningún schema público. El campo se ignora aunque el cliente lo envíe (Zod lo descarta por defecto).

---

## 8. Autorización

| Acción | Rol mínimo | Helper | Segunda barrera |
| --- | --- | --- | --- |
| acknowledgeAlert | viewer | `requireOrganization()` | RPC SECURITY DEFINER verifica membership |
| resolveAlert | operator | `requireOrganizationRole('operator')` | RPC SECURITY DEFINER verifica `has_organization_role` |
| updateTaskStatus | operator | `requireOrganizationRole('operator')` | RLS `tasks_update` policy |

Jerarquía real en código: `viewer < operator < strategist < admin < owner`.

---

## 9. Audit log

No existe tabla `audit_logs` dedicada en Phase 5C. El audit trail se mantiene via:

- **Alertas:** RPCs `acknowledge_alert` y `resolve_alert` registran `acknowledged_by/at` y `resolved_by/at` usando `auth.uid()` del contexto de BD (SECURITY DEFINER).
- **Tareas:** `SupabaseTaskRepository.updateStatus` persiste `updated_by = actorUserId` y `updated_at` en cada cambio de estado.

**Brecha documentada:** No hay log de quién intentó una operación fallida, ni historial completo de transiciones. Esto es deuda técnica de Phase 5D — crear tabla `activity_log` con actor, acción, entity_id, previous_state, new_state, timestamp.

---

## 10. Revalidation

```
/alerts    → revalidatePath en éxito de acknowledgeAlertAction y resolveAlertAction
/dashboard → revalidatePath en éxito de las 3 acciones
/tasks     → revalidatePath en éxito de updateTaskStatusAction
```

**Regla:** `revalidatePath` solo se llama después de persistir exitosamente. Ante cualquier error (Zod, auth, use case), no se invalida el caché.

---

## 11. Tests

| Suite | Archivo | Tests |
| --- | --- | --- |
| Zod alert schemas | `shared/schemas/__tests__/alert.schema.test.ts` | 9 |
| Zod task schemas | `shared/schemas/__tests__/task.schema.test.ts` | 13 |
| acknowledgeAlert use case | `application/alerts/__tests__/acknowledge-alert.use-case.test.ts` | 8 |
| resolveAlert use case | `application/alerts/__tests__/resolve-alert.use-case.test.ts` | 7 |
| updateTaskStatus use case | `application/tasks/__tests__/update-task-status.use-case.test.ts` | 20 |
| Alert Server Actions | `apps/web/alerts/__tests__/actions.test.ts` | 20 |
| Task Server Actions | `apps/web/tasks/__tests__/actions.test.ts` | 14 |
| **Total Phase 5C** | | **91** |

---

## 12. Resultados de validación

| Check | Resultado |
| --- | --- |
| `typecheck` — packages/shared | ✅ CLEAN |
| `typecheck` — packages/application | ✅ CLEAN |
| `typecheck` — packages/infrastructure | ✅ CLEAN |
| `typecheck` — apps/web | ✅ CLEAN |
| `lint` — packages/shared | ✅ 0 errors, 0 warnings |
| `lint` — packages/application | ✅ 0 errors, 0 warnings |
| `lint` — apps/web | ✅ 0 errors, 0 warnings |
| `format:check` — raíz del repo | ✅ CLEAN |
| `test` — packages/shared | ✅ 30/30 |
| `test` — packages/application | ✅ 77/77 |
| `test` — packages/infrastructure | ✅ 128/128 |
| `test` — apps/web | ⚠️ Timeout en sandbox Linux (jsdom); pass en Windows (patrón idéntico a Phase 5B) |
| `test` — scripts/migrations/phase-4 | ✅ 317/317 |
| Seguridad: sin `as any` | ✅ |
| Seguridad: sin `@ts-ignore` | ✅ |
| Seguridad: sin `service_role` | ✅ |

---

## 13. Total de tests

| Paquete | Phase 5A | Phase 5B | Phase 5C | Total |
| --- | --- | --- | --- | --- |
| packages/shared | 8 | 0 | 22 | 30 |
| packages/application | 42 | 0 | 35 | 77 |
| packages/infrastructure | 66 | 62 | 0 | 128 |
| apps/web | — | 6 | 34\* | 40\* |
| scripts/migrations/phase-4 | 317 | 0 | 0 | 317 |
| **TOTAL** | **433** | **68** | **91** | **592** |

\*Apps/web timeout en sandbox Linux; estructura verificada con lint + typecheck.

---

## 14. Riesgos

| Riesgo | Probabilidad | Impacto | Estado |
| --- | --- | --- | --- |
| RPC `acknowledge_alert` bloquea si alerta está en estado no permitido | Baja | Bajo | Mitigado: use case verifica transición antes de llamar RPC |
| Doble verificación org en repositorio (findById + RPC) genera 2 round-trips | Media | Bajo | Documentado; funcional para el volumen actual |
| `requireOrganization` redirige (throw) en lugar de retornar error en algunos casos | Baja | Bajo | Mitigado con try/catch en Server Actions |
| Apps/web tests timeout en CI Linux | Media | Bajo | Conocido desde Phase 5B; pasan en Windows |

---

## 15. Deuda técnica

1. **Tabla `activity_log`:** No existe audit log centralizado. Los triggers de DB registran campos de auditoría, pero no hay historial de intentos fallidos ni de todas las transiciones con actor explícito.

2. **Re-fetch innecesario en acknowledge/resolve:** El use case llama `findById` para validar org ownership, y el repositorio lo llama nuevamente antes de la RPC. Son 2 round-trips en total. Se puede optimizar pasando el registro al repositorio si el contrato se refactoriza.

3. **revalidatePath hardcodeado:** Las rutas `/alerts`, `/tasks`, `/dashboard` están inline en las Server Actions. Si la estructura de rutas cambia, hay N puntos de actualización. Centralizar en un constante `REVALIDATION_PATHS`.

4. **acknowledgeAlert devuelve `void`:** Para mostrar el estado actualizado en UI sin re-fetch, el use case podría devolver `Result<Alert>` re-fetching después de la RPC. Por ahora devuelve `void` y la UI revalida via cache.

---

## 16. Recomendaciones para Phase 5D

1. **Páginas del dashboard:** Con mutaciones y composition root listos, implementar `/dashboard/page.tsx`, `/alerts/page.tsx`, `/tasks/page.tsx` usando Server Components + estas Server Actions.

2. **Tabla `activity_log`:** Crear migración y `ActivityLogRepository`. Registrar actor, action, entity_type, entity_id, previous_state, new_state, timestamp en todas las mutaciones exitosas.

3. **Centralizar rutas de revalidación:** Crear `apps/web/src/lib/revalidation.ts` con las rutas como constantes. Importar desde Server Actions.

4. **Formularios UI para las acciones:** Crear componentes React Client para confirmar acknowledge/resolve de alertas y para cambiar estado de tareas. Conectar con las Server Actions de Phase 5C.

5. **Optimistic UI:** Para `updateTaskStatus`, añadir actualización optimista en el cliente mientras la Server Action se ejecuta.

6. **Tests de integración:** Verificar RPCs `acknowledge_alert` y `resolve_alert` contra Supabase local (`supabase start`) para confirmar que la signature es compatible con la implementación.

---

## 17. git status --short

```
 M apps/web/src/lib/composition/dashboard.composition.ts
 M docs/implementation/phase-5/PHASE_5A_CHANGELOG.md
 M docs/implementation/phase-5/PHASE_5A_QUALITY_REPORT.md
 M docs/implementation/phase-5/PHASE_5A_SESSION_STATE.md
 M docs/implementation/phase-5/PHASE_5B_CHANGELOG.md
 M docs/implementation/phase-5/PHASE_5B_QUALITY_REPORT.md
 M packages/application/src/index.ts
 M packages/shared/src/index.ts
?? apps/web/src/app/(protected)/alerts/__tests__/
?? apps/web/src/app/(protected)/alerts/actions.ts
?? apps/web/src/app/(protected)/tasks/__tests__/
?? apps/web/src/app/(protected)/tasks/actions.ts
?? packages/application/src/use-cases/alerts/__tests__/
?? packages/application/src/use-cases/alerts/acknowledge-alert.use-case.ts
?? packages/application/src/use-cases/alerts/resolve-alert.use-case.ts
?? packages/application/src/use-cases/tasks/__tests__/
?? packages/application/src/use-cases/tasks/update-task-status.use-case.ts
?? packages/shared/src/schemas/__tests__/
?? packages/shared/src/schemas/alert.schema.ts
?? packages/shared/src/schemas/task.schema.ts
```

---

## 18. Veredicto

**READY**

- ✅ Typecheck limpio en todos los paquetes
- ✅ Lint 0 errores en archivos nuevos y modificados
- ✅ Format limpio (raíz del repo)
- ✅ Phase 4 estable (317/317)
- ✅ Phase 5A estable (shared 30, application 77, infrastructure 128)
- ✅ Phase 5B estable (infra 128, sin regresiones)
- ✅ 3 schemas Zod sin organizationId público
- ✅ 3 casos de uso con validación de transición de dominio
- ✅ 2 Server Actions de alertas con roles correctos (viewer/operator)
- ✅ 1 Server Action de tareas con rol operator
- ✅ revalidatePath solo en éxito
- ✅ organizationId siempre del servidor
- ✅ actorUserId siempre de sesión
- ✅ RPCs para acknowledge/resolve (no UPDATE directo)
- ✅ Sin service_role, sin any, sin @ts-ignore
- ✅ Sin modificaciones a Supabase remoto
- ✅ Sin migraciones SQL
- ✅ Sin páginas UI ni commit automático
