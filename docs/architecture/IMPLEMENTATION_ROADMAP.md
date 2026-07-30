# IMPLEMENTATION ROADMAP
## BopIAgency — Hoja de Ruta de Implementación
**Fecha:** 2026-07-29  
**Estado:** Propuesta — pendiente de aprobación  
**Total de fases:** 13 (Fase 0 a Fase 12)

---

## RESUMEN EJECUTIVO

| Fase | Nombre | Prioridad | Duración estimada | Dependencias |
|------|--------|-----------|------------------|--------------|
| 0 | Saneamiento y Seguridad | 🔴 Crítica | 1-2 días | Ninguna |
| 1 | Setup del Monorepo | 🔴 Crítica | 2-3 días | Fase 0 |
| 2 | Autenticación y Multi-empresa | 🔴 Crítica | 3-5 días | Fase 1 |
| 3 | Gestión de Clientes | 🔴 Crítica | 4-6 días | Fase 2 |
| 4 | Migración de Datos | 🔴 Crítica | 3-5 días | Fase 3 |
| 5 | Dashboard Principal | 🟠 Alta | 5-7 días | Fase 4 |
| 6 | Motor de IA (Agentes y Skills) | 🟠 Alta | 5-7 días | Fase 3 |
| 7 | Campaign Studio | 🟠 Alta | 7-10 días | Fase 6 |
| 8 | Motor de Automatización | 🟠 Alta | 5-7 días | Fase 4 |
| 9 | Reportes | 🟡 Media | 4-6 días | Fase 8 |
| 10 | Integraciones Externas | 🟡 Media | 5-7 días | Fase 4 |
| 11 | Publicación de Campañas | 🟡 Media | 7-10 días | Fase 7 + 10 |
| 12 | Producción | 🔴 Crítica | 3-5 días | Todas |

**Duración total estimada:** 54-80 días de desarrollo efectivo (no incluye revisión ni QA)

---

## FASE 0 — SANEAMIENTO Y SEGURIDAD

**Objetivo:** Resolver riesgos de seguridad y deuda técnica crítica antes de cualquier implementación.

**Descripción:** Esta fase no toca código de aplicación. Se enfoca en asegurar el repositorio actual y documentar el estado inicial para poder volver atrás en cualquier momento.

**Tareas:**

| # | Tarea | Riesgo asociado | Evidencia |
|---|-------|----------------|-----------|
| 0.1 | Verificar si `n8n-local/.env` está en el historial de git | R-02 | `git log --all -- n8n-local/.env` |
| 0.2 | Si estuvo en git: rotar `N8N_ENCRYPTION_KEY` y todas las credenciales de n8n | R-02 | `n8n-local/.env` expuesto |
| 0.3 | Crear `.gitignore` en la raíz del repositorio | R-09 | No existe actualmente |
| 0.4 | Exportar Meta Access Token de n8n antes de cualquier cambio | R-01 | Credencial en vault de n8n |
| 0.5 | Confirmar Meta Account ID de magic-bungalow | R-10 | Sin confirmar en audit |
| 0.6 | Exportar backups JSON de W-05, W-06, W-07 desde n8n | W-05/06/07 sin backup | `automations-registry.json` |
| 0.7 | Decidir el rol de bop-soluciones (cliente activo vs. interno) | R-11 | No está en `clients-index.json` |
| 0.8 | Crear snapshot: `git tag v0-pre-migration` | Continuidad | — |

**Criterios de éxito:**
- `.gitignore` en raíz confirmado o creado
- `n8n-local/.env` no trackeable por git
- Meta tokens exportados y documentados de forma segura
- Tag git creado

**Archivos modificados/creados:** Solo `.gitignore` raíz y configuración de git. No se modifica código.

**Rollback:** No aplica — solo se agregan archivos de seguridad.

**No hacer en esta fase:** No instalar dependencias, no crear tablas, no tocar el dashboard.

---

## FASE 1 — SETUP DEL MONOREPO

**Objetivo:** Crear la estructura del monorepo Next.js con todas las herramientas de desarrollo configuradas.

**Descripción:** Se crea el nuevo proyecto Next.js dentro del repositorio existente. El dashboard actual (`agency-dashboard/`) sigue operativo en paralelo.

