# Phase 6 — Staging Smoke Test Matrix

> **Estado:** PREPARADO — pendiente ejecución
> **Restricción:** Ejecutar únicamente contra staging. Nunca contra producción.
> **Fecha de preparación:** 2026-08-05

---

## Leyenda

| Campo | Descripción |
|-------|-------------|
| Precondición | Estado requerido antes de ejecutar el test |
| Acción | Request o acción que desencadena el test |
| Resultado esperado | Respuesta HTTP, estado DB y comportamiento esperado |
| Tablas afectadas | Tablas de Supabase que deben cambiar |
| Estado final | Estado de `automation_executions` post-test |
| Alerta esperada | Si debe generarse una alerta en `automation_alerts` |
| Tarea esperada | Si debe generarse una tarea en `automation_tasks` |
| Log esperado | Entradas en `automation_execution_logs` |
| Cleanup | Pasos para dejar el entorno limpio post-test |

---

## Case 01 — Dispatch válido

| Campo | Valor |
|-------|-------|
| **Precondición** | Automation `staging-auto-01` en estado `active`. Execution no existe. |
| **Acción** | Server Action `startAutomationExecution` con `triggerType: "manual"` |
| **Resultado esperado** | n8n responde 200. Execution creada con status `queued` → `running`. |
| **Tablas afectadas** | `automation_executions` (INSERT), `automation_execution_logs` (INSERT) |
| **Estado final** | `running` |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | `event_type: "dispatch.sent"`, `level: "info"` |
| **Cleanup** | Completar la ejecución via callback case 03 |

---

## Case 02 — Callback `running` válido

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution en estado `queued` |
| **Acción** | `POST /api/webhooks/n8n` con `eventType: "execution.running"`, firma HMAC válida, timestamp reciente |
| **Resultado esperado** | 200 `{"ok": true}`. Execution → `running`. |
| **Tablas afectadas** | `automation_executions` (UPDATE status), `automation_webhook_events` (INSERT), `automation_execution_logs` (INSERT) |
| **Estado final** | `running` |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | `event_type: "status.transition"`, `message` incluye `queued → running` |
| **Cleanup** | Enviar callback `succeeded` (case 03) |

---

## Case 03 — Callback `succeeded` válido

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution en estado `running` |
| **Acción** | `POST /api/webhooks/n8n` con `eventType: "execution.succeeded"`, firma válida |
| **Resultado esperado** | 200. Execution → `succeeded`. `completed_at` seteado. |
| **Tablas afectadas** | `automation_executions` (UPDATE), `automation_webhook_events` (INSERT), `automation_execution_logs` (INSERT) |
| **Estado final** | `succeeded` |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | `level: "info"`, `event_type: "status.transition"` |
| **Cleanup** | Ninguno — estado final |

---

## Case 04 — Callback `failed` válido

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution en estado `running`, `attempt: 1`, retry policy permite retry |
| **Acción** | `POST /api/webhooks/n8n` con `eventType: "execution.failed"`, `errorCode: "STAGING_TEST_ERROR"` |
| **Resultado esperado** | 200. Execution → `failed`. Si retry elegible → nueva execution con `attempt: 2`. |
| **Tablas afectadas** | `automation_executions` (UPDATE + posible INSERT retry), `automation_webhook_events`, `automation_execution_logs` |
| **Estado final** | `failed` (o `retrying` si retry auto) |
| **Alerta esperada** | Sí — alerta de ejecución fallida |
| **Tarea esperada** | Sí — tarea de revisión |
| **Log esperado** | `level: "error"`, `event_type: "status.transition"`, `error_code` presente |
| **Cleanup** | Completar o cancelar la ejecución de retry |

---

## Case 05 — Callback duplicado (mismo `x-bop-event-id`)

| Campo | Valor |
|-------|-------|
| **Precondición** | Case 03 ya ejecutado. `automation_webhook_events` contiene el `external_event_id`. |
| **Acción** | Reenviar exactamente el mismo request de case 03 (mismos headers, mismo body) |
| **Resultado esperado** | 200 `{"ok": true, "deduplicated": true}`. No se duplica ejecución. |
| **Tablas afectadas** | `automation_webhook_events` — INSERT falla por UNIQUE constraint (23505), capturado correctamente |
| **Estado final** | Sin cambio (execution permanece `succeeded`) |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | Ninguno nuevo — deduplicado antes de procesar |
| **Cleanup** | Ninguno |

---

## Case 06 — `eventId` duplicado en request diferente

| Campo | Valor |
|-------|-------|
| **Precondición** | `external_event_id` ya existe en `automation_webhook_events` de otro request |
| **Acción** | `POST /api/webhooks/n8n` con mismo `x-bop-event-id` pero body diferente |
| **Resultado esperado** | 200 `{"ok": true, "deduplicated": true}`. Body alternativo ignorado. |
| **Tablas afectadas** | `automation_webhook_events` — conflicto UNIQUE capturado |
| **Estado final** | Sin cambio |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | Ninguno |
| **Cleanup** | Ninguno |

