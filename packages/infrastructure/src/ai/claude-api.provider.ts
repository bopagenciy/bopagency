/**
 * ClaudeAPIProvider — Phase 7D.
 *
 * Implementación de `AIProvider` (@bop-agency/ai-engine, contrato — ver
 * PHASE_7_AUDIT.md §6: ai-engine es 100% contratos, sin implementaciones
 * hasta esta tarea) contra la API de Anthropic (Messages API), vía `fetch`
 * nativo + `AbortController` — mismo criterio ya establecido en
 * `N8nWebhookDispatcher` ("NO instalar axios — se usa fetch nativo con
 * AbortController"). NO se agrega `@anthropic-ai/sdk` ni ningún otro SDK de
 * IA — instrucción explícita de la tarea (§9: "NO invente múltiples
 * providers. NO implemente una abstracción multi-provider sobredimensionada
 * si no hay necesidad actual").
 *
 * GENÉRICO A PROPÓSITO: esta clase implementa el contrato `AIProvider`
 * genérico de ai-engine — no conoce nada sobre campañas, compliance, ni el
 * dominio de BopIAgency. Los errores que retorna son genéricos
 * (EXTERNAL_SERVICE_ERROR / RATE_LIMITED de @bop-agency/shared), NUNCA los
 * errores de dominio específicos de Phase 7D (aiProviderFailure,
 * aiRateLimited, etc. — esos viven en `campaign-generator.adapter.ts`, que
 * es quien SÍ conoce el dominio y traduce estos errores genéricos a los
 * tipados). Esto mantiene a ClaudeAPIProvider reutilizable para cualquier
 * futura feature de IA, no solo el AI Campaign Builder.
 *
 * SEGURIDAD:
 * - NUNCA loguear el body completo de la request/response (puede contener
 *   brief/contexto de cliente).
 * - NUNCA loguear ni reenviar ANTHROPIC_API_KEY.
 * - NUNCA exponer el mensaje de error crudo del proveedor al caller — solo
 *   un `AppError` con código y mensaje genérico/seguro.
 *
 * VARIABLES DE ENTORNO:
 *   ANTHROPIC_API_KEY        (requerida) - API key de Anthropic. Si falta,
 *                             `complete()` retorna un error EXTERNAL_SERVICE_ERROR
 *                             con `details.reason === 'not_configured'` — NO
 *                             lanza excepción, NO bloquea la carga del
 *                             adapter (§9: "si no hay credenciales
 *                             configuradas: implemente el adapter de todas
 *                             formas; tests con mock/fake; documente las
 *                             variables necesarias; NO bloquee la
 *                             implementación por falta de una API key").
 *   ANTHROPIC_MODEL           (opcional) - default: 'claude-3-5-sonnet-20241022'.
 *   ANTHROPIC_API_VERSION     (opcional) - default: '2023-06-01' (header
 *                             `anthropic-version` requerido por la Messages API).
 *   CAMPAIGN_AI_TIMEOUT_MS    (opcional) - default: 30000ms (min 5000, max 120000).
 */

import { ok, err, createError } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AIProvider, AIRequest, AIResponse } from '@bop-agency/ai-engine';

// ─── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const DEFAULT_API_VERSION = '2023-06-01';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 120_000;

function getTimeoutMs(): number {
  const raw = process.env['CAMPAIGN_AI_TIMEOUT_MS'];
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed < MIN_TIMEOUT_MS || parsed > MAX_TIMEOUT_MS) {
    return DEFAULT_TIMEOUT_MS;
  }
  return parsed;
}

function getModel(): string {
  const raw = process.env['ANTHROPIC_MODEL'];
  return raw && raw.trim().length > 0 ? raw.trim() : DEFAULT_MODEL;
}

function getApiVersion(): string {
  const raw = process.env['ANTHROPIC_API_VERSION'];
  return raw && raw.trim().length > 0 ? raw.trim() : DEFAULT_API_VERSION;
}

/** NUNCA loguear el valor retornado. */
function getApiKey(): string | null {
  const raw = process.env['ANTHROPIC_API_KEY'];
  if (!raw || raw.trim().length === 0) return null;
  return raw.trim();
}

// ─── Anthropic Messages API wire types (mínimo necesario) ─────────────────────

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicMessagesResponse = {
  content?: AnthropicContentBlock[];
  model?: string;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type AnthropicErrorResponse = {
  error?: { type?: string; message?: string };
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export class ClaudeAPIProvider implements AIProvider {
  async complete(request: AIRequest): Promise<Result<AIResponse>> {
    const apiKey = getApiKey();
    if (!apiKey) {
      return err(
        createError('EXTERNAL_SERVICE_ERROR', 'AI provider is not configured (missing ANTHROPIC_API_KEY).', {
          reason: 'not_configured',
        }),
      );
    }

    // La Messages API de Anthropic espera `system` como campo separado (string),
    // no como un mensaje con role 'system' dentro de `messages`.
    const systemPrompt = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const conversationMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model: request.model && request.model.trim().length > 0 ? request.model : getModel(),
      max_tokens: request.maxTokens ?? 4096,
      messages: conversationMessages,
      ...(systemPrompt.length > 0 && { system: systemPrompt }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.stopSequences !== undefined && { stop_sequences: [...request.stopSequences] }),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), getTimeoutMs());

    try {
      const response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': getApiVersion(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        console.error('[claude-api] Rate limited by Anthropic', { status: response.status });
        return err(
          createError('RATE_LIMITED', 'AI provider rate limit exceeded.', { statusCode: response.status }),
        );
      }

      if (!response.ok) {
        let safeDetail = `status ${response.status}`;
        try {
          const errBody = (await response.json()) as AnthropicErrorResponse;
          if (errBody.error?.type) safeDetail = `${safeDetail} (${errBody.error.type})`;
        } catch {
          // Body no es JSON parseable — se ignora, no se expone texto crudo.
        }
        console.error('[claude-api] Anthropic API returned an error', { statusCode: response.status });
        return err(
          createError('EXTERNAL_SERVICE_ERROR', `AI provider request failed: ${safeDetail}`, {
            statusCode: response.status,
          }),
        );
      }

      const payload = (await response.json()) as AnthropicMessagesResponse;

      const text = (payload.content ?? [])
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text as string)
        .join('');

      const inputTokens = payload.usage?.input_tokens ?? 0;
      const outputTokens = payload.usage?.output_tokens ?? 0;

      const aiResponse: AIResponse = {
        content: text,
        model: payload.model ?? getModel(),
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        finishReason: mapFinishReason(payload.stop_reason),
      };

      return ok(aiResponse);
    } catch (fetchErr) {
      clearTimeout(timeoutId);

      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        console.error('[claude-api] Timeout contacting Anthropic', { timeoutMs: getTimeoutMs() });
        return err(
          createError('EXTERNAL_SERVICE_ERROR', 'AI provider request timed out.', { reason: 'timeout' }),
        );
      }

      console.error('[claude-api] Unexpected error contacting Anthropic', {
        errorName: fetchErr instanceof Error ? fetchErr.name : 'unknown',
      });
      return err(createError('EXTERNAL_SERVICE_ERROR', 'Unexpected error contacting AI provider.'));
    }
  }
}

function mapFinishReason(stopReason: string | undefined): AIResponse['finishReason'] {
  if (stopReason === 'end_turn' || stopReason === 'stop_sequence') return 'stop';
  if (stopReason === 'max_tokens') return 'max_tokens';
  return 'error';
}
