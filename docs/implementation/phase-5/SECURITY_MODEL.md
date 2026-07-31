# SECURITY MODEL — PHASE 5

## BopIAgency — Dashboard Principal

**Fecha:** 2026-07-31

---

## 1. PRINCIPIOS

1. **organizationId nunca viene del cliente** — siempre se lee de la sesión del servidor.
2. **Toda mutación pasa por Server Action** — nunca Route Handler para datos autenticados.
3. **Validación Zod en la capa de entrada** — antes de tocar el repositorio.
4. **RPCs para alertas** — `acknowledge_alert` y `resolve_alert` son SECURITY DEFINER en Supabase. No usar UPDATE directo.
5. **RLS como red de seguridad** — RLS rechaza cualquier fuga de datos cross-tenant incluso si la aplicación falla.

---

## 2. ROLES Y PERMISOS

### Roles definidos (Fase 2)

```
owner > admin > operator > member > viewer
```

### Mínimo requerido por operación Phase 5

| Operación               | Rol mínimo | Verificación                                          |
| ----------------------- | ---------- | ----------------------------------------------------- |
| Ver dashboard           | `member`   | RLS `is_organization_member`                          |
| Ver métricas            | `member`   | RLS `is_organization_member`                          |
| Ver alertas             | `member`   | RLS `is_organization_member`                          |
| Ver tareas              | `member`   | RLS `is_organization_member`                          |
| Acknowledge alerta      | `member`   | RPC verifica `is_organization_member`                 |
| Resolver alerta         | `operator` | RPC verifica `has_organization_role(..., 'operator')` |
| Cambiar estado de tarea | `operator` | RLS policy `tasks_update` + Server Action             |
| Crear tarea             | `operator` | RLS policy `tasks_insert` + Server Action             |

---

## 3. OBTENCIÓN DE organizationId

```typescript
// apps/web/src/lib/auth/server.ts — patrón existente
import { createServerClient } from '@/lib/supabase/server';

async function getActiveOrganizationId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthenticated');

  // Lee active_organization_id de user_profiles (servidor)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('active_organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.active_organization_id) throw redirect('/onboarding');
  return profile.active_organization_id;
}
```

> **NUNCA** leer `organizationId` de `searchParams`, `body`, o `cookies` del cliente.

---

## 4. SERVER ACTIONS — DISEÑO

### 4.1 `updateTaskStatus`

```typescript
// apps/web/src/app/(protected)/tasks/actions.ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';

const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled', 'blocked']),
});

export async function updateTaskStatusAction(input: unknown) {
  // 1. Validar input
  const parsed = updateTaskStatusSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos', code: 'VALIDATION_ERROR' };

  // 2. Obtener organizationId del servidor (nunca del cliente)
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado', code: 'UNAUTHENTICATED' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('active_organization_id')
    .eq('id', user.id)
    .single();
  if (!profile?.active_organization_id) return { error: 'Sin organización', code: 'NO_ORG' };

  const organizationId = profile.active_organization_id;

  // 3. UPDATE — RLS se encarga de validar rol operator+ y que la tarea pertenezca a la org
  const { error } = await supabase
    .from('tasks')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.taskId)
    .eq('organization_id', organizationId) // doble garantía
    .is('deleted_at', null);

  if (error) return { error: error.message, code: 'DB_ERROR' };

  // 4. Revalidar caché de la página
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  return { success: true };
}
```

### 4.2 `acknowledgeAlert`

```typescript
// apps/web/src/app/(protected)/alerts/actions.ts
'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase/server';

const alertActionSchema = z.object({
  alertId: z.string().uuid(),
});

export async function acknowledgeAlertAction(input: unknown) {
  const parsed = alertActionSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos', code: 'VALIDATION_ERROR' };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado', code: 'UNAUTHENTICATED' };

  // Usar RPC — la función verifica membership internamente (SECURITY DEFINER)
  // NO hacer UPDATE directo — el trigger protect_alerts_audit_fields lo bloquearía
  const { error } = await supabase.rpc('acknowledge_alert', {
    p_alert_id: parsed.data.alertId,
  });

  if (error) return { error: error.message, code: 'RPC_ERROR' };

  revalidatePath('/alerts');
  revalidatePath('/dashboard');
  return { success: true };
}
```

### 4.3 `resolveAlert`