---

## Case 07 — Firma HMAC inválida

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution activa |
| **Acción** | `POST /api/webhooks/n8n` con `x-bop-signature` incorrecto (cualquier string ≠ firma real) |
| **Resultado esperado** | **401**. No se crea cliente Supabase. No se toca la DB. |
| **Tablas afectadas** | Ninguna |
| **Estado final** | Sin cambio |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | Solo log de servidor (no en DB): `"Signature verification failed"` |
| **Cleanup** | Ninguno |

---

## Case 08 — Timestamp vencido (stale)

| Campo | Valor |
|-------|-------|
| **Precondición** | Cualquier |
| **Acción** | `POST /api/webhooks/n8n` con `x-bop-timestamp` > 300 segundos en el pasado |
| **Resultado esperado** | **401**. Rechazado antes de verificar HMAC. No se toca DB. |
| **Tablas afectadas** | Ninguna |
| **Estado final** | Sin cambio |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | Solo log de servidor: `"Request timestamp is outside the allowed tolerance window"` |
| **Cleanup** | Ninguno |

---

## Case 09 — Payload inválido (Zod)

| Campo | Valor |
|-------|-------|
| **Precondición** | HMAC válido, timestamp válido |
| **Acción** | `POST /api/webhooks/n8n` con payload bien firmado pero campo `eventType` ausente |
| **Resultado esperado** | **400**. HMAC verificado. Payload rechazado por Zod. `automation_webhook_events` insertado como `failed`. |
| **Tablas afectadas** | `automation_webhook_events` (INSERT con `status: "failed"`) |
| **Estado final** | Sin cambio en `automation_executions` |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | Log de servidor con detalle de validación Zod |
| **Cleanup** | Ninguno |

---

## Case 10 — `organizationId` incorrecto

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution de org A. Payload firmado con org B como `organizationId`. |
| **Acción** | `POST /api/webhooks/n8n` con `organizationId` que no coincide con el de la execution |
| **Resultado esperado** | **404** o **409**. Execution no modificada. Aislamiento multi-tenant preservado. |
| **Tablas afectadas** | `automation_webhook_events` (INSERT `failed`) |
| **Estado final** | Sin cambio |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | Error de coherencia: `"organizationId mismatch"` |
| **Cleanup** | Ninguno |

---

## Case 11 — Retry elegible

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution fallida con `attempt: 1`, retry policy `maxAttempts: 3` |
| **Acción** | Verificar que `retryAutomationExecution` crea nueva execution con `attempt: 2` |
| **Resultado esperado** | Nueva execution con `status: "queued"`, `attempt: 2`, mismo `automationId`. |
| **Tablas afectadas** | `automation_executions` (INSERT nueva), `automation_execution_logs` |
| **Estado final** | `queued` (nueva execution) |
| **Alerta esperada** | No (la alerta fue por la ejecución original) |
| **Tarea esperada** | No (ya existe de case 04) |
| **Log esperado** | `event_type: "retry.scheduled"` |
| **Cleanup** | Completar o cancelar la execution de retry |

---

## Case 12 — Retry no elegible

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution fallida con `attempt: 3`, retry policy `maxAttempts: 3` |
| **Acción** | Intentar `retryAutomationExecution` |
| **Resultado esperado** | Error `MAX_ATTEMPTS_REACHED`. No se crea nueva execution. |
| **Tablas afectadas** | Ninguna |
| **Estado final** | `failed` (sin cambio) |
| **Alerta esperada** | Alerta existente — no se duplica |
| **Tarea esperada** | No |
| **Log esperado** | `event_type: "retry.rejected"`, `level: "warn"` |
| **Cleanup** | Ninguno |

---

## Case 13 — Max attempts alcanzado

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution en `attempt: 3` (max según retry policy), `status: "running"` |
| **Acción** | Callback `execution.failed` |
| **Resultado esperado** | Execution → `failed`. No retry. Alerta de max attempts. |
| **Tablas afectadas** | `automation_executions`, `automation_webhook_events`, `automation_execution_logs` |
| **Estado final** | `failed` |
| **Alerta esperada** | Sí — severidad alta |
| **Tarea esperada** | Sí — revisión manual requerida |
| **Log esperado** | `level: "error"`, `message` incluye max attempts |
| **Cleanup** | Ninguno |

---

## Case 14 — Cancel confirmado

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution en estado `queued` (local) |
| **Acción** | `cancelAutomationExecution` |
| **Resultado esperado** | Execution → `cancelled` localmente sin llamar n8n. |
| **Tablas afectadas** | `automation_executions` (UPDATE), `automation_execution_logs` |
| **Estado final** | `cancelled` |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | `event_type: "cancel.local"`, `level: "info"` |
| **Cleanup** | Ninguno |

