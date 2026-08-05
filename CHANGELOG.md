# Changelog — BopIAgency

Historial de cambios del monorepo. Sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Phase 5] — 2026-08-04 — COMPLETE ✅

### Resumen

Phase 5 implementó el dashboard funcional completo de BopIAgency, conectando datos reales de Supabase a través de Clean Architecture (domain → application → infrastructure → UI). Todas las validaciones fueron completadas: unit tests, E2E tests en 3 viewports, build en Windows, TypeScript, lint y Prettier.

---

### Phase 5E — Validación, E2E y Cierre Formal

#### E2E Tests (Playwright)

- **Añadido** `apps/web/playwright.config.ts` con proyectos: `setup`, `chromium`, `mobile` (iPhone 14), `tablet` (iPad Mini)
- **Añadido** `apps/web/e2e/auth.setup.ts` — autenticación real con Supabase, storageState compartido
- **Añadido** `apps/web/e2e/helpers.ts` — `gotoProtected`, `waitForTableOrEmpty`, `assertNoTechnicalErrors`, `skipIfNoCredentials`
- **Añadido** `apps/web/e2e/dashboard.e2e.ts` — 8 tests (KPIs, accesos rápidos, sidebar responsive)
- **Añadido** `apps/web/e2e/alerts.e2e.ts` — 10 tests (tabla, filtros, badges, acknowledge/resolve)
- **Añadido** `apps/web/e2e/tasks.e2e.ts` — 10 tests (tabla, filtros, badges, cambio de estado)
- **Añadido** `apps/web/e2e/metrics.e2e.ts` — 8 tests (tabla, filtros, paginación, formato)
- **Añadido** `apps/web/e2e/responsive.e2e.ts` — 12 tests (3 tests × 4 rutas: sin scroll, heading, main único)
- **Añadido** `apps/web/e2e/accessibility.e2e.ts` — 11 tests (landmarks, headings, aria-labels, teclado, menú móvil)

**Resultado final:** 61 passed / 0 failed en chromium, mobile y tablet.

#### Correcciones HTML semántico

- **Corregido** `apps/web/src/app/(protected)/dashboard/page.tsx` — `<main>` → `<div>` (AppShell provee el único `<main>`); añadido `<h1 className="sr-only">Dashboard</h1>`
- **Corregido** `apps/web/src/app/(protected)/alerts/page.tsx` — `<main>` → `<div>`
- **Corregido** `apps/web/src/app/(protected)/tasks/page.tsx` — `<main>` → `<div>`
- **Corregido** `apps/web/src/app/(protected)/metrics/page.tsx` — `<main>` → `<div>`

**Causa:** doble landmark `<main>` en todas las páginas protegidas (AppShell + página), violando WCAG 2.1.

#### Correcciones E2E responsive

- **Corregido** test "sidebar tiene enlace al Dashboard" — viewport-aware: en desktop valida `<Sidebar>` directamente; en mobile/tablet abre botón `aria-label="Toggle navigation"` del `<MobileNav>` y valida el enlace en el drawer
- **Corregido** test "accesos rápidos navegan correctamente" — reemplaza `page.goBack()` por `gotoProtected()` con validación de heading por destino
- **Corregido** `gotoProtected` en helpers.ts — `waitUntil: 'domcontentloaded'` + espera de `<main>` visible (elimina timeouts por `networkidle` en tablet)
- **Añadido** test "botón de menú móvil tiene nombre accesible" — valida `aria-label="Toggle navigation"` en viewports < 1024px

#### Correcciones Vitest

- **Corregido** `alerts/__tests__/actions.test.ts` — migrado a `vi.hoisted()` para evitar `ReferenceError: Cannot access '...' before initialization` (vitest hoista `vi.mock()` sobre declaraciones `const`)
- **Corregido** `tasks/__tests__/actions.test.ts` — ídem
- **Corregido** `apps/web/src/__tests__/UserMenu.test.tsx` — añadido `vi.mock('next/link')` localizado con `e.preventDefault()` para eliminar warning jsdom "Not implemented: navigation"

