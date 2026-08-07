# Phase 6 — Staging Data Fixtures

> **Propósito:** Definir los datos mínimos de prueba para ejecutar el smoke test matrix de Phase 6.
> **Restricción:** NO insertar automáticamente. Revisar antes de aplicar. Solo en staging.
> **Fecha de preparación:** 2026-08-05

---

## Principios

- Todos los datos son identificables como staging (prefijo `staging-`)
- Ningún email real de clientes o usuarios
- Ningún dato productivo
- Limpiables con una sola query por organización
- No se mezclan con el dataset de producción (project ref diferente)

---

## Fixture 1 — Organización Staging

```sql
-- Insertar organización de staging
INSERT INTO public.organizations (
  id,
  name,
  slug,
  plan,
  created_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  'Staging Test Org',
  'staging-test-org',
  'pro',
  now()
)
ON CONFLICT (id) DO NOTHING;
```

---

## Fixture 2 — Usuario Owner

```sql
-- PASO 1: Crear usuario en Supabase Auth (via Dashboard o CLI)
-- Email: staging-owner@bopagency-test.invalid
-- Password: staging-only (no usar en producción)
-- Copiar el UUID generado por Supabase Auth → reemplazar <AUTH_USER_ID_OWNER>

-- PASO 2: Crear perfil de usuario
INSERT INTO public.users (
  id,
  email,
  full_name,
  created_at
) VALUES (
  '<AUTH_USER_ID_OWNER>',
  'staging-owner@bopagency-test.invalid',
  'Staging Owner User',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- PASO 3: Asignar membresía owner
INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  joined_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '<AUTH_USER_ID_OWNER>',
  'owner',
  now()
)
ON CONFLICT (organization_id, user_id) DO NOTHING;
```

---

## Fixture 3 — Usuario Operator

```sql
-- Email: staging-operator@bopagency-test.invalid
-- Crear en Auth primero → copiar UUID → <AUTH_USER_ID_OPERATOR>

INSERT INTO public.users (
  id,
  email,
  full_name,
  created_at
) VALUES (
  '<AUTH_USER_ID_OPERATOR>',
  'staging-operator@bopagency-test.invalid',
  'Staging Operator User',
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  joined_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '<AUTH_USER_ID_OPERATOR>',
  'operator',
  now()
)
ON CONFLICT (organization_id, user_id) DO NOTHING;
```

---

## Fixture 4 — Usuario Viewer

```sql
-- Email: staging-viewer@bopagency-test.invalid
-- Crear en Auth primero → <AUTH_USER_ID_VIEWER>

INSERT INTO public.users (
  id,
  email,
  full_name,
  created_at
) VALUES (
  '<AUTH_USER_ID_VIEWER>',
  'staging-viewer@bopagency-test.invalid',
  'Staging Viewer User',
  now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  joined_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '<AUTH_USER_ID_VIEWER>',
  'viewer',
  now()
)
ON CONFLICT (organization_id, user_id) DO NOTHING;
```

---

## Fixture 5 — Segunda Organización (para test de aislamiento — Case 20)

```sql
INSERT INTO public.organizations (
  id,
  name,
  slug,
  plan,
  created_at
) VALUES (
  '20000000-0000-0000-0000-000000000002',
  'Staging Test Org B',
  'staging-test-org-b',
  'pro',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Usuario exclusivo de Org B
-- Email: staging-orgb@bopagency-test.invalid → <AUTH_USER_ID_ORG_B>

INSERT INTO public.organization_members (
  organization_id,
  user_id,
  role,
  joined_at
) VALUES (
  '20000000-0000-0000-0000-000000000002',
  '<AUTH_USER_ID_ORG_B>',
  'owner',
  now()
)
ON CONFLICT (organization_id, user_id) DO NOTHING;
```

---

## Fixture 6 — Automation en estado `draft`

```sql
INSERT INTO public.automations (
  id,
  organization_id,
  name,
  description,
  status,
  n8n_workflow_id,
  trigger_config,
  retry_policy,
  metadata,
  is_manual_only,
  created_at
) VALUES (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Staging Draft Automation',
  'Automation de prueba en estado draft — staging only',
  'draft',
  NULL,
  '{"type": "manual"}',
  '{"maxAttempts": 3, "initialDelayMs": 1000, "backoffMultiplier": 2, "maxDelayMs": 30000}',
  '{"environment": "staging", "purpose": "smoke-test"}',
  true,
  now()
)
ON CONFLICT (id) DO NOTHING;
```

---

## Fixture 7 — Automation en estado `active`

```sql
INSERT INTO public.automations (
  id,
  organization_id,
  name,
  description,
  status,
  n8n_workflow_id,
  trigger_config,
  retry_policy,
  metadata,
  is_manual_only,
  created_at
) VALUES (
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'Staging Active Automation',
  'Automation de prueba en estado active — staging only',
  'active',
  'staging-test-workflow',  -- ID del workflow de prueba en n8n
  '{"type": "manual"}',
  '{"maxAttempts": 3, "initialDelayMs": 1000, "backoffMultiplier": 2, "maxDelayMs": 30000}',
  '{"environment": "staging", "purpose": "smoke-test"}',
  true,
  now()
)
ON CONFLICT (id) DO NOTHING;
```