---

## Case 15 — Cancel no soportado (running sin N8N_API_KEY)

| Campo | Valor |
|-------|-------|
| **Precondición** | Execution en `running`. `N8N_API_KEY` no configurado. |
| **Acción** | `cancelAutomationExecution` |
| **Resultado esperado** | Error `CANCEL_NOT_SUPPORTED`. Execution permanece `running`. |
| **Tablas afectadas** | Ninguna |
| **Estado final** | `running` (sin cambio) |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | `level: "warn"`, `"no dispatcher available"` |
| **Cleanup** | Completar via callback |

---

## Case 16 — Timeout de n8n

| Campo | Valor |
|-------|-------|
| **Precondición** | n8n no responde (apagado o red bloqueada). Execution en `queued`. |
| **Acción** | `startAutomationExecution` → dispatch falla por timeout (`N8N_DISPATCH_TIMEOUT_MS`) |
| **Resultado esperado** | Execution → `failed`. Error `EXTERNAL_SERVICE_ERROR` + `reason: "timeout"`. |
| **Tablas afectadas** | `automation_executions` (UPDATE), `automation_execution_logs` |
| **Estado final** | `failed` |
| **Alerta esperada** | Sí |
| **Tarea esperada** | Sí |
| **Log esperado** | `level: "error"`, `event_type: "dispatch.timeout"` |
| **Cleanup** | Reiniciar n8n si se usó este método |

---

## Case 17 — Alertas generadas correctamente

| Campo | Valor |
|-------|-------|
| **Precondición** | Case 04 o Case 16 ejecutado |
| **Acción** | Consultar `automation_alerts` para la organización staging |
| **Resultado esperado** | Alerta presente con `alert_type` apropiado, `status: "active"`, `organization_id` correcto. |
| **Tablas afectadas** | `automation_alerts` (SELECT) |
| **Estado final** | `active` |
| **Alerta esperada** | Ya existente |
| **Tarea esperada** | Ya existente |
| **Log esperado** | N/A |
| **Cleanup** | Reconocer o resolver alerta después de verificar |

---

## Case 18 — Tareas generadas correctamente

| Campo | Valor |
|-------|-------|
| **Precondición** | Case 04 ejecutado |
| **Acción** | Consultar `automation_tasks` para la organización staging |
| **Resultado esperado** | Tarea presente con `status: "pending"`, `source: "automation"`, `tags` incluye `automation-id:{uuid}`. |
| **Tablas afectadas** | `automation_tasks` (SELECT) |
| **Estado final** | `pending` |
| **Cleanup** | Completar tarea después de verificar |

---

## Case 19 — Recuperación de alerta

| Campo | Valor |
|-------|-------|
| **Precondición** | Alerta activa de case 17 |
| **Acción** | `acknowledgeAlert` + `resolveAlert` desde UI staging |
| **Resultado esperado** | Alerta → `acknowledged` → `resolved`. `resolved_at` seteado. |
| **Tablas afectadas** | `automation_alerts` (UPDATE) |
| **Estado final** | `resolved` |
| **Alerta esperada** | Resuelta |
| **Cleanup** | Ninguno |

---

## Case 20 — Aislamiento multi-tenant

| Campo | Valor |
|-------|-------|
| **Precondición** | Dos organizaciones staging (org-A, org-B) con executions respectivas |
| **Acción** | Usuario de org-B intenta acceder a executions de org-A via API o UI |
| **Resultado esperado** | 0 filas retornadas. RLS bloquea acceso cross-tenant. |
| **Tablas afectadas** | `automation_executions` (SELECT — 0 rows) |
| **Estado final** | Sin cambio |
| **Alerta esperada** | No |
| **Tarea esperada** | No |
| **Log esperado** | No (RLS transparente) |
| **Cleanup** | Ninguno |

---

## Resumen de Cobertura

| Categoría | Cases | % |
|-----------|-------|---|
| Happy path (dispatch + callbacks) | 01, 02, 03 | 15% |
| Fallos controlados | 04, 11, 12, 13 | 20% |
| Deduplicación / idempotencia | 05, 06 | 10% |
| Seguridad HMAC | 07, 08 | 10% |
| Validación de payload | 09, 10 | 10% |
| Cancel | 14, 15 | 10% |
| Timeouts | 16 | 5% |
| Observabilidad | 17, 18, 19 | 15% |
| Multi-tenant | 20 | 5% |

---

## Criterio de Aprobación

- Cases 01–10: **Todos deben pasar**
- Cases 11–15: **Todos deben pasar**
- Cases 16–20: **Todos deben pasar**
- Cualquier FAIL en case 07, 08, 10 o 20 → **NO-GO inmediato** (seguridad)
- Cualquier fuga de datos cross-tenant → **NO-GO inmediato**

---

*Smoke test matrix preparada para Phase 6. Ejecutar manualmente con credenciales staging.*
