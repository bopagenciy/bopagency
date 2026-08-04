# Phase 5C Security Review — Mutaciones Seguras del Dashboard

**Fecha:** 2026-08-04  
**Scope:** acknowledgeAlert · resolveAlert · updateTaskStatus  
**Capas revisadas:** schemas Zod · use cases · Server Actions · composition root

---

## Resumen ejecutivo

Phase 5C introduce tres mutaciones del estado en el Dashboard Principal. La revisión no encontró vulnerabilidades críticas. El diseño aplica defensa en profundidad: validación en la frontera (Zod), autorización antes de lógica de negocio, tenant scope garantizado por sesión, y RPCs SECURITY DEFINER como barrera final.

---

## 1. Modelo de amenazas

### Actores

| Actor | Descripción |
| --- | --- |
| Usuario autenticado con rol insuficiente | Intenta ejecutar operaciones reservadas a operator |
| Usuario de otra organización | Intenta manipular recursos de un tenant ajeno |
| Atacante sin sesión | Llama Server Actions sin cookie/token válido |
| Cliente malicioso | Envía payload manipulado (organizationId, actorUserId, UUID inválido) |

### Superficies de ataque

- Server Actions (frontera principal — expuesta al cliente vía POST)
- Payload HTTP (puede contener campos arbitrarios)
- Ids de entidades (alertId, taskId — podría referir a org ajena)

---

## 2. Defensa en profundidad

```
Cliente → [1. Zod schema] → [2. requireOrganization/Role] → [3. findById con orgId] → [4. canTransition] → [5. RPC/UPDATE con orgId]
```

Cada capa es independiente. Si una falla, la siguiente contiene la amenaza.

### Capa 1 — Validación de input (Zod)

**Qué valida:**
- `alertId` y `taskId` son UUIDs válidos (formato RFC 4122).
- `status` es uno de los valores de `TASK_STATUSES` (enum cerrado, no acepta strings arbitrarios).

**Qué NO está en los schemas:**
- `organizationId` — deliberadamente ausente. Zod descarta cualquier campo extra por defecto (`stripUnknown` es el comportamiento default de Zod).
- `actorUserId` — no está en el schema. Aunque el cliente lo envíe, se ignora.

**Verificación:**
```typescript
// Si el cliente envía { alertId: "...", organizationId: "attacker-org" }
// Zod retorna: { alertId: "..." }  ← organizationId descartado
```

✅ Test explícito verifica que organizationId enviado por cliente no afecta la operación.

### Capa 2 — Autenticación y autorización

| Action | Helper | Qué verifica |
| --- | --- | --- |
| acknowledgeAlertAction | `requireOrganization()` | Sesión activa + membership activo en alguna org |
| resolveAlertAction | `requireOrganizationRole('operator')` | Sesión activa + rol ≥ operator en la org del usuario |
| updateTaskStatusAction | `requireOrganizationRole('operator')` | Sesión activa + rol ≥ operator en la org del usuario |

`requireOrganization()` lanza (redirige o throw) ante sesión inválida o membership inactivo.  
`requireOrganizationRole(role)` lanza ante sesión inválida, membership inactivo, o rol insuficiente.

**Principio:** el organizationId usado downstream viene EXCLUSIVAMENTE del contexto retornado por estos helpers, nunca del payload cliente.

```typescript
// En cada Server Action:
const { user, organization } = await requireOrganizationRole('operator');
// organization.id viene del JWT/sesión — no del request body
```

### Capa 3 — Tenant scope en findById

Los use cases siempre llaman `findById(entityId, organizationId)` antes de mutar. El repositorio incluye `AND organization_id = organizationId` en la query. Si el `alertId` o `taskId` pertenece a otro tenant, la query no retorna filas → `NOT_FOUND`.

Esto impide que un usuario de Org A manipule entidades de Org B, incluso si tiene el UUID correcto.

