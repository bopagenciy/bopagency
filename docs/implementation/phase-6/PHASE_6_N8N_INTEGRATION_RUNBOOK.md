# Phase 6 — n8n Integration Runbook
**Versión:** 1.0 — 2026-08-05
**Propósito:** Checklist paso a paso para configurar y validar la integración n8n ↔ BopIAgency.

> IMPORTANTE: Este runbook describe pasos de configuración y testing, NO ejecuta la integración real.
> No modificar workflows n8n de producción sin aprobación explícita.

---

## Variables de Entorno Requeridas

### En Next.js (BopIAgency)

```bash
# Secreto HMAC compartido (mínimo 32 chars, aleatorio)
AUTOMATION_WEBHOOK_SECRET=<generar con: openssl rand -hex 32>

# URL base de n8n (sin trailing slash)
N8N_BASE_URL=http://localhost:5678          # local
# N8N_BASE_URL=https://n8n.bopagency.com   # producción

# Opcional: timeout de dispatch (default: 10000ms)
N8N_DISPATCH_TIMEOUT_MS=10000

# Opcional: API key de n8n para operaciones REST (cancelación)
N8N_API_KEY=<n8n REST API key>

# Opcional: ventana de tolerancia de timestamp (default: 300s)
AUTOMATION_WEBHOOK_TOLERANCE_SECONDS=300

# URL pública de BopIAgency (para callback URL en dispatch)
NEXT_PUBLIC_APP_URL=https://app.bopagencia.com
```

### En n8n

> **Corrección (revisión de consistencia Phase 6):** `BOP_WEBHOOK_SECRET` y
> `BOP_CALLBACK_BASE_URL` **no existen en ningún código auditado** — eran
> nombres aspiracionales de una versión anterior de este runbook. El código
> real (`N8nWebhookDispatcher`, `hmac.ts`) solo lee `AUTOMATION_WEBHOOK_SECRET`
> y no lee ninguna variable "callback base url": la URL de callback la decide
> quien dispara la ejecución (`callbackUrl` en el payload de dispatch), o el
> workflow de n8n puede apuntar directamente a
> `${NEXT_PUBLIC_APP_URL}/api/webhooks/n8n` si `callbackUrl` llega vacío
> (ver nota en el Paso 4).

```bash
# Variable de entorno en n8n para el nodo de firma del workflow:
# MISMO nombre y MISMO valor que AUTOMATION_WEBHOOK_SECRET en Next.js.
AUTOMATION_WEBHOOK_SECRET=<mismo valor exacto que AUTOMATION_WEBHOOK_SECRET en Next.js>
```

---

## Headers del Protocolo HMAC

| Header | Descripción | Ejemplo |
|--------|-------------|---------|
| `X-Bop-Timestamp` | Unix seconds como string | `1754409600` |
| `X-Bop-Signature` | HMAC-SHA256 hex de `${ts}.${body}` | `a3f4b2...` (64 chars) |
| `X-Bop-Event-Id` | UUID único del evento | `550e8400-e29b-...` |

**Canonical string para HMAC:** `${X-Bop-Timestamp}.${rawBody}`

---

## Checklist de Integración

### Paso 1 — Configurar secreto HMAC compartido

- [ ] Generar secreto: `openssl rand -hex 32`
- [ ] Copiar valor a `AUTOMATION_WEBHOOK_SECRET` en `apps/web/.env.local` (Next.js)
- [ ] Copiar el MISMO valor a `AUTOMATION_WEBHOOK_SECRET` en `n8n-local/.env` (n8n) — mismo nombre de variable en ambos lados
- [ ] Verificar que el secreto tiene al menos 32 caracteres (`AUTOMATION_WEBHOOK_SECRET.length >= 32`, ver `hmac.ts`)
- [ ] NO versionar el secreto en git

### Paso 2 — Configurar URL base de n8n

- [ ] Establecer `N8N_BASE_URL` apuntando al host de n8n (sin trailing slash)
- [ ] Verificar que Next.js puede hacer fetch a esa URL (sin bloqueo de firewall/VPC)
- [ ] Verificar que n8n puede hacer POST a `NEXT_PUBLIC_APP_URL/api/webhooks/n8n`

