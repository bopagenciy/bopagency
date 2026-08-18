/**
 * generateCampaignDraftWithAI — presupuesto y nombre (Phase 7D.1.1).
 *
 * REGRESIONES DEL SMOKE REAL CON GEMINI:
 *  (a) la campaña generada mostraba presupuesto $0 pese a haberse ingresado uno;
 *  (b) el nombre de la campaña era un párrafo narrativo entero.
 *
 * Estos tests recorren la cadena completa de la capa de aplicación —
 * validación Zod → use case → payload exacto enviado a
 * `CampaignRepository.create()` — que es donde se decide lo que se persiste.
 *
 * Cobertura:
 *   D1. un presupuesto no nulo sobrevive intacto hasta el INSERT
 *   D2. el presupuesto persistido es el del formulario, NUNCA algo derivado de la IA
 *   D3. decimales y montos grandes sobreviven sin pérdida
 *   D4. un budget nulo/vacío se rechaza en vez de persistirse como 0
 *   D5. el presupuesto también sobrevive en el objeto enviado al puerto de IA
 *   D6. el nombre del usuario se preserva tal cual
 *   D7. sin nombre de usuario, el nombre se deriva CONCISO del concepto
 *   D8. el nombre persistido nunca es el párrafo completo
 *   D9. currency del formulario también se preserva
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
  CreateCampaignInput,
  OrganizationId,
  OrganizationMember,
  OrganizationRepository,
  MetaAdsGeneratedContent,
} from '@bop-agency/domain';
import {
  AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH,
  GENERATED_CONTENT_SCHEMA_VERSION,
} from '@bop-agency/domain';
import { generateCampaignDraftWithAI } from '../generate-campaign-draft-with-ai.use-case';
import type { GenerateCampaignDraftWithAiInput } from '../generate-campaign-draft-with-ai.use-case';
import type { LoggerPort } from '../../../ports/logger.port';
import type {
  CampaignGeneratorPort,
  GenerateCampaignInput,
  GeneratedCampaignResult,
} from '../../../ports/campaign-generator.port';

const ORG_ID = 'org-uuid-1' as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as Client['id'];
const ACTOR_ID = 'user-uuid-1';

/** Concepto realista devuelto por el modelo — un párrafo, no un titular. */
const NARRATIVE_CONCEPT =
  'Campaña de generación de leads para clínicas dentales en Bogotá que posiciona la ' +
  'primera consulta gratuita como puerta de entrada, apoyándose en testimonios de ' +
  'pacientes reales y en una promesa de agenda flexible para profesionales ocupados.';

function makeClient(): Client {
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
    brief: 'Brief',
    budget: 5_000_000,
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
    createdAt: new Date('2026-08-18'),
    updatedAt: new Date('2026-08-18'),
    ...overrides,
  };
}

function makeMember(): OrganizationMember {
  return {
    id: 'member-1',
    organizationId: ORG_ID,
    userId: ACTOR_ID,
    role: 'operator',
    status: 'active',
    invitedBy: null,
    joinedAt: new Date('2026-01-01'),
  };
}

function makeMetaContent(concept: string): MetaAdsGeneratedContent {
  return {
    schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
    platform: 'meta_ads',
    language: 'es',
    campaignConcept: concept,
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
    callsToAction: ['Agenda tu cita'],
    landingPageRecommendations: ['Formulario simple'],
    complianceNotes: [],
    assumptions: [],
  };
}

function makeGenerationResult(concept = NARRATIVE_CONCEPT): GeneratedCampaignResult {
  return {
    content: makeMetaContent(concept),
    metadata: {
      provider: 'gemini',
      model: 'gemini-3.6-flash',
      promptVersion: 'campaign-builder-v1',
      schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
      generatedAt: '2026-08-18T00:00:00.000Z',
      tokenUsage: { inputTokens: 500, outputTokens: 300, totalTokens: 800 },
      latencyMs: 4200,
    },
  };
}

function makeDeps(concept = NARRATIVE_CONCEPT) {
  const campaignRepository: CampaignRepository = {
    findById: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn().mockResolvedValue(ok(makeCampaign())),
    update: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
  };
  const campaignGeneratorPort: CampaignGeneratorPort = {
    generate: vi.fn().mockResolvedValue(ok(makeGenerationResult(concept))),
  };
  const logger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  return {
    campaignRepository,
    clientRepository: {
      findById: vi.fn().mockResolvedValue(ok(makeClient())),
      getDocumentByKey: vi.fn().mockResolvedValue(ok(null)),
    } as unknown as ClientRepository,
    complianceRuleRepository: {
      findApplicableRules: vi.fn().mockResolvedValue(ok([])),
    } as unknown as ComplianceRuleRepository,
    organizationRepository: {
      findMember: vi.fn().mockResolvedValue(ok(makeMember())),
    } as unknown as OrganizationRepository,
    campaignGeneratorPort,
    logger,
  };
}

