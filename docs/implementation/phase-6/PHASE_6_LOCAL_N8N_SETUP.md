# Phase 6 — Integración Local Real: BopIAgency ↔ n8n

**Alcance:** exclusivamente local (Next.js en `http://localhost:3200`, Supabase local en Docker, n8n local en Docker). No toca Supabase cloud ni n8n productivo. No despliega. No inicia Phase 7.

> Este documento describe **preparación y validación local**. No ejecuta ningún dispatch real por sí mismo — cada paso es manual y explícito.

---

## 0. Contrato exacto (auditado en código, no inventado)

### 0.1 Dispatch saliente (BopIAgency → n8n)

Implementado en `packages/infrastructure/src/n8n/n8n-webhook-dispatcher.ts` (`N8nWebhookDispatcher.dispatch`).

- **Método:** `POST`
- **URL:** `${N8N_BASE_URL}/webhook/${automationId}` (el path se construye de forma fija en código; **no** lee `N8N_WEBHOOK_PATH` — ver nota en §0.4)
- **Headers enviados:**
  | Header | Valor |
  |---|---|
  | `Content-Type` | `application/json` |
  | `X-Request-Id` | `idempotencyKey` |
  | `x-bop-timestamp` | Unix seconds (string) |
  | `x-bop-signature` | HMAC-SHA256 hex de `${timestamp}.${rawBody}` |
  | `x-bop-event-id` | `idempotencyKey` (se reutiliza como event id de la firma saliente) |
- **Body JSON exacto enviado** (orden real del objeto en código):
  ```json
  {
    "executionId": "string",
    "organizationId": "string (uuid)",
    "automationId": "string (uuid)",
    "clientId": "string | null",
    "idempotencyKey": "string",
    "triggerType": "string",
    "callbackUrl": "string",
    "metadata": { "...": "sanitizado, sin secretos/tokens/credenciales" }
  }
  ```
- **Nota importante:** el payload de dispatch **no incluye `attempt`**. El workflow local asume intento 1.
- **[GAP CERRADO 2026-08-06] `callbackUrl` ya es enviado por la app, siempre server-side.** Anteriormente, cuando la ejecución se disparaba desde la UI (`startExecutionAction` → `startAutomationExecution`), `callbackUrl` llegaba al payload de dispatch como **cadena vacía** (`''`) — el use case lo aceptaba como input opcional pero ningún caller real lo poblaba. Esto quedó corregido en `N8nWebhookDispatcher.dispatch()` (`packages/infrastructure/src/n8n/n8n-webhook-dispatcher.ts`): el dispatcher **ignora por completo** cualquier `callbackUrl` que venga en `options.payload` (nunca confía en el use case/caller — cierra una vía de SSRF) y **siempre** lo construye él mismo, server-side, a partir de `NEXT_PUBLIC_APP_URL` (origin) + `/api/webhooks/n8n` (path fijo). Con `NEXT_PUBLIC_APP_URL=http://localhost:3200` (valor por defecto en `.env.example`), el payload real ahora incluye `"callbackUrl": "http://localhost:3200/api/webhooks/n8n"`. Si `NEXT_PUBLIC_APP_URL` falta o es inválida, el dispatch falla de forma segura (`INTERNAL_ERROR`) — nunca se envía un callback sin URL ni se adivina un host. La whitelist de hosts locales del nodo `Extraer Dispatch` (`localhost`/`127.0.0.1`/`host.docker.internal`) se mantiene sin cambios como defensa adicional del lado de n8n. Ver `N8nWebhookDispatcher.test.ts` (tests C1–C9) y `StartAutomationExecutionInput.callbackUrl`/`DispatchPayload.callbackUrl` (documentados como ignorados por la implementación real).
- **Timeout:** `N8N_DISPATCH_TIMEOUT_MS` (default 10000ms, rango válido 1000–60000; valores fuera de rango caen al default).
- **Respuesta esperada:** cualquier `2xx` = aceptado (se ignora el body). Cualquier respuesta no-2xx o timeout → `err(EXTERNAL_SERVICE_ERROR)`, la ejecución queda `failed` con `error_code = DISPATCH_FAILED`.

### 0.2 Callback entrante (n8n → BopIAgency)

Implementado en `apps/web/src/app/api/webhooks/n8n/route.ts`, `apps/web/src/lib/webhooks/hmac.ts`, `apps/web/src/app/api/webhooks/n8n/payload.schema.ts`.

- **Método:** `POST`
- **Endpoint:** `${NEXT_PUBLIC_APP_URL}/api/webhooks/n8n` — local: `http://localhost:3200/api/webhooks/n8n` (desde el host) / `http://host.docker.internal:3200/api/webhooks/n8n` (desde dentro del contenedor de n8n).
- **Headers requeridos:**
  | Header | Descripción |
  |---|---|
  | `x-bop-event-id` | Requerido. Idempotencia (`automation_webhook_events.external_event_id`). |
  | `x-bop-timestamp` | Requerido. Unix seconds (string). |
  | `x-bop-signature` | Requerido. HMAC-SHA256 hex. |
