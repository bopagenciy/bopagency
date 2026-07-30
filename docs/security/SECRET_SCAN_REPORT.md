# SECRET SCAN REPORT
## BopIAgency — Reporte de Escaneo de Secretos Expuestos
**Fecha:** 2026-07-29  
**Fase:** 0 — Saneamiento y Seguridad  
**Alcance:** Todos los archivos del repositorio, incluyendo no versionados  
**Metodología:** Inspección manual + grep de patrones (api_key, token, secret, password, oauth, bearer, encryption_key)

---

## RESUMEN EJECUTIVO

| Clasificación | Cantidad | Riesgo inmediato |
|--------------|----------|-----------------|
| ✅ Confirmed secret | 5 | 🔴 Requieren acción |
| ⚠️ Possible secret | 3 | 🟠 Verificar |
| ℹ️ Configuration identifier | 4 | 🟡 Aceptable con condiciones |
| ✅ False positive | 3 | Verde |
| ❓ Not determined | 1 | Verificar |

**Conclusión crítica:**
- Todos los secretos confirmados están en archivos `.env` correctamente ignorados por `.gitignore` de `agency-dashboard/`
- El directorio raíz `BopIAgency/` **no tiene repositorio Git** — n8n-local/.env no está bajo control de versiones
- No se encontraron secretos en ningún archivo versionado (`.ts`, `.json` de workflows, `.md`)

---

## HALLAZGOS DETALLADOS

### S-01 — N8N_ENCRYPTION_KEY en texto plano

| Campo | Valor |
|-------|-------|
| **Ruta** | `n8n-local/.env` |
| **Línea** | 8 |
| **Tipo** | Encryption key (clave maestra que cifra todas las credenciales de n8n) |
| **Valor (enmascarado)** | `sh3f...R9` (64 caracteres alfanuméricos) |
| **Clasificación** | ✅ Confirmed secret |
| **Severidad** | 🔴 CRÍTICA |
| **¿Versionado?** | ❌ NO — `BopIAgency/` no tiene git repo. El archivo no está bajo control de versiones |
| **Acción recomendada** | 1. Verificar que nunca se añada a un repo git raíz sin `.gitignore` previo. 2. Antes de cualquier cambio de `N8N_ENCRYPTION_KEY`, exportar todas las credenciales de n8n manualmente (Meta token, Gmail OAuth2). 3. No rotar todavía — n8n sigue operativo |
| **Necesita rotación** | Sí — antes de apagar n8n (Fase 8) o si el archivo llega a estar bajo control de versiones |

---

### S-02 — N8N_API_KEY (JWT Token)

| Campo | Valor |
|-------|-------|
| **Ruta** | `agency-dashboard/.env` |
| **Línea** | 12 |
| **Tipo** | JWT Bearer Token (acceso a la API REST de n8n) |
| **Valor (enmascarado)** | `eyJh...pgQ` (JWT de 3 partes, exp: 2024-07-14 aprox.) |
| **Clasificación** | ✅ Confirmed secret |
| **Severidad** | 🟠 Media |
| **¿Versionado?** | ❌ NO — correctamente ignorado por `.gitignore` de agency-dashboard |
| **Acción recomendada** | Decodificar el payload para verificar expiración. Si el token está vencido, generar uno nuevo en n8n. Incluir como `N8N_API_KEY=replace-with-n8n-api-key` en `.env.example` |
| **Necesita rotación** | Verificar expiración. El campo `exp` del JWT indica fecha de vencimiento |

---

### S-03 — ALERT_NOTIFICATIONS_API_KEY

| Campo | Valor |
|-------|-------|
| **Ruta** | `agency-dashboard/.env` |
| **Línea** | 15 |
| **Tipo** | API Key personalizada (Bearer token para endpoints de notificaciones) |
| **Valor (enmascarado)** | `Kj7h...oDU` (64 caracteres) |
| **Clasificación** | ✅ Confirmed secret |
| **Severidad** | 🟠 Media |
| **¿Versionado?** | ❌ NO — correctamente ignorado |
| **Acción recomendada** | Mantener hasta migración a Supabase Auth. En la nueva app, este mecanismo es reemplazado por RLS. Documentar el valor para configurarlo en Inngest cuando se migre (Fase 8) |
| **Necesita rotación** | No urgente — solo accesible en red local (127.0.0.1) |

---

### S-04 — AUTOMATIONS_API_KEY

| Campo | Valor |
|-------|-------|
| **Ruta** | `agency-dashboard/.env` |
| **Línea** | 16 |
| **Tipo** | API Key personalizada (Bearer token para endpoints de automatizaciones) |
| **Valor (enmascarado)** | `3fca...fe` (98 caracteres) |
| **Clasificación** | ✅ Confirmed secret |
| **Severidad** | 🟠 Media |
| **¿Versionado?** | ❌ NO — correctamente ignorado |
| **Acción recomendada** | Idem S-03. Mantener y documentar para uso en Fase 8 |
| **Necesita rotación** | No urgente |

---

