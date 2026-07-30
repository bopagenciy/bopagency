# Phase 2 — Closure Document

**Phase:** 2 — Authentication, Organizations & Multi-tenancy
**Status:** ✅ CLOSED
**Closed:** 2026-07-30
**Implemented by:** Claude (Anthropic) — Cowork mode

---

## Verification checklist

### Authentication

- [x] Supabase @supabase/supabase-js and @supabase/ssr installed (NOT auth-helpers)
- [x] Browser client (createBrowserClient) for 'use client' components
- [x] Server client (createServerClient + cookies) for Server Components and Actions
- [x] Admin client (service_role key) — server-only, never NEXT_PUBLIC_
- [x] Middleware client for Next.js middleware
- [x] Middleware: session refresh on every request
- [x] Middleware: unauthenticated → redirect to /login with redirectTo param
- [x] Middleware: authenticated on auth route → redirect to /dashboard
- [x] Login page with server action
- [x] Signup page with server action
- [x] Forgot password page
- [x] Reset password page
- [x] /auth/callback route handler (code → session exchange)
- [x] /auth/confirm route handler (OTP verification)
- [x] /access-denied page
- [x] Zod validation on all auth inputs
- [x] getUser() used everywhere (not getSession())

### Database / SQL

- [x] profiles table + trigger auto-create on signup
- [x] organizations table with plan field
- [x] organization_members with 5 roles + unique constraint
- [x] organization_invitations with token + expiry
- [x] user_preferences table
- [x] updated_at triggers on 3 tables
- [x] SECURITY DEFINER functions: is_organization_member, has_organization_role, current_active_organization_id, can_manage_organization
- [x] RLS enabled on all 5 tables
- [x] GRANTS for authenticated role

### Domain package

- [x] Organization, OrganizationMember, OrganizationInvitation entities
- [x] UserProfile, UserPreferences entities
- [x] OrganizationRepository interface
- [x] UserProfileRepository interface
- [x] hasMinimumRole() and canManageOrganization() helpers
- [x] Extended domain errors

### Application package

- [x] createOrganization use case
- [x] getOrganization use case
- [x] listOrganizations use case
- [x] inviteMember use case
- [x] updateMemberRole use case
- [x] getProfile use case
- [x] updateProfile use case
- [x] getMembership use case

### Infrastructure package

- [x] SupabaseOrganizationRepository with all interface methods
- [x] SupabaseUserProfileRepository with all interface methods
- [x] rowToOrganization, rowToOrganizationMember, rowToOrganizationInvitation mappers
- [x] rowToUserProfile, rowToUserPreferences mappers
- [x] vitest.config.ts added

### UI / Pages

- [x] Onboarding page (create org → owner membership → active_org_id → /dashboard)
- [x] Organization selector in Sidebar with live switching
- [x] AppShell upgraded to async Server Component
- [x] Settings page: profile, org list, preferences
- [x] DemoBanner updated

### Demo data isolation

- [x] All placeholder records carry `_demo: true`
- [x] DemoBanner displays annotation in UI
- [x] No demo data persisted to Supabase

### Tests

- [x] Auth schema tests (14) — `apps/web`
- [x] Organization domain helper tests (15) + Money value-object tests (5) = 20 domain tests
- [x] Organization mapper tests (9) — incluye 3 tests de status
- [x] UserProfile mapper tests (5) — incluye 1 test de activeOrganizationId
- [x] listClients use-case tests (2) — `packages/application`
- [x] membership-status tests (16) — `packages/application`
- [x] OrganizationSwitcher tests (9) — `apps/web`
- [x] UserMenu tests (9) — `apps/web`
- [x] DemoBanner test (1) — `apps/web`
- [x] **Total validado: 60 tests en paquetes + 33 tests en apps/web = 93 tests en 11 archivos de prueba**

> **Nota (post-closure 2026-07-30 — módulos):** Los tests de `packages/application` e `packages/infrastructure` fallaban por resolución de módulos internos en Vitest. Corregido añadiendo `resolve.alias` en cada `vitest.config.ts` y campo `exports` en cada `package.json`. Ver `QUALITY_REPORT.md → Module resolution fix`.

> **Nota (post-closure 2026-07-30 — header):** Los controles del encabezado (selector org, menú usuario, cierre sesión) eran placeholders sin funcionalidad. Corregido con `OrganizationSwitcher`, `UserMenu`, `AppTopBar`, y actualización de `MobileNav`. Ver `QUALITY_REPORT.md → Header interactivo`.

### Documentation

- [x] PHASE_2_SUMMARY.md
- [x] AUTH_DESIGN.md
- [x] SQL_MIGRATIONS.md
- [x] SECURITY_MODEL.md
- [x] QUALITY_REPORT.md
- [x] PHASE_2_CHANGELOG.md
- [x] DEVELOPER_GUIDE.md
- [x] PHASE_2_CLOSURE.md

---

## Bug fixes included

