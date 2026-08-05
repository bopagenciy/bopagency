# Phase 5 — Security Final Review

**Fecha:** 2026-08-04
**Scope:** Phase 5A–5E completa
**Capas:** domain · application · infrastructure · Server Actions · UI pages

---

## Resumen ejecutivo

La revisión de seguridad final de Phase 5 no encontró vulnerabilidades críticas. El diseño aplica defensa en profundidad: validación en la frontera (Zod), autenticación/autorización antes de lógica de negocio, tenant scope garantizado exclusivamente por sesión del servidor, RLS de Supabase como barrera de infraestructura, y sin exposición de credenciales o errores técnicos al cliente. Todos los gaps identificados son de severidad baja y están documentados como follow-ups.

---

## 1. Tenant Isolation (Aislamiento Multi-Tenant)

### Modelo
Cada organización tiene un `organization_id` único. Todos los recursos (alertas, tareas, métricas, clientes) pertenecen a exactamente una organización. El RLS de Supabase filtra por `organization_id` a nivel de base de datos.

### Implementación en Phase 5

| Capa | Mecanismo |
|------|-----------|
| Middleware | `createMiddlewareClient()` refresca session en cada request |
| Server Components | `requireOrganization()` obtiene orgId del JWT/sesión |
| Server Actions | `requireOrganizationRole(role)` antes de cualquier lógica |
| Use cases | `organizationId` como parámetro explícito, no inferido |
| Repositories | Filtro `eq('organization_id', orgId)` en todas las queries |
| RLS (Supabase) | Policy activa por auth.uid() → membership → organization_id |

### Verificación
```bash
# Ninguna página usa organizationId de searchParams:
grep -rn "searchParams.*organizationId" apps/web/src/app/(protected)/ → (vacío)

# Todas las pages llaman requireOrganization():
grep -n "requireOrganization" apps/web/src/app/(protected)/*/page.tsx → 4 resultados ✅

# Ninguna action usa organizationId del cliente:
grep -rn "organizationId" apps/web/src/app/(protected)/alerts/actions.ts → solo de sesión ✅
grep -rn "organizationId" apps/web/src/app/(protected)/tasks/actions.ts → solo de sesión ✅
```

**Veredicto: ✅ PASS** — organizationId nunca proviene del cliente.

---

## 2. Session Authority

### Principio
El `organizationId` y `userId` usados en mutaciones provienen exclusivamente de los helpers de autenticación del servidor, nunca del payload del request.

### Flujo de Server Actions
```
Cliente → POST /dashboard/actions → [Zod stripUnknown] → [requireOrganizationRole()] → use case
                                                                ↑
                                                    organization.id del JWT
                                                    user.id del JWT
```

### Guards aplicados

| Action | Guard | Rol mínimo |
|--------|-------|------------|
| `acknowledgeAlertAction` | `requireOrganization()` | any active member |
| `resolveAlertAction` | `requireOrganizationRole('operator')` | operator+ |
| `updateTaskStatusAction` | `requireOrganizationRole('operator')` | operator+ |

### canMutate en UI
`OPERATOR_ROLES = new Set(['operator', 'strategist', 'admin', 'owner'])` determinado server-side en `tasks/page.tsx` a partir de `membership.role`. El componente `TasksTable` recibe `canMutate: boolean` como prop. Usuarios sin rol suficiente no ven el `<select>` de cambio de estado.

**Veredicto: ✅ PASS** — sesión como única fuente de autoridad.

---

## 3. Mutation Scope

### Verificación de ownership en use cases
Antes de ejecutar una mutación, el use case verifica que el recurso pertenece a la organización del usuario:

```typescript
// acknowledgeAlert use case:
const alertResult = await alertRepository.findById(input.alertId, input.organizationId);
if (!alertResult.success) return err('ALERT_NOT_FOUND'); // 404 si no pertenece a la org
```

Esto impide que un usuario de org A modifique alertas de org B aunque conozca el UUID.

### Mutaciones disponibles en Phase 5
| Mutación | Verificación ownership | Scope correcto |
|----------|----------------------|----------------|
| acknowledgeAlert | `findById(alertId, orgId)` | ✅ |
| resolveAlert | `findById(alertId, orgId)` | ✅ |
| updateTaskStatus | `findById(taskId, orgId)` | ✅ |

**Veredicto: ✅ PASS** — todas las mutaciones verifican ownership con orgId de sesión.

---

## 4. RLS (Row Level Security)

Phase 5 no creó nuevas tablas ni modificó RLS de Supabase (según constraints inamovibles). Las policies existentes de Phase 4 protegen todas las tablas:

| Tabla | Policy existente |
|-------|-----------------|
| `alerts` | `organization_id = auth.uid()→membership→org_id` |
| `tasks` | `organization_id = auth.uid()→membership→org_id` |
| `client_metrics` | `organization_id = auth.uid()→membership→org_id` |

Phase 5 usa RPCs SECURITY DEFINER (`acknowledge_alert`, `resolve_alert`) para mutaciones que requieren bypass de RLS controlado. Estas RPCs validan `organization_id` internamente.

**Veredicto: ✅ PASS** — RLS activo, sin nuevas migraciones, sin bypasses no autorizados.

---

## 5. Secret Scan

### Comandos ejecutados
```bash
grep -rn "\bas any\b|as unknown as|@ts-ignore|@ts-expect-error|service_role" \
  packages/ apps/ --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.next
```

