# SHARED-DATA SECURITY REVIEW
## BopIAgency — Revisión de Seguridad de shared-data/
**Fecha:** 2026-07-29  
**Fase:** 0 — Saneamiento y Seguridad  
**Archivos analizados:** 25 archivos JSON en `shared-data/`

> **Restricción:** No se alteraron ni movieron archivos durante esta revisión.

---

## RESUMEN EJECUTIVO

| Categoría de riesgo | Archivos afectados | Hallazgo principal |
|--------------------|-------------------|-------------------|
| 🔴 PII — Emails personales | `report-recipients.json` | `f.roncallo@gmail.com` como destinatario de reportes de clientes |
| 🔴 Datos financieros reales | `metrics/clients/magic-bungalow/periods/2026-07.json` | Gasto real 159,048 COP, nombres de campañas con URLs privadas |
| 🟠 Account IDs publicitarios | 4 archivos de métricas | `act_906...553` (Legalink), `act_425...10` (cuenta personal) |
| 🟠 Nombre personal | `metrics/clients/magic-bungalow/periods/2026-07.json` | `"accountName": "Francisco Roncallo Nader"` |
| 🟡 IDs de cuentas de clientes | `clients-index.json`, archivos de métricas | IDs internos y nombres de empresa |
| 🟡 Historial de alertas | `alerts/alert-state.json`, `notification-state.json` | Referencias a account IDs en claves de estado |
| ✅ Sin PII | Archivos de reportes semanales/mensuales (métricas cero) | Solo datos agregados, sin información personal |

**Conclusión:** `shared-data/` contiene datos operacionales reales con PII (emails), identificadores publicitarios y datos financieros. **No debe versionarse** sin revisión individual de cada archivo. El `.gitignore` raíz ya protege `report-recipients.json`; se recomienda extender la protección a toda la carpeta `shared-data/`.

---

## REVISIÓN DETALLADA POR ARCHIVO

### 1. `shared-data/reports/report-recipients.json`

**Clasificación:** 🔴 PII — Datos sensibles

| Campo | Hallazgo |
|-------|---------|
| **PII encontrada** | `"f.roncallo@gmail.com"` — email personal de Francisco Roncallo |
| **Contexto** | Configurado como destinatario de reportes de `cliente-prueba-automatizacion-marketing-digital` y `magic-bungalow` |
| **Riesgo** | Si este archivo llega a un repositorio público o se expone en logs, expone el email personal del operador de la agencia |
| **Estado actual** | ✅ Ya excluido por `.gitignore` raíz (entrada `shared-data/reports/report-recipients.json`) |
| **Acción adicional** | Migrar a tabla `report_recipients` en Supabase (Fase 5). En producción, usar email de la agencia (`bopagencia@gmail.com`) en vez de email personal |
| **¿Puede versionarse?** | ❌ NO |

---

### 2. `shared-data/metrics/clients/magic-bungalow/periods/2026-07.json`

**Clasificación:** 🔴 Datos financieros reales + PII

| Campo | Hallazgo |
|-------|---------|
| **Nombre personal** | `"accountName": "Francisco Roncallo Nader"` — nombre completo del propietario |
| **Account ID** | `"accountId": "act_42577810"` — cuenta personal de Meta Ads (no una cuenta de negocio de Magic Bungalow) |
| **Gasto real** | `"spend": 159048` COP (~39 USD) — dato financiero real de julio 2026 |
| **URLs en nombres de campañas** | `https://go.hotmart.com/P102470474D`, `https://api.whatsapp.com/send` — URLs de producto/negocio del cliente |
| **Conversiones** | 60 conversiones, 686 clics — datos reales de rendimiento |
| **Alerta de integridad** | La cuenta `act_42577810` tiene `accountName: "Francisco Roncallo Nader"` — posiblemente es la cuenta personal del operador siendo usada para el cliente, o una cuenta de cliente con nombre personal |
| **Riesgo** | Exposición de nombre completo + actividad publicitaria personal + URLs de productos externos |
| **¿Puede versionarse?** | ❌ NO |