| Bug                                              | Fix                                                      |
| ------------------------------------------------ | -------------------------------------------------------- |
| Next.js 9.3.3 accidentally installed             | apps/web/package.json: `"next": "15.5.22"`               |
| eslint-config-next 12.0.4 mismatch               | apps/web/package.json: `"eslint-config-next": "15.5.22"` |
| Root package.json had next 9.3.3 in dependencies | Removed erroneous dependencies block                     |

---

## Deferred to Phase 4+

- Supabase type codegen (`supabase gen types typescript`)
- `supabase/seed.sql` — demo seed data for local development
- Email template customization in Supabase Dashboard
- Member invitation UI (currently only backend use case exists)
- Integration tests (require real Supabase connection)
- E2E tests with Playwright

---

## Corrección post-closure: alineación de esquema (2026-07-30)

### Columnas faltantes confirmadas

| Tabla                  | Columna                  | Estado antes | Estado después                     |
| ---------------------- | ------------------------ | ------------ | ---------------------------------- |
| `organization_members` | `status`                 | ❌ Faltante  | ✅ Añadida en migración correctiva |
| `user_preferences`     | `active_organization_id` | ❌ Faltante  | ✅ Añadida en migración correctiva |

### Impacto

- **Onboarding:** Un usuario recién registrado podía acceder al dashboard sin completar el onboarding porque `active_organization_id` no existía en `user_preferences` y la lógica de detección leía de `profiles` (que sí tenía el campo pero sin garantía de estar sincronizado).
- **Selector de org:** No podía distinguir membresías activas de suspendidas/eliminadas porque no existía el campo `status`.
- **Seguridad:** Las funciones `is_organization_member` y `has_organization_role` no filtraban por status activo, lo que en principio habría concedido acceso a miembros suspendidos.

### Migración correctiva

`supabase/migrations/20260730090000_phase2_schema_alignment.sql`

**⚠️ ACCIÓN MANUAL REQUERIDA:** Aplicar esta migración en Supabase Dashboard antes de usar el sistema.

### Tests añadidos

`packages/application/src/__tests__/membership-status.test.ts` — 16 tests:

- MembershipStatus distingue acceso
- Selector solo lista orgs con membresía activa
- Autorización respeta status
- `active_organization_id` en `user_preferences` como fuente de verdad

### Resultado de validación

TypeCheck ✅ — Lint ✅ — Tests: 60 en 7 archivos ✅ — Build ✅ — Format ✅

---

## Manual actions required before first use

1. `npm install` (from project root on Windows)
2. `cp apps/web/.env.example apps/web/.env.local` and fill credentials
3. Execute SQL migration initial (`20260730000000_phase2_auth_and_tenancy.sql`) in Supabase Dashboard
4. **Execute corrective migration (`20260730090000_phase2_schema_alignment.sql`) in Supabase Dashboard** ← nueva acción requerida
5. Configure Auth Redirect URLs in Supabase Dashboard (site URL + redirect URLs)
6. Delete `apps/web/.babelrc`
7. After migrations: regenerate TypeScript types: `npx supabase gen types typescript --project-id <PROJECT_REF> --schema public > apps/web/src/lib/supabase/database.types.ts`

---

## Corrección post-closure: conexión de AppShell (2026-07-30)

### Problema

AppShell existía pero ninguna ruta privada estaba envuelta por él. Sin layout intermedio, las páginas se renderizaban sin sidebar, sin AppTopBar ni controles de org/usuario.

### Solución

Creado route group `(protected)` con `layout.tsx` que aplica `AppShell`. Todas las rutas privadas movidas dentro del grupo. URLs sin cambios.

### Rutas protegidas ahora envueltas por AppShell

`/dashboard`, `/clients`, `/campaigns`, `/automations`, `/reports`, `/alerts`, `/tasks`, `/settings`

### Rutas excluidas del grupo protegido

`/(auth)/` (login/signup), `/auth/callback`, `/auth/confirm`, `/access-denied`, `/onboarding`, `/` (root redirect)

### Resultado

TypeCheck ✅ — Lint ✅ — Tests ✅ — Format ✅

---

## Phase 3 readiness

Phase 3 (Campaigns, Clients, Real Data) can begin immediately after:

- Manual actions 1-4 above are complete
- `npm run dev` starts without error
- Auth flow tested manually (signup → onboarding → dashboard → settings)
- AppShell conectado y verificado manualmente:
  - `/dashboard` muestra nombre de organización activa en AppTopBar
  - Selector de organización abre y el cambio persiste al recargar
  - Avatar abre UserMenu
  - Configuración navega a `/settings`
  - Cerrar sesión redirige a `/login` y `/dashboard` vuelve a pedir autenticación
  - `/settings` también muestra AppShell con sidebar y controles
  - URLs sin cambios (route group transparente)
  - No hay headers duplicados (AppTopBar = org/user; Header por página = solo breadcrumbs)
  - Responsive funciona en móvil y escritorio
