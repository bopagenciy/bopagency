/**
 * generateCampaignDraftWithAI use case — tests unitarios (Phase 7D).
 *
 * Cubre (§17 de la especificación):
 * - Generación exitosa meta_ads / google_ads.
 * - La campaña SIEMPRE queda en 'draft' (nunca auto-aprobada/enviada a revisión).
 * - Rol operator permitido, viewer rechazado (FORBIDDEN).
 * - Cliente de otra organización rechazado (NOT_FOUND).
 * - Cliente inactivo rechazado (VALIDATION_ERROR).
 * - Plataforma no soportada (youtube_ads) rechazada ANTES de tocar el cliente/IA.
 * - Fallo del proveedor de IA propagado, sin persistencia.
 * - Output de IA con platform distinto al solicitado → rechazado, sin persistencia.
 * - Reglas de compliance se pasan como contexto al port y quedan reflejadas
 *   en metadata.ai.complianceReview.requiresManualReview.
 * - CampaignRepository.create se llama EXACTAMENTE una vez en el flujo exitoso,
 *   y CERO veces si la generación falla o el output es inválido.
 */

import { describe, it, expect, vi } from 'vitest';
import { generateCampaignDraftWithAI } from '../generate-campaign-draft-with-ai.use-case';
import type { GenerateCampaignDraftWithAiInput } from '../generate-campaign-draft-with-ai.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  Client,
  ClientRepository,
  ComplianceRule,
  ComplianceRuleId,
  ComplianceRuleRepository,
  OrganizationId,
  OrganizationMember,
  OrganizationRepository,
  OrganizationRole,
  MetaAdsGeneratedContent,
  GoogleAdsGeneratedContent,
} from '@bop-agency/domain';
import { GENERATED_CONTENT_SCHEMA_VERSION } from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';
import type { CampaignGeneratorPort, GeneratedCampaignResult } from '../../../ports/campaign-generator.port';

const ORG_ID = 'org-uuid-1' as OrganizationId;
const OTHER_ORG_ID = 'org-uuid-2' as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as Client['id'];
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
    website: 'https://cliente-demo.example.com',
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
    id: 'campaign-uuid-1' as CampaignId,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    name: 'AI draft',
    platform: 'meta_ads',
    objective: 'lead_generation',
    status: 'draft',
    brief: 'Brief de prueba',
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

function makeMember(role: OrganizationRole, overrides: Partial<OrganizationMember> = {}): OrganizationMember {
  return {
    id: 'member-1',
    organizationId: ORG_ID,
    userId: ACTOR_ID,
    role,
    status: 'active',
    invitedBy: null,
    joinedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeRule(overrides: Partial<ComplianceRule> = {}): ComplianceRule {
  return {
    id: 'rule-uuid-1' as ComplianceRuleId,
    organizationId: null,
    clientId: null,
    platform: 'meta_ads',
    jurisdiction: null,
    ruleKey: 'meta_disclaimer_required',
    title: 'Disclaimer requerido',
    description: 'Toda campaña debe incluir disclaimer legal.',
    severity: 'high',
    category: 'legal',
    active: true,
    source: null,
    metadata: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeMetaContent(overrides: Partial<MetaAdsGeneratedContent> = {}): MetaAdsGeneratedContent {
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
        targetingSummary: 'Resumen de segmentación',
        placementSuggestions: ['Feed'],
        creatives: [
          {
            hook: 'Gancho',
            headline: 'Titular',
            primaryText: 'Texto principal',
            format: 'imagen',
            visualSuggestion: 'Sugerencia visual',
          },
        ],
      },
    ],
    callsToAction: ['Compra ahora'],
    landingPageRecommendations: ['Incluir formulario simple'],
    complianceNotes: [],
    assumptions: [],
    ...overrides,
  };
}

function makeGoogleContent(overrides: Partial<GoogleAdsGeneratedContent> = {}): GoogleAdsGeneratedContent {
  return {
    schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
    platform: 'google_ads',
    language: 'es',
    campaignConcept: 'Concepto de campaña de prueba',
    targetAudience: 'Audiencia objetivo',
    valueProposition: 'Propuesta de valor',
    messaging: ['Mensaje clave 1'],
    adGroups: [
      {
        name: 'Ad Group 1',
        theme: 'Tema',
        headlines: ['Titular 1', 'Titular 2', 'Titular 3'],
        descriptions: ['Descripción 1'],
      },
    ],
    keywordSuggestions: ['keyword 1'],
    negativeKeywordSuggestions: [],
    callsToAction: ['Compra ahora'],
    landingPageRecommendations: ['Incluir formulario simple'],
    complianceNotes: [],
    assumptions: [],
    ...overrides,
  };
}

function makeGenerationResult(overrides: Partial<GeneratedCampaignResult> = {}): GeneratedCampaignResult {
  return {
    content: makeMetaContent(),
    metadata: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      promptVersion: 'campaign-builder-v1',
      schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
      generatedAt: '2026-08-16T00:00:00.000Z',
      tokenUsage: { inputTokens: 500, outputTokens: 300, totalTokens: 800 },
      latencyMs: 1200,
    },
    ...overrides,
  };
}

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeCampaignRepo(overrides: Partial<CampaignRepository> = {}): CampaignRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn().mockResolvedValue(ok(makeCampaign())),
    update: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    ...overrides,
  };
}

