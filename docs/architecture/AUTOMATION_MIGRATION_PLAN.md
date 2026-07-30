# AUTOMATION MIGRATION PLAN
## BopIAgency — Plan de Migración de Automatizaciones
**Fecha:** 2026-07-29  
**Estado:** Propuesta — pendiente de aprobación  
**Fuentes:** `docs/audit/N8N_WORKFLOW_INVENTORY.md`, `shared-data/automations/automations-registry.json`

---

## 1. INVENTARIO DE AUTOMATIZACIONES

El sistema actual tiene **7 automatizaciones** documentadas: 4 con backup JSON físico y 3 inferidas desde `automations-registry.json` sin backup.

### 1.1 Automatizaciones con backup JSON (físicas)

| ID | Nombre en n8n | Archivo |
|----|--------------|---------|
| W-01 | CORE - Escanear Clientes | `backups/n8n-workflows/CORE - Escanear Clientes.json` |
| W-02 | META - Sincronizar Métricas - Legalink Colombia | `backups/n8n-workflows/META - Sincronizar Métricas - Legalink Colombia.json` |
| W-03 | META - Sincronizar Métricas - Magic Bungalow | `backups/n8n-workflows/META - Sincronizar Métricas - Magic Bungalow.json` |
| W-04 | ALERTAS - Enviar Correos Críticos | `backups/n8n-workflows/ALERTAS - Enviar Correos Críticos.json` |

### 1.2 Automatizaciones inferidas (sin backup JSON)

| ID | Slug en registry | Evidencia |
|----|----------------|-----------|
| W-05 | reports-generate-monthly | `automations-registry.json` + lógica en `reportService.ts` |
| W-06 | reports-generate-weekly | `automations-registry.json` + lógica en `reportService.ts` |
| W-07 | reports-send-monthly-emails | `automations-registry.json` + lógica en `reportDeliveryService.ts` |

> ⚠️ **Acción pre-migración requerida:** Exportar los backups JSON de W-05, W-06, W-07 desde n8n antes de apagar el servicio.

---

## 2. ANÁLISIS DETALLADO POR WORKFLOW

### W-01: CORE - Escanear Clientes

| Campo | Valor |
|-------|-------|
| **Nombre** | CORE - Escanear Clientes |
| **Categoría** | core |
| **Tipo de trigger** | Cron |
| **Schedule** | Cada minuto (`* * * * *`) |
| **Estado actual** | Activo |
| **Fuente de datos** | Sistema de archivos: `/agencia-ai/clients/*/.ready` |
| **Destino de datos** | Sistema de archivos: `/shared-data/clients-index.json` |
| **Dependencias** | Docker volume mounts, acceso a filesystem local |
| **Credenciales n8n** | Ninguna (solo filesystem) |
| **Endpoints externos** | `http://host.docker.internal:3101/api/clients/index` (escribe resultado) |
| **Lógica de negocio** | Lee directorio, filtra `.ready`, parsea `client.json`, escribe índice |
| **Complejidad** | Baja |
| **Riesgos de migración** | El filesystem local no existirá en el nuevo stack |
| **Opción de migración** | **Eliminar** — se reemplaza con queries a Supabase |
| **Función Inngest propuesta** | N/A |
| **Justificación** | En el nuevo stack, los clientes viven en Supabase. El índice se consulta directamente con `SELECT * FROM clients WHERE status = 'active' AND org_id = ?`. No se necesita escaneo de archivos. |
| **Prioridad** | ✅ No migrar — eliminar en Fase 4 del roadmap |
| **Estado en tabla de decisión** | Propuesto — a confirmar |

---

### W-02 y W-03: META - Sincronizar Métricas

> W-02 (Legalink) y W-03 (Magic Bungalow) son workflows idénticos en lógica, parametrizados por cliente. Se consolidan en **una sola función Inngest** parametrizada.

