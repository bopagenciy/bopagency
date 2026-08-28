/**
 * POST /api/test/publishing-provider-stub — Phase 8B.3 Test Provider Stub
 *
 * Endpoint de prueba determinístico para E2E/testing local del runtime de publicación.
 *
 * SEGURIDAD:
 *   - Requiere `TEST_PROVIDER_ENABLED=true` en variables de entorno.
 *   - Si no está habilitado (`!== 'true'`), la ruta retorna 404 Not Found inmediatamente.
 *   - Cuando está habilitado, exige firma HMAC válida (`verifyIncomingPublicationWebhook`).
 *   - NUNCA habilitado por defecto en producción.
 */

import type { NextRequest } from 'next/server';
import {
  BOP_TIMESTAMP_HEADER,
  BOP_SIGNATURE_HEADER,
  BOP_EVENT_ID_HEADER,
  verifyIncomingPublicationWebhook,
} from '@/lib/webhooks/publication-hmac';

export async function POST(request: NextRequest): Promise<Response> {
  const isEnabled = process.env['TEST_PROVIDER_ENABLED'] === 'true';
  if (!isEnabled) {
    return Response.json({ error: 'Not Found' }, { status: 404 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: 'Bad Request' }, { status: 400 });
  }

  const timestamp = request.headers.get(BOP_TIMESTAMP_HEADER);
  const signature = request.headers.get(BOP_SIGNATURE_HEADER);
  const eventId   = request.headers.get(BOP_EVENT_ID_HEADER);

  const verifyResult = verifyIncomingPublicationWebhook(
    { timestamp, signature, eventId },
    rawBody,
  );

  if (!verifyResult.ok) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Bad Request' }, { status: 400 });
  }

  const metadataObj = parsed['metadata'] && typeof parsed['metadata'] === 'object' ? (parsed['metadata'] as Record<string, unknown>) : null;
  const testMode = (typeof parsed['testMode'] === 'string' ? parsed['testMode'] : (metadataObj && typeof metadataObj['testMode'] === 'string' ? metadataObj['testMode'] : undefined));

  if (testMode === 'failed') {
    return Response.json(
      {
        outcome: 'failed',
        failureCategory: 'PROVIDER_REJECTED',
        providerErrorCode: 'TEST_REJECTED',
        providerStatus: 'Simulated test failure',
      },
      { status: 200 },
    );
  }

  if (testMode === 'unknown_outcome') {
    return Response.json(
      {
        outcome: 'unknown_outcome',
        providerStatus: 'Simulated test unknown outcome',
      },
      { status: 200 },
    );
  }

  if (testMode === 'timeout') {
    return Response.json(
      { error: 'Gateway Timeout' },
      { status: 504 },
    );
  }

  if (testMode === 'malformed_success') {
    return Response.json(
      {
        outcome: 'succeeded',
        // Missing externalId intentionally
      },
      { status: 200 },
    );
  }

  // Default: succeeded
  return Response.json(
    {
      outcome: 'succeeded',
      externalId: `ext-stub-${Date.now()}`,
      externalUrl: 'https://test-provider.example.com/pub/stub',
      providerStatus: 'Simulated test success',
    },
    { status: 200 },
  );
}
