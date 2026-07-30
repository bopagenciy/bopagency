# N8N BACKUP SECURITY REVIEW
## BopIAgency — Revisión de Seguridad de Backups de Workflows n8n
**Fecha:** 2026-07-29  
**Fase:** 0 — Saneamiento y Seguridad  
**Archivos analizados:** 4 archivos JSON en `backups/n8n-workflows/`

---

## RESUMEN EJECUTIVO

| Workflow | Credenciales embebidas | Account IDs | Emails | Webhook IDs | ¿Puede versionarse? |
|---------|----------------------|-------------|--------|-------------|---------------------|
| CORE - Escanear Clientes | ❌ Ninguna | ❌ Ninguno | ❌ Ninguno | ❌ Ninguno | ✅ SÍ — sin restricciones |
| META - Sincronizar Métricas - Legalink | ⚠️ Credential ID (referencia) | ⚠️ `act_906...553` | ❌ Ninguno | ❌ Ninguno | ✅ SÍ — condicionado |
| META - Sincronizar Métricas - Magic Bungalow | ⚠️ Credential ID (referencia) | ⚠️ `act_800...740` + `act_425...10` | ❌ Ninguno | ❌ Ninguno | ✅ SÍ — condicionado |
| ALERTAS - Enviar Correos Críticos | ⚠️ Credential IDs (referencias) | ❌ Ninguno | ⚠️ `bopagencia@gmail.com` | ⚠️ UUID de webhook | ✅ SÍ — condicionado |

**Conclusión general:** Ninguno de los 4 archivos contiene credenciales reales embebidas (tokens, contraseñas, API keys). Solo contienen referencias a las credenciales almacenadas en el vault cifrado de n8n. Todos pueden versionarse con condiciones documentadas.

---

## REVISIÓN DETALLADA

### W-01: CORE - Escanear Clientes

**Archivo:** `backups/n8n-workflows/CORE - Escanear Clientes.json`

| Campo | Valor / Hallazgo |
|-------|----------------|
| **Credenciales embebidas** | ❌ Ninguna — opera 100% en filesystem local |
| **Tokens** | ❌ Ninguno |
| **URLs privadas** | ✅ Solo paths de filesystem: `/agencia-ai/clients/`, `/shared-data/clients-index.json` |
| **IDs de cuentas publicitarias** | ❌ Ninguno |
| **Emails personales** | ❌ Ninguno |
| **Datos de clientes** | ❌ Solo nombres de rutas de archivo |
| **Webhook secrets** | ❌ Ninguno |
| **n8n instanceId** | ⚠️ `bee9...b3b` (identificador de instancia — no es un secreto) |
| **Riesgos identificados** | Los paths absolutos de Docker (`/agencia-ai/`, `/shared-data/`) revelan la estructura del volumen, pero no son sensibles |
| **Acción requerida** | Ninguna |
| **¿Puede mantenerse versionado?** | ✅ **SÍ — sin restricciones** |

---

### W-02: META - Sincronizar Métricas - Legalink Colombia

**Archivo:** `backups/n8n-workflows/META - Sincronizar Métricas - Legalink Colombia.json`

