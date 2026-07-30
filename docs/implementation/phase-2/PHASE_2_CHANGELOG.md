# Phase 2 Changelog

All changes relative to Phase 1 closure (2026-07-29).

---

## [2026-07-30] Phase 2 — Authentication, Organizations & Multi-tenancy

### Added — apps/web

- `src/lib/supabase/types.ts` — Database type definitions for @supabase/supabase-js generic typing
- `src/lib/supabase/browser.ts` — `createBrowserSupabaseClient()` for Client Components
- `src/lib/supabase/server.ts` — `createServerSupabaseClient()` and `createAdminClient()`
- `src/lib/supabase/middleware.ts` — `createMiddlewareClient()` for Next.js middleware
- `src/lib/supabase/index.ts` — barrel exports
- `src/middleware.ts` — session refresh + route protection
- `src/lib/auth/schemas.ts` — Zod schemas for all auth operations
- `src/lib/auth/actions.ts` — Server Actions: signIn, signUp, signOut, requestPasswordReset, updatePassword, resendConfirmation
- `src/lib/auth/server.ts` — Server helpers: requireUser, requireOrganization, requireOrganizationRole, getCurrentMembership
- `src/app/(auth)/layout.tsx` — Auth layout (no AppShell, dark theme)
- `src/app/(auth)/login/page.tsx` — Login page
- `src/app/(auth)/signup/page.tsx` — Signup page
- `src/app/(auth)/forgot-password/page.tsx` — Password reset request page
- `src/app/(auth)/reset-password/page.tsx` — New password form
- `src/app/auth/callback/route.ts` — OAuth/magic-link code exchange
- `src/app/auth/confirm/route.ts` — OTP verification
- `src/app/access-denied/page.tsx` — Insufficient role page
- `src/app/onboarding/page.tsx` — Create first organization
- `src/app/onboarding/OnboardingForm.tsx` — Client form with slugify
- `src/app/settings/SettingsClient.tsx` — Client settings panels
- `src/lib/auth/__tests__/schemas.test.ts` — 12 auth schema tests
- `.env.example` — Environment variable template

### Modified — apps/web

- `src/app/settings/page.tsx` — Replaced UnderConstruction with real profile/org/prefs UI
- `src/app/layout.tsx` — Simplified root layout (providers only)
- `src/components/layout/Sidebar.tsx` — Added org selector, user display, sign-out
- `src/components/layout/AppShell.tsx` — Upgraded to async Server Component with Supabase data fetch
- `src/components/common/DemoBanner.tsx` — Added `_demo: true` annotation

### Added — packages/domain

- `src/entities/user-profile.ts` — UserProfile, UserPreferences entities
- `src/repositories/organization.repository.ts` — OrganizationRepository interface
- `src/repositories/user-profile.repository.ts` — UserProfileRepository interface
- `src/__tests__/organization.test.ts` — 12 domain helper tests

### Modified — packages/domain

- `src/entities/organization.ts` — Added OrganizationInvitation, organizationId(), hasMinimumRole(), canManageOrganization()
- `src/errors/domain.errors.ts` — Added 9 new error codes
- `src/index.ts` — Extended exports

### Added — packages/application

- `src/use-cases/organizations/create-organization.use-case.ts`
- `src/use-cases/organizations/get-organization.use-case.ts`
- `src/use-cases/organizations/list-organizations.use-case.ts`
- `src/use-cases/organizations/invite-member.use-case.ts`
- `src/use-cases/organizations/update-member-role.use-case.ts`
- `src/use-cases/profile/get-profile.use-case.ts`
- `src/use-cases/profile/update-profile.use-case.ts`
- `src/use-cases/profile/get-membership.use-case.ts`

### Modified — packages/application

- `src/index.ts` — Extended exports for new use cases

### Added — packages/infrastructure

- `src/supabase/mappers/organization.mapper.ts` — Row → entity mappers
- `src/supabase/mappers/user-profile.mapper.ts` — Row → entity mappers
- `src/supabase/supabase-organization.repository.ts` — Full OrganizationRepository implementation
- `src/supabase/supabase-user-profile.repository.ts` — Full UserProfileRepository implementation
- `src/supabase/mappers/__tests__/organization.mapper.test.ts` — 9 mapper tests
- `src/supabase/mappers/__tests__/user-profile.mapper.test.ts` — 6 mapper tests
- `vitest.config.ts` — Vitest configuration for infrastructure package