### Resultados

| Patrón | Ocurrencias en Phase 5 pages/actions | Evaluación |
|--------|--------------------------------------|------------|
| `as any` | 0 en pages/actions | ✅ |
| `@ts-ignore` | 0 | ✅ |
| `service_role` | 0 en pages/actions | ✅ |
| `as unknown as` | Solo en mappers de infrastructure | Legítimo — cast de tipos DB sin typed generics |
| `service_role` en comments/docs de infrastructure | Solo en comentarios de advertencia | Legítimo — documenta que NO se usa |

### Evaluación de `as unknown as` en mappers
Los mappers usan `row as unknown as AlertRow` / `TaskRow` / `MetricRow` porque el tipo de retorno de Supabase JS SDK es `any[]` cuando la query es dinámica. Este patrón es el recomendado por Supabase para tipado seguro y está contenido en la capa de infraestructura. No representa un riesgo de seguridad.

**Veredicto: ✅ PASS** — sin secretos expuestos, sin bypasses de tipo en capas críticas.

---

## 6. Errores seguros

### Principio
Los errores técnicos (stack traces, nombres de tablas SQL, valores de RLS) nunca se exponen al cliente.

### Implementación
- Use cases retornan `err('DESCRIPTIVE_CODE')` — nunca el error raw de Supabase
- Server Actions retornan `{ success: false, error: 'Mensaje seguro en español' }`
- `RepositoryErrorState` muestra "No se pudieron cargar los datos" — sin detalles técnicos
- Páginas muestran el estado de error sin exponer la causa técnica

### Verificación
```bash
# No hay Supabase error raw propagado a UI:
grep -rn "\.message\|\.code\|PGRST\|PostgreSQL" \
  apps/web/src/components/ --include="*.tsx" → (vacío) ✅
```

**Veredicto: ✅ PASS** — errores seguros en todas las capas.

---

## 7. Gaps pendientes (severidad baja)

### Gap 1 — Rate limiting en Server Actions
**Severidad:** Baja
**Descripción:** Las Server Actions no tienen rate limiting. Un usuario autenticado podría llamar `acknowledgeAlertAction` en bucle.
**Mitigación actual:** RLS limita el scope. La acción es idempotente (reconocer una alerta ya reconocida retorna error del dominio, no escribe).
**Recomendación:** Agregar rate limiting en middleware o con Upstash Redis en Phase 6.

### Gap 2 — CSRF en Server Actions
**Severidad:** Baja
**Descripción:** Next.js 15 Server Actions tienen protección CSRF built-in vía `Same-Origin-Allow-List` y `Origin` header check. Sin embargo, no hay CSRF token explícito.
**Mitigación:** Next.js 15 implementa CSRF protection automática para Server Actions.
**Recomendación:** Documentar en security runbook que la protección CSRF depende de Next.js versión.

### Gap 3 — Snooze de alertas sin implementar
**Severidad:** Informativa
**Descripción:** `AlertStatus` incluye `snoozed` pero no hay UI para activar snooze. El estado puede quedar en `snoozed` indefinidamente sin reactivación automática.
**Recomendación:** Implementar cron de reactivación en Phase 6.

### Gap 4 — Focus visible en CSS
**Severidad:** Baja (accesibilidad)
**Descripción:** Tailwind base styles pueden eliminar `outline` en algunos contextos, dificultando navegación por teclado para usuarios que no usan mouse.
**Recomendación:** Añadir `:focus-visible { outline: 2px solid #e53e3e; }` en globals.css.

---

## 8. Verificación de archivos sensibles en git

### Estado confirmado (2026-08-04)

```bash
# Verificado con git check-ignore -v:
.gitignore:9:.env.*.local           → apps/web/.env.test.local    ✅ IGNORADO
apps/web/e2e/.auth/.gitignore:2     → apps/web/e2e/.auth/user.json ✅ IGNORADO
apps/web/.gitignore:4               → apps/web/playwright-report/  ✅ IGNORADO
apps/web/.gitignore:5               → apps/web/test-results/       ✅ IGNORADO
```

Ningún secreto, token, credencial E2E ni estado de sesión Playwright está versionado.

```bash
# Sin credenciales reales en código fuente:
grep -rn "E2E_TEST_PASSWORD|service_role_key|anon_key" apps/web/src/ → (vacío) ✅
```

**Veredicto: ✅ PASS** — ningún archivo sensible en el repositorio.

---

## 9. Veredicto

**PASS — Sin vulnerabilidades críticas o altas en Phase 5.**

Todos los controles de seguridad del diseño original (`SECURITY_MODEL.md`, `PHASE_5C_SECURITY_REVIEW.md`) fueron implementados y verificados:
- ✅ Tenant isolation vía sesión del servidor
- ✅ Autorización por rol antes de toda mutación
- ✅ Ownership verification en use cases
- ✅ RLS activa en Supabase (no modificada)
- ✅ Sin secretos en código fuente ni en git
- ✅ Sin service_role en capas de UI/application
- ✅ Errores seguros sin filtración técnica
- ✅ organizationId nunca del cliente
- ✅ .env.test.local, user.json, playwright-report/ y test-results/ correctamente ignorados por git

4 gaps de severidad baja documentados como follow-ups para Phase 6.
