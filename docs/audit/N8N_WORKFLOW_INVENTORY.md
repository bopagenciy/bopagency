# N8N WORKFLOW INVENTORY
## BopIAgency — Inventario de Workflows de n8n
**Fecha:** 2026-07-29

---

## RESUMEN EJECUTIVO

| # | Nombre | Estado | Trigger | Frecuencia | Equivalente Inngest |
|---|--------|--------|---------|-----------|---------------------|
| 1 | CORE - Escanear Clientes | ✅ Activo | Schedule + Manual | Cada minuto | `scan-clients` function |
| 2 | META - Sincronizar Métricas - Legalink Colombia | ✅ Activo | Schedule + Manual | Diario 06:00 | `sync-meta-metrics` function |
| 3 | META - Sincronizar Métricas - Magic Bungalow | ✅ Activo | Schedule + Manual | Diario 06:00 | `sync-meta-metrics` function |
| 4 | ALERTAS - Enviar Correos Críticos | ✅ Activo | Schedule + Manual | Cada hora | `send-alert-emails` function |

**Adicionales en registro (sin JSON backup):**
| # | ID | Nombre | Frecuencia |
|---|-----|--------|-----------|
| 5 | `reports-generate-monthly` | REPORTES - Generar Reportes Mensuales | Mensual |
| 6 | `reports-generate-weekly` | REPORTES - Generar Reportes Semanales | Semanal |
| 7 | `reports-send-monthly-emails` | REPORTES - Enviar Reportes Mensuales | Mensual |

---

## WORKFLOW 1: CORE - Escanear Clientes

### Metadatos
| Campo | Valor |
|-------|-------|
| **Nombre** | CORE - Escanear Clientes |
| **Archivo backup** | `backups/n8n-workflows/CORE - Escanear Clientes.json` |
| **Estado** | Activo |
| **Provider** | n8n (Docker local) |

### Propósito
Escanear el sistema de archivos en busca de clientes nuevos o actualizados (identificados por el archivo `.ready`), leer su `client.json`, normalizarlos y escribir el índice maestro `shared-data/clients-index.json` que consume la Express API.

### Triggers
- **Automático:** `scheduleTrigger` — cada 1 minuto (campo: `minutes`)
- **Manual:** `manualTrigger` — "When clicking 'Execute workflow'"

### Pasos (nodos)
| # | Tipo de nodo | Nombre | Acción |
|---|-------------|--------|--------|
| 1 | scheduleTrigger / manualTrigger | Triggers | Inicia el flujo |
| 2 | readWriteFile | Read/Write Files from Disk | Lee todos los archivos que coincidan con `/agencia-ai/clients/*/.ready` |
| 3 | extractFromFile | Extract from File | Extrae el contenido del archivo `.ready` |
| 4 | code | Interpretar Ready | Parsea el `.ready` y construye la ruta al `client.json` |
| 5 | readWriteFile | Leer Client JSON | Lee el `client.json` de cada cliente usando la ruta construida |
| 6 | extractFromFile | Extraer Client JSON | Extrae el contenido JSON del archivo |
| 7 | code | Normalizar Cliente | Normaliza el objeto del cliente (nombres de campos, valores por defecto) |
| 8 | code | Construir Índice de Clientes | Agrega todos los clientes normalizados en un array |
| 9 | convertToFile | Convert to File | Convierte el índice a bytes JSON |
| 10 | readWriteFile | Read/Write Files from Disk1 | **Escribe** `/shared-data/clients-index.json` |

### Servicios externos
Ninguno — operación 100% local sobre el sistema de archivos.

### Entradas
- Directorio `/agencia-ai/clients/` (montura Docker: `../.agencia-ai:/agencia-ai:ro`)
- Archivos `.ready` en cada subdirectorio de cliente

### Salidas
- `shared-data/clients-index.json` — índice JSON con schema: `{schemaVersion, generatedAt, clientCount, clients[]}`

### Credenciales requeridas
Ninguna.

### Manejo de errores
No documentado en el JSON — sin nodos de error handling explícitos.

### Frecuencia
Cada 1 minuto (potencialmente ineficiente — no comprueba si hubo cambios).

### ⚠️ Problemas detectados
- Se ejecuta cada minuto independientemente de si hubo cambios en los clientes
- La montura del volumen Docker es `:ro` (read-only), lo que es correcto para seguridad
- Sin manejo de errores si un `client.json` está malformado

### Equivalente propuesto en Inngest