```typescript
export async function resolveAlertAction(input: unknown) {
  const parsed = alertActionSchema.safeParse(input);
  if (!parsed.success) return { error: 'Datos inválidos', code: 'VALIDATION_ERROR' };

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado', code: 'UNAUTHENTICATED' };

  // RPC verifica has_organization_role(..., 'operator') internamente
  const { error } = await supabase.rpc('resolve_alert', {
    p_alert_id: parsed.data.alertId,
  });

  if (error) {
    // Posibles errores: alerta ya resuelta, sin permisos
    if (error.message.includes('sin permisos')) {
      return { error: 'Sin permisos para resolver alertas', code: 'FORBIDDEN' };
    }
    return { error: error.message, code: 'RPC_ERROR' };
  }

  revalidatePath('/alerts');
  revalidatePath('/dashboard');
  return { success: true };
}
```

---

## 5. RLS — COBERTURA PHASE 5

### client_metrics

| Operación | Política                | Condición                                                      |
| --------- | ----------------------- | -------------------------------------------------------------- |
| SELECT    | `client_metrics_select` | `is_organization_member(org_id)` AND cliente activo            |
| INSERT    | `client_metrics_insert` | `has_organization_role(org_id, 'operator')` AND cliente activo |
| UPDATE    | `client_metrics_update` | `has_organization_role(org_id, 'admin')` AND cliente activo    |

> Phase 5 solo usa SELECT en client_metrics. INSERT/UPDATE es trabajo de Fase 8 (Inngest sync).

### alerts

| Operación     | Política        | Condición                         |
| ------------- | --------------- | --------------------------------- |
| SELECT        | `alerts_select` | `is_organization_member(org_id)`  |
| UPDATE status | Via RPC         | RPC verifica role y activa bypass |

> **NUNCA** hacer UPDATE directo a `acknowledged_by/at` o `resolved_by/at` — el trigger `trg_alerts_70_audit_fields` lo bloquea.

### tasks

| Operación | Política       | Condición                                           |
| --------- | -------------- | --------------------------------------------------- |
| SELECT    | `tasks_select` | `is_organization_member(org_id)` AND cliente activo |
| INSERT    | `tasks_insert` | `has_organization_role(org_id, 'operator')`         |
| UPDATE    | `tasks_update` | `has_organization_role(org_id, 'operator')`         |

---

## 6. VALIDACIONES ZOD — SCHEMAS REQUERIDOS

```typescript
// packages/shared/src/schemas/task.schema.ts — CREAR
import { z } from 'zod';

export const taskStatusSchema = z.enum(['pending', 'in_progress', 'done', 'cancelled', 'blocked']);

export const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  status: taskStatusSchema,
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10000).optional(),
  status: taskStatusSchema.default('pending'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  dueDate: z.string().date().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).default([]),
});
```

```typescript
// packages/shared/src/schemas/alert.schema.ts — CREAR
import { z } from 'zod';

export const alertStatusSchema = z.enum(['active', 'acknowledged', 'snoozed', 'resolved']);

export const alertSeveritySchema = z.enum(['info', 'warning', 'critical']);

export const acknowledgeAlertSchema = z.object({
  alertId: z.string().uuid(),
});

export const resolveAlertSchema = z.object({
  alertId: z.string().uuid(),
});
```

---

## 7. PROTECCIÓN MULTI-TENANT — CHECKLIST

Para cada Server Action o consulta de servidor:

- [ ] `user` obtenido de `supabase.auth.getUser()` (no de cookies manualmente)
- [ ] `organizationId` leído de `user_profiles.active_organization_id` (no de body/params)
- [ ] `eq('organization_id', organizationId)` en todas las queries como doble barrera
- [ ] RLS activo en todas las tablas (verificado en migración)
- [ ] Input validado con Zod antes de cualquier operación
- [ ] `revalidatePath` llamado después de mutaciones exitosas
- [ ] Errores de DB nunca exponen detalles internos al cliente

---

## 8. AUDIT LOG

Por el momento no hay tabla dedicada de audit log para Phase 5. Los triggers de la DB registran:

- `tasks.updated_by` / `tasks.updated_at` en cada UPDATE
- `alerts.acknowledged_by/at` y `alerts.resolved_by/at` vía RPCs
- `tasks.created_by` en INSERT

En Fase futura: tabla `activity_log` con actor, acción, entity_id, timestamp.
