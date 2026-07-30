# REPOSITORY INVENTORY
## BopIAgency — Auditoría de Modernización
**Fecha:** 2026-07-29  
**Auditor:** Claude (Auditoría automática pre-migración)

---

## 1. ESTRUCTURA RAÍZ

```
BopIAgency/
├── .agencia-ai/               # Sistema operativo de la agencia (Claude Code)
│   ├── .claude/               # Configuración Claude Code
│   │   ├── agents/            # 16 agentes especializados
│   │   ├── commands/          # 26 slash commands
│   │   ├── skills/            # 32 skills modulares
│   │   ├── workflows/         # 8 workflows de proceso
│   │   ├── references/        # 2 guías de referencia permanente
│   │   ├── hooks/             # (vacío — sin hooks definidos)
│   │   └── templates/         # (alias de .agencia-ai/templates)
│   ├── clients/               # Perfiles de 5 clientes + template
│   ├── campaigns/             # Campañas guardadas (bop-soluciones)
│   ├── assets/                # (vacío)
│   ├── automations/           # (vacío)
│   ├── proposals/             # (vacío)
│   ├── references/            # (vacío — las refs están en .claude/references)
│   ├── reports/               # (vacío)
│   ├── templates/             # 19 plantillas de entregables
│   ├── AGENCY-OPERATING-SYSTEM.md
│   ├── CLAUDE.md              # Reglas operativas globales
│   └── README.md
│
├── agency-dashboard/          # App web actual (React + Express + TypeScript)
│   ├── src/                   # Frontend React
│   │   ├── components/        # 24 componentes UI
│   │   ├── pages/             # 9 páginas
│   │   ├── services/          # api.ts, formatters.ts
│   │   ├── types/             # index.ts (tipos compartidos)
│   │   └── styles/            # index.css
│   ├── server/                # Backend Express
│   │   ├── index.ts           # 50+ endpoints REST
│   │   ├── config.ts          # Configuración via env vars
│   │   ├── schemas.ts         # Zod schemas principales
│   │   ├── schemas/           # Schemas por dominio
│   │   │   ├── metricsSchemas.ts
│   │   │   ├── automationSchemas.ts
│   │   │   └── reportSchemas.ts
│   │   └── services/          # 13 servicios
│   ├── data/audit/            # task-actions.jsonl (log de mutaciones)
│   ├── dist/                  # Build compilado
│   ├── .env                   # Variables de entorno (no commitear)
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── .git/                  # Repositorio git independiente
│
├── shared-data/               # Datos compartidos entre app y n8n
│   ├── clients-index.json     # Índice maestro de clientes activos
│   ├── metrics/clients/       # Métricas por cliente y período (JSON)
│   ├── reports/clients/       # Reportes generados (mensual/semanal)
│   ├── automations/           # Registro de automatizaciones + historial
│   ├── alerts/                # Estado de alertas y notificaciones
│   ├── exports/               # (vacío)
│   ├── imports/               # (vacío)
│   ├── logs/                  # (vacío)
│   ├── raw-metrics/           # (vacío)
│   └── processed-metrics/     # (vacío)
│
├── n8n-local/                 # Configuración Docker de n8n
│   ├── docker-compose.yml
│   ├── .env                   # Credenciales n8n (encryption key expuesta)
│   └── local-files/           # (vacío — montura para n8n)
│
├── backups/
│   ├── n8n-workflows/         # 4 workflows n8n exportados en JSON
│   ├── cliente-prueba-metrics/
│   ├── legacy-commands/       # new-client.md (versión antigua)
│   ├── template-client-20260617-085436/
│   └── new-client-20260617-085929.md
│
├── clientbop/                 # (vacío — sin archivos)
└── docs/                      # (creado en esta auditoría)
    └── audit/
```

---

## 2. TECNOLOGÍAS Y VERSIONES ENCONTRADAS

### Frontend (agency-dashboard/src/)
| Tecnología | Versión | Uso |
|-----------|---------|-----|
| React | ^18.3.1 | UI framework |
| TypeScript | ^5.4.5 | Lenguaje |
| Vite | ^5.3.1 | Build tool / dev server |
| Recharts | ^3.8.1 | Gráficas de métricas |
| react-markdown | ^10.1.0 | Renderizado de docs Markdown |
| remark-gfm | ^4.0.1 | Plugin GFM para markdown |

### Backend (agency-dashboard/server/)
| Tecnología | Versión | Uso |
|-----------|---------|-----|
| Express | ^4.19.2 | Servidor REST |
| TypeScript | ^5.4.5 | Lenguaje |
| Zod | ^3.23.8 | Validación de schemas |
| dotenv | ^16.4.5 | Variables de entorno |
| cors | ^2.8.5 | CORS middleware |
| tsx | ^4.15.6 | Ejecución TS en dev |
| concurrently | ^8.2.2 | Correr server+client en paralelo |

