/**
 * CampaignGeneratorAdapter — Phase 7D.
 *
 * Implementación de `CampaignGeneratorPort` (@bop-agency/application).
 * Composición: `buildCampaignGenerationPrompt` (prompt builder versionado) +
 * `AIProvider` (ClaudeAPIProvider, inyectado — no instanciado aquí, para
 * mantener testeable con un fake) + `campaignGeneratedContentSchema`
 * (@bop-agency/shared — validación de forma) antes de retornar al use case.
 *
 * ÚNICO punto de validación de output de IA: hace `JSON.parse` sobre el
 * texto crudo del proveedor y corre `campaignGeneratedContentSchema.safeParse`
 * — ningún output de IA sin validar llega a application/domain (§6/§15 de
 * la tarea).
 *
 * RESILIENCIA (§16): NO implementa retry. Auditoría de la infraestructura
 * existente (N8nWebhookDispatcher) confirmó que ningún adapter del proyecto
 * reintenta automáticamente — un solo intento con timeout, igual aquí. Es
 * seguro: la persistencia (CampaignRepository.create/update, en el use case)
 * solo ocurre DESPUÉS de validar el output, así que un fallo de generación
 * nunca deja un registro a medias ni duplica datos; reintentar es
 * responsabilidad del caller (re-invocar el use case), no de este adapter.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AIProvider } from '@bop-agency/ai-engine';
import type { CampaignGeneratorPort, GenerateCampaignInput, GeneratedCampaignResult } from '@bop-agency/application';
import {
  aiRateLimited,
  aiGenerationTimeout,
  aiProviderFailure,
  invalidAiOutput,
  campaignGenerationUnavailable,
} from '@bop-agency/domain';
import { campaignGeneratedContentSchema, GENERATED_CONTENT_SCHEMA_VERSION } from '@bop-agency/shared';
import { buildCampaignGenerationPrompt, CAMPAIGN_BUILDER_PROMPT_VERSION } from './campaign-prompt-builder';

const PROVIDER_NAME = 'anthropic';

function detailsReason(details: unknown): string | undefined {
  if (details === null || typeof details !== 'object') return undefined;
  const value = (details as Record<string, unknown>)['reason'];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extrae el primer bloque `{...}` balanceado de un texto — tolera que el
 * modelo envuelva el JSON en markdown (```json ... ```) pese a la
 * instrucción explícita del prompt de no hacerlo. NO intenta reparar JSON
 * malformado — si no hay un bloque balanceado válido, se retorna null y el
 * caller trata el output como inválido.
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
  constructor(private readonly aiProvider: AIProvider) {}

  async generate(input: GenerateCampaignInput): Promise<Result<GeneratedCampaignResult>> {
    const request = buildCampaignGenerationPrompt(input);

    const startedAt = Date.now();
    const providerResult = await this.aiProvider.complete(request);
    const latencyMs = Date.now() - startedAt;

    if (!isOk(providerResult)) {
      const providerError = providerResult.error;
      const reason = detailsReason(providerError.details);

      if (providerError.code === 'RATE_LIMITED') {
        return err(aiRateLimited());
      }
      if (reason === 'timeout') {
        return err(aiGenerationTimeout());
      }
      if (reason === 'not_configured') {
        return err(campaignGenerationUnavailable('AI provider is not configured (missing ANTHROPIC_API_KEY).'));
      }
      // providerError.message ya está saneado por ClaudeAPIProvider — nunca
      // incluye headers, body crudo del proveedor, ni la API key.
      return err(aiProviderFailure(providerError.message));
    }

    const response = providerResult.value;

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
        provider: PROVIDER_NAME,
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
