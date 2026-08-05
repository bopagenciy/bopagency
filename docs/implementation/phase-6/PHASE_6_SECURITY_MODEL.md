# Phase 6 — Modelo de Seguridad
**Fecha:** 2026-08-04  
**Scope:** Automation Runtime — autenticación, autorización, secretos, webhooks, ejecuciones

---

## 1. Resumen Ejecutivo

Phase 6 introduce nuevos vectores de ataque respecto a Phases anteriores:

1. **Webhooks entrantes de n8n** — endpoint público que actualiza estado de ejecuciones
2. **Dispatch a n8n** — el sistema llama a endpoints de n8n con API keys
3. **Secretos de plataformas** (Meta tokens, Gmail OAuth) — almacenados en Supabase Vault
4. **Payloads de ejecución** — pueden contener datos de clientes (PII)
5. **Retry de ejecuciones** — riesgo de replay attacks y doble ejecución

El modelo aplica **defensa en profundidad**: autenticación + autorización + validación de payload + idempotencia + sanitización + RLS.

---

## 2. Matriz de Autorización

| Acción | Rol mínimo | Fuente de autoridad |
|--------|-----------|---------------------|
| Ver lista de automatizaciones | `viewer` (any member) | JWT → requireOrganization() |
| Ver historial de ejecuciones | `viewer` | JWT → requireOrganization() |
| Activar automatización | `operator` | JWT → requireOrganizationRole('operator') |
| Pausar automatización | `operator` | JWT → requireOrganizationRole('operator') |
| Disparar manualmente | `operator` | JWT → requireOrganizationRole('operator') |
| Cancelar ejecución | `operator` | JWT → requireOrganizationRole('operator') |
| Reintentar ejecución | `operator` | JWT → requireOrganizationRole('operator') |
| Crear automatización | `admin` | JWT → requireOrganizationRole('admin') |
| Archivar automatización | `admin` | JWT → requireOrganizationRole('admin') |
| Gestionar secretos | `admin` | JWT → requireOrganizationRole('admin') |
| Actualizar estado vía webhook | service_role (HMAC) | HMAC verificado + `AUTOMATION_WEBHOOK_SECRET` |

**Regla invariante:** `organizationId` NUNCA viene del cliente. Siempre del JWT de Supabase.

---

## 3. Autenticación del Webhook Route

### 3.1 Flujo

```
n8n termina ejecución
  → POST /api/webhooks/n8n
  → Headers:
      X-N8N-Signature: hmac-sha256={hex}
      Content-Type: application/json
  → Body: { executionId, automationId, organizationId, status, ... }
```

### 3.2 Verificación HMAC

```typescript
// apps/web/src/app/api/webhooks/n8n/route.ts

export async function POST(request: Request) {
  // 1. Leer body como texto para verificar firma antes de parsear
  const rawBody = await request.text();
  const signature = request.headers.get('X-N8N-Signature');

  if (!signature) {
    return Response.json({ error: 'Missing signature' }, { status: 401 });
  }

  // 2. Verificar HMAC-SHA256
  const secret = process.env.AUTOMATION_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] AUTOMATION_WEBHOOK_SECRET not configured');
    return Response.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const expectedSig = createHmac('sha256', secret)
    .update(rawBody, 'utf-8')
    .digest('hex');

  const receivedSig = signature.replace('hmac-sha256=', '');

  // 3. Comparación timing-safe
  if (!timingSafeEqual(
    Buffer.from(receivedSig, 'hex'),
    Buffer.from(expectedSig, 'hex')
  )) {
    return Response.json({ error: 'Invalid signature' }, { status: 403 });
  }

  // 4. Parsear y procesar SOLO después de verificar firma
  const payload = WebhookPayloadSchema.safeParse(JSON.parse(rawBody));
  if (!payload.success) {
    return Response.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // 5. Procesar con service_role (ÚNICO uso justificado en Phase 6)
  const supabase = createServiceRoleClient();
  // ...
}
```

### 3.3 Uso de service_role

El uso de `service_role` en la webhook route es la **única excepción justificada** en Phase 6. Se documenta aquí para auditoría:

| Criterio | Verificación |
|----------|-------------|
| ¿Hay JWT de usuario? | No — n8n no tiene sesión de usuario |
| ¿Hay alternativa sin service_role? | No — RLS requiere JWT para `authenticated` |
| ¿Se verificó identidad del caller? | Sí — HMAC con secreto compartido |
| ¿Está limitado el scope? | Sí — solo actualiza `automation_executions` y `automation_execution_logs` |
| ¿Está documentado? | Sí — este documento y comentario inline en el código |

**Regla:** Si el HMAC falla, no se usa service_role bajo ninguna circunstancia.

---

## 4. Seguridad de Secretos

### 4.1 Principios

