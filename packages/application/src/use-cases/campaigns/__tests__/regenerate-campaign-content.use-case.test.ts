/**
 * regenerateCampaignContent use case — tests unitarios (Phase 7D).
 *
 * Cubre (§17 / §13 de la especificación):
 * - Regeneración exitosa sobre campaña 'draft'.
 * - Rechaza campañas en cualquier status distinto de 'draft'
 *   (review/approved/rejected/active/paused/completed).
 * - Operator permitido, viewer rechazado.
 * - Campaña de otra organización → NOT_FOUND.
 * - Cliente inactivo → VALIDATION_ERROR.
 * - Reutiliza brief/objective/budget/plataforma de la campaña YA persistida
 *   (no del input del caller).
 * - Overrides opcionales de language/market; si se omiten, reutiliza los de
 *   metadata.ai de la generación previa.
 * - Fallo del proveedor de IA → NO llama a update() (no destruye el
 *   generated_content previo).
 * - Output inválido/platform mismatch → NO llama a update().
 * - CampaignRepository.update se llama exactamente una vez en el flujo exitoso.
 */

import { describe, it, expect, vi } from 'vitest';
import { regenerateCampaignContent } from '../regenerate-campaign-content.use-case';
import type { RegenerateCampaignContentInput } from '../regenerate-campaign-content.use-case';
import { ok, err } from '@bop-agency/shared';
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
  AlertRepository,
  TaskRepository,
  Alert,
} from '@bop-agency/domain';
import { GENERATED_CONTENT_SCHEMA_VERSION, aiProviderFailure } from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';
import type { CampaignGeneratorPort, GeneratedCampaignResult } from '../../../ports/campaign-generator.port';

const ORG_ID = 'org-uuid-1' as OrganizationId;
const OTHER_ORG_ID = 'org-uuid-2' as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as Client['id'];
const CAMPAIGN_ID = 'campaign-uuid-1' as CampaignId;
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
    name: 'AI draft previo',
    platform: 'meta_ads',
    objective: 'lead_generation',
    status: 'draft',
    brief: 'Brief original ya persistido',
    budget: 5000000,
    currency: 'COP',
    startDate: null,
    endDate: null,
    generatedContent: { schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION, platform: 'meta_ads' },
    metadata: {
      ai: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        promptVersion: 'campaign-builder-v1',
        schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
        generatedAt: '2026-08-01T00:00:00.000Z',
        language: 'es',
        complianceReview: { passed: true, requiresManualReview: [] },
      },
    },
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