```typescript
// inngest/functions/scanClients.ts
export const scanClients = inngest.createFunction(
  { id: "scan-clients", name: "CORE - Sincronizar Clientes" },
  [
    // Trigger automático: al crear/actualizar un cliente en Supabase
    { event: "agency/client.created" },
    { event: "agency/client.updated" },
    // También disparable manualmente desde la UI
    { event: "agency/clients.scan-requested" }
  ],
  async ({ event, step }) => {
    const clients = await step.run("fetch-active-clients", async () => {
      return supabase.from("clients").select("*").eq("status", "active");
    });
    await step.run("update-clients-index", async () => {
      // Actualiza tabla en Supabase, no archivo JSON
      // El índice ya ES la tabla de clients
    });
  }
);
// Nota: En Next.js + Supabase, el "índice" es simplemente la tabla clients.
// Este workflow se elimina — la sincronización ocurre en tiempo real via Supabase.
```

---

## WORKFLOW 2: META - Sincronizar Métricas - Legalink Colombia

### Metadatos
| Campo | Valor |
|-------|-------|
| **Nombre** | META - Sincronizar Métricas - Legalink Colombia |
| **Archivo backup** | `backups/n8n-workflows/META - Sincronizar Métricas - Legalink Colombia.json` |
| **Estado** | Activo |
| **ID de cuenta Meta** | `act_906768512465553` |
| **Cliente** | legalink-col |

### Propósito
Sincronizar diariamente las métricas de campañas de Meta Ads (Facebook/Instagram) para Legalink Colombia desde la Graph API de Meta, normalizarlas al schema interno y escribirlas en el archivo de período correspondiente en `shared-data/`.

### Triggers
- **Automático:** `scheduleTrigger` — diariamente a las 06:00 (campo: `triggerAtHour: 6`)
- **Manual:** `manualTrigger`

### Pasos (nodos)
| # | Tipo de nodo | Nombre | Acción |
|---|-------------|--------|--------|
| 1 | scheduleTrigger / manualTrigger | Triggers | Inicia el flujo |
| 2 | set | Configurar Cliente | Configura variables: clientId, período, rutas |
| 3 | httpRequest | Meta - Métricas de campaña | GET `https://graph.facebook.com/v25.0/act_906768512465553/insights` con campos de campaña |
| 4 | httpRequest | Meta - Métricas de Cuenta | GET `https://graph.facebook.com/v25.0/act_906768512465553/insights` con métricas de cuenta |
| 5 | code | Normalizar Métricas de Cuenta | Mapea campos de Meta al schema interno (spend, impressions, clicks, leads, etc.) |
| 6 | code | Normalizar Campañas | Normaliza cada campaña al schema `CampaignSchema` |
| 7 | merge | Unir Métricas Meta | Combina métricas de cuenta con métricas de campañas |
| 8 | code | Construir JSON Meta | Construye el objeto `MonthlyMetrics` completo con schema `1.0.0` |
| 9 | convertToFile | Convert to File | Serializa a bytes JSON |
| 10 | readWriteFile | Read/Write Files from Disk | **Escribe** `/shared-data/metrics/clients/legalink-col/periods/{YYYY-MM}.json` |

### Servicios externos
- **Meta Graph API v25.0** — endpoint: `https://graph.facebook.com/v25.0/act_906768512465553/insights`
- **Credencial:** Meta Business OAuth / Access Token (almacenado en n8n credentials)

### Entradas
- Cuenta de Meta Ads: `act_906768512465553` (Legalink Colombia)
- Período: mes actual (construido dinámicamente en el nodo Set)
- Access Token de Meta (credential de n8n)

### Salidas
- Archivo JSON: `shared-data/metrics/clients/legalink-col/periods/{YYYY-MM}.json`
- Schema de salida: `MonthlyMetrics` (definido en `server/schemas/metricsSchemas.ts`)
- Campos: `clientId`, `period`, `currency: COP`, `sources[meta_ads]`, `aggregate`, `dataQuality`

### Credenciales requeridas
- Meta Ads Access Token (OAuth2) — configurado en n8n credentials (no expuesto en JSON)
- Permisos de Meta: `ads_read`, `read_insights`

### Manejo de errores
Sin nodos de error handling explícitos en el backup. Si la API de Meta falla, no hay retry automático.

### Frecuencia
Diariamente a las 06:00 (America/Bogota).

### ⚠️ Problemas detectados
- El `act_` (Account ID) está hardcodeado en la URL del httpRequest — no es paramétrico
- Un workflow separado por cliente no escala — con 10 clientes = 10 workflows idénticos
- Sin retry logic ante fallas de la API de Meta
- Sin validación de que los datos recibidos son correctos antes de escribir
- El nodo Set aparece vacío (sin parámetros) en la inspección — las variables de cliente pueden estar hardcodeadas en los code nodes