```sql
-- Efectivamente ejecutado:
SELECT * FROM alerts
WHERE id = $alertId
  AND organization_id = $organizationId  -- barrera multi-tenant
LIMIT 1
```

### Capa 4 — Validación de transición de dominio

`canTransitionAlert(from, to)` y `canTransitionTask(from, to)` son funciones puras de dominio que aplican la máquina de estados. El use case verifica la transición antes de llamar al repositorio.

Esto previene que un cliente fuerze una operación inconsistente con el estado actual de la entidad.

### Capa 5 — RPCs SECURITY DEFINER (alertas)

Las RPCs `acknowledge_alert(p_alert_id)` y `resolve_alert(p_alert_id)` son SECURITY DEFINER en Supabase. Internamente verifican que el usuario autenticado (`auth.uid()`) tiene pertenencia a la organización propietaria de la alerta. Esta es la barrera de seguridad final en la base de datos — independiente de la lógica de aplicación.

**Importante:** El repositorio hace `findById(id, orgId)` antes de llamar la RPC para retornar un error `NOT_FOUND` claro en lugar del error opaco de Postgres. La RPC es la última barrera, no la primera.

---

## 3. Análisis de vectores específicos

### Vector: Inyección de organizationId en payload

**Escenario:** Cliente envía `{ alertId: "...", organizationId: "org-de-otra-empresa" }`.  
**Resultado:** Zod schema descarta `organizationId` (no está en el schema). El Server Action usa `organization.id` del contexto de sesión.  
**Veredicto:** ✅ Mitigado por diseño.

### Vector: alertId/taskId de otra organización

**Escenario:** Usuario de Org A envía `alertId` que pertenece a Org B.  
**Resultado:** `findById(alertId, orgAId)` retorna NOT_FOUND porque la row no tiene `organization_id = orgAId`.  
**Veredicto:** ✅ Mitigado. Testado con `NOT_FOUND` en use case tests.

### Vector: Escalada de privilegios (viewer intenta resolveAlert)

**Escenario:** Usuario con rol `viewer` llama `resolveAlertAction`.  
**Resultado:** `requireOrganizationRole('operator')` lanza antes de ejecutar cualquier lógica de negocio. Server Action retorna `{ ok: false, code: 'FORBIDDEN' }`.  
**Veredicto:** ✅ Mitigado. Testado en Server Action tests.

### Vector: Forzar transición inválida (done → pending)

**Escenario:** Operator envía `updateTaskStatusAction({ taskId: "...", status: "pending" })` para una tarea en estado `done`.  
**Resultado:** `canTransitionTask('done', 'pending')` retorna `false`. Use case retorna `CONFLICT`.  
**Veredicto:** ✅ Mitigado. Testado con it.each de transiciones inválidas.

### Vector: UUID sintácticamente inválido

**Escenario:** Cliente envía `alertId: "../../etc/passwd"` o `alertId: "' OR 1=1 --"`.  
**Resultado:** `z.string().uuid()` rechaza cualquier string que no sea UUID RFC 4122. La request retorna `VALIDATION_ERROR` antes de tocar la base de datos.  
**Veredicto:** ✅ Mitigado por Zod.

### Vector: Sesión expirada o token inválido

**Escenario:** Cliente intenta llamar una acción con cookie de sesión expirada.  
**Resultado:** `requireOrganization()` o `requireOrganizationRole()` lanza (throw/redirect). Server Action atrapa y retorna `{ ok: false, code: 'UNAUTHENTICATED' }`.  
**Veredicto:** ✅ Mitigado.

### Vector: actorUserId spoofing

**Escenario:** Cliente envía `{ taskId: "...", status: "done", actorUserId: "admin-uuid" }`.  
**Resultado:** `updateTaskStatusSchema` descarta `actorUserId`. El Server Action usa `context.user.id` (del JWT de sesión). La BD persiste el actorUserId correcto.  
**Veredicto:** ✅ Mitigado por diseño.

---

## 4. Gaps documentados (no son vulnerabilidades activas)

