/**
 * N8nWebhookDispatcher — Adapter de WorkflowDispatcher hacia n8n
 *
 * Implementa el contrato WorkflowDispatcher enviando requests HTTP
 * firmados con HMAC SHA-256 al endpoint de webhook de n8n.
 *
 * SEGURIDAD:
 * - NUNCA loguear el body completo (puede contener metadata de clientes).
 * - NUNCA reenviar secretos del sistema (tokens, keys).
 * - NUNCA hardcodear URL, secreto ni API key.
 * - AUTOMATION_WEBHOOK_SECRET nunca se expone en logs ni respuestas.
 * - Timeout configurable via N8N_DISPATCH_TIMEOUT_MS (default: 10000ms).
 * - Solo usable desde contextos server-side (env vars solo disponibles en server).
 *
 * VARIABLES DE ENTORNO REQUERIDAS (server-only):
 *   N8N_BASE_URL                  - URL base de n8n (ej: http://localhost:5678)
 *   AUTOMATION_WEBHOOK_SECRET     - Secreto HMAC compartido (≥32 chars)
 *
 * VARIABLES OPCIONALES:
 *   N8N_DISPATCH_TIMEOUT_MS       - Timeout en ms (default: 10000)
 *   N8N_API_KEY                   - API key para operaciones REST (cancel)
 *
 * NO instalar axios — se usa fetch nativo con AbortController.
 */
import { createHmac } from 'node:crypto';
import { ok, err, createError } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AutomationId } from '@bop-agency/domain';
import type { WorkflowDispatcher, DispatchOptions, AutomationRun } from '@bop-agency/automation-engine';

// ─── Internal types ───────────────────────────────────────────────────────────

/**
 * Campos esperados en options.payload por el dispatcher.
 * El use case (Phase 6D) poblará estos campos antes de llamar dispatch().
 */
type N8nDispatchPayloadFields = {
  executionId: string;
  organizationId: string;
  clientId?: string | null;
  triggerType: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
};

// ─── Configuration ─────────────────────────────────────────────────────────────

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
    throw new Error('[n8n] N8N_BASE_URL no está configurado');
  }
  return url.trim().replace(/\/$/, '');
}

/**
 * Obtiene el secreto HMAC para firmar requests salientes.
 * NUNCA loguear el valor retornado.
 */
function requireHmacSecret(): Buffer {
  const secret = process.env['AUTOMATION_WEBHOOK_SECRET'];
  if (!secret || secret.trim().length < 32) {
    throw new Error('[n8n] AUTOMATION_WEBHOOK_SECRET no está configurado correctamente');
  }
  return Buffer.from(secret, 'utf-8');
}

// ─── HMAC signing (standalone — no depende de apps/web) ──────────────────────

/**
 * Computa HMAC SHA-256 sobre canonical string `timestamp.rawBody`.
 * Duplicado intencional del helper en apps/web para mantener boundary limpio.
 */
function computeHmac(secretBuf: Buffer, timestamp: string, rawBody: string): string {
  const canonical = `${timestamp}.${rawBody}`;
  return createHmac('sha256', secretBuf).update(canonical, 'utf-8').digest('hex');
}

/**
 * Construye headers de firma para el request saliente.
 * Solo llamar desde server-side.
 */
