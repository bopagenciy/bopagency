/**
 * OpenAIAPIProvider — Phase 7D.1.
 *
 * Implementación de `AIProvider` (@bop-agency/ai-engine) contra la Chat
 * Completions API de OpenAI, vía `fetch` nativo + `AbortController` — misma
 * decisión que `ClaudeAPIProvider` y `N8nWebhookDispatcher`: NO se agrega el
 * SDK `openai` ni ninguna otra dependencia (§22 de la especificación de 7D.1).
 *
 * NO es ChatGPT web: se usa exclusivamente la API pública de OpenAI con
 * `OPENAI_API_KEY` (§8).
 *
 * GENÉRICO A PROPÓSITO (mismo criterio que ClaudeAPIProvider): no conoce
 * campañas, compliance ni el dominio de BopIAgency. Retorna errores genéricos
 * de `provider-http.ts`; la traducción a errores de dominio la hace
 * `CampaignGeneratorAdapter`.
 *
 * SALIDA ESTRUCTURADA: se envía `response_format: { type: 'json_object' }`,
 * que obliga al modelo a devolver un único objeto JSON válido. Aun así, el
 * output SIEMPRE pasa por `campaignGeneratedContentSchema.safeParse` en el
 * adapter antes de persistir (§10) — el modo JSON del proveedor garantiza
 * sintaxis, no el schema de negocio.
 *
 * VARIABLES DE ENTORNO:
 *   OPENAI_API_KEY          (requerida) — si falta, `complete()` retorna
 *                            EXTERNAL_SERVICE_ERROR con reason='not_configured'
 *                            SIN llamar a `fetch`. Nunca lanza.
 *   OPENAI_MODEL            (opcional)  — default DEFAULT_MODELS.openai.
 *   CAMPAIGN_AI_TIMEOUT_MS / CAMPAIGN_AI_MAX_ATTEMPTS /
 *   CAMPAIGN_AI_RETRY_BASE_DELAY_MS / CAMPAIGN_AI_TOTAL_BUDGET_MS
 *                           (opcionales) — compartidas por los tres proveedores.
 *
 * REINTENTOS (7D.1.1): los gestiona `fetchProviderJson` (provider-http.ts) —
 * 429/5xx/red/timeout se reintentan con backoff; 400/401/403 no. Este archivo
 * no implementa política de red propia.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AIProvider, AIRequest, AIResponse } from '@bop-agency/ai-engine';
import { getProviderApiKey, getProviderModel } from './ai-provider-config';
import { fetchProviderJson, providerNotConfiguredError } from './provider-http';

const PROVIDER_ID = 'openai' as const;
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MAX_TOKENS = 4096;

// ─── Wire types (mínimo necesario) ────────────────────────────────────────────

type OpenAIChatResponse = {
  model?: string;
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export class OpenAIAPIProvider implements AIProvider {
  async complete(request: AIRequest): Promise<Result<AIResponse>> {
    const apiKey = getProviderApiKey(PROVIDER_ID);
    if (!apiKey) {
      return err(providerNotConfiguredError(PROVIDER_ID, 'OPENAI_API_KEY'));
    }

    const model =
      request.model && request.model.trim().length > 0
        ? request.model.trim()
        : getProviderModel(PROVIDER_ID);

    // OpenAI acepta el rol 'system' dentro de `messages` (a diferencia de
    // Anthropic), así que el mapeo es 1:1 y el prompt builder sigue siendo
    // único (§11).
    const messages = request.messages.map((m) => ({ role: m.role, content: m.content }));

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      // Salida estructurada — el prompt ya exige explícitamente "un único
      // objeto JSON válido", requisito de este modo en la API de OpenAI.
      response_format: { type: 'json_object' },
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.stopSequences !== undefined && { stop: [...request.stopSequences] }),
    };

    const result = await fetchProviderJson<OpenAIChatResponse>({
      providerId: PROVIDER_ID,
      url: OPENAI_CHAT_COMPLETIONS_URL,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body,
    });

    if (!isOk(result)) return result;

    const payload = result.value;
    const choice = payload.choices?.[0];
    const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';

    const inputTokens = payload.usage?.prompt_tokens ?? 0;
    const outputTokens = payload.usage?.completion_tokens ?? 0;

    return ok({
      content: text,
      model: payload.model ?? model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: payload.usage?.total_tokens ?? inputTokens + outputTokens,
      },
      finishReason: mapFinishReason(choice?.finish_reason),
    });
  }
}

function mapFinishReason(finishReason: string | undefined): AIResponse['finishReason'] {
  if (finishReason === 'stop') return 'stop';
  if (finishReason === 'length') return 'max_tokens';
  return 'error';
}