### Gap 1: Audit log de intentos fallidos

**Descripción:** Si un usuario intenta acknowledgeAlert para un alerta que no le pertenece, la operación falla con NOT_FOUND, pero no queda registro del intento fallido.  
**Riesgo:** Bajo — los intentos de acceso no autorizado no se pueden detectar fácilmente a posteriori.  
**Mitigación actual:** Los logs de servidor (consoleLogger.error) capturan errores en use cases. Pero no hay audit trail estructurado.  
**Plan:** Phase 5D — tabla `activity_log` con intentos (exitosos y fallidos).

### Gap 2: Rate limiting ausente

**Descripción:** No hay rate limiting en los Server Actions. Un atacante con sesión válida podría llamar `acknowledgeAlertAction` miles de veces.  
**Riesgo:** Bajo (requiere sesión válida; la operación es idempotente en algunos casos).  
**Mitigación actual:** Supabase connection pooling limita la carga efectiva. Vercel Edge limita requests por IP.  
**Plan:** Phase 5D o middleware — implementar rate limiting con Redis/Upstash.

### Gap 3: No hay CSRF token explícito

**Descripción:** Los Server Actions de Next.js incluyen protección CSRF automática (same-origin check + `x-action` header). No se implementa CSRF adicional.  
**Riesgo:** Muy bajo — Next.js 14+ incluye protección CSRF nativa para Server Actions.  
**Veredicto:** Aceptado. La protección nativa de Next.js es suficiente.

---

## 5. Escaneo de patrones inseguros

```bash
# Resultados del escaneo en archivos Phase 5C

as any        → 0 coincidencias en archivos nuevos
@ts-ignore    → 0 coincidencias en archivos nuevos
service_role  → 0 coincidencias en archivos nuevos
organization_id del payload → 0 (solo de contexto de sesión)
actorUserId del payload     → 0 (solo de context.user.id)
```

✅ Sin patrones inseguros detectados.

---

## 6. Comparación con SECURITY_MODEL.md

| Regla del modelo | Cumplimiento |
| --- | --- |
| organizationId siempre del servidor | ✅ |
| actorUserId siempre de sesión | ✅ |
| No service_role en esta capa | ✅ |
| No exponer tipos Supabase fuera de infrastructure | ✅ |
| No usar `any` casts | ✅ |
| Toda query con tenant scope | ✅ (via findById con orgId) |
| RPCs para acknowledge/resolve (no UPDATE directo) | ✅ |
| Validación Zod en la frontera | ✅ |
| requireOrganizationRole antes de lógica de negocio | ✅ |

---

## 7. Recomendaciones de seguridad para Phase 5D

1. **Tabla `activity_log`:** Registrar toda mutación con actor, acción, entity_type, entity_id, previous_state, new_state, timestamp, success.

2. **Rate limiting:** Middleware en `apps/web/src/middleware.ts` para las rutas `/alerts` y `/tasks` con límite de, por ejemplo, 60 mutaciones/minuto por usuario.

3. **Logging estructurado:** Reemplazar `consoleLogger` con un logger estructurado (pino, winston) que incluya `requestId`, `userId`, `organizationId` en cada línea de log.

4. **Alertas de seguridad:** Si `NOT_FOUND` supera un umbral (p.ej. 10 intentos en 1 minuto de un mismo usuario), registrar como intento sospechoso.

5. **Tests de penetración básicos:** Añadir tests que verifiquen explícitamente que un usuario de Org A no puede afectar entidades de Org B pasando IDs válidos (cross-tenant isolation tests).

---

## Veredicto de seguridad

**✅ APROBADO para Phase 5D**

No se encontraron vulnerabilidades críticas ni de alto impacto. Los tres gaps documentados son de severidad baja/muy baja y tienen planes de mitigación claros. El diseño de defensa en profundidad (Zod → auth → findById con orgId → canTransition → RPC) proporciona aislamiento adecuado para el estado actual del sistema.