1. Los tokens de Meta Ads, Gmail OAuth y otras plataformas viven en **Supabase Vault** (`vault.secrets`)
2. La tabla `automation_secrets_metadata` almacena solo la **referencia** al vault (`vault_secret_id`)
3. El valor del secreto solo puede leerlo:
   - Una función PostgreSQL SECURITY DEFINER (ejecutada desde n8n via RPC)
   - El webhook route con service_role en contexto de ejecución
4. El secreto **NUNCA** aparece en:
   - Logs de aplicación
   - Payloads de webhook
   - Respuestas de API al cliente
   - `output_payload` de executions

### 4.2 Variables de Entorno Requeridas

| Variable | Dónde | Nivel de exposición |
|----------|-------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Pública (sin secreto) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Pública (RLS protege) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | 🔴 Crítica — solo webhook route |
| `N8N_WEBHOOK_BASE_URL` | Server only | 🟡 Interna — URL de n8n |
| `N8N_API_KEY` | Server only | 🟡 Interna — para cancel vía API |
| `AUTOMATION_WEBHOOK_SECRET` | Server only | 🔴 Crítica — HMAC secret |

**Regla:** Ninguna de las variables `Server only` puede tener prefijo `NEXT_PUBLIC_`.

---

## 5. Idempotencia y Replay Attack Prevention

### 5.1 Problema

n8n puede re-entregar el mismo webhook si no recibió confirmación (timeout, crash del server). Esto causaría doble actualización del estado de ejecución.

### 5.2 Solución: Tabla de Eventos + Clave Única

```sql
-- La clave de idempotencia en automation_webhook_events es UNIQUE
CREATE UNIQUE INDEX uq_webhook_idempotency
  ON public.automation_webhook_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

```typescript
// En la webhook route, antes de procesar:
const { data: existing } = await supabase
  .from('automation_webhook_events')
  .select('id, processing_status')
  .eq('idempotency_key', payload.idempotencyKey)
  .maybeSingle();

if (existing?.processing_status === 'processed') {
  // Idempotente: ya procesado, retornar 200 sin hacer nada
  return Response.json({ ok: true, idempotent: true });
}
```

### 5.3 Idempotencia en Dispatch

```typescript
// En dispatchAutomation use case:
const key = idempotencyKey(automationId, runId, date);

// Verificar si ya existe una execution con esta clave
const existing = await executionRepo.findByIdempotencyKey(key);
if (existing.success && existing.value !== null) {
  // Dispatch duplicado — retornar la execution existente
  return ok(existing.value);
}

// Proceder con nuevo dispatch
```

---

## 6. Sanitización de Payloads

### 6.1 Claves prohibidas en payloads persistidos

Antes de persistir `input_payload`, `output_payload` o `context` (logs), se filtran claves que puedan contener secretos:

```typescript
const FORBIDDEN_KEY_PATTERNS = [
  'secret', 'token', 'key', 'password', 'auth',
  'credential', 'cred', 'private', 'bearer', 'oauth'
];

function sanitizePayload(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) =>
      !FORBIDDEN_KEY_PATTERNS.some(pattern =>
        k.toLowerCase().includes(pattern)
      )
    )
  );
}
```

### 6.2 Límites de tamaño

| Campo | Límite | Razón |
|-------|--------|-------|
| `output_payload` | 10KB | Previene acumulación de datos grandes |
| `error_message` | 500 chars | Sin stack trace completo |
| Log `message` | 2000 chars | |
| Log `context` | 5KB | |
| Logs por ejecución | 500 líneas | Previene flood de logs |

---

## 7. Autorización Multi-Tenant en Ejecuciones

### 7.1 Verificación de ownership antes de toda mutación

```typescript
// En dispatch use case:
const automationResult = await automationRepo.findById(automationId, organizationId);
if (!automationResult.success) return err('AUTOMATION_NOT_FOUND');
// Si la automation no pertenece a la org, findById retorna NOT_FOUND
// El cliente nunca sabe si el recurso existe en otra org

// En cancel use case:
const executionResult = await executionRepo.findById(executionId, organizationId);
if (!executionResult.success) return err('EXECUTION_NOT_FOUND');
```

### 7.2 `organizationId` del webhook payload — verificación doble

El webhook de n8n incluye `organizationId` en el payload. Este valor:
1. **No se usa directamente** para determinar la org de la execution
2. Se **compara** con el `organization_id` de la execution en Supabase (lookup por `executionId`)
3. Si difieren → log de seguridad + retornar 403

```typescript
const execution = await supabase
  .from('automation_executions')
  .select('organization_id')
  .eq('n8n_execution_id', payload.n8nExecutionId)
  .single();

