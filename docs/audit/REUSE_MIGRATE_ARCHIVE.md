# REUSE / MIGRATE / ARCHIVE
## BopIAgency — Clasificación de Elementos para Migración
**Fecha:** 2026-07-29

---

## CRITERIOS DE CLASIFICACIÓN

| Categoría | Criterio |
|-----------|---------|
| ✅ **REUTILIZAR** | Código o contenido que puede copiarse o adaptarse directamente al nuevo stack con cambios mínimos |
| 🔄 **MIGRAR** | Lógica que debe reimplementarse en el nuevo stack, preservando el comportamiento pero cambiando la tecnología |
| 📦 **ARCHIVAR** | Código, archivos o configuraciones que ya no tendrán uso en la nueva app, pero que se preservan como referencia |
| 🗑️ **ELIMINAR** | Archivos sin valor que pueden borrarse para limpiar el repositorio |

---

## 1. SISTEMA AI (.agencia-ai/)

### ✅ REUTILIZAR DIRECTAMENTE

| Elemento | Motivo |
|---------|--------|
| `CLAUDE.md` — Reglas operativas | Se convierte en el system prompt base de la Claude API. Copiar verbatim. |
| `compliance-master-guide.md` | Se inyecta en el agente Compliance Reviewer. Contenido permanente. |
| `client-context-protocol.md` | Se implementa como middleware de Next.js + RLS en Supabase. Lógica preservada. |
| Los 16 archivos de agentes (`.claude/agents/*.md`) | Se convierten en registros en una tabla `agents` de Supabase. El contenido de cada archivo es el `system_prompt`. |
| Las 30 skills de instrucciones (`.claude/skills/*/SKILL.md`) | Se convierten en registros en tabla `skills`. El contenido es el prompt del skill. |
| Las 19 plantillas (`.agencia-ai/templates/*.md`) | Se convierten en registros en tabla `templates`. Contenido reutilizable. |
| Los 26 comandos (`.claude/commands/*.md`) | Se mapean a Server Actions en Next.js. El contenido define el comportamiento. |
| Los 8 workflows (`.claude/workflows/*.md`) | Se convierten en Inngest functions con steps. El contenido define la secuencia. |
| `AGENCY-OPERATING-SYSTEM.md` | Documentación de referencia — mover a `docs/reference/`. |

### 🔄 MIGRAR (reimplementar)

| Elemento | Reimplementación |
|---------|-----------------|
| `skill new-client` (ejecutable) | Server Action + Supabase insert + triggers de Inngest |
| `skill add-task` (ejecutable) | Server Action + Supabase insert en tabla `tasks` |
| Los brand profiles de clientes (Markdown) | Migrar contenido a tabla `client_documents` en Supabase |
| Los `tasks.json` de clientes | Migrar registros a tabla `tasks` en Supabase |
| Los `client.json` de clientes | Migrar a tabla `clients` en Supabase |
| Los `integrations.json` de clientes | Migrar (normalizados) a tabla `client_integrations` |

### 📦 ARCHIVAR

| Elemento | Motivo |
|---------|--------|
| `.agencia-ai/clients/bop-soluciones/` | No está en shared-data. Archivar hasta decisión sobre este cliente. |
| `.agencia-ai/clients/the-industrial-depot/` | Sin integración en shared-data. Archivar o migrar manualmente. |
| `.agencia-ai/campaigns/bop-soluciones/meta-ads-junio-2026.md` | Campaña histórica. Archivar en `docs/archive/campaigns/`. |

### 🗑️ ELIMINAR