function buildSignatureHeaders(
  rawBody: string,
  eventId: string,
  secretBuf: Buffer,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = computeHmac(secretBuf, timestamp, rawBody);
  return {
    'x-bop-timestamp': timestamp,
    'x-bop-signature': signature,
    'x-bop-event-id':  eventId,
  };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export class N8nWebhookDispatcher implements WorkflowDispatcher {

  /**
   * Envía un request HTTP firmado a n8n para ejecutar un workflow.
   *
   * El payload mínimo enviado a n8n incluye:
   * - executionId, organizationId, automationId, clientId
   * - idempotencyKey, triggerType, callbackUrl, metadata segura
   *
   * NO se reenvían secretos del sistema ni datos PII de clientes.
   * NO se loguea el body completo.
   */
  async dispatch(
    automationId: AutomationId,
    options: DispatchOptions,
  ): Promise<Result<AutomationRun>> {
    // Validar y extraer campos del payload
    const payloadFields = options.payload as Partial<N8nDispatchPayloadFields>;

    if (!payloadFields.executionId || !payloadFields.organizationId) {
      return err(createError(
        'VALIDATION_ERROR',
        'options.payload debe incluir executionId y organizationId',
      ));
    }

    // Construir payload mínimo y seguro para n8n
    const n8nPayload = {
      executionId:    payloadFields.executionId,
      organizationId: payloadFields.organizationId,
      automationId:   String(automationId),
      clientId:       payloadFields.clientId ?? null,
      idempotencyKey: options.idempotencyKey,
      triggerType:    payloadFields.triggerType ?? 'manual',
      callbackUrl:    payloadFields.callbackUrl ?? '',
      metadata:       sanitizeMetadata(payloadFields.metadata ?? {}),
    };

    // Serializar — este es el body exacto que se transmite y firma
    const rawBody = JSON.stringify(n8nPayload);

    // Obtener configuración server-side
    let baseUrl: string;
    let secretBuf: Buffer;
    try {
      baseUrl   = requireN8nBaseUrl();
      secretBuf = requireHmacSecret();
    } catch {
      return err(createError(
        'INTERNAL_ERROR',
        'Error de configuración del dispatcher n8n',
      ));
    }

    const webhookUrl = `${baseUrl}/webhook/${String(automationId)}`;
    const sigHeaders = buildSignatureHeaders(rawBody, options.idempotencyKey, secretBuf);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const response = await fetch(webhookUrl, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'X-Request-Id':  options.idempotencyKey,
          ...sigHeaders,
        },
        body:   rawBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Loguear solo el status code, no el body
        console.error('[n8n/dispatch] n8n respondió con error', {
          automationId: String(automationId),
          executionId:  payloadFields.executionId,
          statusCode:   response.status,
        });
        return err(createError(
          'EXTERNAL_SERVICE_ERROR',
          'n8n retornó un error al recibir el dispatch',
          { statusCode: response.status },
        ));
      }

      // n8n respondió 2xx — la ejecución fue aceptada
      const run: AutomationRun = {
        id:            payloadFields.executionId,
        automationId,
        status:        'pending',
        startedAt:     new Date(),
        inputPayload:  { idempotencyKey: options.idempotencyKey },
      };

      return ok(run);

    } catch (fetchErr) {
      clearTimeout(timeoutId);

      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        console.error('[n8n/dispatch] Timeout al contactar n8n', {
          automationId: String(automationId),
          executionId:  payloadFields.executionId,
          timeoutMs:    getTimeoutMs(),
        });
        return err(createError(
          'EXTERNAL_SERVICE_ERROR',
          'El dispatch a n8n excedió el timeout configurado',
          { reason: 'timeout' },
        ));
      }

      console.error('[n8n/dispatch] Error inesperado al contactar n8n', {
        automationId: String(automationId),
        executionId:  payloadFields.executionId,
        errorName: fetchErr instanceof Error ? fetchErr.name : 'unknown',
      });

      return err(createError(
        'EXTERNAL_SERVICE_ERROR',
        'Error al contactar n8n',
      ));
    }
  }

  /**
   * Cancela una ejecución en curso en n8n via REST API.
   * Requiere N8N_API_KEY configurado.
   *
   * DELETE /api/v1/executions/{runId}
   */
  async cancel(runId: string): Promise<Result<void>> {
    const apiKey = process.env['N8N_API_KEY'];
    if (!apiKey) {
      return err(createError(
        'INTERNAL_ERROR',
        'N8N_API_KEY no está configurado — cancel no disponible',
      ));
    }

    let baseUrl: string;
    try {
      baseUrl = requireN8nBaseUrl();
    } catch {
      return err(createError(
        'INTERNAL_ERROR',
        'Error de configuración al intentar cancelar',
      ));
    }

    const cancelUrl = `${baseUrl}/api/v1/executions/${encodeURIComponent(runId)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const response = await fetch(cancelUrl, {
        method:  'DELETE',
        headers: {
          // N8N_API_KEY NUNCA se loguea
          'X-N8N-API-KEY': apiKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok && response.status !== 404) {
        return err(createError(
          'EXTERNAL_SERVICE_ERROR',
          'n8n retornó un error al cancelar la ejecución',
          { statusCode: response.status },
        ));
      }

      return ok(undefined);

    } catch (fetchErr) {
      clearTimeout(timeoutId);

      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        return err(createError(
          'EXTERNAL_SERVICE_ERROR',
          'El cancel a n8n excedió el timeout configurado',
          { reason: 'timeout' },
        ));
      }

      return err(createError(
        'EXTERNAL_SERVICE_ERROR',
        'Error al contactar n8n para cancelar',
      ));
    }
  }
}

// ─── Sanitization ─────────────────────────────────────────────────────────────

/**
 * Elimina del metadata campos que podrían contener secretos o PII.
 * Solo se envía a n8n metadata operacional segura.
 */
const FORBIDDEN_METADATA_PATTERNS = [
  'secret', 'token', 'key', 'password', 'auth',
  'credential', 'cred', 'private', 'bearer', 'oauth',
  'email', 'phone', 'name', 'address',
] as const;

function sanitizeMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([k]) =>
      !FORBIDDEN_METADATA_PATTERNS.some((pattern) =>
        k.toLowerCase().includes(pattern),
      ),
    ),
  );
}
