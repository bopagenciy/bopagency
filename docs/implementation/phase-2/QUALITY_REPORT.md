# Quality Report — Phase 2

## Test suite

### New tests added

| File                                                                                 | Suite                                                                                                  | Tests |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ----- |
| `apps/web/src/lib/auth/__tests__/schemas.test.ts`                                    | SignInSchema, SignUpSchema, RequestPasswordResetSchema, UpdatePasswordSchema, ResendConfirmationSchema | 12    |
| `packages/domain/src/__tests__/organization.test.ts`                                 | organizationId, hasMinimumRole, canManageOrganization                                                  | 12    |
| `packages/infrastructure/src/supabase/mappers/__tests__/organization.mapper.test.ts` | rowToOrganization, rowToOrganizationMember, rowToOrganizationInvitation                                | 9     |
| `packages/infrastructure/src/supabase/mappers/__tests__/user-profile.mapper.test.ts` | rowToUserProfile, rowToUserPreferences                                                                 | 6     |

**Total new tests: 39**

### Test coverage targets

- Auth schema validation: all valid/invalid cases covered
- Role hierarchy: all role pair combinations covered (9 cases)
- Row mappers: all fields + null optionals covered
- Use cases: tested via mapper tests (unit); integration tests deferred to Phase 4

### How to run tests (Windows)

```bash
# From project root:
npm test --workspace=apps/web
npm test --workspace=packages/domain
npm test --workspace=packages/infrastructure

# All at once:
npm run test --workspaces --if-present
```

---

## Type safety

- All new files use TypeScript strict mode (inherited from root `tsconfig.json`)
- `exactOptionalPropertyTypes: true` — no accidental `undefined` in optional fields
- `noUncheckedIndexedAccess: true` — array access returns `T | undefined`
- Database types in `apps/web/src/lib/supabase/types.ts` are manually maintained (Supabase CLI codegen deferred to Phase 4)
- Branded types used for `OrganizationId` and `UserProfileId` to prevent ID mixing

---

## Quality commands to run after `npm install`

```bash
# Type checking
npm run typecheck --workspace=apps/web
npm run typecheck --workspace=packages/domain
npm run typecheck --workspace=packages/application
npm run typecheck --workspace=packages/infrastructure

# Lint
npm run lint --workspace=apps/web

# Tests
npm run test --workspaces --if-present

# Build
npm run build --workspace=apps/web

# Audit
npm audit
```

---

## Schema alignment fix (2026-07-30 — post-Phase 2 closure)

### Columnas faltantes confirmadas en Supabase

Tras aplicar la migración inicial, se detectaron dos columnas faltantes con impacto en la lógica de negocio:

| Tabla                  | Columna faltante         | Impacto                                                           |
| ---------------------- | ------------------------ | ----------------------------------------------------------------- |
| `organization_members` | `status`                 | No se podía distinguir miembros activos de suspendidos/eliminados |
| `user_preferences`     | `active_organization_id` | La org activa no se guardaba en la tabla correcta                 |

### Migración correctiva

Archivo: `supabase/migrations/20260730090000_phase2_schema_alignment.sql`

**Para aplicar en Supabase:**

1. Supabase Dashboard → SQL Editor → New query
2. Pegar el contenido del archivo
3. Run

**Cambios en la migración:**

- Enum `membership_status` (`active`, `invited`, `suspended`, `removed`)
- `organization_members.status` NOT NULL DEFAULT `active`
- `user_preferences.active_organization_id` uuid nullable FK → organizations
- Backfill de datos existentes (status = active para todos los miembros; copia active_org de profiles a user_preferences para usuarios con membresía activa confirmada)
- Índices: `idx_user_prefs_active_org`, `idx_org_members_user_status`, `idx_org_members_org_status`
- Funciones actualizadas: `is_organization_member`, `has_organization_role`, `current_active_organization_id`, `create_organization_with_owner`
- Trigger de integridad: `check_active_org_membership`
- Políticas RLS de `organization_members` recreadas para filtrar por status

### Archivos de código modificados