- **Algoritmo HMAC:** `hex(HMAC_SHA256(AUTOMATION_WEBHOOK_SECRET, canonical))`
- **String exacto que se firma (canonical):** `` `${x-bop-timestamp}.${rawBody}` `` — `rawBody` es el **texto exacto** del body transmitido (`request.text()`, leído antes de cualquier `JSON.parse`). No se puede reserializar el JSON después de firmarlo o la firma no coincidirá.
- **Tolerancia de timestamp:** `AUTOMATION_WEBHOOK_TOLERANCE_SECONDS` (default 300s, rango válido 30–3600s). `|now - timestamp| > tolerancia` → `403 STALE_TIMESTAMP`.
- **Body (Zod, `N8nCallbackPayloadSchema`):**
  ```json
  {
    "eventId": "string (1-255)",
    "eventType": "execution.started | execution.succeeded | execution.failed | execution.cancelled | execution.retrying",
    "timestamp": "ISO 8601 con offset",
    "organizationId": "uuid",
    "executionId": "uuid",
    "automationId": "uuid",
    "attempt": "int 1-100",
    "outputMetadata": "object | null (opcional)",
    "errorCode": "string ≤100 | null (opcional)",
    "errorMessage": "string ≤2000 | null (opcional)"
  }
  ```
  `eventType` mapea a `automation_executions.status` así: `execution.started→running`, `execution.succeeded→succeeded`, `execution.failed→failed`, `execution.cancelled→cancelled`, `execution.retrying→retrying`.
- **Transiciones de estado válidas** (`canTransitionExecution`): `queued→running|cancelled`, `running→succeeded|failed|cancelled`, `failed→retrying`, `retrying→queued`. **`queued→failed` u otras combinaciones no listadas devuelven `409 Conflict`.** Por eso el workflow local siempre envía `running` antes de `succeeded`/`failed`.
- **Respuestas HTTP:**
  | Código | Caso |
  |---|---|
  | `200 {ok:true}` | Procesado correctamente |
  | `200 {ok:true, duplicate:true}` | `x-bop-event-id` ya procesado (unique violation en `automation_webhook_events`) |
  | `200 {ok:true, idempotentStatus:true}` | El estado destino ya era el actual |
  | `400` | JSON inválido, payload Zod inválido, ejecución no encontrada, `automationId` no coincide, `attempt` decreciente |
  | `401` | Falta `x-bop-event-id`, o falta `x-bop-timestamp`/`x-bop-signature` |
  | `403` | Timestamp fuera de tolerancia (`STALE_TIMESTAMP`), firma inválida (`INVALID_SIGNATURE`), o `organizationId` no coincide con la ejecución |
  | `409` | Transición de estado inválida |
  | `500` | Error interno (p. ej. `AUTOMATION_WEBHOOK_SECRET` mal configurado) |

### 0.3 Variables de entorno leídas realmente por el código

| Variable | Leída por | Requerida | Default |
|---|---|---|---|
| `N8N_BASE_URL` | `n8n-webhook-dispatcher.ts` | Sí (dispatch falla si falta) | — |
| `AUTOMATION_WEBHOOK_SECRET` | `n8n-webhook-dispatcher.ts` y `hmac.ts` | Sí (≥32 chars) | — |
| `N8N_DISPATCH_TIMEOUT_MS` | `n8n-webhook-dispatcher.ts` | No | 10000 (rango 1000–60000) |
| `N8N_API_KEY` | `n8n-webhook-dispatcher.ts` (`cancel()`) | Solo si se usa `cancel()` | — |
| `AUTOMATION_WEBHOOK_TOLERANCE_SECONDS` | `hmac.ts` | No | 300 (rango 30–3600) |
| `NEXT_PUBLIC_APP_URL` | usado en otras partes de la app (no directamente por el dispatcher) para construir URLs | No | `http://localhost:3200` |

### 0.4 Hallazgos de auditoría (no se modifica código en esta tarea)