**Tareas:**

| # | Tarea | Tecnología |
|---|-------|-----------|
| 1.1 | Crear `apps/web/` con `create-next-app --typescript` | Next.js 14, TypeScript strict |
| 1.2 | Configurar `tsconfig.json` con `"strict": true` y path aliases | TypeScript |
| 1.3 | Configurar Tailwind CSS con tema personalizado de Bop Agency | Tailwind CSS |
| 1.4 | Instalar y configurar shadcn/ui (componentes base) | shadcn/ui |
| 1.5 | Configurar ESLint + Prettier con reglas del equipo | ESLint, Prettier |
| 1.6 | Configurar Vitest para tests unitarios | Vitest |
| 1.7 | Crear estructura de directorios base (`lib/domain/`, `lib/application/`, `lib/infrastructure/`, `lib/ai/`, `lib/schemas/`) | — |
| 1.8 | Crear `packages/shared/` con tipos base y utilidades | Monorepo |
| 1.9 | Configurar `package.json` workspace root | npm workspaces |
| 1.10 | Configurar variables de entorno base (`.env.local.example`) | Next.js |
| 1.11 | Setup Supabase local para desarrollo (`supabase init`) | Supabase CLI |
| 1.12 | Crear primera migración de schema en Supabase | Supabase |

**Criterios de éxito:**
- `npm run dev` en `apps/web/` funciona sin errores
- `npm run lint` pasa sin warnings
- `npm run test` ejecuta suite vacía sin errores
- Supabase local conectado

**Archivos creados:** `apps/web/`, `packages/shared/`, `package.json` (workspace root)

**No modificar:** `agency-dashboard/`, `shared-data/`, `.agencia-ai/`

---

## FASE 2 — AUTENTICACIÓN Y MULTI-EMPRESA

**Objetivo:** Implementar autenticación con Supabase Auth y el sistema multi-tenant base.

**Descripción:** La aplicación no es accesible sin autenticación. Se implementa el middleware, la página de login, y el schema de organizaciones con RLS.

**Tareas:**

| # | Tarea | Capa |
|---|-------|------|
| 2.1 | Crear tablas: `organizations`, `users`, `user_org_memberships` en Supabase | Infrastructure |
| 2.2 | Configurar RLS en las 3 tablas | Infrastructure |
| 2.3 | Implementar `middleware.ts` — protege rutas `(dashboard)` | Presentation |
| 2.4 | Crear `app/(auth)/login/page.tsx` con Supabase Auth UI | Presentation |
| 2.5 | Implementar `createServerClient` y `createBrowserClient` helpers | Infrastructure |
| 2.6 | Implementar `OrganizationRepository` (interfaz + adaptador Supabase) | Infrastructure |
| 2.7 | Crear Server Action: `createOrganization` | Application |
| 2.8 | Crear Server Action: `inviteUserToOrg` | Application |
| 2.9 | Crear helper `requireRole(userId, orgId, role)` | Application |
| 2.10 | Crear función auxiliar `get_my_org_ids()` en Supabase | Infrastructure |
| 2.11 | Implementar selector de organización activa en UI | Presentation |
| 2.12 | Crear `app/(dashboard)/layout.tsx` con sidebar base | Presentation |
| 2.13 | Tests unitarios: `requireRole`, `OrganizationRepository` | Tests |

**Criterios de éxito:**
- Login funciona con email/contraseña
- Rutas sin sesión redirigen a `/login`
- Un usuario puede crear una organización
- La organización aparece en el selector
- RLS verificado: usuario sin org no ve datos de otra org

**Interfaces implementadas:** `OrganizationRepository` (parcial)

---

## FASE 3 — GESTIÓN DE CLIENTES

**Objetivo:** CRUD completo de clientes con documentos, contactos e integraciones.

**Descripción:** La entidad central del sistema. Un cliente activo visible desde el dashboard, con todos sus documentos accesibles.

**Tareas:**