| Campo | W-02 (Legalink) | W-03 (Magic Bungalow) |
|-------|----------------|----------------------|
| **Nombre** | META - Sincronizar Métricas - Legalink Colombia | META - Sincronizar Métricas - Magic Bungalow |
| **Categoría** | metrics | metrics |
| **Tipo de trigger** | Cron | Cron |
| **Schedule** | Diario 06:00 (`0 6 * * *`) | Diario 06:00 (`0 6 * * *`) |
| **Estado actual** | Activo | Activo |
| **Cuenta Meta** | `act_906768512465553` | Sin confirmar (ver MIGRATION_RISKS R-10) |
| **API** | Meta Graph API v25.0 | Meta Graph API v25.0 |
| **Credenciales n8n** | Meta Access Token (cifrado en vault n8n) | Meta Access Token (cifrado en vault n8n) |
| **Lógica de negocio** | Fetch insights → normalizar → escribir JSON en shared-data | Idem |
| **Campos de métricas** | spend, impressions, clicks, reach, cpm, ctr, date_start, date_stop | Idem |
| **Período** | Mes actual (date_preset: this_month) | Idem |
| **Destino** | `shared-data/metrics/clients/{id}/periods/YYYY-MM.json` | Idem |
| **Complejidad** | Media | Media |
| **Riesgos** | Token vence si es de corta duración; formato de respuesta v25.0 puede variar | Meta account ID desconocido |
| **Opción de migración** | **Inngest Function** parametrizada | Idem (misma función) |
| **Función Inngest propuesta** | `syncMetaPlatformMetrics` — ejecuta para todos los clientes con `meta_ads.enabled = true` | Incluido en la misma función |
| **Prioridad** | 🔴 Alta — sin esto no hay métricas | 🔴 Alta |

**Diseño de la función consolidada (conceptual):**

```
Función: syncMetaPlatformMetrics
Trigger: Cron "0 6 * * *" + Evento manual "agency/metrics.sync.requested"
Pasos:
  1. GET clients WHERE platform=meta_ads AND enabled=true (Supabase)
  2. Para cada cliente:
     a. GET vault_secret (access_token) desde Supabase Vault
     b. FETCH insights desde Meta Graph API v25.0
     c. Normalizar respuesta al schema MonthlyMetrics
     d. UPSERT en client_metrics (client_id, platform=meta_ads, period=YYYY-MM)
     e. UPDATE client_integrations SET last_synced_at = now()
     f. SEND evento "agency/metrics.synced" con { clientId }
  3. Si error en paso b-e para un cliente: registrar error, continuar con el siguiente
Retry: 3 intentos con backoff exponencial
```

---

### W-04: ALERTAS - Enviar Correos Críticos

| Campo | Valor |
|-------|-------|
| **Nombre** | ALERTAS - Enviar Correos Críticos |
| **Categoría** | alerts |
| **Tipo de trigger** | Cron |
| **Schedule** | Cada hora (`0 * * * *`) |
| **Estado actual** | Activo |
| **Fuente de datos** | `GET http://host.docker.internal:3101/api/alerts/notifications/pending?severity=critical&limit=20` |
| **Destinatario hardcodeado** | `bopagencia@gmail.com` |
| **Proveedor de email** | Gmail (OAuth2 en n8n) |
| **Lógica de negocio** | Fetch alertas críticas pendientes → Enviar email HTML a bopagencia@gmail.com → Update notification state |
| **Credenciales n8n** | Gmail OAuth2 (cifrado en vault n8n) |
| **Complejidad** | Media |
| **Riesgos** | Email hardcodeado — debe venir de configuración; Gmail OAuth2 puede expirar |
| **Opción de migración** | **Inngest Function** event-driven (reemplaza polling por eventos) |
| **Función Inngest propuesta** | `sendAlertNotifications` — trigger en evento `agency/alert.created` con severity=critical |
| **Proveedor de email** | Resend (reemplaza Gmail OAuth2) |
| **Mejoras en la migración** | Email configurable por org (no hardcodeado); HTML template mejorado; historial en DB |
| **Prioridad** | 🔴 Alta — alertas críticas deben seguir funcionando |

**Diseño de la función (conceptual):**