### Equivalente propuesto en Inngest

```typescript
// inngest/functions/syncMetaMetrics.ts
export const syncMetaMetrics = inngest.createFunction(
  { 
    id: "sync-meta-metrics",
    name: "META - Sincronizar Métricas",
    concurrency: { limit: 3 } // máximo 3 clientes en paralelo
  },
  [
    // Cron diario a las 06:00 Bogotá
    { cron: "0 6 * * *" },
    // Disparable por cliente desde la UI
    { event: "agency/metrics.sync-requested" }
  ],
  async ({ event, step }) => {
    // Si es evento manual, procesar solo ese cliente
    // Si es cron, procesar todos los clientes con Meta Ads activo
    const clients = await step.run("get-meta-clients", async () => {
      return supabase
        .from("client_integrations")
        .select("client_id, account_id, access_token")
        .eq("platform", "meta_ads")
        .eq("enabled", true);
    });

    // Fan-out: un paso por cliente
    await Promise.all(clients.map(async (client) => {
      await step.run(`sync-${client.client_id}`, async () => {
        const metrics = await fetchMetaInsights(client.account_id, client.access_token);
        const normalized = normalizeMetaMetrics(metrics, client.client_id);
        await supabase.from("client_metrics").upsert(normalized);
      });
    }));
  }
);
// Ventaja: un solo workflow para todos los clientes, paramétrico y escalable.
```

---

## WORKFLOW 3: META - Sincronizar Métricas - Magic Bungalow

Idéntico al Workflow 2 en estructura, con diferente cliente:
- **Account ID Meta:** Diferente (no visible en inspección — hardcodeado en code node)
- **Cliente:** `magic-bungalow`
- **Salida:** `shared-data/metrics/clients/magic-bungalow/periods/{YYYY-MM}.json`

**Equivalente Inngest:** Mismo `syncMetaMetrics` function — el clientId es un parámetro.

---

## WORKFLOW 4: ALERTAS - Enviar Correos Críticos

### Metadatos
| Campo | Valor |
|-------|-------|
| **Nombre** | ALERTAS - Enviar Correos Críticos |
| **Archivo backup** | `backups/n8n-workflows/ALERTAS - Enviar Correos Críticos.json` |
| **Estado** | Activo |
| **Destinatario** | bopagencia@gmail.com |

### Propósito
Consultar cada hora la Express API para obtener alertas con notificaciones pendientes de envío, enviar un correo por cada alerta crítica via Gmail, y registrar el resultado (enviado/fallido) de vuelta en la API.

### Triggers
- **Automático:** `scheduleTrigger` — cada 1 hora (campo: `hours`)
- **Manual:** `manualTrigger`

### Pasos (nodos)
| # | Tipo de nodo | Nombre | Acción |
|-------|-------------|--------|--------|
| 1 | scheduleTrigger / manualTrigger | Triggers | Inicia el flujo |
| 2 | httpRequest | Obtener notificaciones pendientes | GET `http://host.docker.internal:3101/api/alerts/notifications/pending?severity=critical&limit=20` con Bearer token |
| 3 | splitOut | Separar notificaciones | Itera sobre cada notificación pendiente |
| 4 | httpRequest | Registrar intento | POST `.../api/alerts/notifications/{alertId}/attempt` |
| 5 | gmail | Enviar correo de alerta | Envía email a `bopagencia@gmail.com` con subject y HTML del alert |
| 6a | httpRequest | Marcar como enviada | POST `.../api/alerts/notifications/{alertId}/sent` (en éxito) |
| 6b | httpRequest | Marcar como fallida | POST `.../api/alerts/notifications/{alertId}/failed` (en error) |

### Servicios externos
- **Express API local** vía `host.docker.internal:3101` (requiere Docker Desktop)
- **Gmail API** — integración nativa de n8n con OAuth2

### Entradas
- Alertas con estado `notification: pending` y `severity: critical` desde la Express API
- Autenticación: `Authorization: Bearer {ALERT_NOTIFICATIONS_API_KEY}`

### Salidas
- Correo enviado a `bopagencia@gmail.com` con contenido HTML del alert
- Actualización del estado de notificación en `shared-data/alerts/notification-state.json`

### Credenciales requeridas
- `ALERT_NOTIFICATIONS_API_KEY` (Bearer token para la Express API)
- Gmail OAuth2 (configurado en n8n credentials)

### Manejo de errores
- Nodo de error en el paso de Gmail → llama a "Marcar como fallida"
- Sin retry automático para fallos de Gmail

### Frecuencia
Cada 1 hora.