### Paso 3 — Configurar webhook path en n8n

> **Corrección (revisión de consistencia Phase 6):** el dispatcher real
> (`N8nWebhookDispatcher.dispatch`) construye la URL usando el **id de la
> automatización** (`automationId`, `automations.id`), **no** el campo
> `n8n_workflow_id`/`workflow_id`. Ese campo existe en la tabla `automations`
> pero el dispatcher actual no lo lee para construir la URL.

El dispatcher construye la URL como:
```
${N8N_BASE_URL}/webhook/${automationId}
```

- [ ] Configurar el Webhook node de n8n con un path dinámico (ej. `:automationId`) para aceptar cualquier `automations.id`, o crear un webhook fijo por automatización si se prefiere 1 workflow por automatización
- [ ] Verificar que la URL construida (`${N8N_BASE_URL}/webhook/{automationId real}`) es accesible

### Paso 4 — Preparar workflow de n8n para testing

El workflow n8n debe:
1. Recibir el POST del dispatcher en `/webhook/${workflowId}`
2. Verificar la firma `X-Bop-Signature` usando el secreto compartido
3. Ejecutar la lógica de automatización
4. Enviar callback a `callbackUrl` con headers HMAC firmados

Payload real que envía `N8nWebhookDispatcher` (body JSON exacto del POST de dispatch):
```json
{
  "executionId": "uuid",
  "organizationId": "uuid",
  "automationId": "uuid",
  "clientId": "uuid | null",
  "idempotencyKey": "string",
  "triggerType": "manual | schedule | webhook | event",
  "callbackUrl": "string (puede llegar vacío, ver nota)",
  "metadata": {}
}
```

> **Nota de exactitud:** `automationId` e `idempotencyKey` SÍ forman parte del
> body real (el ejemplo anterior de este runbook los omitía). Además,
> `callbackUrl` llega como **cadena vacía** cuando la ejecución se dispara
> desde la UI actual (`startExecutionAction` no la pasa;
> `startAutomationExecution` usa `''` por defecto). El workflow de n8n debe
> estar preparado para ese caso — por ejemplo, usando `callbackUrl` si viene
> informado y, si no, apuntando directamente a
> `${NEXT_PUBLIC_APP_URL}/api/webhooks/n8n` (local:
> `http://host.docker.internal:3200/api/webhooks/n8n` desde dentro del
> contenedor de n8n). Ver `PHASE_6_LOCAL_N8N_SETUP.md` para el workflow local
> de referencia que ya implementa este fallback.

- [ ] Importar o ajustar workflow de n8n para leer estos campos
- [ ] Configurar el nodo de n8n para firmar el callback con `AUTOMATION_WEBHOOK_SECRET`
- [ ] Confirmar que n8n incluye `X-Bop-Event-Id` único en cada callback

### Paso 5 — Implementar firma saliente de n8n (callback hacia BopIAgency)

n8n debe firmar cada callback POST así:
```javascript
const secret = $env.AUTOMATION_WEBHOOK_SECRET; // mismo nombre que en Next.js
const timestamp = Math.floor(Date.now() / 1000).toString();
const rawBody = JSON.stringify(body); // el MISMO string se transmite después, sin reserializar
const canonical = `${timestamp}.${rawBody}`;
const sig = crypto.createHmac('sha256', Buffer.from(secret, 'utf-8'))
  .update(canonical, 'utf-8')
  .digest('hex');
```

Headers requeridos en el callback:
```
X-Bop-Timestamp: <unix_seconds>
X-Bop-Signature: <hex_hmac>
X-Bop-Event-Id: <uuid_unico>
Content-Type: application/json
```

- [ ] Implementar el nodo de firma en n8n
- [ ] Verificar que el canonical string coincide con el esperado por BopIAgency

### Paso 6 — Test: dispatch manual

```bash
# Crear una ejecución desde la UI de BopIAgency
# 1. Ir a /automations
# 2. Seleccionar una automatización con status 'active'
# 3. Hacer clic en "Ejecutar"
```