- **`N8N_WEBHOOK_PATH` no existe en el código.** Se documenta en `.env.example` como referencia, pero el path de dispatch está hardcodeado como `/webhook/{automationId}` en `N8nWebhookDispatcher`. No tiene efecto hasta que se implemente.
- **[CORREGIDO 2026-08-06] `callbackUrl` llegaba vacío desde la UI real.** `startExecutionAction`/`startAutomationExecution` nunca poblaban `callbackUrl` (llegaba `''` al payload de dispatch); el workflow local (turno anterior) compensaba validando/rechazando ese vacío, pero el gap real —que la app nunca enviara un `callbackUrl` real— seguía abierto. Cerrado en `N8nWebhookDispatcher.dispatch()`: el dispatcher ya no lee `callbackUrl` de `options.payload` en absoluto; lo resuelve él mismo desde `NEXT_PUBLIC_APP_URL` (server-side, nunca desde el use case/cliente). Ver detalle completo en §0.1.
- **[CORREGIDO]** `route.ts` insertaba en `automation_execution_logs` usando una columna `context`, pero el esquema real (`20260804000000_phase6b_automation_runtime.sql`) define la columna como `metadata`, y no fijaba `event_type`. Confirmado también en `SupabaseExecutionLogRepository` (mismo defecto) y en `apps/web/src/lib/supabase/types.ts` (tipos vivos usados por `createAdminClient`/`createServerSupabaseClient`, no `database.types.ts` que está huérfano/sin importar). Corregido en la revisión de consistencia del 2026-08-06: ambos puntos de inserción ahora usan `metadata` + `event_type`, y los tipos están alineados con la migración. Ver tests nuevos en `route.test.ts` (C16) y `supabase-execution-log.repository.test.ts`.
- **[CORREGIDO]** `PHASE_6_N8N_INTEGRATION_RUNBOOK.md` mencionaba variables `BOP_WEBHOOK_SECRET` y `BOP_CALLBACK_BASE_URL` del lado de n8n que **no existen en ningún código auditado**. Corregido en la revisión de consistencia del 2026-08-06 para usar `AUTOMATION_WEBHOOK_SECRET` (mismo nombre en ambos lados), consistente con este runbook.
- **[CORREGIDO 2026-08-06] Pérdida de contexto en `n8n-local/workflows/phase6-local-runtime-test.json`.** Síntoma observado: en el nodo `Success: Enviar Succeeded`, `{{$json.url}}` llegaba `undefined` (error *"URL parameter must be a string, got undefined"*), y el nodo anterior producía `eventId = undefined-<timestamp>-succeeded`. Causa raíz: los nodos `Code` de firma (`... Firmar ...`) devolvían un objeto **parcial** (`{ rawBody, unixTs, signature, eventId, url }`) que reemplazaba por completo el `$json` del item — funcionaba para el primer envío (`Firmar Running` → `Enviar Running`), pero en las ramas que encadenan un segundo callback (`Success`, `Failed`, `Duplicate`), el nodo `Firmar Succeeded`/`Firmar Failed` se ejecuta **después** de un nodo `HTTP Request`, cuya salida reemplaza `$json` por la respuesta HTTP (sin `executionId` ni `callbackUrl`). Corrección aplicada:
  - `Extraer Dispatch` (antes `Set`, ahora `Code`) valida `executionId`, `organizationId`, `automationId` y `callbackUrl`, y solo reescribe `localhost` → `host.docker.internal` (nunca acepta hosts arbitrarios); cualquier campo faltante o `callbackUrl` no local produce `validationError`, revisado por `Campos Minimos Validos?` (responde `400`).
  - Todos los nodos `... Firmar ...` (8 en total, todas las ramas) ahora leen el contexto siempre de `$('Extraer Dispatch').item.json` — no de `$input`/`$json` — y devuelven el objeto completo: `{ executionId, automationId, organizationId, callbackUrl, url, fixtureMode, eventId, unixTs, rawBody, signature }`. `eventId` ahora usa el formato determinístico `${executionId}-${unixTs}-<evento>` (nunca puede empezar con `undefined`, y lanza un error explícito si `executionId`/`callbackUrl` faltaran en el contexto).
  - Los 9 nodos `HTTP Request` (`... Enviar ...`) usan de forma consistente `{{$json.callbackUrl}}` (antes `{{$json.url}}`, inconsistente entre ramas).
  - Renombrado `callbackTargetUrl` → `callbackUrl` en todo el workflow, alineado con el nombre real del campo en `DispatchPayload`/`N8nWebhookDispatcher`.
  - Validado con una simulación en Node (sin levantar n8n): `fixtureMode=success` produce `running → succeeded` con contexto íntegro en ambos callbacks, `eventId` válido, y firma HMAC coincidente con el protocolo de `hmac.ts`. Host arbitrario y `callbackUrl` ausente quedan rechazados con `400`.
- **[CORREGIDO 2026-08-06] Lectura del body del Webhook en `Extraer Dispatch`.** Evidencia real: el nodo `Recibe Dispatch` recibía correctamente `body.callbackUrl = http://localhost:3200/api/webhooks/n8n`, pero `Extraer Dispatch` producía `callbackUrl` vacío y `validationError = "callbackUrl no es una URL válida"`. Causa: el nodo leía el body a través del alias de conveniencia `$json` (`$json.body`), que no resuelve de forma fiable dentro de un Code node en `runOnceForEachItem` — a diferencia de las expresiones `={{ }}` de otros nodos, donde `$json` sí es estable. Corrección: se reemplazó por el patrón explícito y soportado oficialmente por n8n:
  ```js
  const envelope = $input.first().json;
  const source = envelope.body ?? envelope;
  ```
  `envelope.body ?? envelope` además hace que el nodo funcione tanto con el envelope real del Webhook (`{headers, params, query, body}`) como con un payload ya plano (sin envelope), útil para pruebas manuales futuras. De paso, `fixtureMode` ahora también acepta un campo top-level `source.fixtureMode` (antes solo `source.metadata.fixtureMode`), y `attempt` se lee de `source.attempt` si viene informado (si no, sigue asumiendo `1`, igual que antes — el dispatch real de `N8nWebhookDispatcher` no lo envía). Validado offline con el envelope real de n8n y con un payload plano — ambos casos producen `callbackUrl = http://host.docker.internal:3200/api/webhooks/n8n` y `validationError` vacío. Ver simulación en el reporte de esta tarea.

---

## 0.5 [CERRADO 2026-08-07] Pendientes técnicos de Phase 6 local staging

Contexto: con el flujo end-to-end local ya funcionando (`dispatch n8n → callback running → callback succeeded`, ambos `POST /api/webhooks/n8n` → `200`, ejecución `Completada` en BopIAgency), quedaban dos pendientes técnicos secundarios (no bloqueaban el flujo principal, pero rompían observabilidad/permisos). Ambos se cerraron en esta revisión.

### A. `evaluateAutomationIncident: recovery resolve failed (best-effort)` — causa y corrección