function baseInput(
  overrides: Partial<GenerateCampaignDraftWithAiInput> = {},
): GenerateCampaignDraftWithAiInput {
  return {
    clientId: CLIENT_ID,
    platform: 'meta_ads',
    objective: 'lead_generation',
    brief: 'Clínica dental en Bogotá, primera consulta gratuita.',
    budget: 5_000_000,
    currency: 'COP',
    organizationId: ORG_ID,
    actorUserId: ACTOR_ID,
    ...overrides,
  };
}

/** Payload exacto con el que se llamó a `CampaignRepository.create()`. */
function persistedInput(repo: CampaignRepository): CreateCampaignInput {
  const calls = (repo.create as unknown as { mock: { calls: CreateCampaignInput[][] } }).mock.calls;
  const first = calls[0];
  if (first === undefined || first[0] === undefined) {
    throw new Error('campaignRepository.create no fue invocado');
  }
  return first[0];
}

function sentToGenerator(port: CampaignGeneratorPort): GenerateCampaignInput {
  const calls = (port.generate as unknown as { mock: { calls: GenerateCampaignInput[][] } }).mock
    .calls;
  const first = calls[0];
  if (first === undefined || first[0] === undefined) {
    throw new Error('campaignGeneratorPort.generate no fue invocado');
  }
  return first[0];
}

describe('generateCampaignDraftWithAI — presupuesto (regresión 7D.1.1)', () => {
  it('D1: un presupuesto no nulo sobrevive intacto hasta el INSERT', async () => {
    const deps = makeDeps();

    const result = await generateCampaignDraftWithAI(baseInput({ budget: 5_000_000 }), deps);

    expect(result.success).toBe(true);
    expect(persistedInput(deps.campaignRepository).budget).toBe(5_000_000);
  });

  it('D2: el presupuesto persistido es el del formulario, no algo derivado de la IA', async () => {
    const deps = makeDeps();

    await generateCampaignDraftWithAI(baseInput({ budget: 1_234_567 }), deps);

    const persisted = persistedInput(deps.campaignRepository);
    expect(persisted.budget).toBe(1_234_567);
    expect(persisted.budget).not.toBe(0);
  });

  it('D3: decimales y montos grandes sobreviven sin pérdida', async () => {
    for (const budget of [0.5, 999.99, 12_345_678.9]) {
      const deps = makeDeps();
      await generateCampaignDraftWithAI(baseInput({ budget }), deps);
      expect(persistedInput(deps.campaignRepository).budget).toBe(budget);
    }
  });

  it('D4: un budget nulo o vacío se rechaza en vez de persistirse como 0', async () => {
    for (const badBudget of [null, undefined, '', '   ', false, []]) {
      const deps = makeDeps();

      const result = await generateCampaignDraftWithAI(
        baseInput({ budget: badBudget as unknown as number }),
        deps,
      );

      expect(result.success, JSON.stringify(badBudget)).toBe(false);
      if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(deps.campaignRepository.create).not.toHaveBeenCalled();
    }
  });

  it('D5: el presupuesto también llega correcto al puerto de IA (contexto del prompt)', async () => {
    const deps = makeDeps();

    await generateCampaignDraftWithAI(baseInput({ budget: 7_500_000 }), deps);

    expect(sentToGenerator(deps.campaignGeneratorPort).budget).toBe(7_500_000);
  });

  it('D9: la moneda del formulario también se preserva', async () => {
    const deps = makeDeps();

    await generateCampaignDraftWithAI(baseInput({ budget: 900, currency: 'USD' }), deps);

    expect(persistedInput(deps.campaignRepository).currency).toBe('USD');
  });
});

describe('generateCampaignDraftWithAI — nombre (regresión 7D.1.1)', () => {
  it('D6: el nombre proporcionado por el usuario se preserva tal cual', async () => {
    const deps = makeDeps();

    await generateCampaignDraftWithAI(
      baseInput({ name: 'Temporada alta — Meta Ads' }),
      deps,
    );

    expect(persistedInput(deps.campaignRepository).name).toBe('Temporada alta — Meta Ads');
  });

  it('D7: sin nombre de usuario, se deriva un título conciso del concepto', async () => {
    const deps = makeDeps();

    await generateCampaignDraftWithAI(baseInput(), deps);

    const { name } = persistedInput(deps.campaignRepository);
    expect(name.length).toBeGreaterThan(0);
    expect(name.length).toBeLessThanOrEqual(AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH);
  });

  it('D8: el nombre persistido nunca es el párrafo de concepto completo', async () => {
    const deps = makeDeps();

    await generateCampaignDraftWithAI(baseInput(), deps);

    const { name } = persistedInput(deps.campaignRepository);
    expect(name).not.toBe(NARRATIVE_CONCEPT);
    expect(name.length).toBeLessThan(NARRATIVE_CONCEPT.length);
  });

  it('D8b: un concepto que ya es un titular corto se usa tal cual, sin truncar', async () => {
    const deps = makeDeps('Leads dentales Bogotá');

    await generateCampaignDraftWithAI(baseInput(), deps);

    expect(persistedInput(deps.campaignRepository).name).toBe('Leads dentales Bogotá');
  });
});
