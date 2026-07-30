# DEPENDENCY MAP
## BopIAgency — Mapa de Dependencias
**Fecha:** 2026-07-29

---

## 1. MAPA ARQUITECTURAL ACTUAL

```
┌─────────────────────────────────────────────────────────────────┐
│  USUARIO / AGENCIA                                              │
│  (Francisco, Claude Code CLI)                                   │
└──────────────┬──────────────────────┬───────────────────────────┘
               │                      │
               ▼                      ▼
┌─────────────────────┐    ┌──────────────────────────┐
│  CLAUDE CODE        │    │  BROWSER                 │
│  .agencia-ai/       │    │  localhost:5173           │
│  - Agentes          │    │  React + Vite             │
│  - Skills           │    │  (agency-dashboard/src)   │
│  - Commands         │    └────────────┬─────────────┘
│  - Workflows        │                 │ HTTP fetch
└─────────────────────┘                 │
          │ lee/escribe                 ▼
          │               ┌─────────────────────────────┐
          ▼               │  EXPRESS API                │
┌──────────────────────┐  │  localhost:3101             │
│  .agencia-ai/clients │  │  (agency-dashboard/server)  │
│  (archivos Markdown  │  └────────────┬────────────────┘
│   + JSON por cliente)│               │
└──────────────────────┘               │ lee/escribe
                                       ▼
                          ┌─────────────────────────────┐
                          │  shared-data/               │
                          │  - clients-index.json       │
                          │  - metrics/ (JSON)          │
                          │  - alerts/ (JSON)           │
                          │  - reports/ (JSON)          │
                          │  - automations/ (JSON)      │
                          └────────────┬────────────────┘
                                       │ lee/escribe
                                       ▼
                          ┌─────────────────────────────┐
                          │  n8n (Docker)               │
                          │  localhost:5678             │
                          │  - CORE - Escanear Clientes │
                          │  - META - Sync Metrics x2   │
                          │  - ALERTAS - Enviar Correos │
                          └────────────┬────────────────┘
                                       │
              ┌────────────────────────┼──────────────────┐
              ▼                        ▼                   ▼
  ┌─────────────────┐    ┌──────────────────────┐  ┌────────────┐
  │  Meta Graph API │    │  Express API (local)  │  │  Gmail API │
  │  v25.0          │    │  (retrollamadas de    │  │  (envío de │
  │  act_XXXXXXX    │    │   n8n a la app)       │  │   alertas) │
  └─────────────────┘    └──────────────────────┘  └────────────┘
```

---

## 2. DEPENDENCIAS NPM DEL DASHBOARD

### Dependencias de producción (`dependencies`)
| Paquete | Versión | Propósito | Estado |
|---------|---------|-----------|--------|
| `express` | ^4.19.2 | Servidor HTTP REST | Activo — todos los endpoints |
| `cors` | ^2.8.5 | CORS middleware | Activo |
| `dotenv` | ^16.4.5 | Variables de entorno | Activo |
| `react` | ^18.3.1 | UI framework | Activo |
| `react-dom` | ^18.3.1 | Renderizado DOM | Activo |
| `recharts` | ^3.8.1 | Gráficas | Activo — MetricsCharts.tsx |
| `react-markdown` | ^10.1.0 | Renderizado Markdown | Activo — MarkdownDocumentViewer.tsx |
| `remark-gfm` | ^4.0.1 | Plugin GFM | Activo |
| `zod` | ^3.23.8 | Validación de schemas | Activo — schemas/ |

### Dependencias de desarrollo (`devDependencies`)
| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `vite` | ^5.3.1 | Build tool y dev server |
| `@vitejs/plugin-react` | ^4.3.1 | Plugin React para Vite |
| `typescript` | ^5.4.5 | Compilador TS |
| `tsx` | ^4.15.6 | Ejecución TS sin compilar (dev) |
| `concurrently` | ^8.2.2 | Ejecutar server + client simultáneo |
| `@types/react` | ^18.3.3 | Tipos React |
| `@types/react-dom` | ^18.3.0 | Tipos React DOM |
| `@types/express` | ^4.17.21 | Tipos Express |
| `@types/cors` | ^2.8.17 | Tipos CORS |
| `@types/node` | ^20.14.9 | Tipos Node.js |

**Ausentes críticos para producción:** ESLint, Prettier, Jest/Vitest, Testing Library

---

## 3. DEPENDENCIAS EXTERNAS (SERVICIOS)

| Servicio | Rol | Autenticación | Dónde se usa |
|---------|-----|---------------|-------------|
| **Meta Graph API v25.0** | Fuente de métricas publicitarias | `access_token` (Meta) via n8n credentials | n8n: META - Sincronizar Métricas |
| **Gmail API** | Envío de alertas críticas | OAuth2 via n8n credentials | n8n: ALERTAS - Enviar Correos |
| **Docker / n8n** | Orquestación de automatizaciones | N8N_ENCRYPTION_KEY + API Key | n8n-local/docker-compose.yml |

---

## 4. FLUJO DE DATOS (DATA FLOW)

### Flujo de métricas (n8n → shared-data → Express → React)
```
Meta Graph API (v25.0)
  → n8n (META - Sincronizar Métricas)
    → normalize (Code node n8n)
      → shared-data/metrics/clients/{id}/periods/{YYYY-MM}.json
        → Express GET /api/clients/:id/metrics
          → React MetricsPage / ClientMetricsPanel
```

### Flujo de alertas (shared-data → Express → n8n → Gmail)
```
Express alertsService.ts
  (lee métricas y genera alertas desde reglas de negocio)
    → shared-data/alerts/alert-state.json
      → n8n GET /api/alerts/notifications/pending (cada hora)
        → Gmail: envía correo a bopagencia@gmail.com
          → n8n POST /api/alerts/notifications/:id/sent
            → shared-data/alerts/notification-state.json
```