| # | Tarea | Capa |
|---|-------|------|
| 3.1 | Crear tablas: `clients`, `client_documents`, `client_contacts`, `client_integrations` | Infrastructure |
| 3.2 | Configurar RLS en las 4 tablas | Infrastructure |
| 3.3 | Implementar `ClientRepository` (interfaz + adaptador Supabase) | Infrastructure |
| 3.4 | Use case: `createClient` con validación Zod | Application |
| 3.5 | Use case: `updateClient` | Application |
| 3.6 | Use case: `softDeleteClient` | Application |
| 3.7 | Use case: `getClientWithDocuments` | Application |
| 3.8 | `app/(dashboard)/clients/page.tsx` — lista de clientes | Presentation |
| 3.9 | `app/(dashboard)/clients/new/page.tsx` — formulario nuevo cliente | Presentation |
| 3.10 | `app/(dashboard)/clients/[id]/page.tsx` — detalle del cliente | Presentation |
| 3.11 | `app/(dashboard)/clients/[id]/documents/[key]/page.tsx` — editor de documento | Presentation |
| 3.12 | Migrar tipos desde `agency-dashboard/src/types/index.ts` | Shared |
| 3.13 | Migrar schemas Zod de clientes desde `server/schemas.ts` | Shared |
| 3.14 | Tests unitarios: `ClientRepository`, use cases | Tests |

**Criterios de éxito:**
- Lista de clientes visible con filtros básicos (status, nombre)
- Se puede crear un cliente nuevo desde la UI
- Los documentos del cliente son editables
- RLS verificado: cliente de org A no visible para usuario de org B

**Interfaces implementadas:** `ClientRepository` (completo)

---

## FASE 4 — MIGRACIÓN DE DATOS

**Objetivo:** Importar todos los datos existentes de JSON/Markdown a Supabase.

**Descripción:** Scripts de migración (TypeScript) que leen los archivos actuales y los insertan en Supabase. Los scripts son idempotentes y pueden ejecutarse múltiples veces. Los archivos originales NO se eliminan.

**Tareas:**

| # | Tarea | Fuente | Destino |
|---|-------|--------|---------|
| 4.1 | Script: migrar `clients-index.json` | `shared-data/clients-index.json` | `clients` |
| 4.2 | Script: migrar documentos de clientes (Markdown) | `.agencia-ai/clients/*/` | `client_documents` |
| 4.3 | Script: migrar tareas de clientes | `.agencia-ai/clients/*/tasks.json` | `tasks` |
| 4.4 | Script: migrar `integrations.json` (normalizando ambos formatos) | `.agencia-ai/clients/*/integrations.json` | `client_integrations` |
| 4.5 | Script: migrar métricas históricas | `shared-data/metrics/clients/` | `client_metrics` |
| 4.6 | Script: migrar alertas | `shared-data/alerts/alert-state.json` | `alerts` |
| 4.7 | Script: migrar reportes | `shared-data/reports/clients/` | `reports` |
| 4.8 | Script: migrar destinatarios de reportes | `shared-data/reports/report-recipients.json` | `report_recipients` |
| 4.9 | Script: migrar agentes | `.agencia-ai/.claude/agents/*.md` | `agents` |
| 4.10 | Script: migrar skills | `.agencia-ai/.claude/skills/*/SKILL.md` | `skills` |
| 4.11 | Script: migrar plantillas | `.agencia-ai/templates/*.md` | `templates` |
| 4.12 | Script: migrar automations-registry | `shared-data/automations/automations-registry.json` | `automations` |
| 4.13 | Verificación de integridad: contar filas vs. fuentes originales | — | — |
| 4.14 | Cargar tokens de integraciones en Supabase Vault | `n8n-local/.env` / Meta Business Manager | `vault` |

**Criterios de éxito:**
- 3 clientes activos en Supabase (cliente-prueba, legalink-col, magic-bungalow)
- Documentos de todos los clientes importados
- Métricas históricas disponibles en Supabase
- 16 agentes importados
- 32 skills importadas
- 17 plantillas importadas
- Tokens de Meta en Vault (no en texto plano)

**Nota:** Los archivos originales se conservan en `shared-data/` y `.agencia-ai/` hasta la Fase 12.

---

## FASE 5 — DASHBOARD PRINCIPAL

**Objetivo:** Dashboard operativo con métricas, alertas, tareas y resumen de la agencia.

**Descripción:** La página principal que los usuarios ven al iniciar sesión. Migra la lógica de `SummaryPage.tsx`, `MetricsPage.tsx`, `AlertsPage.tsx`, `TasksPage.tsx`.

