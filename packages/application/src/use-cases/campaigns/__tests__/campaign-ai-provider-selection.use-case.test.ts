/**
 * Selección de proveedor de IA en los use cases — tests (Phase 7D.1).
 *
 * Verifica que `generateCampaignDraftWithAI` y `regenerateCampaignContent`:
 * - propagan el `provider` al puerto SIN tomar ninguna decisión por proveedor
 *   (el use case no conoce OpenAI/Gemini/Anthropic; solo pasa el id),
 * - rechazan un provider fuera del enum vía Zod (no llega al puerto),
 * - omiten `provider` cuando no se especifica (→ default del servidor),
 * - persisten en `metadata.ai.provider` exactamente el proveedor reportado por
 *   el puerto, sea cual sea,
 * - reutilizan el proveedor de la generación previa al regenerar.
 *
 * Cobertura (§21 "CAMPAIGN GENERATOR"):
 *   P1. provider seleccionado se propaga al puerto
 *   P2. sin provider, el puerto no recibe el campo
 *   P3. provider inválido → VALIDATION_ERROR, puerto NO invocado, sin persistencia
 *   P4. metadata.ai.provider persistido = el reportado por el puerto (gemini)
 *   P5. metadata.ai.provider persistido = el reportado por el puerto (openai)
 *   P6. regenerate reutiliza metadata.ai.provider previo si no hay override
 *   P7. regenerate con override explícito usa el override
 *   P8. regenerate ignora un metadata.ai.provider corrupto (no lo propaga)
 */

import { describe, it, expect, vi } from 'vitest';
import { ok } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  Client,
  ClientRepository,
  ComplianceRuleRepository,
  OrganizationId,
  OrganizationMember,
  OrganizationRepository,
  OrganizationRole,
  MetaAdsGeneratedContent,
  AIGenerationMetadata,
} from '@bop-agency/domain';
import { GENERATED_CONTENT_SCHEMA_VERSION } from '@bop-agency/domain';
import type { AIProviderId } from '@bop-agency/shared';
import { generateCampaignDraftWithAI } from '../generate-campaign-draft-with-ai.use-case';
import { regenerateCampaignContent } from '../regenerate-campaign-content.use-case';
import type { LoggerPort } from '../../../ports/logger.port';
import type {
  CampaignGeneratorPort,
  GenerateCampaignInput,
  GeneratedCampaignResult,
} from '../../../ports/campaign-generator.port';

const ORG_ID = 'org-uuid-1' as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as Client['id'];
const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111' as CampaignId;
const ACTOR_ID = 'user-uuid-1';

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: CLIENT_ID,
    organizationId: ORG_ID,
    name: 'Cliente Demo',
    legalName: null,
    slug: 'cliente-demo',
    status: 'active',
    industry: 'retail',
    timezone: 'America/Bogota',
    currency: 'COP',
    website: null,
    email: null,
    phone: null,
    notes: null,
    metadata: {},
    createdBy: 'user_1',
    updatedBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    name: 'AI draft',
    platform: 'meta_ads',
    objective: 'lead_generation',
    status: 'draft',
    brief: 'Brief de prueba con suficiente contenido.',
    budget: 5000000,
    currency: 'COP',
    startDate: null,
    endDate: null,
    generatedContent: null,
    metadata: {},
    createdBy: ACTOR_ID,
    updatedBy: null,
    submittedForReviewAt: null,
    approvedAt: null,
    rejectedAt: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-01'),
    ...overrides,
  };
}

function makeMember(role: OrganizationRole): OrganizationMember {
  return {
    id: 'member-1',
    organizationId: ORG_ID,
    userId: ACTOR_ID,
    role,
    status: 'active',
    invitedBy: null,
    joinedAt: new Date('2026-01-01'),
  };
}

function makeMetaContent(): MetaAdsGeneratedContent {
  return {
    schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
    platform: 'meta_ads',
    language: 'es',
    campaignConcept: 'Concepto de campaña de prueba',
    targetAudience: 'Audiencia objetivo',
    valueProposition: 'Propuesta de valor',
    messaging: ['Mensaje clave 1'],
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
            primaryText: 'Texto principal',
            format: 'imagen',
            visualSuggestion: 'Visual',
          },
        ],
      },
    ],
    callsToAction: ['Compra ahora'],
    landingPageRecommendations: ['Formulario simple'],
    complianceNotes: [],
    assumptions: [],
  };
}

