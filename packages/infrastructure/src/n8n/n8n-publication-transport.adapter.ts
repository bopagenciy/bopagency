/**
 * N8nPublicationTransportAdapter — Phase 8B.3.
 *
 * Adapter de infraestructura de `ChannelPublisherPort` (definido en Phase 8B.2)
 * para orquestar la publicación vía HTTP hacia n8n en MODELO A (sincrónico).
 *
 * COMPORTAMIENTO SINCRÓNICO (MODELO A):
 *   1. Recibe `PublishInput` desde `dispatchPublicationJob`.
 *   2. Serializa payload provider-neutral y genera headers de firma HMAC SHA-256
 *      usando `PUBLICATION_WEBHOOK_SECRET`.
 *   3. Envía request HTTP POST a n8n y aguarda la respuesta con timeout acotado.
 *   4. Mapea la respuesta a `Result<PublishReceipt>`:
 *      - 2xx con `outcome === 'succeeded'` y `externalId` -> `succeeded` receipt.
 *      - 2xx con `outcome === 'failed'` -> `failed` receipt.
 *      - 202 (Accepted) -> `unknown_outcome` (aceptación por transporte NO es éxito).
 *      - Timeout, 5xx, error de red, respuesta malformada -> `unknown_outcome`.
 *
 * SEGURIDAD:
 * - Requiere `PUBLICATION_WEBHOOK_SECRET` (≥32 caracteres). NO usa `AUTOMATION_WEBHOOK_SECRET`.
 * - NUNCA loguea datos de credenciales ni secrets.
 * - En `application`/`domain` nunca se importan SDKs ni `fetch` directo.
 */

import { createHmac } from 'node:crypto';
import { ok } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { ActivationChannel, ActivationProvider, PublicationFailureCategory } from '@bop-agency/shared';
import type { ChannelPublisherPort, PublishInput, PublishReceipt } from '@bop-agency/application';

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 60_000;

function getTimeoutMs(): number {
  const raw = process.env['N8N_DISPATCH_TIMEOUT_MS'];
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < MIN_TIMEOUT_MS || parsed > MAX_TIMEOUT_MS) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

function requireN8nBaseUrl(): string {
  const url = process.env['N8N_BASE_URL'];
  if (!url || url.trim().length === 0) {
    throw new Error('[n8n-publication] N8N_BASE_URL no está configurado');
  }
  return url.trim().replace(/\/$/, '');
}

function requirePublicationSecret(): Buffer {
  const secret = process.env['PUBLICATION_WEBHOOK_SECRET'];
  if (!secret || secret.trim().length < 32) {
    throw new Error('[n8n-publication] PUBLICATION_WEBHOOK_SECRET no está configurado correctamente');
  }
  return Buffer.from(secret.trim(), 'utf-8');
}

function computeHmac(secretBuf: Buffer, timestamp: string, rawBody: string): string {
  const canonical = `${timestamp}.${rawBody}`;
  return createHmac('sha256', secretBuf).update(canonical, 'utf-8').digest('hex');
}

export class N8nPublicationTransportAdapter implements ChannelPublisherPort {
  private readonly supportedChannels: readonly ActivationChannel[];
  private readonly supportedProviders: readonly ActivationProvider[];

  constructor(options?: {
    readonly channels?: readonly ActivationChannel[];
    readonly providers?: readonly ActivationProvider[];
  }) {
    this.supportedChannels = options?.channels ?? ['meta_ads', 'google_ads', 'linkedin_ads', 'email', 'manual'];
    this.supportedProviders = options?.providers ?? ['meta', 'google', 'linkedin', 'email', 'manual'];
  }

  supports(channel: ActivationChannel, provider: ActivationProvider): boolean {
    return this.supportedChannels.includes(channel) && this.supportedProviders.includes(provider);
  }

  async publish(input: PublishInput): Promise<Result<PublishReceipt>> {
    let baseUrl: string;
    let secretBuf: Buffer;
    try {
      baseUrl = requireN8nBaseUrl();
      secretBuf = requirePublicationSecret();
    } catch (e) {
      return ok({
        outcome: 'unknown_outcome',
        providerStatus: `Configuration error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const payload = {
      jobId: String(input.jobId),
      organizationId: String(input.organizationId),
      clientId: String(input.clientId),
      targetId: String(input.targetId),
      channel: input.channel,
      provider: input.provider,
      clientIntegrationId: input.clientIntegrationId ?? null,
      attemptNumber: input.attemptNumber,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
    };

    const rawBody = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = computeHmac(secretBuf, timestamp, rawBody);
    const eventId = input.idempotencyKey;

    const webhookUrl = `${baseUrl}/webhook/publishing/${input.channel}/${input.provider}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bop-timestamp': timestamp,
          'x-bop-signature': signature,
          'x-bop-event-id': eventId,
        },
        body: rawBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // HTTP 202 (Accepted) -> NO es éxito de publicación. Tratar como unknown_outcome.
      if (response.status === 202) {
        return ok({
          outcome: 'unknown_outcome',
          httpStatus: 202,
          providerStatus: 'Transport accepted (202), async resolution required',
        });
      }

      if (!response.ok) {
        return ok({
          outcome: 'unknown_outcome',
          httpStatus: response.status,
          providerStatus: `n8n responded with HTTP ${response.status}`,
        });
      }

      const bodyText = await response.text();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(bodyText) as Record<string, unknown>;
      } catch {
        return ok({
          outcome: 'unknown_outcome',
          httpStatus: response.status,
          providerStatus: 'n8n returned non-JSON response body',
        });
      }

      const outcome = parsed['outcome'] as string | undefined;
      const externalId = typeof parsed['externalId'] === 'string' ? parsed['externalId'] : null;
      const externalUrl = typeof parsed['externalUrl'] === 'string' ? parsed['externalUrl'] : null;
      const providerStatus = typeof parsed['providerStatus'] === 'string' ? parsed['providerStatus'] : null;
      const providerErrorCode = typeof parsed['providerErrorCode'] === 'string' ? parsed['providerErrorCode'] : null;
      const failureCategory = typeof parsed['failureCategory'] === 'string' ? (parsed['failureCategory'] as PublicationFailureCategory) : null;

      if (outcome === 'succeeded') {
        if (!externalId) {
          return ok({
            outcome: 'unknown_outcome',
            httpStatus: response.status,
            providerStatus: 'Publisher reported succeeded without externalId',
          });
        }
        return ok({
          outcome: 'succeeded',
          externalId,
          externalUrl,
          providerStatus,
          httpStatus: response.status,
        });
      }

      if (outcome === 'failed') {
        return ok({
          outcome: 'failed',
          failureCategory: failureCategory ?? 'PROVIDER_REJECTED',
          providerErrorCode,
          providerStatus,
          httpStatus: response.status,
        });
      }

      return ok({
        outcome: 'unknown_outcome',
        providerStatus: providerStatus ?? `Unknown outcome payload from n8n: ${String(outcome)}`,
        httpStatus: response.status,
      });
    } catch (thrown) {
      clearTimeout(timeoutId);

      if (thrown instanceof Error && thrown.name === 'AbortError') {
        return ok({
          outcome: 'unknown_outcome',
          providerStatus: `n8n publication dispatch timed out after ${getTimeoutMs()}ms`,
        });
      }

      return ok({
        outcome: 'unknown_outcome',
        providerStatus: `Network error during publication dispatch: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
      });
    }
  }
}