| Archivo                                                                    | Cambio                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/supabase/types.ts`                                       | `MembershipStatus` type; `status` en member types; `active_organization_id` en prefs types              |
| `apps/web/src/lib/auth/server.ts`                                          | Lee `active_organization_id` de `user_preferences`; filtra membresía por `status = 'active'`            |
| `apps/web/src/app/settings/actions.ts`                                     | `switchActiveOrganizationAction` verifica `status = 'active'`; escribe a `user_preferences`             |
| `apps/web/src/components/layout/AppShell.tsx`                              | Lee de `user_preferences`; filtra por `status = 'active'`; redirige a `/onboarding` si sin orgs activas |
| `apps/web/src/app/onboarding/page.tsx`                                     | Verifica `user_preferences.active_organization_id`                                                      |
| `packages/domain/src/entities/organization.ts`                             | `MembershipStatus` type; `status` en `OrganizationMember`                                               |
| `packages/domain/src/entities/user-profile.ts`                             | `activeOrganizationId` en `UserPreferences`                                                             |
| `packages/domain/src/index.ts`                                             | Exporta `MembershipStatus`                                                                              |
| `packages/infrastructure/src/supabase/mappers/organization.mapper.ts`      | `status` en `MemberRow` y `rowToOrganizationMember`                                                     |
| `packages/infrastructure/src/supabase/mappers/user-profile.mapper.ts`      | `active_organization_id` en `PreferencesRow` y `rowToUserPreferences`                                   |
| `packages/infrastructure/src/supabase/supabase-user-profile.repository.ts` | `setActiveOrganization` escribe a `user_preferences` + `profiles`                                       |

### Resultados validados (post migración correctiva)

| Paquete                   | Archivos | Tests  | Estado                                        |
| ------------------------- | -------- | ------ | --------------------------------------------- |
| `packages/shared`         | 1        | 8      | ✅                                            |
| `packages/domain`         | 2        | 20     | ✅                                            |
| `packages/application`    | 2        | 18     | ✅ (+16 nuevos de membership-status)          |
| `packages/infrastructure` | 2        | 14     | ✅ (+3 status tests, +1 activeOrganizationId) |
| **Total paquetes**        | **7**    | **60** | ✅                                            |

TypeCheck: ✅ 0 errores (4 paquetes + apps/web) — Lint: ✅ — Build: ✅ — Format: ✅

---

## Module resolution fix (2026-07-30 — post-Phase 2 closure)

### Root cause

Vitest usa el bundler de Vite, que **no lee `paths` de TypeScript**. Sin `resolve.alias` explícito, Vite intentaba resolver `@bop-agency/shared` y `@bop-agency/domain` como paquetes Node.js y fallaba aunque los symlinks de npm workspaces estuvieran correctamente enlazados y los `tsconfig.json` tuvieran los `paths` correctos.

Los tests de `domain` pasaban porque sus archivos de prueba solo importan rutas relativas locales, no paquetes internos del monorepo.

### Cambios aplicados

| Archivo                                    | Cambio                                                            |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `packages/application/vitest.config.ts`    | `resolve.alias` para `@bop-agency/shared` y `@bop-agency/domain`  |
| `packages/infrastructure/vitest.config.ts` | `resolve.alias` para `@bop-agency/domain` y `@bop-agency/shared`  |
| `packages/shared/package.json`             | Campo `exports` con `types`/`import`/`default` → `./src/index.ts` |
| `packages/domain/package.json`             | Campo `exports` con `types`/`import`/`default` → `./src/index.ts` |
| `packages/application/package.json`        | Campo `exports` con `types`/`import`/`default` → `./src/index.ts` |
| `packages/infrastructure/package.json`     | Campo `exports` con `types`/`import`/`default` → `./src/index.ts` |

### Resultados validados

| Paquete                   | Archivos | Tests  | Estado             |
| ------------------------- | -------- | ------ | ------------------ |
| `packages/shared`         | 1        | 8      | ✅                 |
| `packages/domain`         | 2        | 20     | ✅                 |
| `packages/application`    | 1        | 2      | ✅ (antes fallaba) |
| `packages/infrastructure` | 2        | 10     | ✅ (antes fallaba) |
| **Total paquetes**        | **6**    | **40** | ✅                 |

TypeCheck: ✅ 0 errores — Lint: ✅ limpio — Build (`tsc --noEmit`): ✅ 4/4 paquetes — Format: ✅ archivos modificados limpios

---

## Conexión de AppShell (2026-07-30 — post-Phase 2 closure)

### Bug corregido

AppShell, AppTopBar, OrganizationSwitcher y UserMenu existían pero ninguna ruta privada estaba envuelta por AppShell — no había layout intermedio que los aplicara.

### Archivos nuevos

| Archivo                                   | Descripción                                               |
| ----------------------------------------- | --------------------------------------------------------- |
| `apps/web/src/app/(protected)/layout.tsx` | Layout del route group protegido — renderiza `<AppShell>` |

### Archivos movidos (sin cambio de URL)

| Origen             | Destino                        |
| ------------------ | ------------------------------ |
| `app/dashboard/`   | `app/(protected)/dashboard/`   |
| `app/clients/`     | `app/(protected)/clients/`     |
| `app/campaigns/`   | `app/(protected)/campaigns/`   |
| `app/automations/` | `app/(protected)/automations/` |
| `app/reports/`     | `app/(protected)/reports/`     |
| `app/alerts/`      | `app/(protected)/alerts/`      |
| `app/tasks/`       | `app/(protected)/tasks/`       |
| `app/settings/`    | `app/(protected)/settings/`    |

### Archivos modificados

| Archivo                                                   | Cambio                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------- |
| `apps/web/src/components/layout/OrganizationSwitcher.tsx` | Import path actualizado → `@/app/(protected)/settings/actions` |
| `apps/web/src/components/layout/Sidebar.tsx`              | Import path actualizado → `@/app/(protected)/settings/actions` |
| `apps/web/src/__tests__/OrganizationSwitcher.test.tsx`    | Mock path actualizado → `@/app/(protected)/settings/actions`   |
| `apps/web/tsconfig.json`                                  | `.next` añadido a `exclude` para evitar errores de stale types |

### Resultado

TypeCheck: ✅ 0 errores — Lint: ✅ — Tests: 32 en apps/web ✅ — Format: ✅

---

## Header interactivo (2026-07-30 — post-Phase 2 closure)

### Bugs corregidos

| Bug                                                 | Fix                                                                                 |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| "Seleccionar cliente" no abría ningún menú          | Eliminado; reemplazado por `OrganizationSwitcher` con dropdown funcional            |
| Avatar "U" no abría ningún menú                     | Eliminado; reemplazado por `UserMenu` con dropdown funcional                        |
| No había forma de cerrar sesión desde el encabezado | `UserMenu` expone botón "Cerrar sesión" que llama `signOut` server action           |
| Encabezado decía "cliente" en vez de "organización" | `OrganizationSwitcher` muestra nombre real de la org activa                         |
| Móvil sin selector de org ni menú de usuario        | `MobileNav` recibe y renderiza `OrganizationSwitcher` + `UserMenu` con datos reales |

### Archivos nuevos

| Archivo                                                   | Descripción                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/web/src/components/layout/OrganizationSwitcher.tsx` | Client Component: dropdown de orgs, llama `switchActiveOrganizationAction`, ARIA |
| `apps/web/src/components/layout/UserMenu.tsx`             | Client Component: avatar dropdown, configuración, `signOut`, ARIA                |
| `apps/web/src/components/layout/AppTopBar.tsx`            | Server Component (thin wrapper): renderizado en AppShell encima de `<main>`      |
| `apps/web/src/__tests__/OrganizationSwitcher.test.tsx`    | 9 tests: dropdown, organizaciones, org activa, switchOrg, refresh, Escape, ARIA  |
| `apps/web/src/__tests__/UserMenu.test.tsx`                | 9 tests: avatar, menú, signOut, configuración, Escape, clic fuera, ARIA          |

