/**
 * POST /api/webhooks/n8n — Callback seguro de n8n hacia BopIAgency
 *
 * Recibe notificaciones de cambio de estado de ejecuciones desde n8n.
 *
 * FLUJO DE SEGURIDAD (ORDEN OBLIGATORIO — NO ALTERAR):
 *   1. Leer raw body
 *   2. Leer headers de firma
 *   3. Verificar presencia de event-id
 *   4. Verificar timestamp dentro de tolerancia
 *   5. Verificar HMAC SHA-256 (constant-time)
 *   ⛔ SOLO DESPUÉS DEL HMAC:
 *   6. Crear cliente admin Supabase (service_role)
 *   7. Deduplicar via automation_webhook_events (atomic insert)
 *   8. Validar payload con Zod
 *   9. Verificar coherencia (orgId, automationId, transiciones)
 *  10. Actualizar automation_executions
 *  11. Insertar automation_execution_logs sanitizado
 *  12. Marcar webhook_event como processed
 *  13. Responder JSON mínimo
 *
 * SEGURIDAD:
 * - service_role NUNCA se crea antes del HMAC verificado.
 * - No se persiste raw body — solo payload_hash (SHA-256).
 * - Errores HTTP no revelan detalles internos (Supabase, SQL, stack).
 * - organizationId siempre verificado contra la ejecución en DB.
 * - Transiciones de estado validadas con reglas del dominio.
 * - Deduplicación atómica: insert + captura de unique violation (23505).
 *
 * USO DE service_role:
 *   Único punto justificado en Phase 6. n8n no tiene sesión de usuario.
 *   Ver PHASE_6_SECURITY_MODEL.md §3.3 para auditoría completa.
 */
import type { NextRequest } from 'next/server';
import {
  BOP_TIMESTAMP_HEADER,
  BOP_SIGNATURE_HEADER,
  BOP_EVENT_ID_HEADER,
  verifyIncomingWebhook,
} from '@/lib/webhooks/hmac';
import { createAdminClient } from '@/lib/supabase/server';
import { parseCallbackPayload, EVENT_TYPE_TO_STATUS } from './payload.schema';
import { canTransitionExecution } from '@bop-agency/domain';
import type { AutomationExecutionStatus } from '@bop-agency/domain';

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): Response {
  return Response.json(body, { status });
}

/** 200 — procesado correctamente */
const ok = (extra?: Record<string, unknown>) =>
  jsonResponse({ ok: true, ...extra }, 200);

/** 200 — evento duplicado (idempotente) */
const duplicate = () =>
  jsonResponse({ ok: true, duplicate: true }, 200);

/** 400 — payload inválido */
const badRequest = (reason: string) =>
  jsonResponse({ error: 'Bad request', detail: reason }, 400);

/** 401 — firma o headers faltantes */
const unauthorized = () =>
  jsonResponse({ error: 'Unauthorized' }, 401);

/** 403 — firma inválida o timestamp vencido */
const forbidden = () =>
  jsonResponse({ error: 'Forbidden' }, 403);

/** 409 — conflicto de estado (transición inválida) */
const conflict = (reason: string) =>
  jsonResponse({ error: 'Conflict', detail: reason }, 409);

