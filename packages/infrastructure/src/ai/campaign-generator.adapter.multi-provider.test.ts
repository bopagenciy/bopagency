/**
 * CampaignGeneratorAdapter — tests multi-provider (Phase 7D.1).
 *
 * Complementan `campaign-generator.adapter.test.ts` (7D, intacto: verifica la
 * forma legacy de constructor con un AIProvider fijo). Aquí se ejercita la
 * forma nueva: un RESOLVER inyectado que decide el proveedor por llamada.
 *
 * Cobertura (§21 "CAMPAIGN GENERATOR"):
 *   M1. mismo generated-content schema para los tres proveedores
 *   M2. metadata.provider refleja el proveedor realmente usado
 *   M3. sin `input.provider` el resolver recibe undefined (→ default del servidor)
 *   M4. con `input.provider` el resolver recibe exactamente ese id
 *   M5. provider inválido → error del resolver propagado, SIN llamar al proveedor
 *   M6. provider no configurado → campaignGenerationUnavailable, sin llamar al proveedor
 *   M7. output estructurado inválido → invalidAiOutput con CUALQUIER proveedor
 *   M8. el modelo resuelto server-side se inyecta en el AIRequest
 *   M9. no hay fallback automático: un fallo del proveedor no prueba otro
 */
import { describe, it, expect, vi } from 'vitest';
import { ok, err } from '@bop-agency/shared';
import type { Result, AIProviderId } from '@bop-agency/shared';
import type { AIProvider, AIRequest, AIResponse } from '@bop-agency/ai-engine';
import type { GenerateCampaignInput } from '@bop-agency/application';
import { GENERATED_CONTENT_SCHEMA_VERSION } from '@bop-agency/shared';
import { aiUnsupportedProvider, campaignGenerationUnavailable, getAiErrorKind } from '@bop-agency/domain';
import { CampaignGeneratorAdapter } from './campaign-generator.adapter';
import type { CampaignAIProviderResolver } from './campaign-generator.adapter';
import type { ResolvedCampaignAIProvider } from './campaign-ai-provider.factory';

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
          {
            hook: 'Gancho',
            headline: 'Titular',
            primaryText: 'Texto',
            format: 'imagen',
            visualSuggestion: 'Visual',
          },
        ],
      },
    ],
    callsToAction: ['CTA'],
    landingPageRecommendations: ['Recomendación'],
    complianceNotes: [],
    assumptions: [],
  });
}

function fakeProvider(
  impl: (request: AIRequest) => Promise<Result<AIResponse>>,
): AIProvider & { complete: ReturnType<typeof vi.fn> } {
  return { complete: vi.fn(impl) } as AIProvider & { complete: ReturnType<typeof vi.fn> };
}

function okResponse(content: string, model: string): Result<AIResponse> {
  return ok({
    content,
    model,
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    finishReason: 'stop',
  });
}

/** Resolver de prueba: nunca lee process.env ni construye providers reales. */
function makeResolver(
  providerId: AIProviderId,
  model: string,
  provider: AIProvider,
): { resolver: CampaignAIProviderResolver; calls: (AIProviderId | undefined)[] } {
  const calls: (AIProviderId | undefined)[] = [];
  const resolver: CampaignAIProviderResolver = (requested) => {
    calls.push(requested);
    const resolved: ResolvedCampaignAIProvider = { providerId, model, provider };
    return ok(resolved);
  };
  return { resolver, calls };
}