### Infraestructura
| Tecnología | Versión | Uso |
|-----------|---------|-----|
| n8n | stable (Docker) | Automatizaciones |
| Docker | N/D | Contenedor de n8n |

### Sistema AI
| Tecnología | Uso |
|-----------|-----|
| Claude Code | Runtime del sistema operativo de la agencia |
| Meta Graph API v25.0 | Sincronización de métricas de Meta Ads |
| Gmail (via n8n) | Envío de alertas críticas por correo |

---

## 3. ARCHIVOS DE CONFIGURACIÓN

| Archivo | Propósito | Observaciones |
|---------|-----------|---------------|
| `agency-dashboard/.env` | Variables de entorno del servidor | **Contiene valores reales. NO commitear.** |
| `agency-dashboard/.env.example` | Plantilla de variables | Expone nombres de todas las vars requeridas |
| `agency-dashboard/tsconfig.json` | Config TypeScript | strict:true, target ES2020, moduleResolution node |
| `agency-dashboard/vite.config.ts` | Config Vite | Puerto 5173, host 127.0.0.1 |
| `agency-dashboard/package.json` | Dependencias Node | Scripts: dev, build, typecheck |
| `n8n-local/docker-compose.yml` | Infraestructura Docker | Monta shared-data y .agencia-ai como volúmenes |
| `n8n-local/.env` | Config n8n | **Contiene N8N_ENCRYPTION_KEY en texto plano** |
| `.agencia-ai/CLAUDE.md` | Reglas globales del sistema AI | Aplica en toda sesión de Claude Code |

---

## 4. SCRIPTS DISPONIBLES

```json
// agency-dashboard/package.json
{
  "dev":        "concurrently 'npm run dev:server' 'npm run dev:client'",
  "dev:client": "vite",
  "dev:server": "tsx server/index.ts",
  "build":      "tsc && vite build",
  "typecheck":  "tsc --noEmit"
}
```

**Observación:** No hay scripts de testing, linting, formateo (ESLint/Prettier), migración de datos ni seed.

---

## 5. VARIABLES DE ENTORNO DETECTADAS

### agency-dashboard/.env.example
| Variable | Tipo | Descripción |
|---------|------|-------------|
| `CLIENTS_INDEX_PATH` | Path absoluto | Ruta al clients-index.json |
| `AGENCY_CLIENTS_PATH` | Path absoluto | Ruta a .agencia-ai/clients/ |
| `METRICS_DATA_PATH` | Path absoluto | Ruta a shared-data/metrics/ |
| `PORT` | Número | Puerto del servidor Express (default: 3101) |
| `ALERT_NOTIFICATIONS_API_KEY` | Secret | Autenticación de endpoints de notificaciones |
| `AUTOMATIONS_API_KEY` | Secret | Autenticación de endpoints de automatizaciones |
| `REPORT_DELIVERIES_API_KEY` | Secret | Autenticación de endpoints de entregas de reportes |

### agency-dashboard/server/config.ts (adicionales inferidas del código)
| Variable | Default | Descripción |
|---------|---------|-------------|
| `API_PORT` | 3001 | Puerto alternativo (toma precedencia sobre PORT) |
| `API_HOST` | 127.0.0.1 | Host del servidor |
| `N8N_BASE_URL` | http://127.0.0.1:5678 | URL base de n8n |
| `N8N_API_BASE_URL` | http://127.0.0.1:5678/api/v1 | URL de la API de n8n |
| `N8N_API_KEY` | (vacío) | API key para n8n |
| `N8N_CLIENT_SCAN_WORKFLOW_NAME` | CORE - Escanear Clientes | Nombre del workflow de n8n |

### n8n-local/.env
| Variable | Descripción |
|---------|-------------|
| `N8N_PORT` | Puerto de n8n (5678) |
| `N8N_HOST` | Host de n8n |
| `N8N_PROTOCOL` | Protocolo (http) |
| `GENERIC_TIMEZONE` | America/Bogota |
| `N8N_ENCRYPTION_KEY` | **⚠️ Clave de encriptación en texto plano** |
| `N8N_DIAGNOSTICS_ENABLED` | false |
| `N8N_PERSONALIZATION_ENABLED` | false |
| `WEBHOOK_URL` | URL de webhooks |
| `N8N_RESTRICT_FILE_ACCESS_TO` | Rutas permitidas para lectura de archivos |