Verificar:
- [ ] La ejecución aparece con status `queued` en la UI
- [ ] Logs del servidor muestran `[n8n/dispatch] dispatching`
- [ ] n8n recibe el webhook en su panel de ejecuciones
- [ ] Status cambia a `running` cuando n8n lo inicia
- [ ] Sin errores en los logs de Next.js

### Paso 7 — Test: callback `execution.started`

> **Corrección (revisión de consistencia Phase 6):** el whitelist real de
> `eventType` (`N8N_EVENT_TYPES` en `payload.schema.ts`) usa notación con
> punto (`execution.started`, no `execution_started`). Un `eventType` con
> guion bajo falla la validación Zod y responde `400`. También falta
> `timestamp` (ISO 8601 con offset), requerido por el schema.

n8n debe enviar a `POST /api/webhooks/n8n`:
```json
{
  "eventId": "<uuid único de este evento>",
  "eventType": "execution.started",
  "timestamp": "2026-08-06T12:00:00.000Z",
  "executionId": "<uuid>",
  "organizationId": "<uuid>",
  "automationId": "<uuid>",
  "attempt": 1
}
```

Verificar:
- [ ] BopIAgency responde `200 { ok: true }`
- [ ] Status de la ejecución cambia a `running` en UI
- [ ] Log de la ejecución muestra "Execution running via n8n callback"

### Paso 8 — Test: callback `execution.succeeded`

```json
{
  "eventId": "<uuid único de este evento>",
  "eventType": "execution.succeeded",
  "timestamp": "2026-08-06T12:00:05.000Z",
  "executionId": "<uuid>",
  "organizationId": "<uuid>",
  "automationId": "<uuid>",
  "attempt": 1,
  "outputMetadata": { "result": "ok" }
}
```

Verificar:
- [ ] BopIAgency responde `200 { ok: true }`
- [ ] Status cambia a `succeeded`
- [ ] `completed_at` tiene timestamp
- [ ] Si había alertas activas recuperables, se resuelven automáticamente

### Paso 9 — Test: callback `execution.failed`

```json
{
  "eventId": "<uuid único de este evento>",
  "eventType": "execution.failed",
  "timestamp": "2026-08-06T12:00:05.000Z",
  "executionId": "<uuid>",
  "organizationId": "<uuid>",
  "automationId": "<uuid>",
  "attempt": 1,
  "errorCode": "TIMEOUT",
  "errorMessage": "Operation timed out after 30s"
}
```

Verificar:
- [ ] BopIAgency responde `200 { ok: true }`
- [ ] Status cambia a `failed`
- [ ] `error_code` y `error_message` (truncado/sanitizado) en DB
- [ ] Se crea alerta automáticamente (Phase 6F)
- [ ] Se crea tarea manual si corresponde (Phase 6F)

### Paso 10 — Test: idempotencia (callback duplicado)

Enviar el mismo callback dos veces con el mismo `X-Bop-Event-Id`:

Verificar:
- [ ] Primera llamada: `200 { ok: true }`
- [ ] Segunda llamada: `200 { ok: true, duplicate: true }`
- [ ] No se crea un segundo registro en `automation_webhook_events`
- [ ] El status de la ejecución no cambia por el segundo callback

### Paso 11 — Test: timestamp vencido

Enviar callback con `X-Bop-Timestamp` de hace 10 minutos (más de 5min de tolerancia):

Verificar:
- [ ] BopIAgency responde `403 { error: "Forbidden" }`
- [ ] Sin detalles internos en la respuesta
- [ ] Log: `[webhook/n8n] Verificación fallida { code: 'STALE_TIMESTAMP' }`

### Paso 12 — Test: firma inválida

Enviar callback con `X-Bop-Signature` modificada:

Verificar:
- [ ] BopIAgency responde `403 { error: "Forbidden" }`
- [ ] createAdminClient NO fue llamado (verificar logs o test unitario)
- [ ] Sin información de la firma real en la respuesta

### Paso 13 — Test: comportamiento de timeout de n8n

Simular que n8n no responde al dispatch (timeout):

