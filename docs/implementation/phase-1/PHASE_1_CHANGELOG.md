# Changelog — Fase 1

Todos los cambios de la Fase 1 están documentados aquí.  
Formato: [Keep a Changelog](https://keepachangelog.com/es/1.0.0/)

---

## [1.1.0] — 2026-07-30 — Validación de seguridad

### Añadido

- `docs/implementation/phase-1/DEPENDENCY_SECURITY_REPORT.md` — análisis completo de las 17 vulnerabilidades iniciales detectadas por `npm audit`

### Cambiado

- `vitest` actualizado de `^2.1.9` a `^3.2.7` en todos los packages (9 package.json) — elimina CVE crítica GHSA-5xrq-8626-4rwp
- `package.json` raíz: añadido `overrides: { "sharp": "0.35.3" }` para mitigar GHSA-f88m-g3jw-g9cj
- `QUALITY_REPORT.md` actualizado a v2.0 con resultados post-auditoría
- `PHASE_1_SUMMARY.md` actualizado a v1.1.0

### Corregido

- `apps/web/src/__tests__/DemoBanner.test.tsx`: regex `/datos de demostración/i` → `/modo demo/i` (texto real del componente)
- 24 archivos reformateados con `prettier --write` (espaciado, trailing commas)

### Resultado de calidad

- Typecheck: ✅ 0 errores (8 packages + apps/web)
- Lint: ✅ 0 errores
- Tests: ✅ 16/16 passed (vitest 3.2.7)
- Format: ✅ clean
- Build: ⚠️ Sandbox limitation (SIGBUS en SWC nativo) — funcional en Windows
- npm audit: ✅ 0 críticas (de 1 → 0), 14 total restantes

---

## [1.0.0] — 2026-07-29

### Añadido

#### Monorepo raíz

- `package.json` raíz con `workspaces: ["apps/*", "packages/*"]`
- `tsconfig.base.json` con TypeScript 5.9.3 strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess
- `eslint.config.mjs` — ESLint 9 flat config con reglas TypeScript
- `prettier.config.mjs` — Prettier 3 (singleQuote, trailingComma: all, printWidth: 100)
- `.prettierignore` — excluye agency-dashboard, shared-data, backups, n8n-local

#### apps/web

- Next.js 15.5.22 con App Router, TypeScript strict, Tailwind CSS 3.4.19
- Puerto de desarrollo: 3200
- Layout: `AppShell` + `Sidebar` (desktop) + `MobileNav` (móvil) + `Header` con breadcrumbs
- Tema Bop Agency: `brand.500 = #ef4444` (rojo primario)
- Rutas: `/`, `/dashboard`, `/clients`, `/clients/[clientId]`, `/campaigns`, `/campaigns/new`, `/automations`, `/reports`, `/alerts`, `/tasks`, `/settings`
- Dashboard con StatCards, lista de clientes, campañas, alertas activas y automatizaciones
- `DemoBanner` — advertencia visual de datos de demostración
- `UnderConstruction` — componente para módulos en construcción con fase estimada
- `placeholder-data.ts` — datos de demostración con `_demo: true` y nombres ficticios
- Vitest 2.1.9 configurado con jsdom + @testing-library/react
- Test: `DemoBanner.test.tsx`

#### packages/shared

- `Result<T, E>` — Ok\<T\>, Err\<E\>, ok(), err(), isOk(), isErr(), mapResult()
- `AppError` — ErrorCode union (NOT_FOUND, UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR, CONFLICT, INTERNAL_ERROR, NOT_IMPLEMENTED, RATE_LIMITED)
- `PaginatedResult<T>` + `paginate()` con hasNextPage/hasPreviousPage
- `AD_PLATFORMS` — 14 plataformas publicitarias como const tuple
- Statuses: `TaskStatus`, `CampaignStatus`, `AlertSeverity`, `AlertStatus`, `UserRole`
- Utils: `formatDate`, `formatDateTime`, `formatRelative`, `getPeriodId`, `getWeekId`
- Utils: `getEnvVar`, `getOptionalEnvVar`, `isDevelopment`, `isProduction`, `isTest`
- Schemas Zod: `IdSchema`, `PaginationSchema`, `DateRangeSchema`, `SlugSchema`
- Test: `result.test.ts` (7 casos)

#### packages/ui

- `Button` — variants: primary, secondary, ghost, danger, outline; sizes: sm, md, lg; loading
- `Card`, `CardHeader`, `CardBody`
- `Badge` — variants: success, warning, error, info, neutral
- `Input`, `Textarea`, `Select` (con soporte de error y label)
- `Table<T>` — genérico con Column\[\] tipadas
- `EmptyState` — icono, título, descripción, acción
- `PageHeader` — título, descripción, breadcrumbs, acciones
- `StatCard` — métrica con tendencia y comparación
- `Skeleton`, `SkeletonCard`, `SkeletonList`
- `Alert` — variants: info, success, warning, error
- `Modal` — backdrop, título, footer con acciones
- `ResponsiveContainer` — padding adaptativo

#### packages/domain

- **Entidades (11):** Organization, User, Client, Campaign, Task, Alert, Report, Automation, Agent, Skill, Template
- **Repositorios (10):** ClientRepository, CampaignRepository, AlertRepository, ReportRepository, TaskRepository, MetricsRepository, AgentRepository, SkillRepository, TemplateRepository, AutomationRepository
- **Value objects (4):** Email, Money (con Currency), DateRange, Percentage
- **Errores de dominio:** clientNotFound, campaignNotFound, alertNotFound, reportNotFound, taskNotFound, agentNotFound, skillNotFound, templateNotFound, automationNotFound, metricsNotFound, clientSlugTaken, campaignInvalidStatus
- Test: `money.test.ts` (5 casos)

#### packages/application

- **Puertos:** `LoggerPort` (debug/info/warn/error), `EventBusPort` (publish)
- **Casos de uso (8):**
  - `listClients(input, deps)`
  - `getClient(input, deps)`
  - `listCampaigns(input, deps)`
  - `createCampaignDraft(input)` — stub NOT_IMPLEMENTED
  - `listAlerts(input, deps)`
  - `listTasks(input, deps)`
  - `listReports(input, deps)`
  - `listAutomations(input, deps)`
- Test: `list-clients.test.ts` (2 casos)

#### packages/infrastructure

- `ConsoleLogger` — implementa `LoggerPort` con output JSON estructurado
- `InMemoryClientRepository` — implementa `ClientRepository` para dev/test; incluye helper `seed()`

#### packages/ai-engine

- Contratos: `AIProvider`, `AIRequest`, `AIResponse`, `AIMessage`, `AIUsage`
- `AgentDefinition` — mapeo AgentType → system prompt + skills + maxTokens
- `SkillDefinition` — typed skill con buildRequest/parseOutput
- `PromptReference` + `renderPrompt()` — plantillas con interpolación de variables
- `TemplateDefinition` — por TemplateType

#### packages/automation-engine

- Contratos: `WorkflowDispatcher`, `DispatchOptions`
- `AutomationDefinition` — trigger (schedule/webhook/event) + plataformas
- `AutomationRun` + `AutomationRunStatus`
- `RetryPolicy` + `DEFAULT_RETRY_POLICY` + `computeDelay()`
- `IdempotencyKey` + `idempotencyKey()`

#### packages/integrations

- `AdvertisingPlatformProvider` — getAccountMetrics, getCampaigns
- `MetricsProvider` — getMetrics, syncMetrics
- `EmailProvider` — send
- `StorageProvider` — upload, getUrl, delete, list

#### Documentación (este directorio)

- `PHASE_1_SUMMARY.md`
- `MONOREPO_STRUCTURE.md`
- `DEVELOPMENT_GUIDE.md`
- `QUALITY_REPORT.md`
- `PHASE_1_CHANGELOG.md`

### Corregido

- TS-001: `Result<T>` discriminador `success` vs `ok` en casos de uso
- TS-002: `PaginatedResult` campos `hasNextPage`/`hasPreviousPage` faltantes
- TS-003: `process` en `env.ts` sin `@types/node`
- TS-004: `getClient` retornaba AppError en lugar de `err(AppError)`
- TS-005: Objeto `Client` de prueba sin campos `timezone` y `currency`

### No modificado (intencional)

- `agency-dashboard/`
- `shared-data/`
- `.agencia-ai/`
- `templates/`
- `backups/`
- `n8n-local/`
- `docs/audit/`
- `docs/security/`
- Workflows de n8n existentes