### ⚠️ Problemas detectados
- `host.docker.internal` solo funciona en Docker Desktop (Windows/Mac) — no en Linux
- Destinatario hardcodeado: `bopagencia@gmail.com` — no usa el registro de destinatarios
- Solo procesa alertas `critical` — las `warning` e `info` nunca se envían
- Sin deduplicación — si la API devuelve la misma alerta dos veces, se enviará dos veces
- Frecuencia alta (cada hora) para una agencia pequeña

### Equivalente propuesto en Inngest

```typescript
// inngest/functions/sendAlertEmails.ts
export const sendAlertEmails = inngest.createFunction(
  { id: "send-alert-emails", name: "ALERTAS - Enviar Correos Críticos" },
  [
    // Cron: cada hora
    { cron: "0 * * * *" },
    // Event-driven: cuando se crea una alerta crítica
    { event: "agency/alert.created", if: "event.data.severity == 'critical'" }
  ],
  async ({ event, step }) => {
    const pendingAlerts = await step.run("get-pending-alerts", async () => {
      return supabase
        .from("alerts")
        .select("*, clients(name, report_recipients)")
        .eq("notification_status", "pending")
        .in("severity", ["critical", "warning"])
        .order("detected_at", { ascending: true })
        .limit(50);
    });

    await Promise.all(pendingAlerts.map(async (alert) => {
      await step.run(`send-${alert.id}`, async () => {
        await sendEmail({
          to: alert.clients.report_recipients,
          subject: alert.title,
          html: buildAlertEmailHTML(alert)
        });
        await supabase
          .from("alerts")
          .update({ notification_status: "sent", sent_at: new Date() })
          .eq("id", alert.id);
      });
    }));
  }
);
// Ventaja: usa la tabla de destinatarios por cliente, no hardcoded.
// Los reintentos son automáticos via Inngest retries.
```

---

## WORKFLOWS 5, 6, 7 — SIN BACKUP JSON

Estos workflows existen en el registro de automatizaciones (`shared-data/automations/automations-registry.json`) pero **no tienen JSON de backup** en `backups/n8n-workflows/`. Su comportamiento se infiere del código del `reportService.ts` y `reportDeliveryService.ts`.

### WORKFLOW 5: REPORTES - Generar Reportes Mensuales
- **Propósito:** Generar reportes mensuales para todos los clientes activos
- **Trigger:** Mensual (primer día del mes presumiblemente)
- **Equivalente Inngest:** Llamar a `generateReport` en un cron mensual

### WORKFLOW 6: REPORTES - Generar Reportes Semanales
- **Propósito:** Generar reportes semanales para clientes con `sendWeekly: true`
- **Trigger:** Semanal
- **Equivalente Inngest:** Cron semanal `0 8 * * 1`

### WORKFLOW 7: REPORTES - Enviar Reportes Mensuales
- **Propósito:** Leer cola de entregas pendientes y enviar reportes por email
- **Trigger:** Mensual, después de la generación
- **Equivalente Inngest:** Event-driven: `{ event: "agency/report.generated" }` → envía

---

## RESUMEN DE MIGRACIÓN A INNGEST

| Aspecto | n8n actual | Inngest propuesto |
|---------|-----------|------------------|
| Configuración | Docker, GUI, no-code | TypeScript puro, código versionado |
| Escalabilidad | Un workflow por cliente | Un function parametrizado para N clientes |
| Error handling | Manual, sin retry nativo | Retry automático configurable |
| Observabilidad | Dashboard n8n local | Dashboard Inngest + logs en Supabase |
| Credenciales | Almacenadas en n8n DB | Variables de entorno / Supabase vault |
| Deployment | Docker compose local | Serverless (Vercel/Railway) |
| Testing | Imposible sin n8n corriendo | Jest/Vitest — las functions son TypeScript puro |
| Triggers event-driven | Solo mediante webhooks HTTP | Nativos — `inngest.send(event)` desde cualquier parte |
| host.docker.internal | Workaround necesario | Desaparece — todo en el mismo proceso/deploy |

### Orden de migración recomendado
1. `sync-meta-metrics` — Alto valor, código claro, fácil de reimplementar con SDK de Meta
2. `send-alert-emails` — Dependencia de alertas, reimplementar con Resend/Nodemailer
3. `generate-reports` (weekly + monthly) — Depende de métricas sincronizadas
4. `send-report-emails` — Depende de generación de reportes
5. `scan-clients` — Se elimina — reemplazado por Supabase Realtime

---

*Generado automáticamente el 2026-07-29 como parte de la auditoría de modernización BopIAgency.*