Verificar:
- [ ] Dispatch retorna error `EXTERNAL_SERVICE_ERROR` (reason: timeout) después de `N8N_DISPATCH_TIMEOUT_MS` ms (ver `n8n-webhook-dispatcher.ts`)
- [ ] Se crea alerta de `dispatch_failed`
- [ ] La ejecución queda en estado `failed` con `error_code: 'DISPATCH_FAILED'` (el use case normaliza cualquier fallo de dispatch —incluido timeout— a este único código; ver `start-execution.use-case.ts`)

### Paso 14 — Test: cancelación (si la API de n8n lo soporta)

Si `N8N_API_KEY` está configurado:
```bash
# Desde la UI de BopIAgency
# 1. Iniciar una ejecución
# 2. Mientras está en status 'running', hacer clic en "Cancelar"
```

Verificar:
- [ ] BopIAgency intenta DELETE a `${N8N_BASE_URL}/api/v1/executions/${n8nExecutionId}`
- [ ] n8n confirma la cancelación
- [ ] Status cambia a `cancelled` en BopIAgency

Si n8n no soporta cancelación remota:
- [ ] La UI muestra el error apropiado (CANCEL_NOT_SUPPORTED)

### Paso 15 — Revisar logs sanitizados

```sql
-- Verificar en Supabase Studio:
-- Corrección (revisión de consistencia Phase 6): la columna real es
-- `metadata`, no `context` (context es solo el nombre a nivel de dominio/TS).
SELECT id, level, event_type, message, metadata, occurred_at
FROM automation_execution_logs
ORDER BY occurred_at DESC
LIMIT 20;
```

Verificar:
- [ ] Sin tokens JWT en el campo `metadata`
- [ ] Sin error_message completo (solo los primeros 200 chars en safeErrorMessage del incident)
- [ ] Sin organizationId en mensajes (está en columna separada)
- [ ] Sin datos PII en logs

---

## Checklist de Seguridad Final

- [ ] AUTOMATION_WEBHOOK_SECRET rotado si fue compartido inseguramente
- [ ] Mismo secreto en ambos lados (n8n y Next.js)
- [ ] `N8N_API_KEY` almacenado en Supabase Vault (si se usa)
- [ ] URL de n8n no expuesta en variables NEXT_PUBLIC_
- [ ] Logs de producción no contienen secretos
- [ ] Timeouts configurados apropiadamente para el entorno

---

## Troubleshooting Común

| Error | Causa probable | Solución |
|-------|---------------|---------|
| 403 Forbidden | Firma inválida o secretos no coinciden | Verificar AUTOMATION_WEBHOOK_SECRET en ambos lados |
| 403 Stale timestamp | Relojes desincronizados | Sincronizar NTP en servidor n8n |
| 401 Unauthorized | Falta X-Bop-Event-Id | Añadir header en n8n |
| 400 Bad request | Payload no válido (Zod) | Verificar schema de callback |
| 409 Conflict | Transición inválida de estado | Revisar que el eventType es apropiado |
| 500 Internal | AUTOMATION_WEBHOOK_SECRET no configurado | Configurar variable de entorno |
| N8N_TIMEOUT | n8n no responde | Verificar N8N_BASE_URL y que n8n está activo |
| HMAC mismatch outgoing | n8n reconstruye el canonical string diferente | Verificar que n8n NO reformatea el JSON antes de firmar |

---

## Staging Integration (2026-08-05)

### Estado actual
- **N8N STAGING**: LOCAL N8N ONLY detectado — instancia staging cloud no identificada
- **Instancia local**: `n8n-local/docker-compose.yml` con imagen `docker.n8n.io/n8nio/n8n:stable`
- **URL local**: `http://localhost:5678`
- **URL producción documentada**: `https://n8n.bopagency.com` (comentada en runbook)

### Acción requerida
Ver `PHASE_6_STAGING_INTEGRATION_PLAN.md` §4 para opciones de instancia staging.
Ver `PHASE_6_STAGING_SMOKE_TEST_MATRIX.md` para los 20 cases de prueba a ejecutar.
Ver `PHASE_6_STAGING_ENVIRONMENT_CHECKLIST.md` §5 para checklist de n8n staging.