```
Función: sendAlertNotifications
Trigger: Evento "agency/alert.created" WHERE severity IN ('critical', 'warning')
         + Cron diario para alertas pendientes que no se notificaron
Pasos:
  1. GET alert por ID (Supabase)
  2. GET destinatarios de la org (org.settings.alert_recipients)
  3. Construir email HTML con datos de la alerta
  4. SEND email vía Resend API
  5. UPDATE alerts SET notified_at = now(), notification_status = 'sent'
  6. INSERT audit_log (entity_type='alert', action='notified')
Retry: 5 intentos con backoff exponencial
Idempotencia: verificar notified_at IS NULL antes de enviar
```

---

### W-05: REPORTES - Generar Reportes Mensuales

| Campo | Valor |
|-------|-------|
| **Nombre** | REPORTES - Generar Reportes Mensuales |
| **Categoría** | reports |
| **Tipo de trigger** | Cron |
| **Schedule** | 1ro de cada mes a las 08:00 (`0 8 1 * *`) |
| **Estado actual** | Activo (inferido de registry) |
| **Fuente de datos** | Métricas desde `shared-data/metrics/` + documentos de clientes |
| **Lógica de negocio** | Cargar métricas del mes anterior → Construir reporte → Guardar JSON en `shared-data/reports/` |
| **Implementación actual** | `agency-dashboard/server/services/reportService.ts` |
| **Complejidad** | Alta (lógica de agregación + generación de contenido) |
| **Riesgos** | Sin backup JSON — lógica solo en `reportService.ts`; puede tener dependencias con el dashboard |
| **Opción de migración** | **Inngest Function** cron mensual |
| **Función Inngest propuesta** | `generateMonthlyReports` |
| **Prioridad** | 🟠 Media — importante pero no tiempo-crítico al iniciar |

**Diseño de la función (conceptual):**

```
Función: generateMonthlyReports
Trigger: Cron "0 8 1 * *"
Pasos:
  1. Calcular período anterior (YYYY-MM del mes pasado)
  2. GET active clients (Supabase)
  3. Para cada cliente:
     a. GET metrics (client_id, period=mes_pasado) desde Supabase
     b. Generar contenido del reporte (lógica de reportService.ts migrada)
     c. UPSERT reports (client_id, type='monthly', period)
     d. CREATE report_deliveries para cada recipient
     e. SEND evento "agency/report.generated" con { reportId }
Retry: 2 intentos
```

---

### W-06: REPORTES - Generar Reportes Semanales

| Campo | Valor |
|-------|-------|
| **Nombre** | REPORTES - Generar Reportes Semanales |
| **Categoría** | reports |
| **Tipo de trigger** | Cron |
| **Schedule** | Lunes de cada semana a las 08:00 (`0 8 * * 1`) |
| **Estado actual** | Activo (inferido de registry) |
| **Fuente de datos** | Métricas desde `shared-data/metrics/` |
| **Lógica de negocio** | Misma que mensual pero con datos de la semana anterior |
| **Implementación actual** | `agency-dashboard/server/services/reportService.ts` |
| **Complejidad** | Alta |
| **Riesgos** | Sin backup JSON — mismos riesgos que W-05 |
| **Opción de migración** | **Inngest Function** cron semanal (misma función base que W-05, distinto schedule) |
| **Función Inngest propuesta** | `generateWeeklyReports` (o parámetro `type` en `generateReports`) |
| **Prioridad** | 🟠 Media |

---

### W-07: REPORTES - Enviar Reportes por Email