describe('CampaignGeneratorAdapter — multi-provider (7D.1)', () => {
  it('M1/M2: el mismo contenido válido pasa el schema con los tres proveedores y metadata.provider refleja el usado', async () => {
    for (const providerId of ['openai', 'gemini', 'anthropic'] as const) {
      const provider = fakeProvider(async () => okResponse(validMetaJson(), `${providerId}-model`));
      const { resolver } = makeResolver(providerId, `${providerId}-model`, provider);
      const adapter = new CampaignGeneratorAdapter(resolver);

      const result = await adapter.generate(baseInput({ provider: providerId }));

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.content.platform).toBe('meta_ads');
        expect(result.value.content.schemaVersion).toBe(GENERATED_CONTENT_SCHEMA_VERSION);
        expect(result.value.metadata.provider).toBe(providerId);
        expect(result.value.metadata.model).toBe(`${providerId}-model`);
      }
    }
  });

  it('M3: sin input.provider el resolver recibe undefined (default del servidor)', async () => {
    const provider = fakeProvider(async () => okResponse(validMetaJson(), 'default-model'));
    const { resolver, calls } = makeResolver('anthropic', 'default-model', provider);
    const adapter = new CampaignGeneratorAdapter(resolver);

    await adapter.generate(baseInput());

    expect(calls).toEqual([undefined]);
  });

  it('M4: con input.provider el resolver recibe exactamente ese id', async () => {
    const provider = fakeProvider(async () => okResponse(validMetaJson(), 'gemini-model'));
    const { resolver, calls } = makeResolver('gemini', 'gemini-model', provider);
    const adapter = new CampaignGeneratorAdapter(resolver);

    await adapter.generate(baseInput({ provider: 'gemini' }));

    expect(calls).toEqual(['gemini']);
  });

  it('M5: provider no soportado propaga el error y NUNCA llama al proveedor', async () => {
    const provider = fakeProvider(async () => okResponse(validMetaJson(), 'x'));
    const adapter = new CampaignGeneratorAdapter(() => err(aiUnsupportedProvider('mistral')));

    const result = await adapter.generate(baseInput());

    expect(provider.complete).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(getAiErrorKind(result.error)).toBe('AI_UNSUPPORTED_PROVIDER');
    }
  });

  it('M6: provider sin configurar propaga campaignGenerationUnavailable sin llamar al proveedor', async () => {
    const provider = fakeProvider(async () => okResponse(validMetaJson(), 'x'));
    const adapter = new CampaignGeneratorAdapter(() =>
      err(campaignGenerationUnavailable('provider "openai" is not configured (missing OPENAI_API_KEY).')),
    );

    const result = await adapter.generate(baseInput({ provider: 'openai' }));

    expect(provider.complete).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(getAiErrorKind(result.error)).toBe('AI_PROVIDER_NOT_CONFIGURED');
    }
  });

  it('M7: output que no cumple el schema es rechazado con cualquier proveedor, sin exponer el contenido crudo', async () => {
    for (const providerId of ['openai', 'gemini', 'anthropic'] as const) {
      const bad = JSON.stringify({ platform: 'meta_ads', secreto: 'brief confidencial del cliente' });
      const provider = fakeProvider(async () => okResponse(bad, 'm'));
      const { resolver } = makeResolver(providerId, 'm', provider);
      const adapter = new CampaignGeneratorAdapter(resolver);

      const result = await adapter.generate(baseInput({ provider: providerId }));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(getAiErrorKind(result.error)).toBe('AI_INVALID_OUTPUT');
        expect(result.error.message).not.toContain('confidencial');
      }
    }
  });

  it('M8: el modelo resuelto server-side se inyecta en el AIRequest (nunca viene del browser)', async () => {
    const provider = fakeProvider(async () => okResponse(validMetaJson(), 'server-model'));
    const { resolver } = makeResolver('openai', 'server-model', provider);
    const adapter = new CampaignGeneratorAdapter(resolver);

    await adapter.generate(baseInput({ provider: 'openai' }));

    const [sentRequest] = provider.complete.mock.calls[0] as [AIRequest];
    expect(sentRequest.model).toBe('server-model');
  });

  it('M9: un fallo del proveedor NO prueba otro proveedor (sin fallback automático)', async () => {
    const provider = fakeProvider(async () =>
      err({ code: 'EXTERNAL_SERVICE_ERROR' as const, message: 'AI provider request failed: status 503' }),
    );
    const { resolver, calls } = makeResolver('gemini', 'gemini-model', provider);
    const adapter = new CampaignGeneratorAdapter(resolver);

    const result = await adapter.generate(baseInput({ provider: 'gemini' }));

    expect(calls).toEqual(['gemini']);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(getAiErrorKind(result.error)).toBe('AI_EXTERNAL_SERVICE_ERROR');
    }
  });
});
