/**
 * GeminiAPIProvider — Phase 7D.1.
 *
 * Implementación de `AIProvider` (@bop-agency/ai-engine) contra la API
 * `generateContent` de Google Gemini (Generative Language API), vía `fetch`
 * nativo + `AbortController` — misma decisión que `ClaudeAPIProvider` /
 * `OpenAIAPIProvider`: NO se agrega `@google/generative-ai` ni ningún otro SDK
 * (§22 de la especificación de 7D.1).
 *
 * GENÉRICO A PROPÓSITO: no conoce campañas ni compliance. Retorna errores
 * genéricos de `provider-http.ts`; `CampaignGeneratorAdapter` los traduce a
 * errores de dominio.
 *
 * DIFERENCIAS DE FORMA respecto a OpenAI/Anthropic (traducidas aquí, NO en el
 * prompt builder — §11: un solo prompt lógico, los providers solo traducen):
 * - El prompt de sistema va en `systemInstruction`, no dentro de `contents`.
 * - Los roles son 'user' | 'model' (no 'assistant').
 * - El modelo va en la URL, no en el body.
 * - La salida estructurada se pide con `generationConfig.responseMimeType:
 *   'application/json'`.
 *
 * SEGURIDAD: la API key viaja en el header `x-goog-api-key`, NUNCA como query
 * param `?key=` — un query param termina en logs de proxy/servidor. El modelo
 * se interpola en la URL con `encodeURIComponent` (viene de env server-side,
 * nunca del browser, pero se sanea igualmente).
 *
 * VARIABLES DE ENTORNO:
 *   GEMINI_API_KEY          (requerida) — si falta, `complete()` retorna
 *                            EXTERNAL_SERVICE_ERROR con reason='not_configured'
 *                            SIN llamar a `fetch`. Nunca lanza.
 *   GEMINI_MODEL            (opcional)  — default DEFAULT_MODELS.gemini
 *                            (`gemini-3.6-flash` desde 7D.1.1).
 *   CAMPAIGN_AI_TIMEOUT_MS / CAMPAIGN_AI_MAX_ATTEMPTS /
 *   CAMPAIGN_AI_RETRY_BASE_DELAY_MS / CAMPAIGN_AI_TOTAL_BUDGET_MS
 *                           (opcionales) — compartidas por los tres proveedores.
 *
 * REINTENTOS (7D.1.1): los gestiona `fetchProviderJson` (provider-http.ts).
 * Es el proveedor donde se observó el timeout de regeneración del smoke real.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AIProvider, AIRequest, AIResponse } from '@bop-agency/ai-engine';
import { getProviderApiKey, getProviderModel } from './ai-provider-config';
import { fetchProviderJson, providerNotConfiguredError } from './provider-http';

const PROVIDER_ID = 'gemini' as const;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

// ─── Wire types (mínimo necesario) ────────────────────────────────────────────

type GeminiGenerateContentResponse = {
  modelVersion?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export class GeminiAPIProvider implements AIProvider {
  async complete(request: AIRequest): Promise<Result<AIResponse>> {
    const apiKey = getProviderApiKey(PROVIDER_ID);
    if (!apiKey) {
      return err(providerNotConfiguredError(PROVIDER_ID, 'GEMINI_API_KEY'));
    }

    const model =
      request.model && request.model.trim().length > 0
        ? request.model.trim()
        : getProviderModel(PROVIDER_ID);

    const systemPrompt = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: Record<string, unknown> = {
      contents,
      ...(systemPrompt.length > 0 && {
        systemInstruction: { parts: [{ text: systemPrompt }] },
      }),
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        // Salida estructurada — equivalente al json_object de OpenAI.
        responseMimeType: 'application/json',
        ...(request.temperature !== undefined && { temperature: request.temperature }),
        ...(request.stopSequences !== undefined && { stopSequences: [...request.stopSequences] }),
      },
    };

    const url = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`;

    const result = await fetchProviderJson<GeminiGenerateContentResponse>({
      providerId: PROVIDER_ID,
      url,
      headers: {
        'content-type': 'application/json',
        // NUNCA como ?key= en la URL — ver nota de seguridad del encabezado.
        'x-goog-api-key': apiKey,
      },
      body,
    });

    if (!isOk(result)) return result;

    const payload = result.value;
    const candidate = payload.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('');

    const inputTokens = payload.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = payload.usageMetadata?.candidatesTokenCount ?? 0;

    return ok({
      content: text,
      model: payload.modelVersion ?? model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: payload.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens,
      },
      finishReason: mapFinishReason(candidate?.finishReason),
    });
  }
}

function mapFinishReason(finishReason: string | undefined): AIResponse['finishReason'] {
  if (finishReason === 'STOP') return 'stop';
  if (finishReason === 'MAX_TOKENS') return 'max_tokens';
  return 'error';
}