function makeGenerationResult(provider: AIProviderId, model: string): GeneratedCampaignResult {
  return {
    content: makeMetaContent(),
    metadata: {
      provider,
      model,
      promptVersion: 'campaign-builder-v1',
      schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
      generatedAt: '2026-08-18T00:00:00.000Z',
      tokenUsage: { inputTokens: 500, outputTokens: 300, totalTokens: 800 },
      latencyMs: 1200,
    },
  };
}

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeCampaignRepo(overrides: Partial<CampaignRepository> = {}): CampaignRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeCampaign())),
    findAll: vi.fn(),
    create: vi.fn().mockResolvedValue(ok(makeCampaign())),
    update: vi.fn().mockResolvedValue(ok(makeCampaign())),
    approve: vi.fn(),
    reject: vi.fn(),
    ...overrides,
  };
}

function makeClientRepo(): ClientRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeClient())),
    findAll: vi.fn(),
    findBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
    findByIdWithDocuments: vi.fn(),
    listContacts: vi.fn(),
    listDocuments: vi.fn(),
    getDocumentByKey: vi.fn().mockResolvedValue(ok(null)),
    upsertDocument: vi.fn(),
    listIntegrations: vi.fn(),
  } as unknown as ClientRepository;
}

function makeComplianceRuleRepo(): ComplianceRuleRepository {
  return { findApplicableRules: vi.fn().mockResolvedValue(ok([])) } as unknown as ComplianceRuleRepository;
}

function makeOrgRepo(role: OrganizationRole = 'operator'): OrganizationRepository {
  return {
    findMember: vi.fn().mockResolvedValue(ok(makeMember(role))),
  } as unknown as OrganizationRepository;
}

function makeGeneratorPort(result: GeneratedCampaignResult): CampaignGeneratorPort {
  return { generate: vi.fn().mockResolvedValue(ok(result)) };
}

function makeDeps(port: CampaignGeneratorPort, campaignRepository = makeCampaignRepo()) {
  return {
    campaignRepository,
    clientRepository: makeClientRepo(),
    complianceRuleRepository: makeComplianceRuleRepo(),
    organizationRepository: makeOrgRepo(),
    campaignGeneratorPort: port,
    logger: makeLogger(),
  };
}

const BASE_GENERATE_INPUT = {
  clientId: CLIENT_ID,
  platform: 'meta_ads',
  objective: 'lead_generation',
  brief: 'Brief de prueba con suficiente contenido.',
  budget: 5000000,
  organizationId: ORG_ID,
  actorUserId: ACTOR_ID,
};

function sentInput(port: CampaignGeneratorPort): GenerateCampaignInput {
  const calls = (port.generate as unknown as { mock: { calls: GenerateCampaignInput[][] } }).mock.calls;
  const first = calls[0];
  if (first === undefined || first[0] === undefined) {
    throw new Error('campaignGeneratorPort.generate no fue invocado');
  }
  return first[0];
}