function makeClientRepo(overrides: Partial<ClientRepository> = {}): ClientRepository {
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
    ...overrides,
  };
}

function makeComplianceRuleRepo(
  overrides: Partial<ComplianceRuleRepository> = {},
): ComplianceRuleRepository {
  return {
    findApplicableRules: vi.fn().mockResolvedValue(ok([])),
    ...overrides,
  };
}

function makeOrgRepo(overrides: Partial<OrganizationRepository> = {}): OrganizationRepository {
  return {
    findById: vi.fn(),
    findBySlug: vi.fn(),
    findByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findMembers: vi.fn(),
    findMember: vi.fn().mockResolvedValue(ok(makeMember('operator'))),
    addMember: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    findInvitations: vi.fn(),
    findInvitationByToken: vi.fn(),
    createInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
    cancelInvitation: vi.fn(),
    ...overrides,
  };
}

function makeGeneratorPort(overrides: Partial<CampaignGeneratorPort> = {}): CampaignGeneratorPort {
  return {
    generate: vi.fn().mockResolvedValue(ok(makeGenerationResult())),
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<GenerateCampaignDraftWithAiInput> = {},
): GenerateCampaignDraftWithAiInput {
  return {
    clientId: CLIENT_ID,
    platform: 'meta_ads',
    objective: 'lead_generation',
    brief: 'Brief de prueba con suficiente contenido.',
    budget: 5000000,
    organizationId: ORG_ID,
    actorUserId: ACTOR_ID,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<Parameters<typeof generateCampaignDraftWithAI>[1]> = {}) {
  return {
    campaignRepository: makeCampaignRepo(),
    clientRepository: makeClientRepo(),
    complianceRuleRepository: makeComplianceRuleRepo(),
    organizationRepository: makeOrgRepo(),
    campaignGeneratorPort: makeGeneratorPort(),
    logger: makeLogger(),
    ...overrides,
  };
}

describe('generateCampaignDraftWithAI use case', () => {
  it('genera y persiste una campaña draft (meta_ads)', async () => {
    const deps = makeDeps();

    const result = await generateCampaignDraftWithAI(makeInput(), deps);

    expect(result.success).toBe(true);
    expect(deps.campaignRepository.create).toHaveBeenCalledOnce();
    const createArg = (deps.campaignRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createArg.generatedContent.platform).toBe('meta_ads');
    expect(createArg.metadata.ai.provider).toBe('anthropic');
  });

  it('genera y persiste una campaña draft (google_ads)', async () => {
    const deps = makeDeps({
      campaignGeneratorPort: makeGeneratorPort({
        generate: vi.fn().mockResolvedValue(
          ok(makeGenerationResult({ content: makeGoogleContent() })),
        ),
      }),
    });

    const result = await generateCampaignDraftWithAI(makeInput({ platform: 'google_ads' }), deps);

    expect(result.success).toBe(true);
    const createArg = (deps.campaignRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createArg.generatedContent.platform).toBe('google_ads');
  });

  it('la campaña generada NUNCA incluye un status distinto de draft (CreateCampaignInput no expone status)', async () => {
    const deps = makeDeps();

    await generateCampaignDraftWithAI(makeInput(), deps);

    const createArg = (deps.campaignRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createArg).not.toHaveProperty('status');
  });

  it('permite a operator/strategist/admin/owner generar', async () => {
    for (const role of ['operator', 'strategist', 'admin', 'owner'] as const) {
      const deps = makeDeps({
        organizationRepository: makeOrgRepo({ findMember: vi.fn().mockResolvedValue(ok(makeMember(role))) }),
      });
      const result = await generateCampaignDraftWithAI(makeInput(), deps);
      expect(result.success).toBe(true);
    }
  });

  it('rechaza a viewer con FORBIDDEN, sin llamar al proveedor de IA', async () => {
    const deps = makeDeps({
      organizationRepository: makeOrgRepo({ findMember: vi.fn().mockResolvedValue(ok(makeMember('viewer'))) }),
    });

    const result = await generateCampaignDraftWithAI(makeInput(), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(deps.campaignGeneratorPort.generate).not.toHaveBeenCalled();
    expect(deps.campaignRepository.create).not.toHaveBeenCalled();
  });

  it('rechaza plataforma no soportada (youtube_ads) antes de tocar cliente/IA', async () => {
    const deps = makeDeps();

    const result = await generateCampaignDraftWithAI(makeInput({ platform: 'youtube_ads' }), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(deps.clientRepository.findById).not.toHaveBeenCalled();
    expect(deps.campaignGeneratorPort.generate).not.toHaveBeenCalled();
    expect(deps.campaignRepository.create).not.toHaveBeenCalled();
  });

  it('rechaza cliente de otra organización con NOT_FOUND', async () => {
    const deps = makeDeps({
      clientRepository: makeClientRepo({
        findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
      }),
    });

    const result = await generateCampaignDraftWithAI(makeInput({ organizationId: OTHER_ORG_ID }), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    expect(deps.campaignRepository.create).not.toHaveBeenCalled();
  });

  it('rechaza cliente inactivo con VALIDATION_ERROR', async () => {
    const deps = makeDeps({
      clientRepository: makeClientRepo({
        findById: vi.fn().mockResolvedValue(ok(makeClient({ status: 'inactive' }))),
      }),
    });

    const result = await generateCampaignDraftWithAI(makeInput(), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(deps.campaignGeneratorPort.generate).not.toHaveBeenCalled();
    expect(deps.campaignRepository.create).not.toHaveBeenCalled();
  });

  it('propaga el fallo del proveedor de IA sin persistir nada', async () => {
    const deps = makeDeps({
      campaignGeneratorPort: makeGeneratorPort({
        generate: vi.fn().mockResolvedValue(err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'AI provider request failed' })),
      }),
    });

    const result = await generateCampaignDraftWithAI(makeInput(), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(deps.campaignRepository.create).not.toHaveBeenCalled();
  });

  it('rechaza output de IA con platform distinto al solicitado, sin persistir', async () => {
    const deps = makeDeps({
      campaignGeneratorPort: makeGeneratorPort({
        generate: vi.fn().mockResolvedValue(
          ok(makeGenerationResult({ content: makeGoogleContent() })),
        ),
      }),
    });

    // Se solicita meta_ads pero el port devuelve contenido google_ads.
    const result = await generateCampaignDraftWithAI(makeInput({ platform: 'meta_ads' }), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(deps.campaignRepository.create).not.toHaveBeenCalled();
  });

  it('pasa las reglas de compliance aplicables como contexto al port y refleja requiresManualReview en metadata.ai', async () => {
    const rule = makeRule();
    const deps = makeDeps({
      complianceRuleRepository: makeComplianceRuleRepo({
        findApplicableRules: vi.fn().mockResolvedValue(ok([rule])),
      }),
    });

    const result = await generateCampaignDraftWithAI(makeInput(), deps);

    expect(result.success).toBe(true);
    const generateArg = (deps.campaignGeneratorPort.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(generateArg.complianceRules).toEqual([
      { ruleKey: rule.ruleKey, title: rule.title, description: rule.description, severity: rule.severity },
    ]);

    const createArg = (deps.campaignRepository.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createArg.metadata.ai.complianceReview.requiresManualReview).toHaveLength(1);
    expect(createArg.metadata.ai.complianceReview.requiresManualReview[0].ruleKey).toBe(rule.ruleKey);
    expect(createArg.metadata.ai.complianceReview.passed).toBe(true);
  });

  it('CampaignRepository.create se llama exactamente una vez en el flujo exitoso', async () => {
    const deps = makeDeps();

    await generateCampaignDraftWithAI(makeInput(), deps);

    expect(deps.campaignRepository.create).toHaveBeenCalledTimes(1);
  });

  it('rechaza brief vacío con VALIDATION_ERROR, sin tocar ningún repositorio', async () => {
    const deps = makeDeps();

    const result = await generateCampaignDraftWithAI(makeInput({ brief: '' }), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(deps.clientRepository.findById).not.toHaveBeenCalled();
  });

  it('propaga el error del repositorio si create falla', async () => {
    const deps = makeDeps({
      campaignRepository: makeCampaignRepo({
        create: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'db error' })),
      }),
    });

    const result = await generateCampaignDraftWithAI(makeInput(), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
    expect(deps.logger.error).toHaveBeenCalled();
  });
});