### Variables NO documentadas pero referenciadas en el código
| Variable | Referencia | Descripción |
|---------|-----------|-------------|
| `VITE_API_BASE_URL` | src/services/api.ts | URL base de la API para el frontend |

---

## 6. PÁGINAS DEL DASHBOARD (agency-dashboard/src/pages/)

| Archivo | Ruta | Funcionalidad |
|---------|------|--------------|
| `SummaryPage.tsx` | `/` | Resumen general de la agencia |
| `ClientsPage.tsx` | (tab) | Lista de clientes |
| `ClientDetailPage.tsx` | (tab+id) | Detalle de un cliente con documentos y tareas |
| `TasksPage.tsx` | (tab) | Gestión de tareas por cliente |
| `MetricsPage.tsx` | (tab) | Métricas por cliente y período |
| `AlertsPage.tsx` | (tab) | Alertas activas y resueltas |
| `ReportsPage.tsx` | `/reports` | Lista y generación de reportes |
| `ClientReportView.tsx` | (sub-view) | Detalle de un reporte |
| `AutomationsPage.tsx` | `/automations` | Lista de automatizaciones y estado |

**Observación:** El routing es manual con `window.history.pushState` — no usa React Router.

---

## 7. SERVICIOS DEL BACKEND (agency-dashboard/server/services/)

| Archivo | Responsabilidad |
|---------|----------------|
| `clientIndexService.ts` | Lee clients-index.json |
| `clientDocumentService.ts` | Lee documentos Markdown de clientes |
| `clientTaskService.ts` | Lee tasks.json de clientes |
| `taskMutationService.ts` | Muta estado de tareas (con backup JSONL) |
| `metricsService.ts` | Lee métricas desde JSON en shared-data |
| `alertsService.ts` | Genera alertas desde métricas de clientes |
| `alertStateService.ts` | Lee/escribe alert-state.json |
| `alertNotificationService.ts` | Gestiona ciclo de vida de notificaciones |
| `n8nMonitorService.ts` | Consulta estado de n8n via API |
| `reportService.ts` | Genera reportes desde métricas |
| `reportRecipientsService.ts` | Lee/escribe report-recipients.json |
| `reportDeliveryService.ts` | Gestiona cola de entregas de reportes |
| `automationService.ts` | Lee registro de automatizaciones |

---

## 8. ENDPOINTS REST COMPLETOS (agency-dashboard/server/index.ts)

### Sin autenticación (uso interno del dashboard)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servidor |
| GET | `/api/clients` | Lista todos los clientes |
| GET | `/api/clients/:id` | Detalle de un cliente |
| GET | `/api/clients/:id/documents/:documentKey` | Documento Markdown del cliente |
| GET | `/api/clients/:id/tasks` | Tareas del cliente |
| GET | `/api/clients/:id/metrics` | Métricas del cliente (con ?period=) |
| GET | `/api/clients/:id/metrics/periods` | Períodos disponibles |
| GET | `/api/clients/:id/metrics/sources` | Fuentes de métricas |
| GET | `/api/metrics/summary` | Resumen global de métricas |
| GET | `/api/tasks` | Todas las tareas de todos los clientes |
| POST | `/api/clients/:clientId/tasks/:taskId/actions` | Mutar estado de tarea |
| GET | `/api/alerts` | Alertas activas (con filtros) |
| GET | `/api/alerts/history` | Historial de alertas |
| PATCH | `/api/alerts/:alertId/review` | Marcar alerta como revisada |
| PATCH | `/api/alerts/:alertId/snooze` | Silenciar alerta |
| PATCH | `/api/alerts/:alertId/resolve` | Resolver alerta |
| PATCH | `/api/alerts/:alertId/reopen` | Reabrir alerta |
| GET | `/api/alerts/notifications/summary` | Resumen de notificaciones |
| POST | `/api/alerts/notifications/:alertId/local-retry` | Reintentar notificación |
| GET | `/api/automations` | Lista de automatizaciones |
| GET | `/api/automations/summary` | Resumen de automatizaciones |
| GET | `/api/automations/:automationId` | Detalle de automatización |
| GET | `/api/automations/:automationId/executions` | Historial de ejecuciones |
| GET | `/api/integrations/n8n/status` | Estado de n8n |
| GET | `/api/reports` | Lista reportes (con filtros) |
| GET | `/api/reports/:clientId` | Reportes de un cliente |
| GET | `/api/reports/:clientId/:reportType/:period` | Reporte específico |
| POST | `/api/reports/generate` | Generar un reporte |
| POST | `/api/reports/generate-all` | Generar reportes para todos los clientes |
| GET | `/api/report-recipients` | Lista destinatarios de reportes |
| GET | `/api/report-recipients/:clientId` | Destinatario por cliente |
| PUT | `/api/report-recipients/:clientId` | Actualizar destinatario |
| GET | `/api/report-deliveries/local-history` | Historial de entregas |
| POST | `/api/report-deliveries/local-queue` | Encolar entregas |
| POST | `/api/report-deliveries/:deliveryId/local-retry` | Reintentar entrega |

