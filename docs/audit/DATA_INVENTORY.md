# DATA INVENTORY
## BopIAgency — Inventario de Datos y Fuentes
**Fecha:** 2026-07-29

---

## 1. ARQUITECTURA DE DATOS ACTUAL

**Modelo:** Archivos JSON y Markdown en sistema de archivos local.  
**No hay base de datos.** Toda la persistencia es en archivos planos en dos ubicaciones:
- `.agencia-ai/clients/` — datos maestros de clientes (gestionados por Claude Code)
- `shared-data/` — datos operacionales (gestionados por n8n y Express API)

---

## 2. FUENTES DE DATOS

| Fuente | Tipo | Tecnología | Frecuencia de actualización | Responsable de escritura |
|--------|------|-----------|---------------------------|-------------------------|
| Meta Graph API v25.0 | Externa | HTTP REST | Diaria (06:00) | n8n |
| Gmail API | Externa | OAuth2 | Por evento | n8n |
| Claude Code (agentes/skills) | Interna | Markdown/JSON | Por sesión de trabajo | Usuario + Claude |
| Express API | Interna | HTTP REST | Tiempo real | Dashboard UI |
| Archivos JSON manuales | Interna | JSON | Manual | Usuario |

---

## 3. INVENTARIO DETALLADO DE ARCHIVOS DE DATOS

### 3.1 shared-data/clients-index.json

**Propósito:** Índice maestro de todos los clientes activos. Es la fuente de verdad que consume la Express API para `/api/clients`.

**Schema:**
```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "ISO8601",
  "clientCount": 3,
  "clients": [
    {
      "id": "string",
      "name": "string",
      "status": "active | draft | inactive",
      "industry": "string",
      "language": "es | en",
      "timezone": "string (IANA)",
      "createdAt": "ISO8601 | null",
      "updatedAt": "ISO8601 | null",
      "schemaVersion": "1.0.0",
      "documents": { "brandProfile": "filename.md", ... },
      "dataFiles": { "tasks": "tasks.json", "integrations": "integrations.json" },
      "folderPath": "/agencia-ai/clients/{id}",
      "isValid": true
    }
  ]
}
```

**Clientes actuales:** 3 activos (`cliente-prueba`, `legalink-col`, `magic-bungalow`)  
**Escritura:** n8n CORE - Escanear Clientes (cada minuto)  
**Lectura:** Express API, Frontend

---

### 3.2 shared-data/metrics/clients/{id}/periods/{YYYY-MM}.json

**Propósito:** Métricas de campañas por cliente y período mensual.

**Clientes con datos:**
| Cliente | Períodos disponibles |
|---------|---------------------|
| legalink-col | 2026-06, 2026-07 |
| magic-bungalow | 2026-06, 2026-07 |

**Schema (MonthlyMetrics v1.0.0):**
```json
{
  "schemaVersion": "1.0.0",
  "clientId": "string",
  "period": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "timezone": "string" },
  "currency": "COP | USD | EUR",
  "generatedAt": "ISO8601",
  "sources": [
    {
      "platform": "meta_ads | google_ads | ga4 | ...",
      "accountId": "string | null",
      "accountName": "string | null",
      "status": "connected | disconnected | error | manual | pending",
      "lastSyncedAt": "ISO8601 | null",
      "metrics": { "spend": 0, "impressions": 0, "clicks": 0, "leads": 0, ... },
      "campaigns": [
        {
          "id": "string",
          "name": "string",
          "status": "string",
          "dateStart": "string | null",
          "dateStop": "string | null",
          "metrics": { "spend": 0, "impressions": 0, ... }
        }
      ]
    }
  ],
  "aggregate": {
    "spend": 0, "impressions": 0, "reach": 0, "clicks": 0,
    "leads": 0, "conversions": 0, "revenue": 0,
    "ctr": 0, "cpc": 0, "cpl": 0, "conversionRate": 0, "roas": 0,
    "linkClicks": 0, "landingPageViews": 0,
    "postReactions": 0, "postEngagement": 0, "pageEngagement": 0,
    "conversationsStarted": 0, "conversationsReplied": 0, "purchases": 0
  },
  "dataQuality": {
    "status": "complete | partial | empty | error",
    "warnings": [],
    "missingSources": []
  }
}
```