### Modified — packages/infrastructure

- `src/index.ts` — Extended exports

### Added — supabase/

- `config.toml` — Local development configuration
- `.gitignore` — Ignore .branches, .temp, .env
- `migrations/20260730000000_phase2_auth_and_tenancy.sql` — Full schema migration

### [2026-07-30] Post-closure — Alineación de esquema Supabase (columnas faltantes)

**Problema:** Dos columnas confirmadas como faltantes en Supabase tras aplicar la migración inicial:

1. `organization_members.status` — sin ella no se distinguen miembros activos de suspendidos/eliminados
2. `user_preferences.active_organization_id` — la lógica de onboarding y selector de org no podía almacenar/leer la org activa del lugar correcto

**Bug de flujo:** Un usuario recién registrado podía acceder a `/dashboard` sin pasar por `/onboarding` porque el middleware no verificaba la existencia de membresías activas.

**Migración correctiva creada:**
`supabase/migrations/20260730090000_phase2_schema_alignment.sql`

- Enum `membership_status`
- `organization_members.status` NOT NULL DEFAULT 'active' + backfill + índices
- `user_preferences.active_organization_id` FK nullable + backfill + trigger de integridad
- Funciones SQL actualizadas: `is_organization_member`, `has_organization_role`, `current_active_organization_id`, `create_organization_with_owner`
- Políticas RLS de `organization_members` recreadas con filtro de status

**Código actualizado:** 11 archivos (types.ts, server.ts, settings/actions.ts, AppShell.tsx, onboarding/page.tsx, domain entities, infrastructure mappers, repository)

**Tests añadidos:** `packages/application/src/__tests__/membership-status.test.ts` (16 tests)

**Instrucción manual:** Aplicar `20260730090000_phase2_schema_alignment.sql` en Supabase Dashboard antes de usar el sistema.

---

### [2026-07-30] Post-closure — Conexión de AppShell a rutas protegidas

**Bug:** AppShell, AppTopBar, OrganizationSwitcher y UserMenu existían pero ninguna ruta privada estaba envuelta por AppShell. El layout de cada página era solo el `RootLayout` global (sin sidebar, sin barra de navegación, sin controles de org/usuario).

**Causa raíz:** Las rutas privadas no tenían un layout intermedio que aplicara `AppShell`.

**Solución:**

1. Creado `apps/web/src/app/(protected)/layout.tsx` — renderiza `<AppShell>{children}</AppShell>`. El route group `(protected)` no altera las URLs.

2. Movidas las siguientes rutas dentro de `(protected)/`:
   - `dashboard/` → `(protected)/dashboard/`
   - `clients/` → `(protected)/clients/` (incluye `[clientId]/`)
   - `campaigns/` → `(protected)/campaigns/` (incluye `new/`)
   - `automations/` → `(protected)/automations/`
   - `reports/` → `(protected)/reports/`
   - `alerts/` → `(protected)/alerts/`
   - `tasks/` → `(protected)/tasks/`
   - `settings/` → `(protected)/settings/` (incluye `SettingsClient.tsx` y `actions.ts`)

3. Rutas **no movidas** (fuera del grupo protegido):
   - `(auth)/` — layout propio sin AppShell
   - `auth/callback/` y `auth/confirm/` — rutas públicas de Supabase
   - `access-denied/` — pública, sin sidebar
   - `onboarding/` — AppShell mismo redirige aquí si no hay orgs activas
   - `page.tsx` (raíz), `error.tsx`, `loading.tsx`, `not-found.tsx` — globales

4. Actualizados imports de `switchActiveOrganizationAction` en:
   - `OrganizationSwitcher.tsx` → `@/app/(protected)/settings/actions`
   - `Sidebar.tsx` → `@/app/(protected)/settings/actions`
   - `OrganizationSwitcher.test.tsx` → mock path actualizado

5. `tsconfig.json` — añadido `.next` a `exclude` para que `tsc --noEmit` no falle por stale types del build anterior (`.next/types/` se regenera en cada `next build`).