---

### 3. `shared-data/metrics/clients/magic-bungalow/periods/2026-06.json`

**Clasificación:** 🟠 Bug de datos — datos cruzados entre clientes

| Campo | Hallazgo |
|-------|---------|
| **clientId en datos** | `"clientId": "legalink-col"` — confirma el bug del workflow W-03 |
| **accountId** | `act_906768512465553` — cuenta de Legalink, no de Magic Bungalow |
| **accountName** | `"Legalink Colombia"` |
| **Datos financieros** | `spend: 0` — sin gasto real expuesto, pero la cuenta ID es la de Legalink |
| **Impacto** | Las métricas de junio 2026 de Magic Bungalow son en realidad datos (vacíos) de Legalink |
| **¿Puede versionarse?** | ❌ NO (datos de runtime con bug de integridad) |

---

### 4. `shared-data/metrics/clients/legalink-col/periods/2026-06.json` y `2026-07.json`

**Clasificación:** 🟠 Account ID de cliente

| Campo | Hallazgo |
|-------|---------|
| **Account ID** | `"accountId": "act_906768512465553"` — identificador publicitario de Legalink Colombia |
| **Nombre de cuenta** | `"accountName": "Legalink Colombia"` — nombre del cliente |
| **Datos financieros** | `spend: 0` en ambos períodos — sin datos reales activos |
| **Riesgo** | El account ID revela que Legalink Colombia tiene presencia en Meta Ads |
| **¿Puede versionarse?** | ❌ NO (datos de runtime) |

---

### 5. `shared-data/clients-index.json`

**Clasificación:** 🟡 Datos de configuración de clientes

| Campo | Hallazgo |
|-------|---------|
| **Contenido** | IDs (`cliente-prueba-...`, `legalink-col`, `magic-bungalow`), nombres de empresa, industria, zona horaria, paths de archivos Docker |
| **PII directa** | ❌ Ninguna — no contiene emails ni datos financieros |
| **Paths expuestos** | `"/agencia-ai/clients/..."` — estructura de carpetas Docker (no es un riesgo de seguridad) |
| **Riesgo** | Revela los 3 clientes activos de la agencia y sus industrias |
| **¿Puede versionarse?** | ❌ NO (dato de runtime — se regenera automáticamente por n8n) |

---

### 6. `shared-data/alerts/alert-state.json`

**Clasificación:** 🟡 Estado operacional con referencia a account ID

| Campo | Hallazgo |
|-------|---------|
| **Contenido** | Estado de alerta `legalink-col_NO_CAMPAIGNS_act_906768512465553` |
| **Dato sensible** | `act_906768512465553` embebido como parte de la clave del estado |
| **Nota interna** | `"note": "Cuenta nueva. Pendiente crear primera campaña."` — información operacional interna |
| **PII** | ❌ Ninguna |
| **¿Puede versionarse?** | ❌ NO (dato de runtime) |

---

### 7. `shared-data/alerts/notification-state.json`

**Clasificación:** 🟡 Estado operacional

| Campo | Hallazgo |
|-------|---------|
| **Contenido** | Historial de notificaciones enviadas por n8n (ALERTAS workflow) |
| **PII** | ❌ Ninguna directa |
| **Dato relevante** | `"lastError": "Error enviando correo desde n8n"` — indica falla reciente del workflow |
| **Content hashes** | Hashes SHA-256 del contenido de alertas — no son secretos |
| **¿Puede versionarse?** | ❌ NO (dato de runtime) |

---

### 8. `shared-data/reports/report-delivery-state.json`

**Clasificación:** 🟡 Estado operacional de entregas

| Campo | Hallazgo |
|-------|---------|
| **Contenido** | Estado de entrega del reporte mensual de magic-bungalow junio 2026 (pendiente, 3 intentos) |
| **PII** | ❌ Ninguna |
| **Dato relevante** | 3 intentos fallidos — indica problema de configuración de email (coherente con `SYNC_ERROR` en notification-state) |
| **Content hash** | Hash SHA-256 del reporte — no es un secreto |
| **¿Puede versionarse?** | ❌ NO (dato de runtime) |

