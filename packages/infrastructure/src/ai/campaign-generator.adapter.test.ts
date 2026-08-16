/**
 * CampaignGeneratorAdapter — tests unitarios (Phase 7D).
 *
 * Usa un AIProvider fake (no ClaudeAPIProvider real, no fetch) para aislar
 * la composición prompt-builder + validación Zod + mapeo de errores.
 *
 * Cobertura:
 *   G1. genera y valida contenido meta_ads correctamente
 *   G2. genera y valida contenido google_ads correctamente
 *   G3. tolera JSON envuelto en markdown (```json ... ```) pese a la instrucción
 *   G4. texto sin JSON reconocible → err invalidAiOutput (EXTERNAL_SERVICE_ERROR)
 *   G5. JSON válido pero no cumple el schema → err invalidAiOutput, sin exponer contenido crudo
 *   G6. provider RATE_LIMITED → err aiRateLimited (RATE_LIMITED)
 *   G7. provider EXTERNAL_SERVICE_ERROR con reason=timeout → err aiGenerationTimeout
 *   G8. provider EXTERNAL_SERVICE_ERROR con reason=not_configured → err campaignGenerationUnavailable
 *   G9. provider EXTERNAL_SERVICE_ERROR genérico → err aiProviderFailure con el mensaje ya saneado del provider
 *   G10. metadata incluye provider/model/promptVersion/schemaVersion/generatedAt/tokenUsage/latencyMs
 */
import { describe, it, expect, vi } from 'vitest';
import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AIProvider, AIRequest, AIResponse } from '@bop-agency/ai-engine';
import type { GenerateCampaignInput } from '@bop-agency/application';
import { GENERATED_CONTENT_SCHEMA_VERSION } from '@bop-agency/shared';
import { CampaignGeneratorAdapter } from './campaign-generator.adapter';
import { CAMPAIGN_BUILDER_PROMPT_VERSION } from './campaign-prompt-builder';

function baseInput(overrides: Partial<GenerateCampaignInput> = {}): GenerateCampaignInput {
  return {
    platform: 'meta_ads',
    objective: 'lead_generation',
    brief: 'Brief de prueba con contenido suficiente.',
    budget: 3000000,
    currency: 'COP',
    startDate: null,
    endDate: null,
    language: 'es',
    clientContext: { name: 'Cliente Demo', industry: null, website: null, brandProfile: null },
    complianceRules: [],
    ...overrides,
  };
}

function validMetaJson(): string {
  return JSON.stringify({
    schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
    platform: 'meta_ads',
    language: 'es',
    campaignConcept: 'Concepto',
    targetAudience: 'Audiencia',
    valueProposition: 'Propuesta de valor',
    messaging: ['Mensaje 1'],
    adSets: [
      {
        name: 'Ad Set 1',
        audienceType: 'cold',
        targetingSummary: 'Resumen',
        placementSuggestions: ['Feed'],
        creatives: [
          { hook: 'Gancho', headline: 'Titular', primaryText: 'Texto', format: 'imagen', visualSuggestion: 'Visual' },
        ],
      },
    ],
    callsToAction: ['CTA'],
    landingPageRecommendations: ['Recomendación'],
    complianceNotes: [],
    assumptions: [],
  });
}

function validGoogleJson(): string {
  return JSON.stringify({
    schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
    platform: 'google_ads',
    language: 'es',
    campaignConcept: 'Concepto',
    targetAudience: 'Audiencia',
    valueProposition: 'Propuesta de valor',
    messaging: ['Mensaje 1'],
    adGroups: [{ name: 'Grupo 1', theme: 'Tema', headlines: ['H1', 'H2', 'H3'], descriptions: ['D1'] }],
    keywordSuggestions: ['keyword'],
    negativeKeywordSuggestions: [],
    callsToAction: ['CTA'],
    landingPageRecommendations: ['Recomendación'],
    complianceNotes: [],
    assumptions: [],
  });
}