| Campo | Valor |
|-------|-------|
| **Nombre** | REPORTES - Enviar Reportes Mensuales por Email |
| **Categoría** | reports |
| **Tipo de trigger** | Mensual (inferido — puede ser evento o cron post-generación) |
| **Schedule** | Estimado: 1-2 de cada mes a las 09:00 |
| **Estado actual** | Activo (inferido de registry) |
| **Fuente de datos** | `shared-data/reports/` + `shared-data/reports/report-recipients.json` |
| **Lógica de negocio** | Leer reportes generados → Leer destinatarios → Enviar emails → Update delivery state |
| **Implementación actual** | `agency-dashboard/server/services/reportDeliveryService.ts` |
| **Complejidad** | Media |
| **Riesgos** | Sin backup JSON; lógica de retry manual en `reportDeliveryService.ts` |
| **Opción de migración** | **Inngest Function** event-driven (se activa cuando se genera un reporte) |
| **Función Inngest propuesta** | `sendReportEmails` — trigger en `agency/report.generated` |
| **Proveedor** | Resend |
| **Prioridad** | 🟠 Media |

---

## 3. TABLA DE DECISIÓN DE MIGRACIÓN

| ID | Workflow | Eliminar | Inngest | Supabase Cron | Edge Function | Vercel Cron | Mantener n8n |
|----|---------|----------|---------|---------------|---------------|-------------|--------------|
| W-01 | Core - Escanear Clientes | **✅ Elegido** | ❌ | ❌ | ❌ | ❌ | ❌ |
| W-02 | Meta Sync - Legalink | ❌ | **✅ Elegido** | ❌ | ❌ | ❌ | ❌ |
| W-03 | Meta Sync - Magic Bungalow | ❌ | **✅ Elegido** (consolida con W-02) | ❌ | ❌ | ❌ | ❌ |
| W-04 | Alertas - Correos Críticos | ❌ | **✅ Elegido** | ❌ | ❌ | ❌ | ❌ |
| W-05 | Reportes - Generar Mensual | ❌ | **✅ Elegido** | ❌ | ❌ | ❌ | ❌ |
| W-06 | Reportes - Generar Semanal | ❌ | **✅ Elegido** | ❌ | ❌ | ❌ | ❌ |
| W-07 | Reportes - Enviar Emails | ❌ | **✅ Elegido** | ❌ | ❌ | ❌ | ❌ |

**Resultado:** 1 workflow eliminado, 5 flujos migrados a 5 funciones Inngest (W-02 y W-03 consolidados en 1).

---

## 4. MATRIZ COMPARATIVA DE TECNOLOGÍAS

| Criterio | Inngest | Supabase Cron | Edge Functions | Vercel Cron | GitHub Actions | Mantener n8n |
|---------|---------|---------------|----------------|-------------|----------------|--------------|
| **Retry automático** | ✅ Exponential backoff configurable | ✅ pg_cron básico | ❌ Manual | ❌ Manual | ⚠️ Limitado | ✅ Configurable |
| **Observabilidad** | ✅ Dashboard completo + logs + traces | ⚠️ Solo logs de Supabase | ⚠️ Logs de Vercel | ⚠️ Solo éxito/fallo | ⚠️ Logs de Actions | ✅ Dashboard n8n |
| **Pasos encadenados** | ✅ step.run(), step.sleep(), step.waitForEvent() | ❌ Una sola query SQL | ❌ Una sola invocación | ❌ Una sola invocación | ✅ Jobs/steps | ✅ Nodos |
| **Triggers de eventos** | ✅ Event-driven nativo | ❌ Solo cron | ✅ Via HTTP | ❌ Solo cron | ⚠️ Webhooks | ✅ Webhooks |
| **Aprobación humana** | ✅ step.waitForEvent() con timeout | ❌ | ❌ | ❌ | ❌ | ⚠️ Manual |
| **Costo (proyectado)** | $0 hasta 50K runs/mes (Free) | $0 incluido en Supabase | $0 incluido en Vercel | $0 incluido en Vercel Pro | $0 (2000 min/mes) | $0 (self-hosted) + infra |
| **Integración con Next.js** | ✅ SDK nativo `@inngest/next` | ⚠️ Via Supabase client | ✅ Route Handlers | ✅ Nativo | ❌ Externo | ⚠️ Via HTTP |
| **Escalabilidad** | ✅ Cloud-native | ✅ Escala con Supabase | ✅ Edge global | ✅ Serverless | ⚠️ Limitado en cómputo | ⚠️ Requiere servidor |
| **Depuración** | ✅ Dev Server local + Cloud | ⚠️ Difícil en local | ⚠️ Emulador Vercel | ⚠️ Difícil en local | ✅ Logs en CI | ✅ Interfaz visual |
| **Tipo de tareas** | Larga duración, pasos, eventos | Tareas cortas SQL | Tareas cortas HTTP | Tareas cortas HTTP | CI/CD, tareas batch | Workflows visuales |
| **Mantenibilidad** | ✅ TypeScript, colocado con el código | ⚠️ SQL puro | ⚠️ TypeScript aislado | ⚠️ TypeScript aislado | ⚠️ YAML externo | ⚠️ JSON opaco, sin git flow |
| **Curva de aprendizaje** | Baja (1-2 días) | Muy baja | Baja | Muy baja | Media | Baja (ya conocida) |