---

### 9. `shared-data/reports/clients/*/monthly/*.json` y `weekly/*.json` (7 archivos)

**Clasificación:** 🟡 Reportes generados con datos de clientes

| Archivos | Contenido | PII | Financiero | ¿Versionar? |
|---------|----------|-----|-----------|------------|
| `legalink-col/monthly/2026-06.json` | Métricas cero, account ID `act_906...553` | ❌ | spend: 0 | ❌ NO |
| `legalink-col/weekly/2026-W25.json` | Métricas cero | ❌ | spend: 0 | ❌ NO |
| `legalink-col/weekly/2026-W27.json` | Métricas cero | ❌ | spend: 0 | ❌ NO |
| `magic-bungalow/monthly/2026-06.json` | **Bug: usa datos de Legalink** — `accountName: "Legalink Colombia"`, `act_906...553` | ❌ | spend: 0 | ❌ NO |
| `magic-bungalow/weekly/2026-W25.json` | Métricas cero | ❌ | spend: 0 | ❌ NO |
| `magic-bungalow/weekly/2026-W26.json` | Métricas cero | ❌ | spend: 0 | ❌ NO |
| `magic-bungalow/weekly/2026-W27.json` | Métricas cero | ❌ | spend: 0 | ❌ NO |

---

### 10. `shared-data/automations/automations-registry.json` y `executions/*.json` (8 archivos)

**Clasificación:** 🟡 Registro operacional de automatizaciones

| Campo | Hallazgo |
|-------|---------|
| **Contenido** | Catálogo de 4 automatizaciones activas con historial de ejecuciones |
| **PII** | ❌ Ninguna |
| **Datos sensibles** | URLs de n8n (`http://localhost:5678`) — internas, no accesibles desde internet |
| **Datos operacionales** | Timestamps, duración de ejecuciones, estados de salud |
| **¿Puede versionarse?** | ❌ NO (dato de runtime que evoluciona continuamente) |

---

### 11. `shared-data/metrics/metrics-index.json`

**Clasificación:** 🗑️ Vacío — sin datos

| Campo | Hallazgo |
|-------|---------|
| **Contenido** | `{"clients": []}` — completamente vacío |
| **PII** | ❌ Ninguna |
| **¿Puede versionarse?** | No tiene sentido — archivo vacío sin datos |

---

## DATOS QUE NO DEBEN LLEGAR AL NAVEGADOR

Los siguientes datos están actualmente en `shared-data/` y son accedidos por el servidor Express. Deben revisarse para garantizar que no se exponen al cliente sin autenticación:

| Dato | Riesgo si llega al browser | Estado actual |
|------|---------------------------|--------------|
| `report-recipients.json` (emails) | PII expuesta | El endpoint Express requiere autenticación con `REPORT_DELIVERIES_API_KEY` |
| `metrics/*.json` (account IDs, gasto) | Datos comerciales del cliente | El endpoint requiere autenticación |
| `clients-index.json` | Lista de clientes de la agencia | El endpoint es interno (localhost) |
| `alerts/alert-state.json` (notes internas) | Información operacional interna | Solo accesible desde el dashboard |

**Recomendación:** En la migración a Next.js/Supabase, estos datos deben protegerse con Supabase Auth + RLS. Nunca acceder desde Server Components sin validación de sesión.

---

## DATOS PENDIENTES DE MIGRACIÓN PRIVADA A SUPABASE

| Dato actual en shared-data/ | Tabla destino en Supabase | Fase |
|-----------------------------|--------------------------|------|
| `report-recipients.json` | `report_recipients` | Fase 5 |
| `metrics/clients/*/periods/*.json` | `ad_metrics` | Fase 4 |
| `reports/clients/*/` | `reports` | Fase 5 |
| `alerts/alert-state.json` | `alerts` | Fase 8 |
| `alerts/notification-state.json` | `notifications` | Fase 8 |
| `automations/automations-registry.json` | `automations` | Fase 9 |
| `automations/executions/*.json` | `automation_executions` | Fase 9 |
| `clients-index.json` | `clients` (ya en schema) | Fase 3 |
| `report-delivery-state.json` | `report_deliveries` | Fase 5 |