### S-05 — REPORT_DELIVERIES_API_KEY

| Campo | Valor |
|-------|-------|
| **Ruta** | `agency-dashboard/.env` |
| **Línea** | 17 |
| **Tipo** | API Key personalizada (Bearer token para endpoints de entregas de reportes) |
| **Valor (enmascarado)** | `ad57...de` (98 caracteres) |
| **Clasificación** | ✅ Confirmed secret |
| **Severidad** | 🟠 Media |
| **¿Versionado?** | ❌ NO — correctamente ignorado |
| **Acción recomendada** | Idem S-03 |
| **Necesita rotación** | No urgente |

---

### S-06 — Credencial gmailOAuth2 referenciada en workflow

| Campo | Valor |
|-------|-------|
| **Ruta** | `backups/n8n-workflows/ALERTAS - Enviar Correos Críticos.json` |
| **Línea** | 114 |
| **Tipo** | Referencia a credencial OAuth2 de Gmail almacenada en n8n |
| **Valor (enmascarado)** | Credential ID: `Qb8t...hh`, Name: `Gmail account` |
| **Clasificación** | ⚠️ Possible secret |
| **Severidad** | 🟠 Media |
| **¿Versionado?** | ❌ NO — el archivo está en `backups/` que no está bajo git (solo agency-dashboard tiene .git) |
| **Acción recomendada** | El ID de credencial es solo una referencia al vault cifrado de n8n — el token OAuth2 real está cifrado con `N8N_ENCRYPTION_KEY`. Sin la key, el ID es inútil. Verificar antes de versionar este archivo si se crea un repo raíz |
| **Necesita rotación** | Exportar el token OAuth2 de Gmail antes de apagar n8n |

---

### S-07 — Credencial Meta Marketing API referenciada en workflows

| Campo | Valor |
|-------|-------|
| **Ruta** | `backups/n8n-workflows/META - Sincronizar Métricas - *.json` (×2) |
| **Línea** | ~51-90 |
| **Tipo** | Referencia a credencial httpHeaderAuth (Meta Access Token) |
| **Valor (enmascarado)** | Credential ID: `W8An...QK`, Name: `Meta Marketing API - BOP` |
| **Clasificación** | ⚠️ Possible secret |
| **Severidad** | 🟠 Media |
| **¿Versionado?** | ❌ NO — mismo análisis que S-06 |
| **Acción recomendada** | Extraer el Meta Access Token real desde n8n o Meta Business Manager antes de apagar n8n |
| **Necesita rotación** | No inmediato. Verificar expiración del token (los tokens de larga duración duran ~60 días) |

---

### S-08 — Credencial BOP Alert Notifications API referenciada

| Campo | Valor |
|-------|-------|
| **Ruta** | `backups/n8n-workflows/ALERTAS - Enviar Correos Críticos.json` |
| **Línea** | ~49, 90, 113, 140, 166 |
| **Tipo** | Referencia a httpHeaderAuth (apunta al ALERT_NOTIFICATIONS_API_KEY de Express) |
| **Valor (enmascarado)** | Credential ID: `y8Bg...vd`, Name: `BOP Alert Notifications API` |
| **Clasificación** | ⚠️ Possible secret |
| **Severidad** | 🟡 Baja |
| **¿Versionado?** | ❌ NO |
| **Acción recomendada** | El valor real está en `agency-dashboard/.env` (S-03). Este archivo JSON solo tiene el ID de referencia |
| **Necesita rotación** | No |

---

### S-09 — Meta Account ID de Legalink Colombia

| Campo | Valor |
|-------|-------|
| **Ruta** | `backups/n8n-workflows/META - Sincronizar Métricas - Legalink Colombia.json` (líneas 17, 195) y `shared-data/metrics/clients/legalink-col/periods/*.json` |
| **Tipo** | Identificador de cuenta publicitaria de Meta |
| **Valor (enmascarado)** | `act_906...553` |
| **Clasificación** | ℹ️ Configuration identifier |
| **Severidad** | 🟡 Baja |
| **¿Versionado?** | ❌ NO (actualmente, pero se debe proteger si se versiona shared-data) |
| **Acción recomendada** | Mover a variable de entorno: `META_ADS_ACCOUNT_ID_LEGALINK=act_906...553`. No debería estar hardcodeado en workflows ni en archivos de métricas |
| **Necesita rotación** | No aplica |

---

### S-10 — Meta Account ID de Magic Bungalow

| Campo | Valor |
|-------|-------|
| **Ruta** | `shared-data/metrics/clients/magic-bungalow/periods/2026-07.json` |
| **Tipo** | Identificador de cuenta publicitaria de Meta |
| **Valor (enmascarado)** | `act_425...10` |
| **Clasificación** | ℹ️ Configuration identifier |
| **Severidad** | 🟡 Baja |
| **¿Versionado?** | ❌ NO |
| **Acción recomendada** | Configurar como variable de entorno o en Supabase (tabla `client_integrations.account_id`) |
| **Necesita rotación** | No aplica |