| Campo | Valor / Hallazgo |
|-------|----------------|
| **Credenciales embebidas** | ❌ NO — solo referencia: `{id: "W8An...QK", name: "Meta Marketing API - BOP"}` |
| **¿Qué es el credential ID?** | Es un puntero al vault cifrado de n8n. Sin `N8N_ENCRYPTION_KEY`, es inútil. No contiene el token real |
| **Tokens** | ❌ Ninguno embebido |
| **URLs de API** | ⚠️ `https://graph.facebook.com/v25.0/act_906768512465553/insights` (líneas 17, 60) — URL pública de Meta Graph API |
| **IDs de cuentas publicitarias** | ⚠️ `act_906...553` hardcodeado en la URL y en parámetro `accountId` (línea 195). Nota: este ID corresponde a **Legalink Colombia** según métricas |
| **Nombre de cuenta** | ⚠️ `"Legalink Colombia"` — nombre del cliente, no sensible en sí mismo |
| **Emails personales** | ❌ Ninguno |
| **Datos de clientes** | ⚠️ `clientId: "legalink-col"` en código JavaScript embebido |
| **Webhook secrets** | ❌ Ninguno |
| **n8n instanceId** | ⚠️ `bee9...b3b` (idem W-01) |
| **Riesgos identificados** | El account ID `act_906...553` es el identificador de la cuenta publicitaria de Meta. No es un secreto en sí mismo (Meta lo considera un identificador público), pero revela qué cuentas gestiona la agencia |
| **Acción requerida antes de versionar** | Evaluar si el account ID del cliente debe quedar expuesto. Alternativa: mover a variable de entorno `META_ADS_ACCOUNT_ID_LEGALINK` |
| **¿Puede mantenerse versionado?** | ✅ **SÍ — condicionado** a decisión sobre exposición del account ID del cliente |

---

### W-03: META - Sincronizar Métricas - Magic Bungalow

**Archivo:** `backups/n8n-workflows/META - Sincronizar Métricas - Magic Bungalow.json`

| Campo | Valor / Hallazgo |
|-------|----------------|
| **Credenciales embebidas** | ❌ NO — misma referencia: `{id: "W8An...QK", name: "Meta Marketing API - BOP"}` |
| **Tokens** | ❌ Ninguno embebido |
| **URLs de API** | ⚠️ `https://graph.facebook.com/v25.0/act_906768512465553/insights` — NOTA: la URL en el nodo HTTP usa el account ID de Legalink (`act_906...553`), pero el código JS interno usa `act_800960387807740` y configura el cliente como `legalink-col`. **Este workflow puede tener un error de configuración** |
| **IDs de cuentas publicitarias** | ⚠️ Dos IDs distintos detectados: `act_906...553` (en URL) y `act_800...740` (en parámetro) — INCONSISTENCIA |
| **Datos de clientes** | ⚠️ El código JS interno contiene `CLIENT_ID = 'legalink-col'` aunque el nombre del workflow dice "Magic Bungalow" — posible error de copiar-pegar |
| **Emails personales** | ❌ Ninguno |
| **n8n instanceId** | ⚠️ `bee9...b3b` (idem) |
| **Riesgos identificados** | 🔴 **Posible bug crítico**: el workflow de Magic Bungalow puede estar sincronizando con la cuenta de Legalink. Verificar antes de confiar en las métricas de Magic Bungalow |
| **Acción requerida** | 1. Verificar en n8n qué credencial usa realmente `W8An...QK`. 2. Confirmar el account ID correcto de Magic Bungalow. 3. Los datos de métricas de magic-bungalow/2026-06.json muestran `clientId: "legalink-col"` — confirmando el bug |
| **¿Puede mantenerse versionado?** | ✅ **SÍ — condicionado** a resolución del bug (no un problema de seguridad, sino de integridad de datos) |

---

### W-04: ALERTAS - Enviar Correos Críticos

**Archivo:** `backups/n8n-workflows/ALERTAS - Enviar Correos Críticos.json`

| Campo | Valor / Hallazgo |
|-------|----------------|
| **Credenciales embebidas** | ❌ NO — solo referencias: `{id: "y8Bg...vd", name: "BOP Alert Notifications API"}` y `{id: "Qb8t...hh", name: "Gmail account"}` |
| **¿Qué son los credential IDs?** | `y8Bg...vd` → puntero al `ALERT_NOTIFICATIONS_API_KEY` de Express. `Qb8t...hh` → puntero al OAuth2 de Gmail. Sin `N8N_ENCRYPTION_KEY`, ambos son inútiles |
| **Tokens** | ❌ Ninguno embebido |
| **Email hardcodeado** | ⚠️ `"sendTo": "bopagencia@gmail.com"` (línea 99) — email de la agencia, considerado público |
| **Webhook ID** | ⚠️ `"webhookId": "f5f8c167-8ca2-4aa0-ba31-e431042fa81e"` — UUID de un nodo webhook. Si n8n no está expuesto a internet, no hay riesgo |
| **URLs del servidor Express** | ⚠️ `http://host.docker.internal:3101/api/alerts/notifications/pending` — URL interna de Docker, no accesible desde internet |
| **Datos de clientes** | ❌ Ninguno directo |
| **n8n instanceId** | ⚠️ `bee9...b3b` (idem) |
| **Riesgos identificados** | Email de la agencia hardcodeado (aceptable por ser público). Webhook ID expuesto (riesgo bajo si n8n es local). URLs de API interna (no accesibles desde internet) |
| **Acción requerida** | Verificar que n8n NO está expuesto a internet (puerto 5678). Si lo está, el webhook ID podría ser usado para disparar el workflow externamente |
| **¿Puede mantenerse versionado?** | ✅ **SÍ — condicionado** a verificación de que n8n no tiene exposición pública |