### Protegidos con `ALERT_NOTIFICATIONS_API_KEY` (uso de n8n)
| Método | Ruta |
|--------|------|
| GET | `/api/alerts/notifications/pending` |
| POST | `/api/alerts/notifications/:alertId/attempt` |
| POST | `/api/alerts/notifications/:alertId/sent` |
| POST | `/api/alerts/notifications/:alertId/failed` |
| POST | `/api/alerts/notifications/:alertId/retry` |
| GET | `/api/alerts/notifications/history` |

### Protegidos con `AUTOMATIONS_API_KEY` (uso de n8n)
| Método | Ruta |
|--------|------|
| POST | `/api/automations/:automationId/executions` |

### Protegidos con `REPORT_DELIVERIES_API_KEY` (uso de n8n)
| Método | Ruta |
|--------|------|
| GET | `/api/report-deliveries/pending` |
| POST | `/api/report-deliveries/:deliveryId/attempt` |
| POST | `/api/report-deliveries/:deliveryId/sent` |
| POST | `/api/report-deliveries/:deliveryId/failed` |
| POST | `/api/report-deliveries/:deliveryId/retry` |
| GET | `/api/report-deliveries/history` |
| POST | `/api/report-deliveries/queue` |

**Total: ~50 endpoints REST**

---

## 9. DUPLICACIONES DETECTADAS

| Tipo | Descripción |
|------|-------------|
| **Templates duplicadas** | `backups/template-client-20260617-085436/` es una copia exacta de `_template-client/` |
| **new-client duplicado** | `backups/legacy-commands/new-client.md` y `backups/new-client-20260617-085929.md` — versiones antiguas del skill `/new-client` |
| **Endpoints duplicados** | Todos los endpoints de n8n tienen una variante `/local-*` para el frontend (sin auth), duplicando lógica |
| **Schemas duplicados** | `server/schemas.ts` y `server/schemas/` coexisten — las schemas de métricas y automatizaciones están en `/schemas/` pero las de client/task/alert en `schemas.ts` raíz |
| **bop-soluciones vs. shared-data** | `bop-soluciones` está en `.agencia-ai/clients/` pero NO tiene métricas en `shared-data/` — sus datos están en `.agencia-ai/clients/bop-soluciones/metrics.json` (formato diferente) |
| **metrics-index.json vacío** | `shared-data/metrics/metrics-index.json` contiene `{"clients":[]}` — no se usa |
| **Directorios vacíos** | `assets/`, `automations/`, `proposals/`, `references/`, `reports/` dentro de `.agencia-ai/` — creados pero sin uso |
| **clientbop/** | Directorio vacío en raíz — sin propósito claro |

---

## 10. DEUDA TÉCNICA IDENTIFICADA

| Severidad | Descripción |
|-----------|-------------|
| 🔴 Alta | Sin tests (ni unitarios ni de integración ni E2E) |
| 🔴 Alta | Sin ESLint ni Prettier — no hay estándar de formateo |
| 🔴 Alta | CORS hardcodeado: `'http://localhost:5173'` (no configurable) |
| 🔴 Alta | Sin manejo de roles ni autenticación de usuarios |
| 🔴 Alta | Sin base de datos — toda la persistencia es en archivos JSON locales |
| 🟠 Media | Sin React Router — routing manual con window.history |
| 🟠 Media | Sin loading states globales ni error boundaries en frontend |
| 🟠 Media | `moduleResolution: "node"` — deprecado en TS moderno (debería ser "bundler") |
| 🟠 Media | `strict: true` en tsconfig pero sin `exactOptionalPropertyTypes` |
| 🟠 Media | API_PORT y PORT con lógica dual en config.ts — confuso |
| 🟡 Baja | Sin `.gitignore` raíz — solo existe en agency-dashboard/ |
| 🟡 Baja | `data/audit/task-actions.jsonl` crecerá indefinidamente |
| 🟡 Baja | Directorios vacíos proliferados (assets, proposals, etc.) |
| 🟡 Baja | `clientbop/` sin propósito |

---

*Generado automáticamente el 2026-07-29 como parte de la auditoría de modernización BopIAgency.*