- **Síntoma:** tras un callback `succeeded`, el log mostraba `evaluateAutomationIncident: recovery resolve failed (best-effort)` con `error: INTERNAL_ERROR`. El callback principal seguía respondiendo `200` (best-effort funcionando como diseñado), pero la recuperación automática de alertas no se completaba.
- **Causa raíz:** `resolveActiveByAlertKeyPrefixes` (`packages/infrastructure/src/supabase/repositories/supabase-alert.repository.ts`) escribía el label `automation-recovery:<executionId>` directamente en la columna `alerts.resolved_by`. Esa columna está definida como `uuid NULL REFERENCES auth.users(id)` (`supabase/migrations/20260730150000_phase4_data_migration_targets.sql`), no como texto libre. Postgres rechazaba el `UPDATE` con `22P02 invalid input syntax for type uuid`, que el repositorio traducía genéricamente a `INTERNAL_ERROR`.
- **Corrección:** `resolveActiveByAlertKeyPrefixes` ahora valida si el label recibido es un UUID válido; si lo es, se persiste tal cual en `resolved_by` (caso de una resolución manual futura por un usuario real); si no lo es —como en la recuperación automática del sistema, que no tiene un `auth.users.id` asociado—, `resolved_by` se deja en `NULL` (valor válido para la FK nullable). La trazabilidad de qué ejecución disparó la recuperación se mantiene vía logging de aplicación (`organizationId`, `automationId`, `executionId`, `errorCode`), nunca en la columna FK.
- **Best-effort preservado:** no se eliminó el `try/best-effort` — se corrigió la causa real. El callback principal sigue devolviendo `200` incluso si esta recuperación falla por cualquier otro motivo (verificado con un test dedicado en `route.test.ts`).
- **Archivos:** `packages/infrastructure/src/supabase/repositories/supabase-alert.repository.ts`, `packages/application/src/use-cases/automations/evaluate-automation-incident.use-case.ts` (logging).
- **Tests:** `packages/infrastructure/src/supabase/repositories/__tests__/supabase-alert.repository.test.ts` (9 tests nuevos para `resolveActiveByAlertKeyPrefixes`), `apps/web/src/app/api/webhooks/n8n/__tests__/route.test.ts` (test nuevo: callback `succeeded` responde `200` aunque la recuperación falle en `alerts`).

### B. `403 / SQLSTATE 42501 permission denied for table automation_webhook_events` — causa y corrección

- **Síntoma:** con `SUPABASE_SERVICE_ROLE_KEY`, PostgREST devolvía `403` / `permission denied for table automation_webhook_events` al intentar el `INSERT` de deduplicación del callback. Un `INSERT` directo por `psql` sí funcionaba (confirmando que el problema era de grants de PostgREST/rol, no de RLS ni de la tabla en sí).
- **Causa raíz:** la migración `supabase/migrations/20260804000000_phase6b_automation_runtime.sql` asumía ("service_role hereda por defecto en Supabase — no necesita GRANT explícito") que `service_role` tiene automáticamente `SELECT/INSERT/UPDATE/DELETE` sobre tablas nuevas. Auditoría de grants confirmó que, en esta instancia, `service_role` solo tenía `REFERENCES/TRIGGER/TRUNCATE` sobre las tablas de Phase 6B — el supuesto era incorrecto. Nota adicional: `supabase-js` encadena `.insert(...).select('id').single()`, por lo que el `INSERT` por sí solo no habría bastado — PostgREST también necesita `SELECT` para devolver la fila insertada.
- **Corrección:** se editó la migración `20260804000000_phase6b_automation_runtime.sql` (aún no aplicada a producción/`main` — ver §Grants para el detalle exacto por tabla) para otorgar explícitamente a `service_role` solo los privilegios que el código real ejecuta:
  - `automation_executions`: `SELECT, UPDATE` (el callback hace `SELECT` de coherencia y `UPDATE` de estado; el `INSERT` de ejecuciones sigue pasando por el cliente de sesión + RLS).
  - `automation_execution_logs`: `INSERT` (el callback solo escribe logs; la lectura para la UI sigue siendo `authenticated` + RLS).
  - `automation_webhook_events`: `SELECT, INSERT, UPDATE, DELETE` (dedup + marcar processed/failed; `DELETE` para la retención de 7 días documentada, aún sin job de limpieza implementado).
  - `automation_secrets_metadata`: **sin GRANT a `service_role`** — no hay ningún consumidor de código todavía (tabla placeholder de una fase futura). Se añadirá cuando exista un consumidor real.
  - `anon` y `authenticated` no reciben ningún privilegio operativo nuevo; `automation_webhook_events` sigue sin política RLS para `authenticated`.
- **Tests:** `scripts/migrations/phase-4/__tests__/phase6b-grants.test.ts` (nuevo, 23 tests estáticos que verifican los `GRANT`/`REVOKE`/RLS exactos en el archivo de migración).

### A2. [CERRADO 2026-08-07] Segundo defecto — el fix de `resolved_by` era necesario pero no suficiente

Validación E2E posterior a A mostró que el recovery seguía fallando con el mismo `INTERNAL_ERROR`, aunque el callback principal seguía en `200` y la ejecución terminaba `succeeded` en DB. Se agregó logging seguro del error real de Postgres (`code`, `message`, `details`, `hint` — nunca secretos/tokens/payload/PII) en `resolveActiveByAlertKeyPrefixes` antes de mapearlo a `INTERNAL_ERROR`, lo que habría expuesto `42501 permission denied for table alerts` en logs reales.

