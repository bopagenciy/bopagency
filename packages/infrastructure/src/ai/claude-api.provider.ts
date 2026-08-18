/**
 * ClaudeAPIProvider — Phase 7D, refactorizado en Phase 7D.1.
 *
 * Implementación de `AIProvider` (@bop-agency/ai-engine) contra la Messages
 * API de Anthropic, vía `fetch` nativo + `AbortController` — sin SDK, mismo
 * criterio ya establecido en `N8nWebhookDispatcher`.
 *
 * NOMBRE: se CONSERVA `ClaudeAPIProvider` (§6 de 7D.1 — "puede renombrarse a
 * AnthropicAPIProvider solo si aporta claridad y no genera churn innecesario").
 * Renombrarlo tocaría el composition root, el barrel de infraestructura, su
 * suite de tests y el reporte de 7D sin cambiar una sola línea de
 * comportamiento; el `AIProviderId` del proyecto ya es `'anthropic'` (fuente
 * única en @bop-agency/shared), que es donde realmente importa la
 * desambiguación. Se exporta además el alias `AnthropicAPIProvider` para quien
 * prefiera el nombre alineado al provider id.
 *
 * IMPORTANTE: el proveedor de runtime es la API de Anthropic, NO "Claude Code"
 * (tooling de desarrollo, sin ningún rol en runtime).
 *
 * GENÉRICO A PROPÓSITO: implementa el contrato `AIProvider` sin conocer nada
 * del dominio de BopIAgency. Los errores que retorna son los genéricos
 * compartidos de `provider-http.ts` (idénticos en forma a los de OpenAI y
 * Gemini, para que el adapter los mapee con la misma lógica).
 *
 * CAMBIOS EN 7D.1 (sin cambio de comportamiento observable):
 * - La lectura de env se centralizó en `ai-provider-config.ts` (mismas
 *   variables, mismos defaults, mismo rango de timeout).
 * - Las factorías de error se centralizaron en `provider-http.ts` (mismos
 *   `code` y `details.reason` que en 7D).
 *
 * SEGURIDAD:
 * - NUNCA loguear el body de request/response (contiene el brief del cliente).
 * - NUNCA loguear ni reenviar ANTHROPIC_API_KEY.
 * - NUNCA exponer el mensaje crudo del proveedor al caller.
 *
 * VARIABLES DE ENTORNO:
 *   ANTHROPIC_API_KEY       (requerida) — si falta, `complete()` retorna
 *                            EXTERNAL_SERVICE_ERROR con reason='not_configured'
 *                            SIN llamar a `fetch`. Nunca lanza.
 *   ANTHROPIC_MODEL         (opcional)  — default DEFAULT_MODELS.anthropic.
 *   ANTHROPIC_API_VERSION   (opcional)  — default '2023-06-01'.
 *   CAMPAIGN_AI_TIMEOUT_MS / CAMPAIGN_AI_MAX_ATTEMPTS /
 *   CAMPAIGN_AI_RETRY_BASE_DELAY_MS / CAMPAIGN_AI_TOTAL_BUDGET_MS
 *                           (opcionales) — compartidas por los tres proveedores.
 *
 * REINTENTOS (7D.1.1): los gestiona `fetchProviderJson` (provider-http.ts) —
 * idéntica política para los tres proveedores.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AIProvider, AIRequest, AIResponse } from '@bop-agency/ai-engine';
import {
  getAnthropicApiVersion,
  getProviderApiKey,
  getProviderModel,
} from './ai-provider-config';
import { fetchProviderJson, providerNotConfiguredError } from './provider-http';

const PROVIDER_ID = 'anthropic' as const;
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MAX_TOKENS = 4096;

// ─── Wire types (mínimo necesario) ────────────────────────────────────────────

type AnthropicContentBlock = { type: string; text?: string };

type AnthropicMessagesResponse = {
  content?: AnthropicContentBlock[];
  model?: string;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export class ClaudeAPIProvider implements AIProvider {
  async complete(request: AIRequest): Promise<Result<AIResponse>> {
    const apiKey = getProviderApiKey(PROVIDER_ID);
    if (!apiKey) {
      return err(providerNotConfiguredError(PROVIDER_ID, 'ANTHROPIC_API_KEY'));
    }

    const model =
      request.model && request.model.trim().length > 0
        ? request.model.trim()
        : getProviderModel(PROVIDER_ID);

    // La Messages API espera `system` como campo separado (string), no como un
    // mensaje con role 'system' dentro de `messages`.
    const systemPrompt = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const conversationMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: conversationMessages,
      ...(systemPrompt.length > 0 && { system: systemPrompt }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.stopSequences !== undefined && { stop_sequences: [...request.stopSequences] }),
    };

    const result = await fetchProviderJson<AnthropicMessagesResponse>({
      providerId: PROVIDER_ID,
      url: ANTHROPIC_MESSAGES_URL,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': getAnthropicApiVersion(),
      },
      body,
    });

    if (!isOk(result)) return result;

    const payload = result.value;
    const text = (payload.content ?? [])
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');

    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;

    return ok({
      content: text,
      model: payload.model ?? model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      finishReason: mapFinishReason(payload.stop_reason),
    });
  }
}

/**
 * Alias explícito alineado con `AIProviderId = 'anthropic'`. No reemplaza a
 * `ClaudeAPIProvider` (ver nota de nombre en el encabezado) — ambos apuntan a
 * la misma clase, así que no hay dos implementaciones que mantener.
 */
export const AnthropicAPIProvider = ClaudeAPIProvider;

function mapFinishReason(stopReason: string | undefined): AIResponse['finishReason'] {
  if (stopReason === 'end_turn' || stopReason === 'stop_sequence') return 'stop';
  if (stopReason === 'max_tokens') return 'max_tokens';
  return 'error';
}