**Veredicto:** Inngest es la opción dominante para BopIAgency porque:
1. Las automatizaciones requieren pasos encadenados (fetch → normalize → upsert → notify)
2. Se necesita aprobación humana en flujos futuros (Campañas → Publicación)
3. El retry y la observabilidad son requisitos no negociables (ver `MIGRATION_RISKS.md` R-03)
4. La integración nativa con Next.js elimina infraestructura adicional
5. El costo en el Free tier es $0 para el volumen actual de la agencia

---

## 5. CATÁLOGO DE FUNCIONES INNGEST PROPUESTAS

| Función | ID Inngest | Trigger | Schedule / Evento | Prioridad |
|---------|-----------|---------|------------------|-----------|
| Sincronizar métricas Meta | `sync-meta-metrics` | Cron + Evento | `0 6 * * *` / `agency/metrics.sync.requested` | 🔴 Alta |
| Evaluar alertas | `evaluate-alerts` | Evento | `agency/metrics.synced` | 🔴 Alta |
| Enviar notificaciones de alerta | `send-alert-notifications` | Evento | `agency/alert.created` | 🔴 Alta |
| Generar reportes mensuales | `generate-monthly-reports` | Cron | `0 8 1 * *` | 🟠 Media |
| Generar reportes semanales | `generate-weekly-reports` | Cron | `0 8 * * 1` | 🟠 Media |
| Enviar reportes por email | `send-report-emails` | Evento | `agency/report.generated` | 🟠 Media |
| Sincronizar cliente al crear | `on-client-created` | Evento | `agency/client.created` | 🟡 Baja |

---

## 6. PLAN DE TRANSICIÓN

### Fase de Coexistencia (Roadmap Fase 8)

Durante la migración, n8n y las nuevas funciones Inngest coexisten temporalmente:

```
Semana 1-2: Implementar funciones Inngest en staging
Semana 3:   Testear con datos reales de un cliente (cliente-prueba)
Semana 4:   Validar equivalencia funcional (métricas, alertas)
Semana 5:   Deshabilitar workflows n8n equivalentes (no eliminar)
Semana 6:   Monitorear Inngest en producción por 1 semana
Semana 7:   Confirmar éxito → apagar n8n Docker
```

### Rollback

Si Inngest falla durante la transición:
1. Rehabilitar los workflows n8n correspondientes (están deshabilitados, no eliminados)
2. Investigar el fallo en Inngest Dashboard
3. Fix → re-deploy → deshabilitar n8n nuevamente

### Pre-requisitos antes de migrar

- [ ] Exportar Meta Access Token de n8n credentials (para legalink-col)
- [ ] Confirmar Meta Account ID de magic-bungalow (ver `MIGRATION_RISKS.md` R-10)
- [ ] Exportar backups JSON de W-05, W-06, W-07 desde n8n
- [ ] Configurar Resend API para emails (reemplaza Gmail OAuth2)
- [ ] Configurar Supabase Vault con los tokens migrados
- [ ] Aprobar schema de Supabase (DATABASE_DESIGN.md)

---

*Plan de migración de automatizaciones — 2026-07-29. Propuesta pendiente de aprobación.*