/** 500 — error interno sanitizado */
const serverError = () =>
  jsonResponse({ error: 'Internal server error' }, 500);

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  // ── PASO 1: Leer raw body ANTES de parsear ─────────────────────────────────
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return badRequest('Unable to read request body');
  }

  // ── PASO 2: Leer headers de firma ─────────────────────────────────────────
  const timestamp = request.headers.get(BOP_TIMESTAMP_HEADER);
  const signature = request.headers.get(BOP_SIGNATURE_HEADER);
  const eventId   = request.headers.get(BOP_EVENT_ID_HEADER);

  // ── PASOS 3-5: Verificar HMAC (event-id → timestamp → firma) ──────────────
  // ⛔ service_role NO se crea antes de este punto.
  let verifyResult: ReturnType<typeof verifyIncomingWebhook>;
  try {
    verifyResult = verifyIncomingWebhook(
      { timestamp, signature, eventId },
      rawBody,
    );
  } catch {
    // Error de configuración del servidor (secreto no configurado)
    console.error('[webhook/n8n] Error de configuración HMAC — revisar AUTOMATION_WEBHOOK_SECRET');
    return serverError();
  }

  if (!verifyResult.ok) {
    const { code } = verifyResult.error;

    // Log de seguridad sin revelar detalles al cliente
    console.warn('[webhook/n8n] Verificación fallida', {
      code,
      // No loguear signature, rawBody ni secreto
    });

    if (code === 'MISSING_EVENT_ID' || code === 'MISSING_SIGNATURE') {
      return unauthorized();
    }
    // STALE_TIMESTAMP | INVALID_SIGNATURE
    return forbidden();
  }

  // ── PASO 6: Crear cliente admin SOLO después del HMAC verificado ───────────
  // ⚠️ SEGURIDAD: service_role bypasea RLS — únicamente después de HMAC.
  // Ver PHASE_6_SECURITY_MODEL.md §3.3 para justificación de auditoría.
  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch {
    console.error('[webhook/n8n] Error al crear cliente admin');
    return serverError();
  }

  const { eventId: verifiedEventId, payloadHash } = verifyResult;

  // ── PASO 7: Deduplicación atómica via automation_webhook_events ────────────
  // Estrategia: INSERT primero, capturar unique violation (23505).
  // Previene race conditions que un SELECT previo no podría.
  const webhookInsert = await adminClient
    .from('automation_webhook_events')
    .insert({
      source:            'n8n',
      external_event_id: verifiedEventId,
      event_type:        'pending', // se actualiza tras procesar
      payload_hash:      payloadHash,
      status:            'received',
    })
    .select('id')
    .single();

  if (webhookInsert.error) {
    // Código 23505 = unique_violation en (source, external_event_id)
    if (webhookInsert.error.code === '23505') {
      // Evento ya procesado — responder idempotentemente
      return duplicate();
    }
    console.error('[webhook/n8n] Error al insertar webhook_event', {
      code: webhookInsert.error.code,
      // No loguear el mensaje completo de Supabase
    });
    return serverError();
  }

  const webhookEventId = webhookInsert.data.id as string;

  // ── PASO 8: Validar payload con Zod ───────────────────────────────────────
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    await markWebhookFailed(adminClient, webhookEventId, 'INVALID_JSON');
    return badRequest('Request body is not valid JSON');
  }

  const payloadResult = parseCallbackPayload(parsedBody);
  if (!payloadResult.ok) {
    await markWebhookFailed(adminClient, webhookEventId, 'INVALID_PAYLOAD');
    return badRequest('Payload validation failed');
  }

  const payload = payloadResult.data;

  // ── PASO 9: Verificar coherencia — ejecución existe en la organización ─────
  const { data: execution, error: execError } = await adminClient
    .from('automation_executions')
    .select('id, organization_id, automation_id, status, attempt')
    .eq('id', payload.executionId)
    .single();

  if (execError || !execution) {
    // No revelar si la ejecución existe en otra org
    console.warn('[webhook/n8n] Ejecución no encontrada', {
      executionId: payload.executionId,
    });
    await markWebhookFailed(adminClient, webhookEventId, 'EXECUTION_NOT_FOUND');
    return badRequest('Execution not found');
  }

  // Verificar organizationId (no revelar mismatch explícitamente al cliente)
  if (execution.organization_id !== payload.organizationId) {
    console.warn('[webhook/n8n] organizationId mismatch — posible ataque', {
      fromPayload: payload.organizationId,
      // No loguear el valor real de la DB
    });
    await markWebhookFailed(adminClient, webhookEventId, 'ORG_MISMATCH');
    return forbidden();
  }

  // Verificar automationId
  if (execution.automation_id !== payload.automationId) {
    console.warn('[webhook/n8n] automationId mismatch', {
      executionId: payload.executionId,
    });
    await markWebhookFailed(adminClient, webhookEventId, 'AUTOMATION_MISMATCH');
    return badRequest('automationId mismatch');
  }

  // Verificar attempt no decremental
  if (payload.attempt < (execution.attempt as number)) {
    await markWebhookFailed(adminClient, webhookEventId, 'INVALID_ATTEMPT');
    return badRequest('Attempt number cannot decrease');
  }

  // ── Validar transición de estado ─────────────────────────────────────────
  const currentStatus = execution.status as AutomationExecutionStatus;
  const newStatus     = EVENT_TYPE_TO_STATUS[payload.eventType] as AutomationExecutionStatus;

  // Permitir idempotencia: mismo status → no es error, es duplicado por eventType
  if (currentStatus !== newStatus && !canTransitionExecution(currentStatus, newStatus)) {
    await markWebhookFailed(adminClient, webhookEventId, 'INVALID_TRANSITION');
    return conflict(
      `Invalid transition: ${currentStatus} → ${newStatus}`,
    );
  }

  // Si el status ya es el destino (idempotencia de estado)
  if (currentStatus === newStatus) {
    await markWebhookProcessed(adminClient, webhookEventId, payload.eventType);
    return ok({ idempotentStatus: true });
  }

  // ── PASO 10: Actualizar automation_executions ─────────────────────────────
  const now = new Date().toISOString();
  const statusPatch: Record<string, unknown> = {
    status: newStatus,
  };

  if (newStatus === 'running') {
    statusPatch['started_at'] = now;
  }
  if (['succeeded', 'failed', 'cancelled'].includes(newStatus)) {
    statusPatch['completed_at'] = now;
  }
  if (payload.outputMetadata !== null && payload.outputMetadata !== undefined) {
    statusPatch['output_metadata'] = payload.outputMetadata;
  }
  if (payload.errorCode !== null && payload.errorCode !== undefined) {
    statusPatch['error_code'] = payload.errorCode;
  }
  if (payload.errorMessage !== null && payload.errorMessage !== undefined) {
    // Sanitizar: truncar a 500 chars, no persistir stack traces completos
    statusPatch['error_message'] = sanitizeErrorMessage(payload.errorMessage);
  }

  const { error: updateError } = await adminClient
    .from('automation_executions')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update(statusPatch as any)
    .eq('id', payload.executionId)
    .eq('organization_id', payload.organizationId);

  if (updateError) {
    console.error('[webhook/n8n] Error al actualizar execution', {
      code: updateError.code,
    });
    await markWebhookFailed(adminClient, webhookEventId, 'UPDATE_FAILED');
    return serverError();
  }

  // ── PASO 11: Insertar automation_execution_logs sanitizado ─────────────────
  const logContext: Record<string, unknown> = {
    attempt:     payload.attempt,
    eventType:   payload.eventType,
    automationId: payload.automationId,
  };
  if (payload.errorCode) {
    logContext['errorCode'] = payload.errorCode;
  }

  await adminClient
    .from('automation_execution_logs')
    .insert({
      execution_id:    payload.executionId,
      organization_id: payload.organizationId,
      level:           newStatus === 'failed' ? 'error' : 'info',
      message:         `Execution ${newStatus} via n8n callback`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      context:         logContext as any,
      // No almacenar error_message completo aquí — ya está en execution
      occurred_at:     now,
    });
  // No fallar si el log falla — la actualización de estado ya fue exitosa

  // ── PASO 12: Marcar webhook_event como processed ───────────────────────────
  await markWebhookProcessed(adminClient, webhookEventId, payload.eventType);

  // ── PASO 13: Responder JSON mínimo ─────────────────────────────────────────
  return ok();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>;

async function markWebhookProcessed(
  client: AdminClient,
  webhookEventId: string,
  eventType: string,
): Promise<void> {
  await client
    .from('automation_webhook_events')
    .update({
      status:       'processed',
      event_type:   eventType,
      processed_at: new Date().toISOString(),
    })
    .eq('id', webhookEventId);
}

async function markWebhookFailed(
  client: AdminClient,
  webhookEventId: string,
  errorCode: string,
): Promise<void> {
  await client
    .from('automation_webhook_events')
    .update({
      status:     'failed',
      error_code: errorCode,
    })
    .eq('id', webhookEventId);
}

/**
 * Sanitiza error_message antes de persistir.
 * - Trunca a 500 chars.
 * - Redacta tokens y credenciales.
 */
const TOKEN_PATTERN = /\b(Bearer\s+\S+|sk-[a-zA-Z0-9]{10,}|ey[a-zA-Z0-9._-]{20,})\b/gi;

function sanitizeErrorMessage(raw: string): string {
  return raw.slice(0, 500).replace(TOKEN_PATTERN, '[REDACTED]');
}