---

## HALLAZGO ESPECIAL: BUG EN WORKFLOW W-03

> **Acción requerida humana — no puede resolverse en Fase 0**

El workflow `META - Sincronizar Métricas - Magic Bungalow` contiene evidencia de un posible error de configuración:

1. La URL del nodo HTTP usa `act_906768512465553` (account de Legalink)
2. El código JavaScript interno usa `act_800960387807740` (diferente)
3. El `CLIENT_ID` en el código dice `'legalink-col'` (debería ser `'magic-bungalow'`)
4. El archivo `shared-data/metrics/clients/magic-bungalow/periods/2026-06.json` contiene `"clientId": "legalink-col"` — confirmando que este período sincronizó con la cuenta equivocada

**Impacto:** Las métricas de Magic Bungalow de junio 2026 pueden ser incorrectas (pertenecen a Legalink). Julio 2026 muestra `accountId: act_42577810` y `accountName: "Francisco Roncallo Nader"`, que parece ser una cuenta diferente.

**Acción recomendada:** Francisco debe verificar en n8n qué credencial está asignada al workflow W-03 y cuál es el account ID correcto de Magic Bungalow en Meta Business Manager.

---

## DECISIÓN DE VERSIONADO

| Archivo | Versionar | Condición |
|---------|----------|-----------|
| `CORE - Escanear Clientes.json` | ✅ SÍ | Sin restricciones |
| `META - Sincronizar Métricas - Legalink Colombia.json` | ✅ SÍ (condicionado) | Aceptar que el account ID `act_906...553` queda visible en el repo |
| `META - Sincronizar Métricas - Magic Bungalow.json` | ✅ SÍ (condicionado) | Idem. Resolver el bug antes de tomar el archivo como referencia fidedigna |
| `ALERTAS - Enviar Correos Críticos.json` | ✅ SÍ (condicionado) | Verificar que n8n no está expuesto públicamente |

**Recomendación final:** Los 4 archivos pueden mantenerse versionados. Ninguno contiene tokens, contraseñas ni secretos reales. Los account IDs de Meta son identificadores semipúblicos. El mayor riesgo (S-01) está en `n8n-local/.env`, no en los backups.

---

## ADDENDUM — 2026-07-29: VERIFICACIÓN POST-CORRECCIÓN W-03

### Estado actualizado del backup W-03 (Magic Bungalow)

El backup fue reemplazado por la versión corregida el 2026-07-29T18:58:25.

**Correcciones verificadas:**
- `Configurar Cliente`: clientId=`magic-bungalow`, accountId=`act_800960387807740`, accountName=`Glampings, hotel y cabaña Magic Bungalow Villa de Leyva` ✅
- `Construir JSON Meta`: usa valores dinámicos de `Configurar Cliente` ✅
- `Read/Write Files from Disk`: ruta dinámica con clientId ✅
- `Registrar ejecución exitosa`: workflowName y clientId correctos ✅

