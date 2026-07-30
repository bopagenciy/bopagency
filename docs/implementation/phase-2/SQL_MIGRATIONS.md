# SQL Migrations — Phase 2

## Migraciones

| Archivo                                                          | Estado                      | Descripción                                                          |
| ---------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| `supabase/migrations/20260730000000_phase2_auth_and_tenancy.sql` | ✅ Aplicada                 | Migración inicial — tablas base, RLS, triggers, RPC                  |
| `supabase/migrations/20260730090000_phase2_schema_alignment.sql` | ⚠️ **Pendiente de aplicar** | Migración correctiva — columnas faltantes detectadas post-aplicación |

> **Para aplicar la migración correctiva:**
> Supabase Dashboard → SQL Editor → New query → pegar el contenido de `20260730090000_phase2_schema_alignment.sql` → Run.
> O via CLI: `supabase db push` (requiere supabase CLI v2 configurado con el proyecto remoto).

---

## Migración inicial

File: `supabase/migrations/20260730000000_phase2_auth_and_tenancy.sql`

## Tables

### profiles

| Column                  | Type          | Notes                       |
| ----------------------- | ------------- | --------------------------- |
| id                      | uuid PK       | References `auth.users(id)` |
| email                   | text NOT NULL | Copied from auth.users      |
| full_name               | text          | Nullable                    |
| avatar_url              | text          | Nullable                    |
| active_organization_id  | uuid          | FK → organizations(id)      |
| created_at / updated_at | timestamptz   | Auto-managed                |

### organizations

| Column                  | Type                 | Notes                         |
| ----------------------- | -------------------- | ----------------------------- |
| id                      | uuid PK              | gen_random_uuid()             |
| name                    | text NOT NULL        |                               |
| slug                    | text NOT NULL UNIQUE | URL identifier                |
| plan                    | text NOT NULL        | 'free' / 'pro' / 'enterprise' |
| settings                | jsonb                | Default `{}`                  |
| created_at / updated_at | timestamptz          |                               |

### organization_members

| Column          | Type                       | Notes                                                    |
| --------------- | -------------------------- | -------------------------------------------------------- |
| id              | uuid PK                    |                                                          |
| organization_id | uuid FK → organizations    | CASCADE DELETE                                           |
| user_id         | uuid FK → auth.users       | CASCADE DELETE                                           |
| role            | text NOT NULL              | 'owner' / 'admin' / 'strategist' / 'operator' / 'viewer' |
| status          | membership_status NOT NULL | ⚠️ Añadida en migración correctiva — DEFAULT 'active'    |
| invited_by      | uuid                       | Nullable FK → auth.users                                 |
| joined_at       | timestamptz                | Default NOW()                                            |
| UNIQUE          | (organization_id, user_id) | One membership per org                                   |

### organization_invitations

| Column          | Type                    | Notes                                            |
| --------------- | ----------------------- | ------------------------------------------------ |
| id              | uuid PK                 |                                                  |
| organization_id | uuid FK → organizations | CASCADE DELETE                                   |
| email           | text NOT NULL           |                                                  |
| role            | text NOT NULL           |                                                  |
| invited_by      | uuid FK → auth.users    |                                                  |
| token           | text NOT NULL UNIQUE    | Random identifier                                |
| status          | text NOT NULL           | 'pending' / 'accepted' / 'expired' / 'cancelled' |
| expires_at      | timestamptz             | Default NOW() + 7 days                           |
| accepted_at     | timestamptz             | Nullable                                         |
| created_at      | timestamptz             |                                                  |

### user_preferences

| Column                  | Type                        | Notes                                                              |
| ----------------------- | --------------------------- | ------------------------------------------------------------------ |
| id                      | uuid PK                     |                                                                    |
| user_id                 | uuid UNIQUE FK → auth.users | One per user                                                       |
| active_organization_id  | uuid FK → organizations     | ⚠️ Añadida en migración correctiva — ON DELETE SET NULL — Nullable |
| language                | text                        | Default 'es'                                                       |
| timezone                | text                        | Default 'America/Bogota'                                           |
| email_notifications     | boolean                     | Default true                                                       |
| created_at / updated_at | timestamptz                 |                                                                    |

---

## Trigger: handle_new_user()

Fires `AFTER INSERT ON auth.users` with SECURITY DEFINER. Creates:

1. A `profiles` row with `id = new.id`, `email = new.email`
2. A `user_preferences` row with `user_id = new.id`

---

## Authorization functions (all SECURITY DEFINER)

| Function                                  | Returns | Purpose                                                                  |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------ |
| `is_organization_member(org_id)`          | boolean | True si el usuario tiene membresía **activa** en la org                  |
| `has_organization_role(org_id, min_role)` | boolean | True si role ≥ min_role Y status = active                                |
| `current_active_organization_id()`        | uuid    | Returns `user_preferences.active_organization_id` (fuente de verdad)     |
| `can_manage_organization(org_id)`         | boolean | True si role es admin u owner Y status = active                          |
| `check_active_org_membership()`           | trigger | Impide asignar active_organization_id sin membresía activa en esa org    |
| `create_organization_with_owner()`        | uuid    | Crea org + member(status=active) + actualiza user_preferences y profiles |

Role hierarchy: `viewer(0) < operator(1) < strategist(2) < admin(3) < owner(4)`

---

## RLS policies summary

| Table                    | Policy                  | Who                                     |
| ------------------------ | ----------------------- | --------------------------------------- |
| profiles                 | select / update own row | auth.uid() = id                         |
| organizations            | select if member        | is_organization_member()                |
| organizations            | insert                  | any authenticated user (for onboarding) |
| organizations            | update if can_manage    | can_manage_organization()               |
| organization_members     | select if member        | is_organization_member()                |
| organization_members     | insert if can_manage    | can_manage_organization()               |
| organization_members     | delete if can_manage    | can_manage_organization()               |
| organization_invitations | select if member        | is_organization_member()                |
| organization_invitations | insert if can_manage    | can_manage_organization()               |
| organization_invitations | update own token        | email = current_user email              |
| user_preferences         | select / update own     | user_id = auth.uid()                    |

---

## How to apply

1. Open Supabase Dashboard → SQL Editor
2. Paste contents of `supabase/migrations/20260730000000_phase2_auth_and_tenancy.sql`
3. Click Run
4. Verify tables appear in Table Editor

Or via CLI (if supabase CLI is installed and linked):

```bash
supabase db push
```