**Plataformas soportadas (enum):** `meta_ads`, `google_ads`, `ga4`, `search_console`, `youtube`, `gohighlevel`, `mailchimp`, `brevo`, `wordpress`, `clickup`, `trello`, `asana`, `whatsapp`, `manual`

**Datos actuales:** Solo `meta_ads` está conectado para legalink-col y magic-bungalow.

---

### 3.3 shared-data/reports/clients/{id}/{type}/{period}.json

**Propósito:** Reportes generados por la Express API para envío a clientes.

**Tipos:** `monthly`, `weekly`  
**Períodos disponibles:**
| Cliente | Tipo | Períodos |
|---------|------|---------|
| legalink-col | monthly | 2026-06 |
| legalink-col | weekly | 2026-W25, 2026-W27 |
| magic-bungalow | monthly | 2026-06 |
| magic-bungalow | weekly | 2026-W25, 2026-W26, 2026-W27 |

**Schema del reporte:**
```json
{
  "schemaVersion": "string",
  "reportId": "string",
  "clientId": "string",
  "clientName": "string",
  "reportType": "monthly | weekly",
  "period": {
    "label": "string",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "previousStartDate": "YYYY-MM-DD",
    "previousEndDate": "YYYY-MM-DD"
  },
  "generatedAt": "ISO8601",
  "currency": "string",
  "summary": {},
  "previousPeriod": {},
  "changes": {},
  "efficiency": {},
  "topCampaigns": [],
  "campaigns": [],
  "insights": [],
  "recommendations": [],
  "dataQuality": {},
  "sources": []
}
```

---

### 3.4 shared-data/alerts/alert-state.json

**Propósito:** Estado centralizado de todas las alertas del sistema.

**Schema:**
```json
{
  "schemaVersion": "string",
  "updatedAt": "ISO8601",
  "states": {
    "{alertId}": {
      "status": "open | reviewed | snoozed | resolved",
      "reviewedAt": "ISO8601 | null",
      "reviewedBy": "string | null",
      "resolvedAt": "ISO8601 | null",
      "resolvedBy": "string | null",
      "snoozedUntil": "ISO8601 | null",
      "note": "string | null"
    }
  }
}
```

**Estado actual:** 0 alertas activas en el state file.

**Tipos de alertas generadas dinámicamente:**
- `MISSING_METRICS_FILE` — No existe archivo de métricas para el período
- `STALE_SYNC` — La última sincronización tiene más de X días
- `ACTIVE_CAMPAIGNS_NO_SPEND` — Campañas activas sin gasto registrado
- `NO_CAMPAIGNS` — Cliente sin campañas registradas
- `SYNC_ERROR` — Error durante sincronización

---

### 3.5 shared-data/alerts/notification-state.json

**Propósito:** Ciclo de vida de las notificaciones por email de cada alerta.

**Schema:**
```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "ISO8601",
  "notifications": {
    "{alertId}": {
      "alertId": "string",
      "status": "pending | sent | failed",
      "channels": ["email"],
      "attempts": 0,
      "lastAttemptAt": "ISO8601 | null",
      "sentAt": "ISO8601 | null",
      "contentHash": "string | null",
      "error": "string | null"
    }
  }
}
```

---

### 3.6 shared-data/automations/automations-registry.json

**Propósito:** Registro de todas las automatizaciones conocidas con su estado de salud.

**Schema (AutomationRegistry v1.0.0):**
```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "ISO8601",
  "automations": [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "category": "core | metrics | alerts | reports | notifications | other",
      "provider": "n8n",
      "workflowId": "string | null",
      "clientId": "string | null",
      "clientName": "string | null",
      "status": "active | inactive | draft | unknown",
      "schedule": { "type": "manual | hourly | daily | weekly | monthly | custom", "label": "string" },
      "health": {
        "status": "healthy | warning | error | never_run | unknown",
        "lastRunAt": "ISO8601 | null",
        "lastSuccessAt": "ISO8601 | null",
        "lastFailureAt": "ISO8601 | null",
        "nextRunAt": "ISO8601 | null",
        "lastDurationMs": "number | null",
        "lastError": "string | null",
        "lastRunStatus": "success | failed | null"
      },
      "links": { "providerUrl": "string" }
    }
  ]
}
```