function makeFakeProvider(completeImpl: (request: AIRequest) => Promise<Result<AIResponse>>): AIProvider {
  return { complete: vi.fn(completeImpl) };
}

function makeAIResponse(content: string, overrides: Partial<AIResponse> = {}): AIResponse {
  return {
    content,
    model: 'claude-3-5-sonnet-20241022',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    finishReason: 'stop',
    ...overrides,
  };
}

describe('CampaignGeneratorAdapter.generate', () => {
  it('G1: genera y valida contenido meta_ads correctamente', async () => {
    const provider = makeFakeProvider(async () => ok(makeAIResponse(validMetaJson())));
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content.platform).toBe('meta_ads');
    }
  });

  it('G2: genera y valida contenido google_ads correctamente', async () => {
    const provider = makeFakeProvider(async () => ok(makeAIResponse(validGoogleJson())));
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput({ platform: 'google_ads' }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content.platform).toBe('google_ads');
    }
  });

  it('G3: tolera JSON envuelto en markdown ```json ... ```', async () => {
    const wrapped = '```json\n' + validMetaJson() + '\n```';
    const provider = makeFakeProvider(async () => ok(makeAIResponse(wrapped)));
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput());

    expect(result.success).toBe(true);
  });

  it('G4: texto sin JSON reconocible retorna err EXTERNAL_SERVICE_ERROR (invalidAiOutput)', async () => {
    const provider = makeFakeProvider(async () => ok(makeAIResponse('Lo siento, no puedo generar esto.')));
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('G5: JSON válido pero que no cumple el schema retorna err sin exponer el contenido crudo', async () => {
    const invalidContent = JSON.stringify({ platform: 'meta_ads', foo: 'bar del brief del cliente confidencial' });
    const provider = makeFakeProvider(async () => ok(makeAIResponse(invalidContent)));
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message).not.toContain('confidencial');
    }
  });

  it('G6: provider RATE_LIMITED se mapea a err RATE_LIMITED', async () => {
    const provider = makeFakeProvider(async () => err({ code: 'RATE_LIMITED', message: 'rate limited' }));
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('RATE_LIMITED');
  });

  it('G7: provider EXTERNAL_SERVICE_ERROR con reason=timeout se mapea a error de timeout', async () => {
    const provider = makeFakeProvider(async () =>
      err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'timed out', details: { reason: 'timeout' } }),
    );
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message.toLowerCase()).toContain('timed out');
    }
  });

  it('G8: provider EXTERNAL_SERVICE_ERROR con reason=not_configured se mapea a campaignGenerationUnavailable', async () => {
    const provider = makeFakeProvider(async () =>
      err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'not configured', details: { reason: 'not_configured' } }),
    );
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message.toLowerCase()).toContain('unavailable');
    }
  });

  it('G9: provider EXTERNAL_SERVICE_ERROR genérico se mapea a aiProviderFailure preservando el mensaje ya saneado', async () => {
    const provider = makeFakeProvider(async () =>
      err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'AI provider request failed: status 503' }),
    );
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message).toContain('status 503');
    }
  });

  it('G10: metadata incluye provider/model/promptVersion/schemaVersion/generatedAt/tokenUsage/latencyMs', async () => {
    const provider = makeFakeProvider(async () => ok(makeAIResponse(validMetaJson())));
    const adapter = new CampaignGeneratorAdapter(provider);

    const result = await adapter.generate(baseInput());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.metadata.provider).toBe('anthropic');
      expect(result.value.metadata.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.value.metadata.promptVersion).toBe(CAMPAIGN_BUILDER_PROMPT_VERSION);
      expect(result.value.metadata.schemaVersion).toBe(GENERATED_CONTENT_SCHEMA_VERSION);
      expect(() => new Date(result.value.metadata.generatedAt).toISOString()).not.toThrow();
      expect(result.value.metadata.tokenUsage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150 });
      expect(typeof result.value.metadata.latencyMs).toBe('number');
      expect(result.value.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });
});