**Bug residual detectado (W-03b):**
Los nodos `Meta - Métricas de campaña` y `Meta - Métricas de Cuenta` siguen con URLs hardcodeadas usando `act_906768512465553` (Legalink Colombia), en lugar de `act_800960387807740` (Magic Bungalow). La corrección fue parcial: actualizó los campos de identidad y registro, pero no los nodos de extracción de datos de la API Meta.

**Impacto:** Las llamadas reales a Meta Ads se hacen sobre la cuenta de Legalink. Los datos de métricas (spend, impressions, campaigns) provienen de Legalink pero son atribuidos a Magic Bungalow en el archivo de salida.

### Estado actualizado del backup W-02 (Legalink Colombia)

El backup conservado (2026-06-22) tiene un **bug simétrico**: el nodo `Read/Write Files from Disk` tiene la ruta hardcodeada como `magic-bungalow/` en lugar de `legalink-col/`. Este es el origen de la contaminación de `shared-data/metrics/clients/magic-bungalow/periods/2026-06.json`.

**Clasificación del backup W-02:** Backup histórico sensible / archive candidate. Contiene evidencia del bug. No debe usarse como referencia operativa. No debe eliminarse.

### Tabla actualizada de workflows

| Workflow | Backup actual | Estado del bug | ¿Puede operar? |
|---------|--------------|----------------|----------------|
| W-01: CORE - Escanear Clientes | Sin cambios | ✅ Sin bugs | ✅ Sí |
| W-02: META - Legalink Colombia | 2026-06-22 (defectuoso) | 🔴 Escribe en ruta de magic-bungalow | ❌ No hasta corregir |
| W-03: META - Magic Bungalow | 2026-07-29 (parcial) | 🔴 URLs API con account de Legalink | ❌ No hasta corregir W-03b |
| W-04: ALERTAS - Enviar Correos | Sin cambios | ✅ Sin bugs conocidos | ✅ Sí |

---

---

## ADDENDUM 2 — 2026-07-29: CIERRE DEFINITIVO

### Estado final de los 5 archivos de backup

| Archivo | mtime | Estado |
|---------|-------|--------|
| `CORE - Escanear Clientes.json` | 2026-06-26 | ✅ Sin cambios — correcto |
| `ALERTAS - Enviar Correos Críticos.json` | 2026-06-22 | ✅ Sin cambios — correcto |
| `META - Sincronizar Métricas - Legalink Colombia.json` | 2026-07-29 **19:29** | ✅ Actualizado — W-02b corregido. URLs dinámicas, ruta correcta, cero referencias a Magic Bungalow |
| `META - Sincronizar Métricas - Magic Bungalow.json` | 2026-07-29 **18:58** | ⚠️ Desactualizado — mtime anterior a la ejecución corregida (19:40). Identidad correcta; URLs de API aún hardcodeadas con `act_906768512465553`. El workflow en n8n SÍ fue corregido (evidencia: métricas generadas con `act_800960387807740` y 55 campañas). Backup no re-descargado tras corrección W-03b |
| `backupMETA - Sincronizar Métricas - Legalink Colombia.json` | 2026-06-22 19:06 | ⚠️ Archivo histórico defectuoso — bug W-02b original. Conservar como evidencia. No usar como referencia operativa |

### Verificación de referencias cruzadas (resumen ejecutivo)

| Backup | Buscar | Resultado |
|--------|--------|-----------|
| Magic Bungalow | `act_906768512465553` | ENCONTRADO 2x en URLs hardcodeadas (bug residual en backup, no en n8n) |
| Magic Bungalow | `legalink-col`, `Legalink Colombia`, `/clients/legalink-col/` | AUSENTES ✅ |
| Legalink Colombia | `act_800960387807740`, `magic-bungalow`, `Magic Bungalow`, `/clients/magic-bungalow/` | AUSENTES ✅ |

### Acción pendiente post-cierre

Re-descargar el backup de Magic Bungalow desde n8n para que refleje el estado correcto del workflow. No es bloqueante para Fase 1.

*Addendum 2 añadido el 2026-07-29. Cierre definitivo de Fase 0.*

---

*Revisión inicial completada el 2026-07-29. Addendums añadidos el 2026-07-29.*