- **Causa raíz:** `20260730150000_phase4_data_migration_targets.sql` (Phase 4, ya en `main`) revoca todo de `anon`/`authenticated` y otorga `SELECT, INSERT, UPDATE` **solo a `authenticated`** sobre `public.alerts` — nunca hubo GRANT a `service_role`. Es el mismo defecto ya corregido para las 4 tablas de Phase 6B (§B), pero `alerts` es de una migración anterior que no recibió el fix equivalente. `service_role` bypasea RLS, pero NO el sistema de privilegios GRANT/REVOKE — son mecanismos independientes.
- **Por qué no se reprodujo en pruebas unitarias:** los tests usan mocks del cliente Supabase (no ejecutan SQL real), así que no pueden detectar un GRANT faltante — solo se ve contra una instancia Postgres real.
- **Corrección:** `20260730150000_phase4_data_migration_targets.sql` ya está en `main` (confirmado por `git ls-tree main`) — no se edita in-place. Se creó una migración correctiva nueva y aditiva: `supabase/migrations/20260807150000_fix_alerts_service_role_grant.sql` → `GRANT SELECT, INSERT, UPDATE ON public.alerts TO service_role;` (sin `DELETE`, sin tocar RLS/triggers/datos).
- **Tests:** `scripts/migrations/phase-4/__tests__/alerts-service-role-grant.test.ts` (nuevo, 7 tests estáticos) + 1 test nuevo en `supabase-alert.repository.test.ts` verificando el logging seguro del error real.
- **Verificación pendiente del lado del usuario (requiere DB local real, sin acceso desde este entorno):**
  ```sql
  -- Confirmar el defecto antes de aplicar la migración correctiva:
  SELECT has_table_privilege('service_role', 'public.alerts', 'select');
  SELECT has_table_privilege('service_role', 'public.alerts', 'update');
  SELECT has_table_privilege('service_role', 'public.alerts', 'insert');
  -- Reproducir el UPDATE exacto de resolveActiveByAlertKeyPrefixes sin efectos:
  BEGIN;
    SET ROLE service_role;
    UPDATE public.alerts
      SET status = 'resolved', resolved_at = now(), resolved_by = NULL, updated_at = now()
      WHERE organization_id = 'd4c60c86-30a4-4360-8464-81c0af1d813c'
        AND status = 'active'
        AND alert_key LIKE 'automation:d4c60c86-30a4-4360-8464-81c0af1d813c:1aec6ccb-670c-41e6-85a6-03823c6b405e:%';
  ROLLBACK;
  ```
  Aplicar después con: `supabase db reset` (reaplica todas las migraciones, incluida la correctiva) o `psql < supabase/migrations/20260807150000_fix_alerts_service_role_grant.sql` contra la DB local ya iniciada.

### A3. [CERRADO 2026-08-07] Tercer defecto — `42703 column alerts.alert_key does not exist` con el GRANT ya aplicado

Con el GRANT de service_role ya aplicado (§A2), el recovery seguía fallando, ahora con `42703`, pese a que `alert_key` existe de verdad en `public.alerts` (confirmado con un `SELECT` directo vía PostgREST, `HTTP 200`).