### Flujo de onboarding de clientes (Claude Code → n8n → shared-data)
```
Claude Code: skill /new-client
  → crea archivos en .agencia-ai/clients/{id}/
    → crea .ready en directorio del cliente
      → n8n (CORE - Escanear Clientes, cada minuto o manual)
        → lee client.json de cada cliente con .ready
          → escribe shared-data/clients-index.json
            → Express GET /api/clients (lee el índice)
```

### Flujo de reportes (Express → shared-data → n8n → Gmail)
```
Express POST /api/reports/generate
  → reportService.ts genera reporte desde métricas
    → shared-data/reports/clients/{id}/{type}/{period}.json
      → reportDeliveryService.ts: crea entradas en delivery-state.json
        → n8n GET /api/report-deliveries/pending
          → Gmail: envía reporte al cliente
```

---

## 5. DEPENDENCIAS ENTRE MÓDULOS (INTRA-REPO)

### Backend — Grafo de dependencias de servicios
```
index.ts
├── clientIndexService     ← clients-index.json
├── clientDocumentService  ← .agencia-ai/clients/{id}/*.md
├── clientTaskService      ← .agencia-ai/clients/{id}/tasks.json
├── taskMutationService    ← clientTaskService + data/audit/task-actions.jsonl
├── metricsService         ← shared-data/metrics/
├── alertsService          ← metricsService + alertStateService
├── alertStateService      ← shared-data/alerts/alert-state.json
├── alertNotificationService ← alertsService + shared-data/alerts/notification-state.json
├── n8nMonitorService      ← N8N API (HTTP externa)
├── reportService          ← metricsService
├── reportRecipientsService ← shared-data/reports/report-recipients.json
├── reportDeliveryService  ← shared-data/reports/report-delivery-state.json
└── automationService      ← shared-data/automations/
```

### Frontend — Grafo de dependencias de páginas
```
App.tsx (routing manual)
├── SummaryPage       → api: /clients, /metrics/summary, /alerts, /tasks, /integrations/n8n/status
├── ClientsPage       → api: /clients
├── ClientDetailPage  → api: /clients/:id, /documents/:key, /tasks/:id, /metrics/:id
├── TasksPage         → api: /tasks, /clients/:id/tasks/:taskId/actions
├── MetricsPage       → api: /clients/:id/metrics, /metrics/periods, /metrics/sources
├── AlertsPage        → api: /alerts, /alerts/:id/review|snooze|resolve|reopen, /notifications/summary
├── ReportsPage       → api: /reports, /reports/generate, /report-deliveries/*
├── ClientReportView  → api: /reports/:clientId/:type/:period
└── AutomationsPage   → api: /automations, /automations/summary, /automations/:id/executions
```

---

## 6. PUERTOS Y COMUNICACIÓN LOCAL

| Componente | Puerto | Protocolo | Accesible desde |
|-----------|--------|-----------|----------------|
| React Dev Server | 5173 | HTTP | localhost |
| Express API | 3101 | HTTP | 127.0.0.1 (solo local) |
| n8n | 5678 | HTTP | 127.0.0.1 (solo local) |
| n8n → Express (interno Docker) | 3101 | HTTP | host.docker.internal:3101 |

**⚠️ Riesgo:** n8n usa `host.docker.internal` para llegar al Express API. Esto solo funciona en Docker Desktop (Windows/Mac). En Linux requiere configuración adicional.

---

## 7. CREDENCIALES Y SECRETOS (REFERENCIAS — SIN VALORES)

| Secreto | Dónde vive | Riesgo |
|---------|-----------|--------|
| Meta Access Token | n8n credentials (base de datos encriptada de n8n) | No expuesto en archivos |
| Gmail OAuth2 | n8n credentials | No expuesto en archivos |
| `N8N_ENCRYPTION_KEY` | `n8n-local/.env` | **⚠️ En texto plano en el repo** |
| `ALERT_NOTIFICATIONS_API_KEY` | `agency-dashboard/.env` | En .env (no commitear) |
| `AUTOMATIONS_API_KEY` | `agency-dashboard/.env` | En .env (no commitear) |
| `REPORT_DELIVERIES_API_KEY` | `agency-dashboard/.env` | En .env (no commitear) |
| `N8N_API_KEY` | `agency-dashboard/.env` | En .env (no commitear) |

---

## 8. INCOMPATIBILIDADES CON STACK OBJETIVO

| Componente actual | Stack objetivo | Incompatibilidad |
|------------------|---------------|-----------------|
| Express REST | Next.js API Routes / Server Actions | Necesita reescritura completa de endpoints |
| Vite + React SPA | Next.js App Router (SSR/RSC) | Arquitectura de routing diferente |
| JSON files (persistencia) | Supabase (PostgreSQL) | Migración de esquema y datos requerida |
| n8n (Docker) | Inngest (TypeScript) | Reescritura de todos los workflows |
| window.history.pushState | Next.js Link + useRouter | Routing declarativo vs. imperativo |
| CORS hardcodeado | Next.js (mismo origen) | El CORS desaparece en Next.js monolítico |
| localStorage (no usado aún) | Supabase auth (server-side) | N/A |
| moduleResolution: "node" | Debe actualizarse a "bundler" | tsconfig.json |
| No auth de usuarios | Supabase Auth / middleware Next.js | Nueva capa completa |

---

*Generado automáticamente el 2026-07-29 como parte de la auditoría de modernización BopIAgency.*