| Elemento | Motivo |
|---------|--------|
| `.agencia-ai/assets/` (vacío) | Directorio vacío sin propósito actual |
| `.agencia-ai/automations/` (vacío) | Las automatizaciones vivirán en Inngest |
| `.agencia-ai/proposals/` (vacío) | Las propuestas se generarán y guardarán en Supabase |
| `.agencia-ai/references/` (vacío) | Las referencias están en `.claude/references/` |
| `.agencia-ai/reports/` (vacío) | Los reportes vivirán en Supabase |
| `.agencia-ai/.claude/hooks/` (vacío) | Sin hooks definidos |
| `.agencia-ai/.claude/templates/` (vacío — alias) | Duplicado de `templates/` |
| `clientbop/` (raíz, vacío) | Sin propósito identificado |

---

## 2. AGENCY DASHBOARD — FRONTEND (src/)

### ✅ REUTILIZAR DIRECTAMENTE

| Elemento | Cómo reutilizar |
|---------|----------------|
| `src/types/index.ts` | Copiar tipos como base para los tipos de Next.js. Actualizar según schema de Supabase. |
| Lógica de formateo (`src/services/formatters.ts`) | Copiar como utilidades en `lib/formatters.ts` |
| Schemas Zod de métricas (`server/schemas/metricsSchemas.ts`) | Copiar a `lib/schemas/metrics.ts` — son independientes del framework |
| Schemas Zod de automatizaciones (`server/schemas/automationSchemas.ts`) | Copiar a `lib/schemas/automations.ts` |
| Schemas Zod de reportes (`server/schemas/reportSchemas.ts`) | Copiar a `lib/schemas/reports.ts` |
| Schemas Zod de clientes/tareas/alertas (`server/schemas.ts`) | Copiar y dividir por dominio |
| Componentes UI atómicos: `Toast.tsx`, `LoadingState.tsx`, `ErrorState.tsx` | Adaptar a Tailwind CSS (actualmente usan CSS inline/import) |
| Lógica de tablas y filtros: `TaskFilters.tsx`, `MetricsFilters.tsx` | Adaptar a componentes Next.js con shadcn/ui |

### 🔄 MIGRAR (reimplementar en Next.js)

| Elemento | Reimplementación |
|---------|-----------------|
| `SummaryPage.tsx` | `app/(dashboard)/page.tsx` con Server Components + Suspense |
| `ClientsPage.tsx` | `app/(dashboard)/clients/page.tsx` |
| `ClientDetailPage.tsx` | `app/(dashboard)/clients/[id]/page.tsx` |
| `TasksPage.tsx` | `app/(dashboard)/tasks/page.tsx` |
| `MetricsPage.tsx` | `app/(dashboard)/metrics/page.tsx` |
| `AlertsPage.tsx` | `app/(dashboard)/alerts/page.tsx` |
| `ReportsPage.tsx` | `app/(dashboard)/reports/page.tsx` |
| `AutomationsPage.tsx` | `app/(dashboard)/automations/page.tsx` |
| `Sidebar.tsx` | Componente de layout en `app/(dashboard)/layout.tsx` |
| `MetricsCharts.tsx` | Adaptar con Recharts o migrar a shadcn/ui charts |
| Routing manual (`window.history.pushState`) | **Eliminar** — reemplazar con `next/link` y `useRouter` |
| `src/services/api.ts` | Reemplazar con Server Actions y Supabase client |

### 📦 ARCHIVAR

| Elemento | Motivo |
|---------|--------|
| `agency-dashboard/dist/` | Build compilado del SPA actual. Archivar como snapshot antes de la migración. |
| `agency-dashboard/.git/` | El dashboard tiene su propio git. Consolidar en el repo raíz o archivar el historial. |
| `agency-dashboard/data/audit/task-actions.jsonl` | Log de auditoría histórico. Migrar a Supabase o archivar. |

---

## 3. AGENCY DASHBOARD — BACKEND (server/)

### 🔄 MIGRAR (reimplementar como Route Handlers o Server Actions de Next.js)