**Tareas:**

| # | Tarea | Origen |
|---|-------|--------|
| 5.1 | Implementar `MetricsRepository` (interfaz + Supabase) | Nuevo |
| 5.2 | Implementar `AlertRepository` (interfaz + Supabase) | Nuevo |
| 5.3 | Implementar `TaskRepository` (interfaz + Supabase) | Nuevo |
| 5.4 | `app/(dashboard)/page.tsx` — Agency Summary (Server Component) | `SummaryPage.tsx` |
| 5.5 | Componente: `ClientMetricsCard` — KPIs por cliente | `MetricsCharts.tsx` |
| 5.6 | `app/(dashboard)/metrics/page.tsx` — vista de métricas | `MetricsPage.tsx` |
| 5.7 | `app/(dashboard)/alerts/page.tsx` — panel de alertas | `AlertsPage.tsx` |
| 5.8 | `app/(dashboard)/tasks/page.tsx` — gestión de tareas | `TasksPage.tsx` |
| 5.9 | Server Action: `updateTaskStatus` con audit log | `taskMutationService.ts` |
| 5.10 | Server Action: `acknowledgeAlert` / `resolveAlert` | `alertStateService.ts` |
| 5.11 | Migrar schemas Zod de métricas desde `server/schemas/metricsSchemas.ts` | `lib/schemas/metrics.ts` |
| 5.12 | Migrar schemas Zod de alertas desde `server/schemas.ts` | `lib/schemas/alerts.ts` |
| 5.13 | Componentes Recharts para gráficas de métricas | `MetricsCharts.tsx` |
| 5.14 | Responsive: mobile-first en todas las páginas de esta fase | — |
| 5.15 | Tests E2E: flujo de ver métricas y resolver alerta | Playwright |

**Criterios de éxito:**
- Dashboard muestra los 3 clientes con sus métricas
- Alertas se pueden marcar como resueltas
- Tareas se pueden mover entre estados
- Responsive en móvil

**Interfaces implementadas:** `MetricsRepository`, `AlertRepository`, `TaskRepository`

---

## FASE 6 — MOTOR DE IA (AGENTES Y SKILLS)

**Objetivo:** Ejecutar agentes y skills de Claude API desde la UI web.

**Descripción:** La capacidad más importante del sistema — reemplaza el CLI de Claude Code con una interfaz web. Un usuario selecciona un agente, escribe una instrucción, y recibe la respuesta en tiempo real con streaming.

**Tareas:**

| # | Tarea | Capa |
|---|-------|------|
| 6.1 | Implementar `AgentRepository` (interfaz + Supabase) | Infrastructure |
| 6.2 | Implementar `SkillRepository` (interfaz + Supabase) | Infrastructure |
| 6.3 | Implementar `AIProvider` (interfaz + adaptador Claude API) | Infrastructure |
| 6.4 | Implementar `ContextBuilder` — carga documentos del cliente para construir el system prompt | AI Engine |
| 6.5 | Use case: `runAgent` con streaming | Application |
| 6.6 | Use case: `runSkill` | Application |
| 6.7 | Route Handler: `app/api/ai/run/route.ts` — SSE streaming | Presentation |
| 6.8 | `app/(dashboard)/ai/page.tsx` — interfaz de chat con agentes | Presentation |
| 6.9 | Componente: `AgentSelector` — lista de agentes disponibles por cliente | Presentation |
| 6.10 | Componente: `AIRunOutput` — display de respuesta en streaming | Presentation |
| 6.11 | Implementar tabla `ai_runs` en Supabase + Repository | Infrastructure |
| 6.12 | Use case: `getAIRunHistory` por cliente | Application |
| 6.13 | Tracking de tokens usados + costo estimado por run | Application |
| 6.14 | Tests: `ContextBuilder` con cliente mock | Vitest |

**Criterios de éxito:**
- Se puede seleccionar "Meta Ads Specialist" + cliente activo
- La instrucción se envía a Claude API
- La respuesta llega en streaming visible en la UI
- El run queda registrado en `ai_runs`

**Interfaces implementadas:** `AgentRepository`, `SkillRepository`, `AIProvider`