---

### S-11 — Nombre personal en datos de métricas

| Campo | Valor |
|-------|-------|
| **Ruta** | `shared-data/metrics/clients/magic-bungalow/periods/2026-07.json` |
| **Tipo** | Nombre del titular de la cuenta Meta Ads (`accountName`) |
| **Valor** | `Francisco Roncallo Nader` |
| **Clasificación** | ℹ️ Configuration identifier / dato personal |
| **Severidad** | 🟡 Baja |
| **¿Versionado?** | ❌ NO |
| **Acción recomendada** | Usar el nombre comercial del cliente en lugar del nombre personal. En Supabase, usar `client_integrations.config.account_name = "Magic Bungalow"` |
| **Necesita rotación** | No aplica |

---

### S-12 — Email personal en report-recipients.json

| Campo | Valor |
|-------|-------|
| **Ruta** | `shared-data/reports/report-recipients.json` |
| **Líneas** | 8, 30 |
| **Tipo** | Dirección de correo electrónico personal |
| **Valor (parcial)** | `f.ron...@gmail.com` |
| **Clasificación** | ℹ️ Configuration identifier |
| **Severidad** | 🟡 Baja |
| **¿Versionado?** | ❌ NO |
| **Acción recomendada** | Migrar a tabla `report_recipients` en Supabase. No versionar con email personal. En Supabase usar una columna `email` encriptada si se requiere |
| **Necesita rotación** | No aplica |

---

### S-13 — Email de agencia en workflow y documentos

| Campo | Valor |
|-------|-------|
| **Ruta** | `backups/n8n-workflows/ALERTAS - Enviar Correos Críticos.json` (línea 99), `.agencia-ai/clients/the-industrial-depot/campaigns/google-fasteners1.md`, `.agencia-ai/clients/the-industrial-depot/strategy-30days.md` |
| **Tipo** | Email institucional de la agencia |
| **Valor** | `bopagencia@gmail.com` |
| **Clasificación** | ✅ False positive |
| **Severidad** | Verde — es información pública de la agencia |
| **¿Versionado?** | ❌ NO (actualmente) |
| **Acción recomendada** | El hardcoding del destinatario en el workflow es un problema de configuración (no de seguridad). Mover a variable de entorno para el futuro. En la nueva app, configurar como `AGENCY_ALERT_EMAIL` |
| **Necesita rotación** | No aplica |

---

### S-14 — n8n instanceId

| Campo | Valor |
|-------|-------|
| **Ruta** | `backups/n8n-workflows/*.json` (todos los 4 archivos) |
| **Tipo** | Identificador único de la instancia de n8n |
| **Valor (enmascarado)** | `bee9...b3b` (64 hex chars) |
| **Clasificación** | ✅ False positive |
| **Severidad** | Verde |
| **¿Versionado?** | ❌ NO |
| **Acción recomendada** | No es un secreto. Es un identificador que permite a n8n identificar la instancia de origen. No requiere acción |
| **Necesita rotación** | No aplica |

---

### S-15 — Webhook ID en workflow de alertas

| Campo | Valor |
|-------|-------|
| **Ruta** | `backups/n8n-workflows/ALERTAS - Enviar Correos Críticos.json` |
| **Línea** | 112 |
| **Tipo** | UUID de webhook de n8n |
| **Valor** | `f5f8c167-8ca2-4aa0-ba31-e431042fa81e` |
| **Clasificación** | ❓ Not determined |
| **Severidad** | 🟡 Baja |
| **¿Versionado?** | ❌ NO |
| **Acción recomendada** | Verificar si este webhook está activo y expuesto en alguna URL pública de n8n. Si n8n no está expuesto a internet, el riesgo es nulo. Si lo está, el webhook podría ser llamado por terceros |
| **Necesita rotación** | Verificar exposición pública |

---

## RESUMEN DE ACCIONES REQUERIDAS

| ID | Acción | Urgencia | Responsable |
|----|--------|---------|-------------|
| A-01 | Crear `.gitignore` en raíz de `BopIAgency/` antes de inicializar git raíz | 🔴 Antes de `git init` en raíz | Francisco |
| A-02 | Exportar Meta Access Token de n8n antes de apagar | 🟠 Antes de Fase 8 | Francisco |
| A-03 | Exportar Gmail OAuth2 de n8n antes de apagar | 🟠 Antes de Fase 8 | Francisco |
| A-04 | Verificar expiración del N8N_API_KEY JWT | 🟡 Fase 1 | Francisco |
| A-05 | Mover `act_906...553` y `act_425...10` a variables de entorno | 🟡 Fase 4 | Desarrollador |
| A-06 | Verificar si el webhook de n8n está expuesto a internet | 🟡 Inmediato | Francisco |
| A-07 | Documentar los valores de API keys para configuración de Inngest (Fase 8) | 🟡 Antes de Fase 8 | Francisco |

---

*Escaneo realizado el 2026-07-29. No se revelaron ni modificaron valores de secretos. No se revocaron credenciales.*