**Resultado Vitest web:** 19 test files / 166 tests / 0 failed.

#### Configuración

- **Modificado** `apps/web/vitest.config.ts` — alias `@bop-agency/infrastructure` para resolución correcta en el workspace de apps/web
- **Modificado** `apps/web/package.json` — scripts `test:e2e`, `test:e2e:ui`; devDep `@playwright/test ^1.62.1`
- **Añadido** `apps/web/.gitignore` — entradas `e2e/.auth/user.json`, `playwright-report/`, `test-results/`
- **Añadido** `apps/web/e2e/.auth/.gitignore` — `user.json` ignorado

#### Documentación Phase 5E

- **Añadido** `docs/implementation/phase-5/PHASE_5E_E2E_REPORT.md`
- **Añadido** `docs/implementation/phase-5/PHASE_5_VISUAL_REVIEW.md`
- **Añadido** `docs/implementation/phase-5/PHASE_5_SECURITY_FINAL.md`
- **Añadido** `docs/implementation/phase-5/PHASE_5_CLOSURE.md`

---

### Phase 5D — UI Funcional

- **Añadido** 18 componentes UI: `EmptyState`, `RepositoryErrorState`, `Pagination`, `SummaryCard`, `AgencySummaryCards`, `ActiveAlertsSidebar`, `AlertSeverityBadge`, `AlertStatusBadge`, `AlertActions`, `AlertsFilters`, `AlertsTable`, `TaskStatusBadge`, `TaskPriorityBadge`, `TaskStatusAction`, `TasksFilters`, `TasksTable`, `MetricsFilters`, `MetricsTable`, `MetricsSummaryCards`
- **Implementado** Dashboard con KPIs reales (clientes, alertas activas, tareas pendientes, gasto mensual)
- **Implementado** `/alerts` — tabla paginada, filtros por estado/severidad, acciones acknowledge/resolve
- **Implementado** `/tasks` — tabla paginada, filtros por estado/overdue, cambio de estado inline
- **Implementado** `/metrics` — tabla paginada, filtros por plataforma/período, summary cards
- **Añadido** 93 unit tests para los 18 componentes

---

### Phase 5C — Server Actions y Autorización

- **Añadido** `acknowledgeAlertAction` — guard `requireOrganization()`, validación Zod UUID
- **Añadido** `resolveAlertAction` — guard `requireOrganizationRole('operator')`, validación Zod UUID
- **Añadido** `updateTaskStatusAction` — guard `requireOrganizationRole('operator')`, validación Zod UUID + TaskStatus enum
- **Implementado** patrón de autorización: organizationId siempre del JWT/sesión, nunca del cliente
- **Añadido** 34 unit tests para las 3 Server Actions

---

### Phase 5B — Repositorios Supabase

- **Añadido** `SupabaseMetricsRepository` — `listMetrics`, `getMetricsSummary`
- **Añadido** `SupabaseAlertRepository` — `findById`, `list`, `acknowledge`, `resolve`
- **Añadido** `SupabaseTaskRepository` — `findById`, `list`, `updateStatus`
- **Añadido** 128 tests de infraestructura (mocks de Supabase client, cobertura de branches)

---

### Phase 5A — Domain y Contratos

- **Añadido** entidades de dominio: `Metric`, `MetricSummary`, `MetricValues`, `Alert` (expandida), `Task` (expandida), `AgencyDashboardSummary`
- **Añadido** interfaces: `MetricsRepository`, `AlertRepository`, `TaskRepository`
- **Añadido** use cases: `getAgencyDashboardSummary`, `listAlerts`, `listTasks`, `listClientMetrics`, `acknowledgeAlert`, `resolveAlert`, `updateTaskStatus`
- **Añadido** 77 unit tests de application layer

---

## [Phase 4] — 2026-07-xx — COMPLETE ✅

Migraciones SQL y scripts de datos. 317 tests passing.

---

## [Phase 3] — 2026-07-xx — COMPLETE ✅

Autenticación, onboarding, layout base, rutas protegidas, AppShell, Sidebar, MobileNav, ClientRepository.