---

## FASE 7 — CAMPAIGN STUDIO

**Objetivo:** Crear campañas completas con IA, incluyendo copies, creativos y flujo de aprobación.

**Descripción:** Implementa el flujo de creación de campañas descrito en el flujo 10.1 de ARCHITECTURE.md. Incluye compliance review automático.

**Tareas:**

| # | Tarea | Capa |
|---|-------|------|
| 7.1 | Crear tablas: `campaigns`, `campaign_approvals`, `compliance_rules` | Infrastructure |
| 7.2 | Implementar `CampaignRepository` (interfaz + Supabase) | Infrastructure |
| 7.3 | Use case: `createCampaignWithAI` (agente + compliance) | Application |
| 7.4 | Use case: `approveCampaign` con audit trail | Application |
| 7.5 | Use case: `rejectCampaign` con nota | Application |
| 7.6 | `app/(dashboard)/campaigns/page.tsx` — lista por cliente | Presentation |
| 7.7 | `app/(dashboard)/campaigns/new/page.tsx` — wizard de creación | Presentation |
| 7.8 | `app/(dashboard)/campaigns/[id]/page.tsx` — detalle + aprobación | Presentation |
| 7.9 | Componente: `CampaignApprovalPanel` — UI para aprobar/rechazar | Presentation |
| 7.10 | Importar reglas de compliance desde `compliance-master-guide.md` a tabla | Infrastructure |
| 7.11 | Inngest function: `on-campaign-created` — dispara notificación de revisión | Automation |
| 7.12 | Tests E2E: flujo creación → aprobación | Playwright |

**Criterios de éxito:**
- Se puede crear una campaña para Meta Ads con IA
- El compliance reviewer valida la campaña automáticamente
- Un admin puede aprobar o rechazar
- El historial de aprobaciones es visible

**Interfaces implementadas:** `CampaignRepository`

---

## FASE 8 — MOTOR DE AUTOMATIZACIÓN (INNGEST)

**Objetivo:** Migrar todas las automatizaciones de n8n a funciones Inngest.

**Descripción:** Implementa las 5 funciones Inngest del plan de migración. n8n continúa operativo en paralelo hasta validar las nuevas funciones.

**Tareas:**

| # | Tarea | Workflow origen |
|---|-------|----------------|
| 8.1 | Setup Inngest: `@inngest/next`, `inngest/client.ts`, `app/api/inngest/route.ts` | — |
| 8.2 | Función: `syncMetaPlatformMetrics` (consolida W-02 y W-03) | W-02, W-03 |
| 8.3 | Función: `evaluateAlerts` — trigger on metrics.synced | Lógica de `alertsService.ts` |
| 8.4 | Función: `sendAlertNotifications` — trigger on alert.created | W-04 |
| 8.5 | Función: `generateMonthlyReports` — cron mensual | W-05 |
| 8.6 | Función: `generateWeeklyReports` — cron semanal | W-06 |
| 8.7 | Función: `sendReportEmails` — trigger on report.generated | W-07 |
| 8.8 | Implementar `WorkflowDispatcher` (interfaz + adaptador Inngest) | Infrastructure |
| 8.9 | Configurar Resend como proveedor de email | Infrastructure |
| 8.10 | Implementar `EmailProvider` (interfaz + adaptador Resend) | Infrastructure |
| 8.11 | `app/(dashboard)/automations/page.tsx` — estado de automatizaciones | Presentation |
| 8.12 | Validar en staging: ejecutar `syncMetaPlatformMetrics` para cliente-prueba | QA |
| 8.13 | Validar equivalencia: métricas vía Inngest == métricas actuales en shared-data | QA |
| 8.14 | Deshabilitar workflows n8n equivalentes (no eliminar) | Transición |

**Criterios de éxito:**
- Las métricas de Meta se sincronizan vía Inngest
- Las alertas se generan y se envían por email vía Resend
- Los reportes se generan y envían mensualmente
- Inngest Dashboard muestra ejecuciones con historial

**Interfaces implementadas:** `WorkflowDispatcher`, `EmailProvider`

---

## FASE 9 — REPORTES

**Objetivo:** Vista de reportes generados con historial de entregas.