function makeMetaContent(overrides: Partial<MetaAdsGeneratedContent> = {}): MetaAdsGeneratedContent {
  return {
    schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
    platform: 'meta_ads',
    language: 'es',
    campaignConcept: 'Concepto regenerado',
    targetAudience: 'Audiencia objetivo',
    valueProposition: 'Propuesta de valor',
    messaging: ['Mensaje clave 1'],
    adSets: [
      {
        name: 'Ad Set 1',
        audienceType: 'warm',
        targetingSummary: 'Resumen de segmentación',
        placementSuggestions: ['Feed'],
        creatives: [
          {
            hook: 'Gancho nuevo',
            headline: 'Titular nuevo',
            primaryText: 'Texto principal nuevo',
            format: 'video',
            visualSuggestion: 'Sugerencia visual nueva',
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

function makeGenerationResult(overrides: Partial<GeneratedCampaignResult> = {}): GeneratedCampaignResult {
  return {
    content: makeMetaContent(),
    metadata: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      promptVersion: 'campaign-builder-v1',
      schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
      generatedAt: '2026-08-16T00:00:00.000Z',
      tokenUsage: { inputTokens: 400, outputTokens: 250, totalTokens: 650 },
      latencyMs: 900,
    },
    ...overrides,
  };
}

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeCampaignRepo(overrides: Partial<CampaignRepository> = {}): CampaignRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeCampaign())),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue(ok(makeCampaign({ generatedContent: makeMetaContent() as unknown as Record<string, unknown> }))),
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

function makeInput(overrides: Partial<RegenerateCampaignContentInput> = {}): RegenerateCampaignContentInput {
  return { campaignId: CAMPAIGN_ID, organizationId: ORG_ID, actorUserId: ACTOR_ID, ...overrides };
}

function makeDeps(overrides: Partial<Parameters<typeof regenerateCampaignContent>[1]> = {}) {
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

describe('regenerateCampaignContent use case', () => {
  it('regenera el contenido de una campaña draft correctamente', async () => {
    const deps = makeDeps();

    const result = await regenerateCampaignContent(makeInput(), deps);

    expect(result.success).toBe(true);
    expect(deps.campaignRepository.update).toHaveBeenCalledOnce();
    const updateArg = (deps.campaignRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];
    expect(updateArg.generatedContent.campaignConcept).toBe('Concepto regenerado');
  });

  it('reutiliza brief/objective/budget/platform de la campaña persistida, no del input', async () => {
    const deps = makeDeps();

    await regenerateCampaignContent(makeInput(), deps);

    const generateArg = (deps.campaignGeneratorPort.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(generateArg.brief).toBe('Brief original ya persistido');
    expect(generateArg.platform).toBe('meta_ads');
    expect(generateArg.budget).toBe(5000000);
  });

  it('rechaza campañas en status distinto de draft', async () => {
    for (const status of ['review', 'approved', 'rejected', 'active', 'paused', 'completed'] as const) {
      const deps = makeDeps({
        campaignRepository: makeCampaignRepo({ findById: vi.fn().mockResolvedValue(ok(makeCampaign({ status }))) }),
      });

      const result = await regenerateCampaignContent(makeInput(), deps);

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(deps.campaignGeneratorPort.generate).not.toHaveBeenCalled();
      expect(deps.campaignRepository.update).not.toHaveBeenCalled();
    }
  });

  it('permite a operator/strategist/admin/owner regenerar', async () => {
    for (const role of ['operator', 'strategist', 'admin', 'owner'] as const) {
      const deps = makeDeps({
        organizationRepository: makeOrgRepo({ findMember: vi.fn().mockResolvedValue(ok(makeMember(role))) }),
      });
      const result = await regenerateCampaignContent(makeInput(), deps);
      expect(result.success).toBe(true);
    }
  });

  it('rechaza a viewer con FORBIDDEN', async () => {
    const deps = makeDeps({
      organizationRepository: makeOrgRepo({ findMember: vi.fn().mockResolvedValue(ok(makeMember('viewer'))) }),
    });

    const result = await regenerateCampaignContent(makeInput(), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('FORBIDDEN');
    expect(deps.campaignRepository.findById).not.toHaveBeenCalled();
  });

  it('retorna NOT_FOUND si la campaña no existe / es de otra organización', async () => {
    const deps = makeDeps({
      campaignRepository: makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'not found' })),
      }),
    });

    const result = await regenerateCampaignContent(makeInput({ organizationId: OTHER_ORG_ID }), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
    expect(deps.campaignRepository.update).not.toHaveBeenCalled();
  });

  it('rechaza si el cliente está inactivo', async () => {
    const deps = makeDeps({
      clientRepository: makeClientRepo({
        findById: vi.fn().mockResolvedValue(ok(makeClient({ status: 'inactive' }))),
      }),
    });

    const result = await regenerateCampaignContent(makeInput(), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(deps.campaignRepository.update).not.toHaveBeenCalled();
  });

  it('rechaza si la campaña no tiene brief', async () => {
    const deps = makeDeps({
      campaignRepository: makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(ok(makeCampaign({ brief: null }))),
      }),
    });

    const result = await regenerateCampaignContent(makeInput(), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
    expect(deps.campaignGeneratorPort.generate).not.toHaveBeenCalled();
  });

  it('usa language/market override del input si se proveen', async () => {
    const deps = makeDeps();

    await regenerateCampaignContent(makeInput({ language: 'en', market: 'US' }), deps);

    const generateArg = (deps.campaignGeneratorPort.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(generateArg.language).toBe('en');
    expect(generateArg.market).toBe('US');
  });

  it('reutiliza language de metadata.ai previa si no se provee override', async () => {
    const deps = makeDeps();

    await regenerateCampaignContent(makeInput(), deps);

    const generateArg = (deps.campaignGeneratorPort.generate as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(generateArg.language).toBe('es');
  });

  it('NO llama a update() si el proveedor de IA falla (no destruye el generated_content previo)', async () => {
    const deps = makeDeps({
      campaignGeneratorPort: makeGeneratorPort({
        generate: vi.fn().mockResolvedValue(err({ code: 'EXTERNAL_SERVICE_ERROR', message: 'AI provider request failed' })),
      }),
    });

    const result = await regenerateCampaignContent(makeInput(), deps);

    expect(result.success).toBe(false);
    expect(deps.campaignRepository.update).not.toHaveBeenCalled();
  });

  it('NO llama a update() si el output tiene platform distinto al de la campaña', async () => {
    const deps = makeDeps({
      campaignGeneratorPort: makeGeneratorPort({
        generate: vi.fn().mockResolvedValue(
          ok(
            makeGenerationResult({
              content: {
                ...makeMetaContent(),
                platform: 'google_ads' as unknown as 'meta_ads',
              },
            }),
          ),
        ),
      }),
    });

    const result = await regenerateCampaignContent(makeInput(), deps);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(deps.campaignRepository.update).not.toHaveBeenCalled();
  });

  it('CampaignRepository.update se llama exactamente una vez en el flujo exitoso, sin crear una nueva campaña', async () => {
    const deps = makeDeps();

    await regenerateCampaignContent(makeInput(), deps);

    expect(deps.campaignRepository.update).toHaveBeenCalledTimes(1);
    expect(deps.campaignRepository.create).not.toHaveBeenCalled();
  });

  it('preserva claves de metadata no relacionadas con "ai"', async () => {
    const deps = makeDeps({
      campaignRepository: makeCampaignRepo({
        findById: vi.fn().mockResolvedValue(
          ok(makeCampaign({ metadata: { ai: { language: 'es' }, customFlag: true } })),
        ),
      }),
    });

    await regenerateCampaignContent(makeInput(), deps);

    const updateArg = (deps.campaignRepository.update as ReturnType<typeof vi.fn>).mock.calls[0]?.[2];
    expect(updateArg.metadata.customFlag).toBe(true);
  });
});

describe('Phase 7F — AI provider failure alert on regenerate (existing campaign)', () => {
  function makeAlertRepository(overrides: Partial<AlertRepository> = {}): AlertRepository {
    return {
      findById: vi.fn(),
      findByOrganization: vi.fn(),
      findActiveByOrganization: vi.fn(),
      findByClient: vi.fn(),
      countBySeverity: vi.fn(),
      acknowledge: vi.fn(),
      resolve: vi.fn(),
      upsertByAlertKey: vi.fn().mockResolvedValue(ok({ alert: {} as Alert, created: true })),
      findActiveByAlertKey: vi.fn(),
      resolveActiveByAlertKeyPrefixes: vi.fn(),
      ...overrides,
    } as unknown as AlertRepository;
  }

  it('scopes the alert by the EXISTING campaignId (not by client) since the campaign already exists', async () => {
    const alertRepository = makeAlertRepository();
    const deps = makeDeps({
      alertRepository,
      taskRepository: { findActiveBySignatureTag: vi.fn(), create: vi.fn() } as unknown as TaskRepository,
      campaignGeneratorPort: makeGeneratorPort({
        generate: vi.fn().mockResolvedValue(err(aiProviderFailure('provider unreachable'))),
      }),
    });

    const result = await regenerateCampaignContent(makeInput(), deps);

    expect(result.success).toBe(false);
    expect(alertRepository.upsertByAlertKey).toHaveBeenCalledOnce();
    const alertArgs = (alertRepository.upsertByAlertKey as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      alertKey: string;
      metadata: Record<string, unknown>;
    };
    expect(alertArgs.alertKey).toBe(`campaign:${ORG_ID}:${CAMPAIGN_ID}:ai-provider-failure:AI_EXTERNAL_SERVICE_ERROR`);
    // Smoke bug fix regression: el actor real propagado, nunca inventado.
    expect(alertArgs.metadata['actorUserId']).toBe(ACTOR_ID);
  });

  it('does not persist the regeneration when the provider fails, regardless of the alert side effect', async () => {
    const alertRepository = makeAlertRepository();
    const deps = makeDeps({
      alertRepository,
      campaignGeneratorPort: makeGeneratorPort({
        generate: vi.fn().mockResolvedValue(err(aiProviderFailure('provider unreachable'))),
      }),
    });

    const result = await regenerateCampaignContent(makeInput(), deps);

    expect(result.success).toBe(false);
    expect(deps.campaignRepository.update).not.toHaveBeenCalled();
  });
});