---

## DECISIÓN DE VERSIONADO — RESUMEN

| Archivo/Directorio | ¿Versionar? | Razón |
|-------------------|------------|-------|
| `shared-data/reports/report-recipients.json` | ❌ NO | PII — emails personales. Ya en `.gitignore` raíz |
| `shared-data/metrics/**` | ❌ NO | Account IDs publicitarios, nombre personal, datos financieros |
| `shared-data/reports/clients/**` | ❌ NO | Datos de clientes con account IDs y métricas |
| `shared-data/alerts/**` | ❌ NO | Estado operacional con referencias a account IDs |
| `shared-data/automations/**` | ❌ NO | Datos de runtime |
| `shared-data/clients-index.json` | ❌ NO | Datos de runtime — se regenera automáticamente |
| `shared-data/` (toda la carpeta) | ❌ NO | **Recomendación: agregar `shared-data/` al `.gitignore` raíz** |

---

## ACCIÓN RECOMENDADA PARA `.gitignore` RAÍZ

El `.gitignore` raíz actual solo excluye `shared-data/reports/report-recipients.json`. Se recomienda extender la protección en una fase futura (cuando se inicialice git en la raíz):

```
# Datos operacionales de runtime — migrar a Supabase (Fases 3-9)
shared-data/
```

Esta decisión está fuera del alcance de las modificaciones permitidas en Fase 0 (el `.gitignore` raíz ya protege el archivo más crítico).

---

---

## ADDENDUM — 2026-07-29: VERIFICACIÓN POST-REGENERACIÓN

### Estado actualizado de archivos contaminados

Tras la corrección de los bugs W-03, W-03b y W-02b, y la regeneración de datos, el estado de los archivos de Magic Bungalow es el siguiente:

| Archivo | Estado anterior | Estado actual |
|---------|----------------|---------------|
| `metrics/clients/magic-bungalow/periods/2026-06.json` | 🔴 Contaminado (`legalink-col`) | ✅ Regenerado — 55 campañas, `act_800960387807740` |
| `metrics/clients/magic-bungalow/periods/2026-07.json` | ⚠️ Metadata OK, API incorrecta | ✅ Regenerado — 55 campañas, `act_800960387807740` |
| `reports/clients/magic-bungalow/monthly/2026-06.json` | 🔴 Contaminado (source Legalink) | ✅ Regenerado — `act_800960387807740` |
| `reports/clients/magic-bungalow/weekly/2026-W25.json` | 🔴 Contaminado (source Legalink) | ✅ Regenerado — `act_800960387807740` |
| `reports/clients/magic-bungalow/weekly/2026-W26.json` | ✅ Siempre limpio | ✅ Sin cambios |
| `reports/clients/magic-bungalow/weekly/2026-W27.json` | 🔴 Contaminado (source Legalink) | 🔴 **AÚN CONTAMINADO** — no fue reemplazado |

### Carpeta de cuarentena añadida

Nueva carpeta `shared-data/quarantine/magic-bungalow-contaminated/` con 5 archivos:
- `metrics/2026-06-CONTAMINATED.json` — copia original contaminada
- `metrics/2026-07-CONTAMINATED.json` — versión intermedia del proceso de regeneración
- `monthly-reports/2026-06-CONTAMINATED.json` — reporte mensual original contaminado
- `weekly-reports/2026-W25-CONTAMINATED.json` — reporte semanal original contaminado
- `weekly-reports/2026-W27-CONTAMINATED.json` — copia idéntica al archivo de producción (aún contaminado)

La carpeta de cuarentena debe incluirse en la decisión de versionado: **no versionar** (contiene datos operacionales con datos de cliente incorrectos).

*Addendum añadido el 2026-07-29.*

---

*Revisión completada el 2026-07-29. No se modificaron datos.*