function persistedAiMetadata(repo: CampaignRepository, method: 'create' | 'update'): AIGenerationMetadata {
  const calls = (repo[method] as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const first = calls[0];
  if (first === undefined) throw new Error(`campaignRepository.${method} no fue invocado`);
  const payload = (method === 'create' ? first[0] : first[2]) as {
    metadata: { ai: AIGenerationMetadata };
  };
  return payload.metadata.ai;
}

describe('generateCampaignDraftWithAI — selección de proveedor (7D.1)', () => {
  it('P1: propaga el provider seleccionado al puerto sin decidir nada por proveedor', async () => {
    const port = makeGeneratorPort(makeGenerationResult('gemini', 'gemini-1.5-flash'));

    const result = await generateCampaignDraftWithAI(
      { ...BASE_GENERATE_INPUT, provider: 'gemini' },
      makeDeps(port),
    );

    expect(result.success).toBe(true);
    expect(sentInput(port).provider).toBe('gemini');
  });

  it('P2: sin provider explícito, el puerto no recibe el campo (default del servidor)', async () => {
    const port = makeGeneratorPort(makeGenerationResult('anthropic', 'claude-3-5-sonnet-20241022'));

    await generateCampaignDraftWithAI(BASE_GENERATE_INPUT, makeDeps(port));

    expect(sentInput(port).provider).toBeUndefined();
  });

  it('P3: provider fuera del enum es rechazado por Zod, sin llamar al puerto ni persistir', async () => {
    const port = makeGeneratorPort(makeGenerationResult('openai', 'gpt-4o-mini'));
    const repo = makeCampaignRepo();

    const result = await generateCampaignDraftWithAI(
      { ...BASE_GENERATE_INPUT, provider: 'mistral' as never },
      makeDeps(port, repo),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(port.generate).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('P4: persiste en metadata.ai el proveedor y modelo reportados por el puerto (gemini)', async () => {
    const port = makeGeneratorPort(makeGenerationResult('gemini', 'gemini-1.5-flash'));
    const repo = makeCampaignRepo();

    await generateCampaignDraftWithAI({ ...BASE_GENERATE_INPUT, provider: 'gemini' }, makeDeps(port, repo));

    const ai = persistedAiMetadata(repo, 'create');
    expect(ai.provider).toBe('gemini');
    expect(ai.model).toBe('gemini-1.5-flash');
    expect(ai.promptVersion).toBe('campaign-builder-v1');
    expect(ai.schemaVersion).toBe(GENERATED_CONTENT_SCHEMA_VERSION);
    expect(ai.generatedAt).toBe('2026-08-18T00:00:00.000Z');
    expect(ai.tokenUsage).toEqual({ inputTokens: 500, outputTokens: 300, totalTokens: 800 });
    expect(ai.latencyMs).toBe(1200);
    // Nunca se persiste nada parecido a una credencial.
    expect(JSON.stringify(ai).toLowerCase()).not.toContain('api_key');
    expect(JSON.stringify(ai).toLowerCase()).not.toContain('authorization');
  });

  it('P5: persiste openai cuando el puerto reporta openai', async () => {
    const port = makeGeneratorPort(makeGenerationResult('openai', 'gpt-4o-mini'));
    const repo = makeCampaignRepo();

    await generateCampaignDraftWithAI({ ...BASE_GENERATE_INPUT, provider: 'openai' }, makeDeps(port, repo));

    expect(persistedAiMetadata(repo, 'create').provider).toBe('openai');
  });
});

describe('regenerateCampaignContent — selección de proveedor (7D.1)', () => {
  const BASE_REGENERATE_INPUT = {
    campaignId: CAMPAIGN_ID,
    organizationId: ORG_ID,
    actorUserId: ACTOR_ID,
  };

  it('P6: sin override, reutiliza el proveedor de la generación anterior', async () => {
    const previous = makeCampaign({ metadata: { ai: { provider: 'openai', model: 'gpt-4o-mini' } } });
    const repo = makeCampaignRepo({ findById: vi.fn().mockResolvedValue(ok(previous)) });
    const port = makeGeneratorPort(makeGenerationResult('openai', 'gpt-4o-mini'));

    const result = await regenerateCampaignContent(BASE_REGENERATE_INPUT, makeDeps(port, repo));

    expect(result.success).toBe(true);
    expect(sentInput(port).provider).toBe('openai');
  });

  it('P7: con override explícito usa el override, no el proveedor previo', async () => {
    const previous = makeCampaign({ metadata: { ai: { provider: 'openai', model: 'gpt-4o-mini' } } });
    const repo = makeCampaignRepo({ findById: vi.fn().mockResolvedValue(ok(previous)) });
    const port = makeGeneratorPort(makeGenerationResult('gemini', 'gemini-1.5-flash'));

    await regenerateCampaignContent({ ...BASE_REGENERATE_INPUT, provider: 'gemini' }, makeDeps(port, repo));

    expect(sentInput(port).provider).toBe('gemini');
    expect(persistedAiMetadata(repo, 'update').provider).toBe('gemini');
  });

  it('P8: un metadata.ai.provider corrupto no se propaga como si fuera válido', async () => {
    const previous = makeCampaign({ metadata: { ai: { provider: 'not-a-provider' } } });
    const repo = makeCampaignRepo({ findById: vi.fn().mockResolvedValue(ok(previous)) });
    const port = makeGeneratorPort(makeGenerationResult('anthropic', 'claude-3-5-sonnet-20241022'));

    await regenerateCampaignContent(BASE_REGENERATE_INPUT, makeDeps(port, repo));

    expect(sentInput(port).provider).toBeUndefined();
  });
});
