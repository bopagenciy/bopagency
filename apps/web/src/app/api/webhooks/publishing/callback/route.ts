/**
 * POST /api/webhooks/publishing/callback — Callback de Evidencia de Publicación
 *
 * Recibe evidencia/notificaciones de publicaciones en MODELO A (sincrónico/auditoría).
 *
 * FLUJO DE SEGURIDAD (ORDEN OBLIGATORIO — NO ALTERAR):
 *   1. Leer raw body text.
 *   2. Leer headers de firma (`x-bop-timestamp`, `x-bop-signature`, `x-bop-event-id`).
 *   3. Verificar HMAC SHA-256 (`verifyIncomingPublicationWebhook`).
 *      ⛔ service_role NO se crea antes de este punto.
 *   4. Crear cliente admin Supabase (`service_role`).
 *   5. Registra recepción atómica via RPC `record_publication_webhook_receipt`.
 *   6. Si `isNew === false` (duplicado):
 *      - Carga el evento existente y compara `payload_hash`.
 *      - Mismo hash -> 200 { ok: true, duplicate: true }
 *      - Hash distinto -> 409 Conflict (suspicious replay/conflict)
 *   7. Parsear payload JSON con Zod.
 *   8. Invocar use case `processPublicationWebhookEvidence` (EVIDENCIA ÚNICAMENTE — NUNCA muta estado del job).
 *   9. Marcar evento de webhook como `processed`.
 *  10. Responder 200 OK.
 */

import type { NextRequest } from 'next/server';
import {
  BOP_TIMESTAMP_HEADER,
  BOP_SIGNATURE_HEADER,
  BOP_EVENT_ID_HEADER,
  verifyIncomingPublicationWebhook,
} from '@/lib/webhooks/publication-hmac';
import { createAdminClient } from '@/lib/supabase/server';
import { parsePublicationWebhookCallbackPayload } from './payload.schema';
import {
  SupabaseCampaignPublicationRepository,
} from '@bop-agency/infrastructure';
import {
  processPublicationWebhookEvidence,
} from '@bop-agency/application';
import type { CampaignPublicationJobId, OrganizationId } from '@bop-agency/domain';
import type { ActivationProvider } from '@bop-agency/shared';

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return Response.json(body, { status });
}

export async function POST(request: NextRequest): Promise<Response> {
  // PASO 1: Leer raw body
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonResponse({ error: 'Bad request', detail: 'Unable to read request body' }, 400);
  }

  // PASO 2: Leer headers
  const timestamp = request.headers.get(BOP_TIMESTAMP_HEADER);
  const signature = request.headers.get(BOP_SIGNATURE_HEADER);
  const eventId   = request.headers.get(BOP_EVENT_ID_HEADER);

  // PASOS 3-5: Verificar HMAC
  // ⛔ service_role NO se crea antes de este punto.
  let verifyResult: ReturnType<typeof verifyIncomingPublicationWebhook>;
  try {
    verifyResult = verifyIncomingPublicationWebhook(
      { timestamp, signature, eventId },
      rawBody,
    );
  } catch (err) {
    console.error('[webhook/publishing] Config error — check PUBLICATION_WEBHOOK_SECRET', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }

  if (!verifyResult.ok) {
    const { code } = verifyResult.error;
    if (code === 'MISSING_EVENT_ID' || code === 'MISSING_SIGNATURE') {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  // PASO 6: Crear cliente admin SOLO después de HMAC verificado
  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch {
    console.error('[webhook/publishing] Failed to create admin client');
    return jsonResponse({ error: 'Internal server error' }, 500);
  }

  const { eventId: verifiedEventId, payloadHash } = verifyResult;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const publicationRepository = new SupabaseCampaignPublicationRepository(adminClient as any);

  // Parse temporal preliminar para extraer el provider para `recordWebhookReceipt`
  let tempParsed: Record<string, unknown> = {};
  try {
    tempParsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    // Si no es JSON válido, provider fallback 'meta'
  }
  const rawProvider = typeof tempParsed['provider'] === 'string' ? tempParsed['provider'] : 'meta';
  const provider = rawProvider as ActivationProvider;

  // PASO 7: Registrar recepción atómica via RPC `record_publication_webhook_receipt`
  const receiptResult = await publicationRepository.recordWebhookReceipt({
    provider,
    externalEventId: verifiedEventId,
    payloadHash,
  });

  if (!receiptResult.success) {
    console.error('[webhook/publishing] Error recording receipt', receiptResult.error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }

  const receipt = receiptResult.value;

  // PASO 7b: Deduplicación y Verificación de Hash Mismatch
  if (!receipt.isNew) {
    // Duplicado detectado. Cargar el evento almacenado para verificar payload_hash
    const existingEventResult = await publicationRepository.findWebhookEventByProviderAndExternalId(
      provider,
      verifiedEventId,
    );

    if (existingEventResult.success && existingEventResult.value) {
      const storedHash = existingEventResult.value.payloadHash;
      if (storedHash !== payloadHash) {
        // Hash distinto -> conflicto/replay sospechoso
        console.warn('[webhook/publishing] Suspicious replay mismatch', {
          provider,
          externalEventId: verifiedEventId,
        });
        return jsonResponse(
          { error: 'Conflict', detail: 'Event ID exists with different payload hash' },
          409,
        );
      }
    }

    // Mismo hash -> duplicado benigno e idempotente
    return jsonResponse({ ok: true, duplicate: true }, 200);
  }

  // PASO 8: Validar payload con Zod
  const payloadResult = parsePublicationWebhookCallbackPayload(tempParsed);
  if (!payloadResult.ok) {
    await publicationRepository.markWebhookEventProcessed(receipt.id, 'failed', {
      errorCode: 'INVALID_PAYLOAD',
    });
    return jsonResponse({ error: 'Bad request', detail: payloadResult.error }, 400);
  }

  const payload = payloadResult.data;

  // PASO 9: Invocar use case processPublicationWebhookEvidence (EVIDENCIA ÚNICAMENTE)
  const evidenceResult = await processPublicationWebhookEvidence(
    {
      jobId: payload.jobId as CampaignPublicationJobId,
      organizationId: payload.organizationId as OrganizationId,
      provider: payload.provider,
      externalEventId: payload.externalEventId,
      outcome: payload.outcome ?? null,
      externalId: payload.externalId ?? null,
      failureCategory: payload.failureCategory ?? null,
      note: payload.note ?? null,
    },
    { publicationRepository },
  );

  if (!evidenceResult.success) {
    await publicationRepository.markWebhookEventProcessed(receipt.id, 'failed', {
      errorCode: 'EVIDENCE_PROCESSING_FAILED',
    });
    return jsonResponse({ error: 'Internal server error' }, 500);
  }

  const evidence = evidenceResult.value;

  // PASO 10: Marcar evento de webhook procesado
  await publicationRepository.markWebhookEventProcessed(receipt.id, 'processed', {
    jobId: payload.jobId as CampaignPublicationJobId,
    organizationId: payload.organizationId as OrganizationId,
  });

  return jsonResponse(
    {
      ok: true,
      status: evidence.status,
      detail: evidence.note,
      currentJobStatus: evidence.currentJobStatus,
    },
    200,
  );
}