**Descripción:** La interfaz de reportes — lista de reportes generados, detalle de cada reporte, historial de entregas y posibilidad de reenvío manual.

**Tareas:**

| # | Tarea | Capa |
|---|-------|------|
| 9.1 | Implementar `ReportRepository` (interfaz + Supabase) | Infrastructure |
| 9.2 | Crear tablas: `reports`, `report_recipients`, `report_deliveries` | Infrastructure |
| 9.3 | Migrar lógica de `reportService.ts` a use case `generateReport` | Application |
| 9.4 | `app/(dashboard)/reports/page.tsx` — lista de reportes | Presentation |
| 9.5 | `app/(dashboard)/reports/[id]/page.tsx` — detalle de reporte | Presentation |
| 9.6 | Server Action: `resendReport` — reenvío manual de un reporte | Application |
| 9.7 | Server Action: `addReportRecipient` | Application |
| 9.8 | Componente: `ReportDeliveryStatus` — estado de entregas por destinatario | Presentation |
| 9.9 | Configuración de destinatarios de reportes por cliente | Presentation |
| 9.10 | Tests unitarios: generación de reporte con datos de prueba | Vitest |

**Criterios de éxito:**
- Los reportes generados son visibles en la UI
- Se puede ver el estado de entrega por destinatario
- Se puede reenviar un reporte manualmente

**Interfaces implementadas:** `ReportRepository`

---

## FASE 10 — INTEGRACIONES EXTERNAS

**Objetivo:** Gestión de credenciales de plataformas externas con sincronización manual.

**Descripción:** Interfaz para conectar y gestionar las integraciones de cada cliente (Meta Ads, Google Ads, etc.) con almacenamiento seguro en Supabase Vault.

**Tareas:**

| # | Tarea | Capa |
|---|-------|------|
| 10.1 | Implementar `MetricsProvider` (interfaz + adaptador Meta API v25.0) | Infrastructure |
| 10.2 | Implementar `StorageProvider` (interfaz + adaptador Supabase Storage) | Infrastructure |
| 10.3 | Helper: `VaultClient` — leer/escribir secrets en Supabase Vault | Infrastructure |
| 10.4 | `app/(dashboard)/clients/[id]/integrations/page.tsx` | Presentation |
| 10.5 | Server Action: `connectMetaIntegration` — guarda access_token en Vault | Application |
| 10.6 | Server Action: `triggerManualMetricsSync` — dispara Inngest event | Application |
| 10.7 | Componente: `IntegrationCard` — estado de cada plataforma con badge de último sync | Presentation |
| 10.8 | Componente: `SyncStatusBadge` — muestra último sync y posibles errores | Presentation |
| 10.9 | `MetricsProvider` para Google Ads [Propuesto — puede diferirse a Fase 12] | Infrastructure |
| 10.10 | Tests de integración: `MetricsProvider` con API mock de Meta | Vitest |

**Criterios de éxito:**
- Se puede ver el estado de integración de cada cliente
- Se puede desencadenar una sincronización manual
- Los tokens están almacenados en Vault (verificar que no están en JSONB)

**Interfaces implementadas:** `MetricsProvider`, `StorageProvider`

---

## FASE 11 — PUBLICACIÓN DE CAMPAÑAS

**Objetivo:** Publicar campañas aprobadas en plataformas externas (Meta Ads).

**Descripción:** Extensión de Campaign Studio — las campañas aprobadas pueden publicarse directamente en la plataforma de advertising, con flujo de aprobación humana previo.

**Tareas:**

| # | Tarea | Capa |
|---|-------|------|
| 11.1 | Implementar `AdvertisingPlatformProvider` (interfaz + adaptador Meta Marketing API) | Infrastructure |
| 11.2 | Use case: `publishCampaignToMeta` con flujo de aprobación | Application |
| 11.3 | Inngest function: `publishCampaign` con `step.waitForEvent` (aprobación humana) | Automation |
| 11.4 | Componente: `PublishCampaignPanel` — UI para iniciar publicación | Presentation |
| 11.5 | Componente: `PublishConfirmationModal` — confirmación final antes de publicar | Presentation |
| 11.6 | Guardar `external_id` en `campaigns` tras publicación exitosa | Application |
| 11.7 | Sincronizar métricas de la campaña publicada | Application |
| 11.8 | Tests E2E: flujo aprobación → publicación (con API mock de Meta) | Playwright |