| Servicio/Endpoint | Reimplementación |
|------------------|-----------------|
| `clientIndexService.ts` | Supabase query: `SELECT * FROM clients WHERE status = 'active'` |
| `clientDocumentService.ts` | Supabase query: `SELECT content FROM client_documents WHERE client_id = ? AND key = ?` |
| `clientTaskService.ts` | Supabase query: `SELECT * FROM tasks WHERE client_id = ?` |
| `taskMutationService.ts` | Server Action + Supabase update + insert en tabla `task_audit_log` |
| `metricsService.ts` | Supabase query: `SELECT * FROM metrics WHERE client_id = ? AND period = ?` |
| `alertsService.ts` | Lógica de negocio para generar alertas → migrar como función utilitaria + Supabase insert |
| `alertStateService.ts` | Supabase update: `UPDATE alerts SET status = ? WHERE id = ?` |
| `alertNotificationService.ts` | Inngest function `send-alert-emails` |
| `n8nMonitorService.ts` | Reemplazar con monitoreo de Inngest (API de Inngest) |
| `reportService.ts` | Migrar lógica de generación a función utilitaria en `lib/reports/` |
| `reportRecipientsService.ts` | Supabase: tabla `report_recipients` |
| `reportDeliveryService.ts` | Inngest function `send-report-emails` |
| `automationService.ts` | Supabase query sobre tabla `automations` + API de Inngest para estado |
| Todos los endpoints REST (50+) | Route Handlers en `app/api/` + Server Actions para mutaciones |
| `config.ts` | Variables de entorno en `.env.local` de Next.js |

### 📦 ARCHIVAR

| Elemento | Motivo |
|---------|--------|
| `server/test_alerts.ts` | Script de prueba manual. Reemplazar con tests Vitest. |
| `server/test_notifications.ts` | Script de prueba manual. Reemplazar con tests Vitest. |
| `agency-dashboard/` completo (al finalizar migración) | Mantener durante la transición, archivar cuando Next.js esté en producción |

---

## 4. N8N Y AUTOMATIZACIONES

### 🔄 MIGRAR (reimplementar en Inngest)

| Workflow n8n | Función Inngest | Prioridad |
|-------------|-----------------|-----------|
| META - Sincronizar Métricas (×2) | `syncMetaMetrics` — parametrizado para N clientes | 🔴 Alta |
| ALERTAS - Enviar Correos Críticos | `sendAlertEmails` — con Resend o Nodemailer | 🔴 Alta |
| REPORTES - Generar Reportes Mensuales | `generateReports` — cron mensual | 🟠 Media |
| REPORTES - Generar Reportes Semanales | `generateReports` — cron semanal | 🟠 Media |
| REPORTES - Enviar Reportes Mensuales | `sendReportEmails` — event-driven | 🟠 Media |
| CORE - Escanear Clientes | **Eliminar** — Supabase Realtime reemplaza esto | ✅ No migrar |

### 📦 ARCHIVAR

| Elemento | Motivo |
|---------|--------|
| `backups/n8n-workflows/` (4 JSON) | Mantener como referencia durante migración a Inngest |
| `n8n-local/docker-compose.yml` | Mantener hasta que Inngest esté en producción |
| `n8n-local/.env` | **Rotar credenciales antes de archivar** |

---

## 5. SHARED-DATA

### 🔄 MIGRAR (importar a Supabase)

| Archivo | Tabla Supabase destino |
|---------|----------------------|
| `clients-index.json` | `clients` (se genera automáticamente en Supabase) |
| `metrics/clients/{id}/periods/*.json` | `metrics` (JSONB por plataforma y período) |
| `reports/clients/{id}/{type}/*.json` | `reports` |
| `alerts/alert-state.json` | `alerts` |
| `alerts/notification-state.json` | `alert_notifications` |
| `automations/automations-registry.json` | `automations` |
| `automations/executions/*.json` | `execution_history` |
| `reports/report-recipients.json` | `report_recipients` |
| `reports/report-delivery-state.json` | `report_deliveries` |

### 📦 ARCHIVAR

