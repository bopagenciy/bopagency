# Phase 6C — N8n Gateway and Secure HMAC Webhook
**Estado:** ✅ COMPLETE  
**Fecha:** 2026-08-04  
**Rama:** feat/phase-6-automation-runtime  
**Prerequisitos:** 6A ✅, 6B ✅

---

## 1. Resumen Ejecutivo

Phase 6C implementa la capa de comunicación segura entre BopIAgency y n8n mediante:

1. **HMAC Shared Utilities** — firma y verificación HMAC SHA-256 con protección de replay y constant-time comparison.
2. **N8nWebhookDispatcher** — adapter de `WorkflowDispatcher` que firma y envía requests POST a n8n.
3. **Callback Route segura** — `POST /api/webhooks/n8n` con verificación HMAC obligatoria **antes** de cualquier acceso a Supabase.
4. **Deduplicación atómica** — via `automation_webhook_events` con captura de unique violation (23505).
5. **Validación de estado** — transiciones de ejecución validadas con reglas de dominio.

No se ejecutan workflows reales. No se modifican tablas de Phase 6B.

---

## 2. Protocolo HMAC

### 2.1 Algoritmo

```
canonical_string = timestamp + "." + rawBody
signature        = hex(HMAC_SHA256(AUTOMATION_WEBHOOK_SECRET, canonical_string))
```

- `timestamp`: Unix seconds (entero, como string)
- `rawBody`: cuerpo exacto transmitido — **nunca reserializado**
- `signature`: hex string de 64 caracteres

### 2.2 Headers

| Header | Dirección | Descripción |
|--------|-----------|-------------|
| `X-Bop-Timestamp` | bidireccional | Unix seconds en el momento del envío |
| `X-Bop-Signature` | bidireccional | hex(HMAC-SHA256) |
| `X-Bop-Event-Id`  | bidireccional | UUID único del evento (idempotencia) |

Los headers son **lowercase** en el código (HTTP/2 normaliza a lowercase).

### 2.3 Flujo saliente (BopIAgency → n8n)

```
1. Dispatcher construye payload mínimo (sin secretos, sin PII)
2. Serializa a JSON → rawBody
3. Firma: X-Bop-Timestamp = now_seconds, X-Bop-Signature = HMAC(secret, ts.body)
4. POST {N8N_BASE_URL}/webhook/{automationId}
5. n8n verifica la firma usando el mismo secreto compartido
```

### 2.4 Flujo entrante (n8n → BopIAgency)

```
1. n8n envía POST /api/webhooks/n8n con los 3 headers
2. Route lee raw body (sin parsear)
3. Verifica event-id → timestamp → HMAC (en ese orden)
4. Solo si HMAC ok → createAdminClient()
5. Inserta en automation_webhook_events (atomic)
6. Si 23505 → duplicado → 200 idempotente
7. Valida payload Zod
8. Verifica coherencia (org, automation, attempt)
9. Valida transición de estado
10. Actualiza automation_executions
11. Inserta log sanitizado
12. Responde 200
```

---

## 3. Tolerancia de Replay

- **Variable:** `AUTOMATION_WEBHOOK_TOLERANCE_SECONDS`  
- **Default:** `300` (5 minutos)  
- **Mínimo válido:** `30` segundos  
- **Máximo válido:** `3600` (1 hora)  
- Si la variable no está configurada o es inválida, se usa el default seguro.

La protección de replay combina:
1. **Ventana temporal** — el timestamp debe estar dentro de la tolerancia
2. **External event ID único** — `automation_webhook_events.external_event_id` tiene UNIQUE INDEX con `source`

Un atacante necesitaría capturar la firma Y reusarla dentro de la misma ventana temporal Y antes de que el event ID sea marcado como procesado.

---

## 4. Deduplicación

### Estrategia atómica

```sql
-- UNIQUE INDEX en automation_webhook_events:
CREATE UNIQUE INDEX uq_webhook_source_external_id
  ON public.automation_webhook_events(source, external_event_id)
  WHERE external_event_id IS NOT NULL;
```

```typescript
// Route handler: INSERT primero, captura unique violation
const result = await adminClient
  .from('automation_webhook_events')
  .insert({ source: 'n8n', external_event_id: eventId, ... })
  .select('id').single();

if (result.error?.code === '23505') {
  return Response.json({ ok: true, duplicate: true }, { status: 200 });
}
```