**Automatizaciones registradas (7):**
| ID | Nombre | Categoría | Schedule |
|----|--------|-----------|---------|
| `core-scan-clients` | CORE - Escanear Clientes | core | manual |
| `meta-sync-metrics-magic-bungalow` | META - Sincronizar Métricas - Magic Bungalow | metrics | daily |
| `meta-sync-metrics-legalink-col` | META - Sincronizar Métricas - Legalink Colombia | metrics | daily |
| `alerts-send-emails` | ALERTAS - Enviar Correos Críticos | notifications | hourly |
| `reports-generate-monthly` | REPORTES - Generar Reportes Mensuales | reports | monthly |
| `reports-generate-weekly` | REPORTES - Generar Reportes Semanales | reports | weekly |
| `reports-send-monthly-emails` | REPORTES - Enviar Reportes Mensuales | reports | monthly |

---

### 3.7 shared-data/automations/executions/{automation-id}.json

**Propósito:** Historial de ejecuciones por automatización.

**Archivos presentes:**
- `alerts-send-emails.json`
- `core-scan-clients.json`
- `meta-sync-metrics-legalink-col.json`
- `meta-sync-metrics-magic-bungalow.json`
- `reports-generate-monthly.json`
- `reports-generate-weekly.json`
- `reports-send-monthly-emails.json`

**Schema por ejecución:**
```json
{
  "executionId": "string",
  "status": "success | failed",
  "startedAt": "ISO8601",
  "finishedAt": "ISO8601",
  "durationMs": 0,
  "error": "string | null",
  "metadata": {}
}
```

---

### 3.8 shared-data/reports/report-recipients.json

**Propósito:** Configuración de destinatarios de reportes por cliente.

**Schema:**
```json
{
  "schemaVersion": "1.0.0",
  "updatedAt": "ISO8601",
  "clients": {
    "{clientId}": {
      "enabled": true,
      "to": ["email@example.com"],
      "cc": [],
      "bcc": [],
      "sendMonthly": true,
      "sendWeekly": false,
      "language": "es",
      "subjectPrefix": "Informe de resultados"
    }
  }
}
```

**Destinatarios actuales:**
| Cliente | Habilitado | Destinatario | Monthly | Weekly |
|---------|-----------|-------------|---------|--------|
| cliente-prueba | ✅ Sí | f.roncallo@gmail.com | ✅ | ❌ |
| legalink-col | ❌ No | (vacío) | ✅ | ❌ |
| magic-bungalow | ✅ Sí | f.roncallo@gmail.com | ✅ | ❌ |

---

### 3.9 shared-data/reports/report-delivery-state.json

**Propósito:** Cola de entregas de reportes y su estado de envío.

**Schema:** Similar a notification-state.json pero para reportes.

---

### 3.10 .agencia-ai/clients/{id}/tasks.json

**Propósito:** Lista de tareas operativas del cliente con estados y prioridades.

**Schema:**
```json
{
  "schemaVersion": "1.0.0",
  "clientId": "string",
  "lastUpdatedAt": "ISO8601 | null",
  "tasks": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "status": "idea | pending | awaiting_approval | approved | in_progress | in_review | blocked | completed | cancelled",
      "priority": "low | medium | high | critical",
      "ownerAgent": "string",
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601",
      "dueDate": "ISO8601 | null",
      "source": "string",
      "reason": "string",
      "expectedImpact": "string",
      "requiresApproval": false,
      "acceptanceCriteria": [],
      "dependencies": [],
      "tags": []
    }
  ]
}
```

---

### 3.11 .agencia-ai/clients/{id}/integrations.json

**Propósito:** Mapa de conexiones de plataformas por cliente.