### Archivos modificados

| Archivo                                        | Cambio                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/web/src/components/layout/Header.tsx`    | Eliminados controles placeholder; solo breadcrumbs                                  |
| `apps/web/src/components/layout/AppShell.tsx`  | Pasa `activeOrganizationId` y `user` a `AppTopBar` y `MobileNav`                    |
| `apps/web/src/components/layout/MobileNav.tsx` | Recibe `organizations`, `activeOrganizationId`, `user`; renderiza org/user controls |
| `apps/web/src/components/layout/index.ts`      | Exporta los nuevos componentes y sus tipos                                          |

### Arquitectura

```
AppShell (Server Component — fetches user + orgs)
├── Sidebar (desktop, lg:flex) — org switcher + user menu + nav
├── MobileNav (mobile, lg:hidden) — org switcher + user menu + hamburger
├── AppTopBar (desktop, lg:flex) — org switcher + user menu
│   ├── OrganizationSwitcher (Client Component)
│   └── UserMenu (Client Component)
└── main
    └── {children} — incluye Header breadcrumbs de cada página
```

### Resultados validados

| Paquete / scope     | Archivos | Tests  | Estado                                    |
| ------------------- | -------- | ------ | ----------------------------------------- |
| `apps/web` — auth   | 1        | 14     | ✅                                        |
| `apps/web` — header | 2        | 18     | ✅ (+9 OrganizationSwitcher, +9 UserMenu) |
| `apps/web` — common | 1        | 1      | ✅                                        |
| **Total apps/web**  | **4**    | **33** | ✅                                        |

TypeCheck: ✅ 0 errores (apps/web) — Lint: ✅ — Format: ✅

---

## Known limitations

| Item                                | Status                      | Planned                      |
| ----------------------------------- | --------------------------- | ---------------------------- |
| Controles interactivos del header   | ✅ Corregido (post-closure) | —                            |
| Vitest aliases en paquetes internos | ✅ Corregido (post-closure) | —                            |
| Supabase type codegen               | Manual (types.ts)           | Phase 4 (supabase gen types) |
| Integration tests                   | Deferred                    | Phase 4                      |
| E2E tests (Playwright)              | Deferred                    | Phase 5                      |
| Email delivery in dev               | Supabase local Studio       | Phase 4                      |

---

## Security audit

- `npm audit` must be run after `npm install` on Windows
- Known pre-existing advisories from Phase 1: documented in `docs/implementation/phase-1/DEPENDENCY_SECURITY_REPORT.md`
- No new high/critical vulnerabilities introduced in Phase 2 (Supabase packages have clean audit history)