**Por qué no SELECT + INSERT:** Un `SELECT` previo crearía una race condition entre workers. El INSERT con captura de 23505 es atómico.

---

## 5. Boundary service_role

**Regla fundamental:** `createAdminClient()` (service_role) se llama **ÚNICAMENTE** después de que `verifyIncomingWebhook()` retorna `ok: true`.

```typescript
// ORDEN ESTRICTO — NO ALTERAR:
const verifyResult = verifyIncomingWebhook(headers, rawBody);  // ← primero
if (!verifyResult.ok) return forbidden();                       // ← rechazar si falla

const adminClient = createAdminClient();                        // ← solo aquí
```

Este invariante está verificado por el test C15.

---

## 6. Payload de Callback

### Schema Zod

```typescript
const N8nCallbackPayloadSchema = z.object({
  eventId:        z.string().min(1).max(255),
  eventType:      z.enum(['execution.started', 'execution.succeeded',
                           'execution.failed', 'execution.cancelled',
                           'execution.retrying']),
  timestamp:      z.string().datetime({ offset: true }),
  organizationId: z.string().uuid(),
  executionId:    z.string().uuid(),
  automationId:   z.string().uuid(),
  attempt:        z.number().int().min(1).max(100),
  outputMetadata: z.record(z.unknown()).nullable().optional(),
  errorCode:      z.string().max(100).nullable().optional(),
  errorMessage:   z.string().max(2000).nullable().optional(),
});
```

### Mapping eventType → ExecutionStatus

| eventType | AutomationExecutionStatus |
|-----------|--------------------------|
| `execution.started` | `running` |
| `execution.succeeded` | `succeeded` |
| `execution.failed` | `failed` |
| `execution.cancelled` | `cancelled` |
| `execution.retrying` | `retrying` |

---

## 7. Validación de Transiciones

Las transiciones son validadas con `canTransitionExecution()` del dominio:

| From | To (valid) |
|------|-----------|
| `queued` | `running`, `cancelled` |
| `running` | `succeeded`, `failed`, `cancelled` |
| `failed` | `retrying` |
| `retrying` | `queued` |
| `succeeded` | *(terminal)* |
| `cancelled` | *(terminal)* |

**Transiciones bloqueadas explícitamente:**
- `succeeded → running` → 409
- `cancelled → running` → 409
- `organizationId` del payload ≠ org de la ejecución → 403

---

## 8. Respuestas HTTP

| Código | Condición |
|--------|-----------|
| `200` | Procesado correctamente `{ok: true}` |
| `200` | Evento duplicado `{ok: true, duplicate: true}` |
| `400` | Payload inválido (JSON o Zod) |
| `400` | Ejecución no encontrada |
| `400` | automationId mismatch o attempt inválido |
| `401` | Header de firma o event-id faltante |
| `403` | Firma inválida, timestamp vencido, org mismatch |
| `409` | Transición de estado inválida |
| `500` | Error interno (sanitizado, sin detalles) |

**Política de no revelación:**
- Los 401/403 no revelan si la ejecución existe
- Los 500 no revelan detalles de Supabase, SQL o stack
- Los errores de firma no incluyen la firma esperada

---

## 9. Sanitización

### Mensajes de error
```typescript
const TOKEN_PATTERN = /\b(Bearer\s+\S+|sk-[a-zA-Z0-9]{10,}|ey[a-zA-Z0-9._-]{20,})\b/gi;
sanitize(msg) = msg.slice(0, 500).replace(TOKEN_PATTERN, '[REDACTED]')
```

### Metadata del dispatcher
Claves eliminadas antes de enviar a n8n: `secret`, `token`, `key`, `password`, `auth`, `credential`, `cred`, `private`, `bearer`, `oauth`, `email`, `phone`, `name`, `address`.

### Persistencia
- `automation_webhook_events` almacena `payload_hash` (SHA-256), **no el raw body**
- `automation_execution_logs` almacena solo metadatos operacionales
- `error_message` truncado a 500 chars y redactado

---

## 10. Tests

| Suite | Tests | Cobertura |
|-------|-------|-----------|
| `hmac.test.ts` | 27 | HMAC firma, constant-time compare, tolerancia, verify, build headers |
| `n8n-webhook-dispatcher.test.ts` | 16 | dispatch ok/error/timeout, cancel, metadata sanitización, no secretos en logs |
| `route.test.ts` | 21 | C1-C15: firma faltante, inválida, timestamp, duplicado, transiciones, org mismatch, service_role order |

