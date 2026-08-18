/**
 * CampaignGeneratorAdapter — Phase 7D, ampliado a multi-provider en 7D.1.
 *
 * Implementación de `CampaignGeneratorPort` (@bop-agency/application).
 * Composición: `buildCampaignGenerationPrompt` (prompt builder ÚNICO y
 * versionado — §11: no hay un prompt builder por proveedor) + un `AIProvider`
 * resuelto por `createCampaignAIProvider` (OpenAI / Gemini / Anthropic) +
 * `campaignGeneratedContentSchema` (@bop-agency/shared).
 *
 * ÚNICO punto de validación de output de IA (§10): hace `JSON.parse` sobre el
 * texto crudo del proveedor y corre `campaignGeneratedContentSchema.safeParse`
 * — vale para los TRES proveedores por igual, sin casts específicos por
 * proveedor y sin persistir jamás un output inválido.
 *
 * MULTI-PROVIDER (7D.1):
 * - El proveedor se resuelve POR LLAMADA (`input.provider`), no en el
 *   constructor: eso es lo que permite elegir proveedor por campaña/generación
 *   y lo que dejaría el futuro "compare mode" (§17) sin reescritura.
 * - El `model` lo aporta la factoría (server-side, por proveedor) y se inyecta
 *   en el `AIRequest` — el browser nunca elige modelo (§12/§19).
 * - `metadata.provider` deja de ser la constante 'anthropic' de 7D y pasa a ser
 *   el `AIProviderId` realmente usado.
 *
 * COMPATIBILIDAD CON 7D: el constructor sigue aceptando un `AIProvider` suelto
 * (forma usada por los tests de 7D y por cualquier caller previo). En esa forma
 * el adapter se comporta exactamente como en 7D: proveedor fijo, id 'anthropic'.
 *
 * RESILIENCIA (§16 de 7D, reafirmado en §16 de 7D.1): NO implementa retry NI
 * fallback entre proveedores. Un solo intento con timeout. La persistencia
 * ocurre en el use case y solo DESPUÉS de validar el output, así que un fallo
 * nunca deja un registro a medias.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AIProvider, AIRequest } from '@bop-agency/ai-engine';
import type { AIProviderId } from '@bop-agency/shared';
import type {
  CampaignGeneratorPort,
  GenerateCampaignInput,
  GeneratedCampaignResult,
} from '@bop-agency/application';
import {
  aiRateLimited,
  aiGenerationTimeout,
  aiProviderFailure,
  invalidAiOutput,
  campaignGenerationUnavailable,
} from '@bop-agency/domain';
import { campaignGeneratedContentSchema, GENERATED_CONTENT_SCHEMA_VERSION } from '@bop-agency/shared';
import { buildCampaignGenerationPrompt, CAMPAIGN_BUILDER_PROMPT_VERSION } from './campaign-prompt-builder';
import { createCampaignAIProvider } from './campaign-ai-provider.factory';
import type { ResolvedCampaignAIProvider } from './campaign-ai-provider.factory';
import { PROVIDER_REASON_NOT_CONFIGURED, PROVIDER_REASON_TIMEOUT } from './provider-http';

/** Id usado cuando el adapter se construye con un AIProvider fijo (forma 7D). */
const LEGACY_FIXED_PROVIDER_ID: AIProviderId = 'anthropic';

/**
 * Resolución de proveedor por llamada. La factoría real es
 * `createCampaignAIProvider`; el tipo se declara aquí para poder inyectar un
 * doble en tests sin tocar `process.env`.
 */
export type CampaignAIProviderResolver = (
  providerId?: AIProviderId,
) => Result<ResolvedCampaignAIProvider>;

function detailsReason(details: unknown): string | undefined {
  if (details === null || typeof details !== 'object') return undefined;
  const value = (details as Record<string, unknown>)['reason'];
  return typeof value === 'string' ? value : undefined;
}

function isAIProviderInstance(value: unknown): value is AIProvider {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { complete?: unknown }).complete === 'function'
  );
}

/**
 * Extrae el primer bloque `{...}` balanceado de un texto — tolera que el
 * modelo envuelva el JSON en markdown (```json ... ```) pese a la instrucción
 * explícita del prompt y pese a los modos de salida JSON de OpenAI/Gemini. NO
 * intenta reparar JSON malformado.
 */