**Criterios de éxito:**
- Una campaña aprobada puede publicarse en Meta Ads
- El `external_id` se guarda en Supabase
- El flujo requiere confirmación humana antes de ejecutar

**Interfaces implementadas:** `AdvertisingPlatformProvider`

---

## FASE 12 — PRODUCCIÓN

**Objetivo:** Desplegar la aplicación en producción y apagar el sistema legado.

**Descripción:** Despliegue final, monitoreo, y archivado del sistema n8n + Express.

**Tareas:**

| # | Tarea | Tipo |
|---|-------|------|
| 12.1 | Setup de proyecto en Vercel (conectar repo, configurar env vars) | Deploy |
| 12.2 | Setup de Supabase en producción (separado del local) | Infrastructure |
| 12.3 | Configurar Inngest en producción (signing key, event key) | Infrastructure |
| 12.4 | Configurar Resend en producción (dominio verificado) | Infrastructure |
| 12.5 | Ejecutar tests E2E contra staging | QA |
| 12.6 | Importar datos de producción a Supabase producción | Data |
| 12.7 | Smoke tests en producción | QA |
| 12.8 | Monitoreo activo: 1 semana con n8n todavía operativo | Operaciones |
| 12.9 | Apagar workflows n8n en producción | Transición |
| 12.10 | Apagar servidor Docker de n8n | Transición |
| 12.11 | Mover `agency-dashboard/` a `legacy/agency-dashboard-v1/` | Archivado |
| 12.12 | Crear tag git: `v1.0.0-production` | Release |
| 12.13 | Documentar runbooks de operaciones | Documentación |

**Criterios de éxito:**
- La app está accesible en Vercel con dominio configurado
- Los 3 clientes activos tienen sus datos en producción
- Las automatizaciones Inngest están activas en producción
- n8n apagado sin pérdida de funcionalidad
- Monitoreo de Inngest Dashboard activo

---

## DEPENDENCIAS ENTRE FASES

```
Fase 0 (Seguridad)
    └── Fase 1 (Setup)
            └── Fase 2 (Auth)
                    └── Fase 3 (Clientes)
                            ├── Fase 4 (Migración de Datos)
                            │       ├── Fase 5 (Dashboard)
                            │       ├── Fase 8 (Automatización)
                            │       │       └── Fase 9 (Reportes)
                            │       └── Fase 10 (Integraciones)
                            └── Fase 6 (Motor IA)
                                    └── Fase 7 (Campaign Studio)
                                            └── Fase 11 (Publicación)
                                                    └── Fase 12 (Producción)
```

**Fases que pueden ejecutarse en paralelo:**
- Fases 5, 6, 8 pueden ejecutarse en paralelo tras completar Fase 4
- Fases 9, 10 pueden ejecutarse en paralelo tras completar Fase 8

---

## RIESGOS POR FASE

| Fase | Riesgo principal | Mitigación |
|------|-----------------|------------|
| 0 | N8N_ENCRYPTION_KEY en historial de git | Revisar git log antes de continuar |
| 1 | Conflicto de configuración TypeScript entre apps | `tsconfig.json` por app + shared config en `packages/config/` |
| 2 | RLS mal configurada permite ver datos de otras orgs | Tests de aislamiento por tenant como requisito de éxito |
| 4 | Pérdida de datos en migración | Los archivos originales NUNCA se eliminan hasta Fase 12 |
| 6 | Costo de Claude API en desarrollo | Usar modelos Haiku para tests, Sonnet solo en staging/prod |
| 8 | Equivalencia funcional difícil de verificar sin tests del sistema actual | Escribir "golden tests" contra Express API antes de migrar |
| 11 | Publicación accidental en Meta Ads | Entorno de prueba con cuenta sandbox de Meta obligatorio |
| 12 | Fallo de n8n durante el período de transición | n8n no se apaga hasta confirmar 1 semana de Inngest estable |

---

*Hoja de ruta — 2026-07-29. Propuesta pendiente de aprobación. Las duraciones son estimaciones — pueden variar según disponibilidad del equipo.*