if (execution.data?.organization_id !== payload.organizationId) {
  console.warn('[webhook/security] organizationId mismatch', {
    fromPayload: payload.organizationId,
    fromDb: execution.data?.organization_id,
  });
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}
```

---

## 8. Exposición de Errores

| Capa | Política |
|------|---------|
| Server Actions | Retornan `{ success: false, error: 'Mensaje en español' }` — sin detalles técnicos |
| Webhook route | Retorna solo `{ ok: true }` o `{ error: 'descripción genérica' }` |
| UI | Muestra mensaje de error seguro — nunca el código de error técnico |
| Logs | `console.error` con detalles técnicos — solo visible en servidor |

**Regla:** Si n8n no está disponible, la UI muestra "El servicio de automatización no está disponible temporalmente" — sin exponer la URL de n8n ni el código de error HTTP.

---

## 9. Gaps de Seguridad Pendientes (Phase 6)

| Gap | Severidad | Mitigación actual | Plan |
|-----|-----------|------------------|------|
| Rate limiting en Server Actions de dispatch | Media | Un usuario autenticado podría disparar en bucle | Añadir Upstash Redis en Phase 6G o posterior |
| Expiración de tokens de Meta en Vault | Alta | Sin alerta antes de expiración | `expires_at` en `automation_secrets_metadata` + alerta en Phase 6F |
| `N8N_ENCRYPTION_KEY` histórico en git | Crítica | Verificar con `git log --all -- n8n-local/.env` | Acción manual pre-Phase 6 |
| Backups de W-05/W-06/W-07 ausentes | Media | Si n8n se resetea, se pierden | Exportar desde n8n antes de Phase 6 |
| Sin logging de auditoría para activar/pausar automations | Baja | Las acciones se reflejan en `updated_at` | Añadir `audit_log` entries en Phase 6G |
| SSRF desde dispatch (URL de n8n controlada externamente) | Baja | URL viene de env var `N8N_WEBHOOK_BASE_URL`, no del usuario | Validar que la URL sea la esperada — no configurable por usuario |

---

## 10. Checklist de Seguridad por Subfase

### Phase 6A (Domain)
- [ ] Verificar `git log --all -- n8n-local/.env` — rotar si estuvo en git
- [ ] Exportar W-05, W-06, W-07 de n8n como backup

### Phase 6B (DB)
- [ ] Nueva migración SQL con pattern de protección de campos inmutables
- [ ] RLS habilitado en todas las tablas nuevas
- [ ] Sin datos de clientes en `automation_webhook_events` (solo metadata)

### Phase 6C (Gateway)
- [x] `N8N_BASE_URL` validado por env var (no configurable por usuario)
- [x] Timeout configurable via N8N_DISPATCH_TIMEOUT_MS, AbortController, default 10s
- [x] `N8N_API_KEY` nunca en logs (verificado en test B12)

### Phase 6D (Ejecuciones) ✅ COMPLETE 2026-08-05
- [x] Idempotency key verificado antes de todo dispatch (scoped a organizationId)
- [x] `organizationId` en todas las llamadas a repositorio; RLS via cliente user-scoped
- [x] Metadata sanitizada: claves con secret/token/key/password/auth/credential/etc. eliminadas
- [x] Logs sanitizados: misma lista extendida en SupabaseExecutionLogRepository
- [x] `service_role` no utilizado en ningún path de Phase 6D
- [x] Dispatcher port en capa de aplicación — n8n no alcanzable sin composición explícita

### Phase 6E (UI)
- [ ] Server Actions con `requireOrganizationRole` antes de toda mutación
- [ ] Errores de n8n no expuestos en respuestas de Server Actions

### Phase 6F (Alertas/Tareas) ✅ COMPLETE 2026-08-05
- [x] Alertas de `AUTOMATION_FAILED` no exponen URL de n8n ni stack trace — `buildSafeAlertContent()` usa textos fijos por tipo de incidente
- [x] `safeErrorMessage` truncada a 200 chars antes de persistir — sin tokens, HMAC, stack traces
- [x] `alert_key` no contiene PII ni datos variables — solo orgId + automationId + tipo de incidente
- [x] `service_role` (adminClient) usado únicamente en webhook route para bypass de trigger `trg_alerts_70_audit_fields` — `auth.uid() IS NULL` permite INSERT/UPDATE de campos de auditoría
- [x] Deduplicación por `alert_key` UNIQUE en DB — sin race conditions por upsert atómico
- [x] Tarea no expone signatureTag ni orgId en UI — sólo título y descripción seguros

### Phase 6G (Tests y Cierre)
- [ ] Test de HMAC: firma inválida → 403
- [ ] Test de replay: mismo idempotency_key → 200 idempotente sin doble procesamiento
- [ ] Test de ownership: execution de otra org → 403 (o NOT_FOUND)
- [ ] `git check-ignore -v` para confirmar que `.env.local` y credenciales no están trackeados