| Elemento | Motivo |
|---------|--------|
| `shared-data/` completo | Fuente de verdad actual. Archivar cuando Supabase esté poblado y verificado. |
| `shared-data/raw-metrics/` (vacío) | Sin datos actuales |
| `shared-data/processed-metrics/` (vacío) | Sin datos actuales |
| `shared-data/exports/` (vacío) | Sin datos actuales |
| `shared-data/imports/` (vacío) | Sin datos actuales |
| `shared-data/logs/` (vacío) | Sin datos actuales |
| `shared-data/metrics/metrics-index.json` | Vacío y sin uso |

---

## 6. BACKUPS

### 📦 ARCHIVAR TODOS

| Elemento | Motivo |
|---------|--------|
| `backups/legacy-commands/new-client.md` | Versión antigua del skill. El skill actual en `.claude/skills/` es la versión correcta. |
| `backups/new-client-20260617-085929.md` | Snapshot histórico. Archivar en `docs/archive/`. |
| `backups/template-client-20260617-085436/` | Copia exacta del `_template-client/`. Archivar. |
| `backups/cliente-prueba-metrics/` | Métricas históricas del cliente de prueba. |

---

## 7. RESUMEN CUANTIFICADO

| Categoría | Cantidad de elementos |
|-----------|----------------------|
| ✅ Reutilizar directamente | 47 elementos (16 agentes + 30 skills + 19 templates + schemas Zod + tipos) |
| 🔄 Migrar / reimplementar | 38 elementos (endpoints, servicios, workflows, datos) |
| 📦 Archivar | 15 grupos de archivos |
| 🗑️ Eliminar | 8 directorios vacíos |

---

## 8. ORDEN DE MIGRACIÓN RECOMENDADO

### Fase 0 — Pre-migración (antes de tocar código)
1. Crear `.gitignore` en raíz
2. Verificar y rotar credenciales expuestas
3. Exportar Meta Access Token y Gmail OAuth2 de n8n
4. Normalizar `integrations.json` de legalink-col y magic-bungalow
5. Decidir el rol de bop-soluciones

### Fase 1 — Setup del nuevo proyecto Next.js
1. Crear repositorio con Next.js App Router + TypeScript estricto
2. Configurar Supabase (schema, RLS, auth)
3. Configurar Tailwind CSS + shadcn/ui
4. Configurar Inngest
5. Configurar ESLint + Prettier + Vitest

### Fase 2 — Migración de datos
1. Script de importación: `clients-index.json` → tabla `clients`
2. Script de importación: `metrics/` → tabla `metrics`
3. Script de importación: `tasks.json` → tabla `tasks`
4. Verificar integridad post-importación

### Fase 3 — Migración del sistema AI
1. Importar agentes a tabla `agents` (content = system_prompt)
2. Importar skills a tabla `skills`
3. Importar templates a tabla `templates`
4. Implementar Claude API integration con contexto de cliente

### Fase 4 — Migración del backend (API Routes)
1. Endpoints de clientes y documentos
2. Endpoints de métricas
3. Endpoints de tareas y mutaciones
4. Endpoints de alertas
5. Endpoints de reportes y entregas
6. Endpoints de automatizaciones

### Fase 5 — Migración del frontend
1. Layout y Sidebar
2. Dashboard / Summary page
3. Clients pages
4. Metrics page
5. Alerts page
6. Reports page
7. Automations page
8. Tasks page

### Fase 6 — Migración de automatizaciones (Inngest)
1. `syncMetaMetrics` function
2. `sendAlertEmails` function
3. `generateReports` function (monthly + weekly)
4. `sendReportEmails` function

### Fase 7 — Validación y apagado de legacy
1. Tests E2E sobre la nueva app
2. Verificar equivalencia funcional con la app actual
3. Apagar n8n Docker
4. Mover `agency-dashboard/` a `archive/agency-dashboard-v1/`
5. Mover `shared-data/` a `archive/shared-data-backup/`

---

*Generado automáticamente el 2026-07-29 como parte de la auditoría de modernización BopIAgency.*