---

## 11. Variables de Entorno

Todas son **server-only** (nunca `NEXT_PUBLIC_`).

| Variable | Requerida | Descripción | Mínimo |
|----------|-----------|-------------|--------|
| `AUTOMATION_WEBHOOK_SECRET` | ✅ | Secreto HMAC compartido con n8n | 32 chars |
| `N8N_BASE_URL` | ✅ | URL base de n8n | — |
| `AUTOMATION_WEBHOOK_TOLERANCE_SECONDS` | Opcional | Ventana de replay (default: 300) | 30 |
| `N8N_DISPATCH_TIMEOUT_MS` | Opcional | Timeout de dispatch (default: 10000) | 1000 |
| `N8N_API_KEY` | Para cancel | API key de n8n REST | — |

---

## 12. Rollback

1. **Deshabilitar route:** Agregar `export const config = { matcher: [] }` en middleware o devolver 503 inmediatamente.
2. **Rotar secreto:** Actualizar `AUTOMATION_WEBHOOK_SECRET` en servidor y en credenciales de n8n simultáneamente. Los eventos en vuelo con el secreto anterior fallarán — n8n los reintentará.
3. **Revertir dispatcher:** Eliminar el import de `N8nWebhookDispatcher` en el use case y usar el dispatcher anterior (Phase 6D es donde se conecta al use case).
4. **Conservar datos:** No borrar `automation_webhook_events`, `automation_executions`, ni `automation_execution_logs`. Los eventos ya procesados tienen `status='processed'`.
5. **Auditoría:** `automation_webhook_events` conserva todos los eventos recibidos, incluso los fallidos, como registro de auditoría.

---

## 13. Archivos Creados/Modificados

### Nuevos
| Archivo | Descripción |
|---------|-------------|
| `apps/web/src/lib/webhooks/hmac.ts` | HMAC utilities server-only |
| `apps/web/src/app/api/webhooks/n8n/payload.schema.ts` | Zod schema del callback |
| `apps/web/src/app/api/webhooks/n8n/route.ts` | Callback route segura |
| `apps/web/src/lib/webhooks/__tests__/hmac.test.ts` | Tests HMAC (27 casos) |
| `apps/web/src/app/api/webhooks/n8n/__tests__/route.test.ts` | Tests route (21 casos) |
| `packages/infrastructure/src/n8n/n8n-webhook-dispatcher.ts` | Dispatcher adapter |
| `packages/infrastructure/src/n8n/n8n-webhook-dispatcher.test.ts` | Tests dispatcher (16 casos) |
| `docs/implementation/phase-6/PHASE_6C_N8N_GATEWAY_REPORT.md` | Este documento |

### Modificados
| Archivo | Cambio |
|---------|--------|
| `packages/infrastructure/src/index.ts` | Export de N8nWebhookDispatcher |
| `packages/infrastructure/package.json` | Dependency @bop-agency/automation-engine |
| `packages/infrastructure/tsconfig.json` | Path mapping automation-engine |
| `packages/infrastructure/vitest.config.ts` | Alias automation-engine |
| `docs/implementation/phase-6/PHASE_6_IMPLEMENTATION_PLAN.md` | Marcar 6C COMPLETE |
| `docs/implementation/phase-6/PHASE_6_SECURITY_MODEL.md` | Actualizar checklist 6C |
| `docs/implementation/phase-6/PHASE_6_RISK_REGISTER.md` | Actualizar estado R-SEC-02, R-SEC-03 |

---

## 14. Riesgos Pendientes (post-6C)

| ID | Descripción | Severidad | Plan |
|----|-------------|-----------|------|
| R-P6C-01 | `N8nWebhookDispatcher` aún no conectado a un use case — se conecta en 6D | Bajo | Phase 6D |
| R-P6C-02 | n8n debe configurar las credenciales HMAC en sus workflows (acción manual) | Medio | Documentar en RUNBOOK |
| R-P6C-03 | Sin rate limiting en `/api/webhooks/n8n` — un atacante que pase HMAC podría flood | Medio | Añadir en Phase 6G o posterior |
| R-P6C-04 | `cancel()` requiere `N8N_API_KEY` — no testeado end-to-end | Bajo | Phase 6D/6G |
| R-P6C-05 | `automation_execution_logs` schema no verificado contra migración 6B — puede fallar en producción | Bajo | Verificar campos al conectar Phase 6D |