**Plataformas soportadas:**
- `metaAds` (accountId)
- `googleAds` (customerId, loginCustomerId)
- `ga4` (propertyId)
- `searchConsole` (siteUrl)
- `youtube` (channelId)
- `goHighLevel` (locationId)
- `emailMarketing` (provider, listId)
- `wordpress` (siteUrl)
- `projectManagement` (provider, workspaceId, projectId)
- `whatsappCloud` (phoneNumberId, businessAccountId)

**Estado actual de integraciones:**
| Cliente | Meta Ads | Google Ads | GA4 | WhatsApp |
|---------|---------|-----------|-----|---------|
| legalink-col | ⚠️ (formato antiguo) | ❌ | ❌ | ❌ |
| magic-bungalow | ⚠️ (formato antiguo) | ❌ | ❌ | ❌ |
| cliente-prueba | ✅ (formato nuevo, vacío) | ❌ | ❌ | ❌ |

**⚠️ Inconsistencia:** legalink-col y magic-bungalow tienen `integrations.json` con formato `{clientId, integrations: []}` (array vacío), diferente al template que usa un objeto con todas las plataformas.

---

### 3.12 agency-dashboard/data/audit/task-actions.jsonl

**Propósito:** Log de auditoría de mutaciones de tareas (append-only).

**Formato:** JSON Lines (una entrada por línea).  
**⚠️ Riesgo:** Crecimiento ilimitado — sin paginación ni rotación de logs.

---

## 4. VOLUMEN DE DATOS ACTUAL

| Tipo | Cantidad | Estimado de tamaño |
|------|---------|-------------------|
| Clientes activos | 3 (+ 2 sin shared-data) | N/A |
| Archivos de métricas | 4 (2 clientes × 2 meses) | ~50KB total |
| Reportes generados | 7 (mensual + semanales) | ~200KB total |
| Archivos Markdown de clientes | ~80 archivos | ~500KB total |
| Workflows n8n (backup) | 4 JSON | ~100KB |

**Observación:** El volumen actual es extremadamente pequeño. Una migración a Supabase es directa.

---

## 5. ESQUEMA PROPUESTO EN SUPABASE

```sql
-- Tablas principales para la nueva aplicación
CREATE TABLE organizations (id uuid, name text, ...);        -- Multi-empresa
CREATE TABLE clients (id uuid, org_id uuid, name text, ...); -- Multi-cliente
CREATE TABLE client_documents (client_id uuid, key text, content text, ...);
CREATE TABLE client_integrations (client_id uuid, platform text, config jsonb, ...);
CREATE TABLE tasks (client_id uuid, title text, status text, ...);
CREATE TABLE metrics (client_id uuid, period text, platform text, data jsonb, ...);
CREATE TABLE campaigns (client_id uuid, platform text, data jsonb, ...);
CREATE TABLE alerts (client_id uuid, type text, severity text, ...);
CREATE TABLE reports (client_id uuid, type text, period text, data jsonb, ...);
CREATE TABLE automations (id uuid, name text, status text, ...);
CREATE TABLE execution_history (automation_id uuid, status text, ...);
CREATE TABLE report_recipients (client_id uuid, config jsonb, ...);
CREATE TABLE ai_agent_runs (client_id uuid, agent text, prompt text, result text, ...);
```

---

## 6. DATOS NO DETERMINADOS

| Elemento | Estado | Acción requerida |
|---------|--------|-----------------|
| Account ID Meta de magic-bungalow | No visible (hardcodeado en code node n8n) | Revisar en n8n UI o en historial de sincronización |
| Contenido de `bop-soluciones/metrics.json` | Formato desconocido (no es MonthlyMetrics) | Revisar y decidir si migrar o archivar |
| Contenido de `bop-soluciones/campaigns.json` | Revisado brevemente — tiene campañas en formato alternativo | Mapear al schema MonthlyMetrics |
| Contenido de `bop-soluciones/insights.json` | No revisado | Revisar y catalogar |
| Estado de n8n credentials (tokens Meta, Gmail) | Almacenados en volumen Docker (n8n_data) | Extraer antes de migrar |

---

*Generado automáticamente el 2026-07-29 como parte de la auditoría de modernización BopIAgency.*