- **Causa raíz:** `alert_key` tiene el formato `automation:{orgId}:{automationId}:{tipo}` — contiene el carácter `:`. Según la documentación oficial de PostgREST ([Reserved characters](https://docs.postgrest.org/en/stable/references/api/url_grammar.html#reserved-characters)), `:` es uno de los caracteres reservados de la gramática de los combinadores `or=`/`and=` (junto con `,`, `.`, `()`) y **debe** ir entre comillas dobles cuando forma parte del valor de un filtro. `resolveActiveByAlertKeyPrefixes` construía el filtro `.or()` sin comillas (`alert_key.like.automation:...:dispatch-failed%`), así que PostgREST interpretaba los `:` como parte de su propia gramática de filtros en vez de como texto literal, y fallaba al intentar resolver una referencia de columna inválida — de ahí el `42703`, aunque la columna real sí existe. Por eso un `SELECT` simple (`?select=...`, sin `or()`) funcionaba: no pasa por esa gramática de combinadores.
- **Corrección:** cada condición `LIKE` dentro de `.or()` ahora envuelve su valor entre comillas dobles (con escape de `\` y `"` por defensa en profundidad): `alert_key.like."automation:{orgId}:{automationId}:{tipo}%"`. `%` no es un carácter reservado por PostgREST, así que el wildcard de `LIKE` sigue funcionando igual dentro de las comillas.
- **Archivos:** `packages/infrastructure/src/supabase/repositories/supabase-alert.repository.ts` (nuevo helper `quotePostgrestFilterValue`).
- **Tests:** 2 tests nuevos en `supabase-alert.repository.test.ts` que verifican el string exacto enviado a `.or()` (con los IDs reales de la validación E2E) y que ningún `:` queda fuera de las comillas.
- **Sin migración ni cambio de esquema** — el defecto era enteramente de construcción del filtro PostgREST en el repositorio, no de la base de datos.

### A4. [CERRADO 2026-08-07] Cuarto paso — `.or()` combinado con UPDATE seguía fallando incluso con el quoting correcto; se eliminó `.or()`

Con el quoting de §A3 aplicado, se agregó logging temporal (`RECOVERY_FILTER_V2`) justo antes de la llamada a Supabase, y se confirmó en runtime real (Next.js y PostgREST reiniciados, caché `.next` limpia) que el string enviado a `.or()` era exactamente el esperado — cada valor completamente entre comillas dobles. Aun así, el `42703` persistió, específicamente combinando `.or()` con `UPDATE`/`PATCH`.

- **Decisión:** en vez de seguir depurando la gramática interna de `or=(...)` de PostgREST combinada con `UPDATE`, se eliminó por completo la dependencia de `.or()`. Los 4 prefijos recuperables (`dispatch-failed`, `execution-failed`, `max-attempts`, `stuck`) son mutuamente excluyentes por diseño (nunca se solapan), así que no hace falta una única condición OR: `resolveActiveByAlertKeyPrefixes` ahora ejecuta un `UPDATE` independiente por prefijo con `.like('alert_key', '<prefijo>%')` — el operador de filtro simple de PostgREST, sin gramática de combinador de por medio — y acumula los ids de alertas resueltas (deduplicados con un `Set`) en un `for...of` secuencial (no `Promise.all`, para mantener el logging y el mapeo de errores deterministas).
- **Limpieza:** se retiró el logging temporal `RECOVERY_FILTER_V2` y el helper `quotePostgrestFilterValue` (sin más consumidores). Se conservó el logging seguro de errores Postgres/PostgREST (`code`/`message`/`details`/`hint`/`operation`, ahora con el `prefix` que falló).
- **Archivos:** `packages/infrastructure/src/supabase/repositories/supabase-alert.repository.ts`.
- **Tests:** reescritos en `supabase-alert.repository.test.ts` (17 tests para este método, incluyendo confirmación explícita de que ya no se llama `.or()`, un `.like()` por prefijo, deduplicación de ids, y que un error a mitad de la iteración detiene el resto).
- **Sin migración, sin tocar n8n, sin tocar producción.**

### Evidencia final del flujo (confirmada por el usuario antes de este cierre)

```
BopIAgency → dispatch n8n → callback running → callback succeeded
POST /api/webhooks/n8n → 200
POST /api/webhooks/n8n → 200
Ejecución: Completada (BopIAgency)
```

---

## 1. n8n local (auditoría de `n8n-local/docker-compose.yml`)

- **Imagen:** `docker.n8n.io/n8nio/n8n:stable` (tag flotante, no fijado a versión exacta — riesgo menor documentado en §Riesgos).
- **Puerto real:** `5678`, publicado solo en loopback: `127.0.0.1:5678:5678`. **n8n local = `http://localhost:5678`** (protocolo `http`, sin TLS — coherente con `N8N_PROTOCOL=http` en `n8n-local/.env`).
- **Volumen persistente:** `n8n_data:/home/node/.n8n` (credenciales/workflows sobreviven a reinicios del contenedor).
- **Timezone:** `America/Bogota` (`GENERIC_TIMEZONE`/`TZ`).
- **Acceso desde el host:** vía `http://localhost:5678` (Next.js corre en el host, no en Docker).
- **Acceso desde dentro del contenedor hacia Next.js (host):** `http://host.docker.internal:3200`. En Docker Desktop (Windows/Mac) funciona por defecto; se añadió `extra_hosts: host.docker.internal:host-gateway` para que también funcione en Docker Engine (Linux).
- **Cambios aplicados a `docker-compose.yml` (mínimos, solo lo necesario):**
  - `AUTOMATION_WEBHOOK_SECRET` añadida a `environment:`, leída de `n8n-local/.env` (nunca hardcodeada).
  - `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` para que el nodo Code de firma pueda leer `$env.AUTOMATION_WEBHOOK_SECRET`. **Riesgo aceptado solo en local:** en `false`, cualquier nodo Code del contenedor puede leer TODAS las env vars, no solo el secreto HMAC. **No recomendado para producción/staging compartido** — ahí usar `true` (bloqueado) y credenciales nativas de n8n en vez de `$env` para secretos. Documentado también en `n8n-local/.env.example` y en el propio `docker-compose.yml`.
  - `extra_hosts: host.docker.internal:host-gateway` para portabilidad Linux (en Docker Desktop para Windows/Mac ya funciona por defecto; `host-gateway` es un valor especial soportado de forma multiplataforma por el daemon de Docker 20.10+, no específico de un SO).
  - Montaje de solo lectura `./workflows:/workflows:ro` (referencia; la importación real se hace por la UI, ver paso 8).
- **Validación de `docker compose config`:** el CLI de Docker no está disponible en el entorno donde se preparó esta revisión, por lo que no se pudo ejecutar el comando real. Se hizo el equivalente: se parseó `docker-compose.yml` con un parser YAML y se simuló la sustitución de variables `${VAR}`/`${VAR:-default}` usando **únicamente** los placeholders de `n8n-local/.env.example` (nunca el `.env` real, para no arriesgar imprimir un secreto). El resultado renderiza correctamente y coincide con lo documentado arriba (puerto, volúmenes, `extra_hosts`, variables). **Antes de iniciar n8n, ejecutar tú mismo el comando real** para confirmar contra tu `.env` real:
  ```
  docker compose -f n8n-local/docker-compose.yml config
  ```

---

## 2. Variables locales (`apps/web/.env.local`)

Añadidas/documentadas en `apps/web/.env.example` (sin valores reales):

```
N8N_BASE_URL=http://localhost:5678
N8N_WEBHOOK_PATH=/webhook          # documental, no usado por el código todavía
AUTOMATION_WEBHOOK_SECRET=replace-with-a-locally-generated-32-byte-random-secret
N8N_API_KEY=
N8N_DISPATCH_TIMEOUT_MS=10000
AUTOMATION_WEBHOOK_TOLERANCE_SECONDS=300
```

`NEXT_PUBLIC_APP_URL=http://localhost:3200` ya existía. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ya están configuradas en tu `.env.local` local (confirmado sin leer sus valores).

## 3. Variables de n8n (`n8n-local/.env`)

Ver plantilla `n8n-local/.env.example` (nueva). Añadir a tu `n8n-local/.env` real:

```
AUTOMATION_WEBHOOK_SECRET=<el MISMO valor exacto que en apps/web/.env.local>
N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

---

## Pasos

### 1. Iniciar Supabase local

```
supabase start
```
Confirmar API en `http://127.0.0.1:54321` y DB en `127.0.0.1:54322`.

### 2. Iniciar Next.js local

```
cd apps/web
npm run dev
```
Confirmar que responde en `http://localhost:3200`.

### 3. Crear el secreto local (`AUTOMATION_WEBHOOK_SECRET`)

**No se genera en esta tarea.** Generarlo tú mismo, localmente, con ≥32 bytes aleatorios, por ejemplo:

```
openssl rand -base64 32
```

o en PowerShell:

```
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

No lo imprimas en un log compartido ni lo pegues en el chat. Guárdalo únicamente en:
- `apps/web/.env.local` → `AUTOMATION_WEBHOOK_SECRET=...`
- `n8n-local/.env` → `AUTOMATION_WEBHOOK_SECRET=...` (mismo valor exacto)

### 4. Configurar `apps/web/.env.local`

Copiar las claves nuevas de `apps/web/.env.example` (sección "n8n / Automation Runtime") y completar con el secreto generado en el paso 3 y `N8N_BASE_URL=http://localhost:5678`.

### 5. Configurar `n8n-local/.env`

Copiar `n8n-local/.env.example` → `n8n-local/.env` si aún no existe, y añadir/confirmar `AUTOMATION_WEBHOOK_SECRET` (mismo valor que el paso 4) y `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.

### 6. Iniciar n8n

```
cd n8n-local
docker compose up -d
```

Comando de inicio (ver también §Entrega): `docker compose -f n8n-local/docker-compose.yml up -d`

### 7. Abrir la UI de n8n

`http://localhost:5678` — crear/iniciar sesión del owner local de n8n si es la primera vez (credenciales propias de n8n, no relacionadas con BopIAgency).

### 8. Importar el workflow

En la UI de n8n: **Workflows → Import from File** → seleccionar `n8n-local/workflows/phase6-local-runtime-test.json`.

Revisar rápidamente cada nodo tras importar (los parámetros de nodos pueden variar levemente entre versiones de n8n — ver §Riesgos).

### 9. Activarlo

Activar el workflow **solo después de revisarlo** en la UI. Confirmar que el nodo "Recibe Dispatch" (Webhook) queda con método `POST` y path `:automationId`.

### 10. Verificar la webhook URL

En el nodo "Recibe Dispatch", la UI de n8n mostrará algo como `http://localhost:5678/webhook/:automationId`. Confirmar que el host/puerto coincide con `N8N_BASE_URL` (`http://localhost:5678`) configurado en `apps/web/.env.local` — el dispatcher construye la URL final reemplazando `:automationId` por el UUID real de la automatización.

### 11. Ejecutar el script de precheck

```
pwsh -File scripts/local/verify-phase6-n8n.ps1
```
o en Windows PowerShell:
```
powershell -ExecutionPolicy Bypass -File scripts/local/verify-phase6-n8n.ps1
```

Debe terminar en `PASS` (o `PASS CON ADVERTENCIAS`) antes de continuar. Si falla, corregir y repetir.

### 12. Ejecutar dispatch success

En BopIAgency (`http://localhost:3200/automations`), abrir **Local Active Automation** y pulsar **Ejecutar**. Como la UI actual no expone `metadata.fixtureMode`, el dispatch llega sin ese campo y el workflow usa el default `success`: envía `execution.started` y, tras una espera breve, `execution.succeeded`.

> **[GAP CERRADO 2026-08-06]** Este flujo desde la UI ya funciona end-to-end: `N8nWebhookDispatcher` construye `callbackUrl` automáticamente desde `NEXT_PUBLIC_APP_URL` (`http://localhost:3200/api/webhooks/n8n` con la config de `.env.example`), sin depender de que `startExecutionAction` lo pase. Ya no hace falta el flujo manual con `curl` del paso 15 solo para validar `callbackUrl` — ese flujo sigue siendo útil para probar los casos negativos (`fixtureMode`), que la UI no expone.

### 13. Validar callbacks

En la pestaña **Executions** de n8n, confirmar que el workflow corrió sin error y que ambos `HTTP Request` (Running, Succeeded) devolvieron `200`.

### 14. Validar DB

En Supabase Studio local (`http://localhost:54323`) o `psql`, revisar:
- `automation_executions`: la ejecución pasó de `queued` → `running` → `succeeded`.
- `automation_execution_logs`: **confirmar si el log del callback quedó persistido** (ver hallazgo §0.4 — puede no aparecer por el mismatch de columna `context`/`metadata`).
- `automation_webhook_events`: dos filas `processed` (una por cada callback), sin duplicados.
- `alerts` / `tasks`: sin alertas nuevas (el flujo success no genera incidentes).

### 15. Probar casos negativos

Sin usar la UI de automatizaciones (que no expone `fixtureMode`), enviar manualmente un POST al webhook local de n8n con `metadata.fixtureMode` en el body, por ejemplo con `curl` (ejemplo con placeholders, no ejecutar hasta tenerlo revisado):

```bash
curl -X POST http://localhost:5678/webhook/<automationId-de-Local-Active-Automation> \
  -H "Content-Type: application/json" \
  -d '{
    "executionId": "<uuid de una execution existente o de prueba>",
    "organizationId": "<org id de BopAgency Local>",
    "automationId": "<automationId>",
    "idempotencyKey": "manual-test-1",
    "triggerType": "manual",
    "callbackUrl": "http://localhost:3200/api/webhooks/n8n",
    "metadata": { "fixtureMode": "failed" }
  }'
```

> **Nota:** este `curl` llama directamente al webhook de n8n, sin pasar por `N8nWebhookDispatcher` — por eso `callbackUrl` se incluye a mano en el body. El workflow local sigue exigiéndolo (ver §0.1/§0.4): omitirlo, dejarlo vacío, o apuntar a un host que no sea `localhost`/`127.0.0.1`/`host.docker.internal` hace que responda `400` sin firmar ni enviar nada. El valor de ejemplo (`http://localhost:3200/...`) es reescrito internamente a `http://host.docker.internal:3200/...` por el nodo `Extraer Dispatch`. **Esto ya no aplica al paso 12** (dispatch real desde la UI): ahí `callbackUrl` lo construye la app automáticamente — ver el gap cerrado en §0.1.

Repetir cambiando `fixtureMode` a `duplicate`, `stale-timestamp`, `invalid-signature`, `timeout` y observar:
- `failed`: ejecución termina en `failed`, se crea una `alert` (severidad `critical`, mecanismo real de `evaluateAutomationIncident`) y una `task`.
- `duplicate`: el segundo envío responde `200 {ok:true, duplicate:true}` — cubre también *replay protection*.
- `stale-timestamp`: la app responde `403` (timestamp fuera de tolerancia).
- `invalid-signature`: la app responde `403` (firma inválida).
- `timeout`: n8n no responde a tiempo al dispatch inicial; si se dispara desde la UI real (no desde curl), la ejecución en BopIAgency debe terminar `failed` con `error_code=DISPATCH_FAILED` tras ~10s.

### 16. Cleanup

Ejecutar `supabase/fixtures/phase6_local_staging_cleanup.sql` (ya existente de la tarea anterior) para borrar cualquier dato de prueba adicional generado, si aplica. No borra organización, usuario, perfiles ni membresías.

### 17. Detener servicios

```
cd n8n-local && docker compose down
```
(agregar `-v` solo si se desea borrar también el volumen `n8n_data`, perdiendo el workflow importado). Detener Next.js (`Ctrl+C`) y, si aplica, `supabase stop`.

---

## Riesgos

- ~~`evaluateAutomationIncident: recovery resolve failed (best-effort)` / `INTERNAL_ERROR`~~ — **[CERRADO 2026-08-07]** causa raíz: `resolved_by` es `uuid` FK a `auth.users`, no texto libre. Ver §0.5.A.
- ~~`403 / SQLSTATE 42501 permission denied for table automation_webhook_events`~~ — **[CERRADO 2026-08-07]** causa raíz: `service_role` no tenía `SELECT/INSERT/UPDATE/DELETE` explícitos en `20260804000000_phase6b_automation_runtime.sql`. Ver §0.5.B.
- ~~Bug de esquema en el log de callback (`context` vs `metadata`)~~ — **corregido** en la revisión de consistencia del 2026-08-06 (`route.ts`, `SupabaseExecutionLogRepository`, `types.ts`). Ver tests C16 en `route.test.ts`.
- ~~`callbackUrl` vacío desde la UI real~~ — **[CERRADO 2026-08-06]** `N8nWebhookDispatcher.dispatch()` ya no depende de que el use case/`startExecutionAction` lo pasen: lo resuelve él mismo, server-side, desde `NEXT_PUBLIC_APP_URL`. Ver §0.1 y tests C1–C9 en `n8n-webhook-dispatcher.test.ts`. Riesgo residual menor: si `NEXT_PUBLIC_APP_URL` no está configurada en un entorno, el dispatch falla de forma segura (`INTERNAL_ERROR`) en vez de despachar sin callback — confirmar que esté presente en cada entorno (ya es requerida por `verify-phase6-n8n.ps1` en local).
- **Tag `n8n:stable` no fijado a versión exacta** — la forma exacta de los parámetros de nodos (Webhook, IF, Code, HTTP Request) puede variar levemente entre actualizaciones de n8n. Revisar cada nodo tras importar (paso 8).
- **`N8N_WEBHOOK_PATH` documentada pero no usada por el código** — no configurar expectativas sobre ella hasta que se implemente.
- ~~Nombres de variables inconsistentes con `PHASE_6_N8N_INTEGRATION_RUNBOOK.md`~~ — **corregido** en la revisión de consistencia del 2026-08-06.
- **`database.types.ts` está huérfano** (no lo importa ningún archivo — el `Database` vivo es `apps/web/src/lib/supabase/types.ts`). Se corrigió igualmente por prolijidad, pero si se retoma la generación automática de tipos, confirmar cuál de los dos archivos debe quedar como fuente única.
- **Workflow local no probado contra una instancia real de n8n** en esta tarea (sin Docker disponible en el entorno de preparación) — validar cuidadosamente en los pasos 8–9 antes de activarlo.