function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return null;
}

export class CampaignGeneratorAdapter implements CampaignGeneratorPort {
  private readonly resolveProvider: CampaignAIProviderResolver;

  /**
   * @param providerOrResolver
   *   - `AIProvider` (forma 7D): proveedor fijo, `metadata.provider` = 'anthropic'.
   *     Se mantiene para no romper callers ni tests existentes (§6).
   *   - `CampaignAIProviderResolver` (forma 7D.1): resolución por llamada.
   *   - omitido: usa `createCampaignAIProvider` (producción).
   */
  constructor(providerOrResolver?: AIProvider | CampaignAIProviderResolver) {
    if (providerOrResolver === undefined) {
      this.resolveProvider = createCampaignAIProvider;
    } else if (isAIProviderInstance(providerOrResolver)) {
      const fixed = providerOrResolver;
      this.resolveProvider = () =>
        ok({
          providerId: LEGACY_FIXED_PROVIDER_ID,
          // Cadena vacía = "que el proveedor resuelva su propio modelo desde
          // env", exactamente el comportamiento de 7D.
          model: '',
          provider: fixed,
        });
    } else {
      this.resolveProvider = providerOrResolver;
    }
  }

  async generate(input: GenerateCampaignInput): Promise<Result<GeneratedCampaignResult>> {
    // 1. Resolución de proveedor (única decisión por proveedor de todo el flujo).
    const resolved = this.resolveProvider(input.provider);
    if (!isOk(resolved)) {
      // Ya es un AppError de dominio saneado (aiUnsupportedProvider /
      // campaignGenerationUnavailable) — no contiene env vars ni secretos.
      return resolved;
    }
    const { providerId, model, provider } = resolved.value;

    // 2. Prompt ÚNICO para los tres proveedores; solo se inyecta el modelo
    // resuelto server-side (§11/§12).
    const basePrompt = buildCampaignGenerationPrompt(input);
    const request: AIRequest = model.length > 0 ? { ...basePrompt, model } : basePrompt;

    const startedAt = Date.now();
    const providerResult = await provider.complete(request);
    const latencyMs = Date.now() - startedAt;

    // 3. Mapeo de errores — idéntico para los tres proveedores porque todos
    // usan las factorías de `provider-http.ts`.
    if (!isOk(providerResult)) {
      const providerError = providerResult.error;
      const reason = detailsReason(providerError.details);

      if (providerError.code === 'RATE_LIMITED') {
        return err(aiRateLimited());
      }
      if (reason === PROVIDER_REASON_TIMEOUT) {
        return err(aiGenerationTimeout());
      }
      if (reason === PROVIDER_REASON_NOT_CONFIGURED) {
        return err(campaignGenerationUnavailable(providerError.message));
      }
      // providerError.message ya está saneado por el provider — nunca incluye
      // headers, body crudo del proveedor, ni la API key.
      return err(aiProviderFailure(providerError.message));
    }

    const response = providerResult.value;

    // 4. Validación de output — idéntica para OpenAI, Gemini y Anthropic (§10).
    const jsonText = extractJsonObject(response.content);
    if (jsonText === null) {
      return err(invalidAiOutput('la respuesta del proveedor no contiene un objeto JSON reconocible.'));
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch {
      return err(invalidAiOutput('la respuesta del proveedor no es JSON válido.'));
    }

    const validation = campaignGeneratedContentSchema.safeParse(parsedJson);
    if (!validation.success) {
      // Se exponen solo las rutas de campo que fallaron, nunca el contenido
      // crudo generado (podría incluir texto del brief del cliente).
      const fieldPaths = validation.error.errors.map((e) => e.path.join('.')).join(', ');
      return err(invalidAiOutput(`el contenido generado no cumple el schema esperado (campos: ${fieldPaths}).`));
    }

    const result: GeneratedCampaignResult = {
      content: validation.data,
      metadata: {
        provider: providerId,
        model: response.model,
        promptVersion: CAMPAIGN_BUILDER_PROMPT_VERSION,
        schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        tokenUsage: response.usage,
        latencyMs,
      },
    };

    return ok(result);
  }
}
