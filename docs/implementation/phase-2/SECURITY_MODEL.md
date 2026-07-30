# Security Model — Phase 2

## Principles

1. **Never trust the client** — organization IDs and user roles are always re-validated server-side via RLS and SECURITY DEFINER functions. The client never supplies a value that gates access.
2. **Service role key isolation** — `SUPABASE_SERVICE_ROLE_KEY` is never prefixed with `NEXT_PUBLIC_`. It only appears in `createAdminClient()` which is only importable from server-side code.
3. **getUser() not getSession()** — `auth.getUser()` validates the JWT with Supabase servers; `auth.getSession()` only reads from the cookie (can be forged). The middleware and all server helpers use `getUser()`.
4. **Defense in depth** — middleware protects routes, server helpers provide function-level protection, RLS provides database-level protection. All three layers must be independently safe.

---

## Credential storage

| Credential       | Variable                        | Exposed to browser? | Where used                           |
| ---------------- | ------------------------------- | ------------------- | ------------------------------------ |
| Supabase URL     | `NEXT_PUBLIC_SUPABASE_URL`      | Yes                 | browser.ts, server.ts, middleware.ts |
| Anon key         | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes                 | browser.ts, server.ts, middleware.ts |
| Service role key | `SUPABASE_SERVICE_ROLE_KEY`     | **No**              | `createAdminClient()` only           |

The anon key is safe to expose — it is protected by RLS policies at the database level.

---

## RLS bootstrap problem

**Problem:** When a user first signs up, they have no organization membership yet. If `organizations` INSERT required membership, the onboarding flow would deadlock.

**Solution:** A dedicated INSERT policy allows any `auth.uid() IS NOT NULL` to insert into `organizations`. This creates no privilege escalation because:

- The trigger creates the profile but not the membership
- The onboarding page immediately inserts a membership row with role = 'owner'
- All subsequent reads/writes are gated by `is_organization_member()`

---

## SECURITY DEFINER functions

These PostgreSQL functions run with elevated (definer's) privileges to avoid infinite RLS recursion:

- `is_organization_member(org_id uuid)` — verifica `organization_members` filtrando por `status = 'active'`
- `has_organization_role(org_id uuid, min_role text)` — verifica rol Y `status = 'active'`
- `current_active_organization_id()` — lee `user_preferences.active_organization_id` (fuente de verdad; actualizado en migración correctiva, antes leía `profiles`)
- `can_manage_organization(org_id uuid)` — shortcut para role ≥ 'admin' con status activo
- `check_active_org_membership()` — trigger BEFORE INSERT/UPDATE sobre `user_preferences` que impide asignar `active_organization_id` a una org donde el usuario no tiene membresía activa

All functions are `SET search_path = public` to prevent search_path injection.

---

## Server helper protection layer

`apps/web/src/lib/auth/server.ts` provides:

- `requireUser()` — redirects to `/login` if no session
- `requireUserWithProfile()` — adds profile lookup
- `requireOrganization(orgId?)` — verifica membresía **activa** (`status = 'active'`); lee org activa desde `user_preferences`; redirige a `/onboarding` si no hay org activa, `/access-denied` si no es miembro
- `requireOrganizationRole(requiredRole, orgId?)` — verifies minimum role; redirects to `/access-denied` if insufficient
- `getCurrentMembership()` — returns null (no redirect) if no session; safe for optional auth contexts

---

## Invitation security

- Tokens are generated as random UUIDs (crypto-quality)
- Expiry enforced both in SQL (`expires_at < NOW()`) and in the infrastructure repository before accepting
- Status transitions: `pending → accepted` or `pending → cancelled` only
- The invitation email → accept endpoint verifies token + status + expiry atomically

---

## Data isolation invariants

- A user can only read organizations they are a member of (RLS: `is_organization_member()`)
- A user can only manage (update/delete members) if role ≥ 'admin' (RLS: `can_manage_organization()`)
- `user_preferences.active_organization_id` es la fuente de verdad para la organización activa. `profiles.active_organization_id` se mantiene sincronizado por la RPC para compatibilidad, pero el código lo lee desde `user_preferences`.
- `active_organization_id` nunca se usa como puerta de acceso a nivel de base de datos. Todos los checks de acceso usan registros reales de `organization_members` con `status = 'active'`.
- El trigger `check_active_org_membership` impide que un UPDATE directo de `user_preferences.active_organization_id` apunte a una org donde el usuario no tenga membresía activa.
- Solo membresías con `status = 'active'` conceden acceso. Las membresías `suspended`, `removed` o `invited` son invisibles para RLS y las funciones de autorización.
- Demo data in `placeholder-data.ts` carries `_demo: true` on every record and is never persisted to the database.