> ⚠️ Actualizar `n8n_workflow_id` con el ID real del workflow después de importarlo en n8n staging.

---

## Fixture 8 — Execution en estado `failed` (para tests de retry)

```sql
INSERT INTO public.automation_executions (
  id,
  organization_id,
  automation_id,
  status,
  attempt,
  idempotency_key,
  triggered_by,
  trigger_type,
  error_code,
  error_message,
  queued_at,
  started_at,
  completed_at,
  created_at
) VALUES (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'failed',
  1,
  'staging:manual:2026-08-05:fixture-failed-1',
  'staging-owner',
  'manual',
  'STAGING_TEST_FAILURE',
  'Execution fallida intencional para tests de retry — staging only',
  now() - interval '10 minutes',
  now() - interval '9 minutes',
  now() - interval '8 minutes',
  now() - interval '10 minutes'
)
ON CONFLICT (id) DO NOTHING;

-- Log asociado a la execution fallida
INSERT INTO public.automation_execution_logs (
  organization_id,
  execution_id,
  level,
  event_type,
  message,
  occurred_at
) VALUES (
  '10000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'error',
  'status.transition',
  'Execution failed: STAGING_TEST_FAILURE — Execution fallida intencional para tests de retry',
  now() - interval '8 minutes'
);
```

---

## Fixture 9 — Execution en estado `failed` con max attempts (para Case 13)

```sql
INSERT INTO public.automation_executions (
  id,
  organization_id,
  automation_id,
  status,
  attempt,
  idempotency_key,
  triggered_by,
  trigger_type,
  error_code,
  error_message,
  queued_at,
  started_at,
  completed_at,
  created_at
) VALUES (
  '40000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  'failed',
  3,
  'staging:manual:2026-08-05:fixture-maxattempts',
  'staging-owner',
  'manual',
  'STAGING_MAX_ATTEMPTS',
  'Execution fallida en attempt 3 — max attempts alcanzados — staging only',
  now() - interval '30 minutes',
  now() - interval '29 minutes',
  now() - interval '28 minutes',
  now() - interval '30 minutes'
)
ON CONFLICT (id) DO NOTHING;
```

---

## Fixture 10 — Limpieza completa (post-test)

```sql
-- CLEANUP: Ejecutar en orden inverso de dependencias
-- Solo en staging — NUNCA en producción

-- 1. Logs
DELETE FROM public.automation_execution_logs
WHERE organization_id IN (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

-- 2. Webhook events
DELETE FROM public.automation_webhook_events
WHERE organization_id IN (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

-- 3. Executions
DELETE FROM public.automation_executions
WHERE organization_id IN (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

-- 4. Secrets metadata
DELETE FROM public.automation_secrets_metadata
WHERE organization_id IN (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

-- 5. Automations
DELETE FROM public.automations
WHERE organization_id IN (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

-- 6. Members
DELETE FROM public.organization_members
WHERE organization_id IN (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

-- 7. Organizations
DELETE FROM public.organizations
WHERE id IN (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

-- 8. Usuarios (Auth — eliminar desde Supabase Dashboard o CLI)
-- supabase auth admin delete-user <AUTH_USER_ID_OWNER>
-- supabase auth admin delete-user <AUTH_USER_ID_OPERATOR>
-- supabase auth admin delete-user <AUTH_USER_ID_VIEWER>
-- supabase auth admin delete-user <AUTH_USER_ID_ORG_B>
```

---

## Resumen de Fixtures

| Fixture | Tipo | UUID / Email | Propósito |
|---------|------|-------------|-----------|
| F1 | Organization | `1000...0001` | Org principal de staging |
| F2 | User (owner) | `staging-owner@bopagency-test.invalid` | Tests RLS owner |
| F3 | User (operator) | `staging-operator@bopagency-test.invalid` | Tests RLS operator |
| F4 | User (viewer) | `staging-viewer@bopagency-test.invalid` | Tests RLS viewer |
| F5 | Organization B | `2000...0002` | Tests aislamiento multi-tenant |
| F6 | Automation draft | `3000...0001` | Tests de estado draft |
| F7 | Automation active | `3000...0002` | Smoke tests dispatch |
| F8 | Execution failed | `4000...0001` | Tests de retry |
| F9 | Execution failed (max attempts) | `4000...0002` | Tests de max attempts |
| F10 | Cleanup | — | Limpiar post-test |

---

## Identificación como Staging

Para garantizar que los datos no se confunden con producción:

- Emails: dominio `@bopagency-test.invalid` (TLD inválido — no deliverable)
- Names: prefijo `Staging` o `staging-`
- Metadata: `{"environment": "staging"}`
- UUIDs: patrón `10000000-`, `20000000-`, `30000000-`, `40000000-`
- `n8n_workflow_id`: `staging-test-workflow`

---

*Fixtures preparados para Phase 6 Staging. NO insertar automáticamente. Revisar y aplicar manualmente.*
