# ENVIRONMENT VARIABLE INVENTORY
## BopIAgency — Inventario Completo de Variables de Entorno
**Fecha:** 2026-07-29  
**Fase:** 0 — Saneamiento y Seguridad  
**Nota:** No se muestran valores reales. Todos los valores son confidenciales.

---

## 1. RESUMEN

| Aplicación | Total vars | Secretas | Públicas | Faltantes | Estado |
|-----------|-----------|---------|---------|-----------|--------|
| `agency-dashboard` | 13 | 4 | 9 | 1 | 🟠 Incompleto |
| `n8n-local` | 9 | 1 | 8 | 0 | 🟠 Con riesgo (S-01) |
| `raíz BopIAgency` | 0 | 0 | 0 | — | ⚠️ Sin .gitignore raíz |

---

## 2. AGENCY-DASHBOARD — Variables de Entorno

### 2.1 Variables en `agency-dashboard/.env` (REAL — no versionado ✅)

| Variable | Secreto/Público | Obligatoria | Encontrada | Descripción | Destino futuro (Next.js) |
|---------|----------------|------------|-----------|-------------|--------------------------|
| `CLIENTS_INDEX_PATH` | Público | ✅ Sí | ✅ Sí | Path absoluto al `clients-index.json` | ⛔ Eliminar — en Next.js los clientes vienen de Supabase |
| `AGENCY_CLIENTS_PATH` | Público | ✅ Sí | ✅ Sí | Path absoluto a `.agencia-ai/clients/` | ⛔ Eliminar — en Next.js los docs van a Supabase |
| `METRICS_DATA_PATH` | Público | ✅ Sí | ✅ Sí | Path absoluto a `shared-data/metrics/` | ⛔ Eliminar — métricas en Supabase |
| `PORT` | Público | 🔲 Opcional | ✅ Sí | Puerto del servidor Express (3101) | ⛔ Eliminar — Express no existe en Next.js |
| `API_HOST` | Público | 🔲 Opcional | ✅ Sí | Host del servidor (127.0.0.1) | ⛔ Eliminar |
| `API_PORT` | Público | 🔲 Opcional | ✅ Sí | Puerto alternativo (3101) — duplicado de PORT | ⛔ Eliminar |
| `VITE_API_BASE_URL` | Público | 🔲 Opcional | ✅ Sí | URL base de la API para el frontend Vite | ⛔ Eliminar — reemplazar por `NEXT_PUBLIC_APP_URL` |
| `N8N_BASE_URL` | Público | 🔲 Opcional | ✅ Sí | URL base de n8n (http://127.0.0.1:5678) | ⛔ Eliminar — n8n migrado a Inngest |
| `N8N_API_BASE_URL` | Público | 🔲 Opcional | ✅ Sí | URL de la API REST de n8n | ⛔ Eliminar |
| `N8N_API_KEY` | 🔐 Secreto | 🔲 Opcional | ✅ Sí | JWT de autenticación a la API de n8n | ⛔ Eliminar — n8n migrado |
| `N8N_CLIENT_SCAN_WORKFLOW_NAME` | Público | 🔲 Opcional | ✅ Sí | Nombre del workflow de escaneo en n8n | ⛔ Eliminar |
| `ALERT_NOTIFICATIONS_API_KEY` | 🔐 Secreto | ✅ Sí | ✅ Sí | Bearer token para endpoints de notificaciones | ⛔ Eliminar — reemplazar por Supabase Auth + RLS |
| `AUTOMATIONS_API_KEY` | 🔐 Secreto | ✅ Sí | ✅ Sí | Bearer token para endpoints de automatizaciones | ⛔ Eliminar — reemplazar por Inngest signing key |
| `REPORT_DELIVERIES_API_KEY` | 🔐 Secreto | ✅ Sí | ✅ Sí | Bearer token para endpoints de entregas | ⛔ Eliminar — reemplazar por Supabase Auth + RLS |

### 2.2 Variables en `agency-dashboard/.env.example` (versionado ✅)

| Variable | En .env? | Comentario |
|---------|---------|-----------|
| `CLIENTS_INDEX_PATH` | ✅ | Incluida con valor de ejemplo (ruta Windows) |
| `PORT` | ✅ | Incluida |
| `AGENCY_CLIENTS_PATH` | ✅ | Incluida |
| `METRICS_DATA_PATH` | ✅ | Incluida |
| `ALERT_NOTIFICATIONS_API_KEY` | ✅ | Incluida con placeholder correcto |
| `AUTOMATIONS_API_KEY` | ✅ | Incluida con placeholder correcto |
| `REPORT_DELIVERIES_API_KEY` | ✅ | Incluida con placeholder correcto |

**Variables en `.env` real que NO están en `.env.example`:**

| Variable | Estado | Acción |
|---------|--------|--------|
| `API_HOST` | ❌ Faltante en .env.example | Agregar |
| `API_PORT` | ❌ Faltante en .env.example | Agregar |
| `VITE_API_BASE_URL` | ❌ Faltante en .env.example | Agregar |
| `N8N_BASE_URL` | ❌ Faltante en .env.example | Agregar |
| `N8N_API_BASE_URL` | ❌ Faltante en .env.example | Agregar |
| `N8N_API_KEY` | ❌ Faltante en .env.example | Agregar como `replace-with-n8n-api-key` |
| `N8N_CLIENT_SCAN_WORKFLOW_NAME` | ❌ Faltante en .env.example | Agregar |

---

## 3. N8N-LOCAL — Variables de Entorno

### 3.1 Variables en `n8n-local/.env` (no versionado — sin git en raíz)

| Variable | Secreto/Público | Obligatoria | Encontrada | Descripción | Estado de seguridad |
|---------|----------------|------------|-----------|-------------|---------------------|
| `N8N_PORT` | Público | ✅ Sí | ✅ Sí | Puerto de n8n (5678) | ✅ OK |
| `N8N_HOST` | Público | ✅ Sí | ✅ Sí | Host de n8n (localhost) | ✅ OK |
| `N8N_PROTOCOL` | Público | ✅ Sí | ✅ Sí | Protocolo (http) | ✅ OK |
| `GENERIC_TIMEZONE` | Público | ✅ Sí | ✅ Sí | Zona horaria (America/Bogota) | ✅ OK |
| `TZ` | Público | 🔲 Opcional | ✅ Sí | Zona horaria del sistema | ✅ OK |
| `N8N_ENCRYPTION_KEY` | 🔐 Secreto | ✅ Sí | ✅ Sí | Clave maestra que cifra todas las credenciales de n8n | ⚠️ R-02: Texto plano. Ver S-01 |
| `N8N_DIAGNOSTICS_ENABLED` | Público | 🔲 Opcional | ✅ Sí | Telemetría de n8n desactivada | ✅ OK |
| `N8N_PERSONALIZATION_ENABLED` | Público | 🔲 Opcional | ✅ Sí | Personalización desactivada | ✅ OK |
| `WEBHOOK_URL` | Público | 🔲 Opcional | ✅ Sí | URL base para webhooks (localhost:5678) | ✅ OK — local |
| `N8N_RESTRICT_FILE_ACCESS_TO` | Público | ✅ Sí | ✅ Sí | Rutas permitidas: `/agencia-ai;/shared-data;/files` | ✅ OK — restricción correcta |

---

## 4. VARIABLES FUTURAS — Next.js (para referencia en Fases 1-2)

> Estas variables **no existen todavía** en el repositorio. Se documentan como referencia para el futuro `.env.local` de la app Next.js. **No crear todavía.**

| Variable | Tipo | Obligatoria | Descripción | Fase de introducción |
|---------|------|------------|-------------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Público | ✅ | URL del proyecto Supabase | Fase 2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Público | ✅ | Clave anónima de Supabase (segura en cliente) | Fase 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔐 Secreto | ✅ | Clave de servicio Supabase (solo servidor) | Fase 2 |
| `ANTHROPIC_API_KEY` | 🔐 Secreto | ✅ | API key de Claude (Anthropic) | Fase 6 |
| `INNGEST_EVENT_KEY` | 🔐 Secreto | ✅ | Clave para enviar eventos a Inngest | Fase 8 |
| `INNGEST_SIGNING_KEY` | 🔐 Secreto | ✅ | Clave de firma de webhooks Inngest | Fase 8 |
| `RESEND_API_KEY` | 🔐 Secreto | ✅ | API key de Resend (proveedor de email) | Fase 8 |
| `AGENCY_ALERT_EMAIL` | Público | ✅ | Email de destino para alertas críticas | Fase 8 |
| `NEXT_PUBLIC_APP_URL` | Público | 🔲 | URL pública de la app Next.js | Fase 12 |
| `META_ADS_ACCOUNT_ID_LEGALINK` | Público | 🔲 | Account ID Meta de Legalink | Fase 4 |
| `META_ADS_ACCOUNT_ID_MAGIC_BUNGALOW` | Público | 🔲 | Account ID Meta de Magic Bungalow | Fase 4 |

---

## 5. RESPONSABLES

| Variable | Responsable actual | Responsable en nueva app |
|---------|-------------------|------------------------|
| Variables de paths (CLIENTS_INDEX_PATH, etc.) | Francisco (configura en .env local) | N/A — eliminadas |
| N8N_ENCRYPTION_KEY | Francisco | N/A — n8n se apaga en Fase 8 |
| API keys de Express (ALERT, AUTOMATIONS, REPORT) | Francisco | N/A — reemplazadas por Supabase Auth |
| SUPABASE_SERVICE_ROLE_KEY | N/A (no existe aún) | Francisco (Vercel Dashboard) |
| ANTHROPIC_API_KEY | N/A (no existe aún) | Francisco (Anthropic Console) |
| INNGEST_SIGNING_KEY | N/A (no existe aún) | Francisco (Inngest Dashboard) |
| RESEND_API_KEY | N/A (no existe aún) | Francisco (Resend Dashboard) |

---

*Inventario generado el 2026-07-29. No contiene valores reales.*