**Resultado:** TypeCheck ✅ — Lint ✅ — Tests: 32 en apps/web ✅ — Format ✅

**Verificación manual requerida:** `/dashboard`, `/settings` y otras rutas privadas ahora muestran AppShell (sidebar + AppTopBar con org/user). URLs sin cambios.

---

### [2026-07-30] Post-closure — Controles interactivos del encabezado

**Bugs corregidos:**

1. El botón "Seleccionar cliente" no ejecutaba ninguna acción → eliminado y reemplazado por `OrganizationSwitcher` con dropdown real
2. El avatar "U" no abría ningún menú → eliminado y reemplazado por `UserMenu` con dropdown real
3. No había acceso a cerrar sesión desde el encabezado → `UserMenu` incluye botón que llama `signOut`
4. Encabezado mostraba "cliente" en lugar de la organización activa → `OrganizationSwitcher` muestra el nombre real
5. Móvil sin controles de org ni usuario → `MobileNav` ahora renderiza ambos componentes

**Archivos nuevos:**

- `apps/web/src/components/layout/OrganizationSwitcher.tsx` — Client Component accesible: dropdown de orgs, llama `switchActiveOrganizationAction`, `router.refresh()`, cierra con Escape y clic fuera, aria-expanded / aria-haspopup
- `apps/web/src/components/layout/UserMenu.tsx` — Client Component accesible: dropdown de usuario, Configuración → /settings, Cerrar sesión → `signOut`, cierra con Escape y clic fuera, aria-expanded / aria-haspopup
- `apps/web/src/components/layout/AppTopBar.tsx` — Server Component thin wrapper; insertado por AppShell entre MobileNav y main; solo visible en escritorio (hidden lg:flex)
- `apps/web/src/__tests__/OrganizationSwitcher.test.tsx` — 9 tests
- `apps/web/src/__tests__/UserMenu.test.tsx` — 9 tests

**Archivos modificados:**

- `apps/web/src/components/layout/Header.tsx` — eliminados placeholders del lado derecho; solo breadcrumbs
- `apps/web/src/components/layout/AppShell.tsx` — añade `<AppTopBar>` al layout; pasa `activeOrganizationId` y `user` a `MobileNav`
- `apps/web/src/components/layout/MobileNav.tsx` — recibe props `organizations`, `activeOrganizationId`, `user`; renderiza `OrganizationSwitcher` + `UserMenu` en la barra superior móvil
- `apps/web/src/components/layout/index.ts` — exporta los nuevos componentes

**Resultado:** TypeCheck ✅ — Lint ✅ — Tests: 33 en apps/web (14 auth + 18 header + 1 common) ✅ — Format ✅

---

### [2026-07-30] Post-closure — Resolución de módulos internos en Vitest

**Problema:** `npm run test` fallaba en `packages/application` e `packages/infrastructure` con `Cannot find package '@bop-agency/shared'` y `Cannot find package '@bop-agency/domain'`. No era un error de lógica de negocio — era un problema de configuración de Vitest. Vite no lee `paths` de TypeScript; sin `resolve.alias` explícito no puede resolver paquetes internos del monorepo aunque los symlinks de npm workspaces sean correctos.

**Archivos modificados:**

- `packages/application/vitest.config.ts` — añadido `resolve.alias` para `@bop-agency/shared` y `@bop-agency/domain`
- `packages/infrastructure/vitest.config.ts` — añadido `resolve.alias` para `@bop-agency/domain` y `@bop-agency/shared`
- `packages/shared/package.json` — añadido campo `exports`
- `packages/domain/package.json` — añadido campo `exports`
- `packages/application/package.json` — añadido campo `exports`
- `packages/infrastructure/package.json` — añadido campo `exports`

**Resultado:** 40 tests aprobados en 6 archivos de prueba (shared: 8, domain: 20, application: 2, infrastructure: 10). TypeCheck, lint y build limpios.

---

### Bug Fixes

- `apps/web/package.json` — `"next"` corrected from `"^9.3.3"` → `"15.5.22"`
- `apps/web/package.json` — `"eslint-config-next"` corrected from `"^12.0.4"` → `"15.5.22"`
- `package.json` (root) — Removed erroneous `"dependencies": { "next": "9.3.3" }` block
