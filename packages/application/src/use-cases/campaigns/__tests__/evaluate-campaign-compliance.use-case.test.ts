/**
 * evaluateCampaignCompliance use case — tests unitarios (Phase 7C).
 *
 * Cubre: carga la campaña, consulta reglas aplicables usando clientId/
 * platform DE LA CAMPAÑA (no del input del caller), delega la evaluación
 * determinística al dominio, campaña inexistente/otra organización, y
 * propagación de errores del repositorio de reglas. Dado que el evaluador
 * de dominio aún no produce violaciones reales (ver compliance-rule.ts),
 * este use case es puramente informativo y NUNCA bloquea nada.
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluateCampaignCompliance } from '../evaluate-campaign-compliance.use-case';
import type { EvaluateCampaignComplianceInput } from '../evaluate-campaign-compliance.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  ComplianceRule,
  ComplianceRuleId,
  ComplianceRuleRepository,
  OrganizationId,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

const ORG_ID = 'org-uuid-1' as OrganizationId;
const CAMPAIGN_ID = 'campaign-uuid-1' as CampaignId;

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    organizationId: ORG_ID,
    clientId: 'client_1' as Campaign['clientId'],
    name: 'Campaña de Verano',
    platform: 'meta_ads',
    objective: 'lead_generation',
    status: 'review',
    brief: null,
    budget: 5000000,
    currency: 'COP',
    startDate: null,
    endDate: null,
    generatedContent: null,
    metadata: {},
    createdBy: 'user_1',
    updatedBy: null,
    submittedForReviewAt: new Date('2026-08-02'),
    approvedAt: null,
    rejectedAt: null,
    createdAt: new Date('2026-08-01'),
    updatedAt: new Date('2026-08-02'),
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
    description: 'Toda campaña de salud debe incluir disclaimer.',
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

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeCampaignRepo(overrides: Partial<CampaignRepository> = {}): CampaignRepository {
  return {
    findById: vi.fn().mockResolvedValue(ok(makeCampaign())),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    ...overrides,
  };
}

function makeComplianceRuleRepo(
  overrides: Partial<ComplianceRuleRepository> = {},
): ComplianceRuleRepository {
  return {
    findApplicableRules: vi.fn().mockResolvedValue(ok([makeRule()])),
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<EvaluateCampaignComplianceInput> = {},
): EvaluateCampaignComplianceInput {
  return { campaignId: CAMPAIGN_ID, organizationId: ORG_ID, ...overrides };
}

describe('evaluateCampaignCompliance use case', () => {
  it('evalúa la campaña con las reglas aplicables y no bloquea (passed siempre true hoy)', async () => {
    const campaignRepository = makeCampaignRepo();
    const complianceRuleRepository = makeComplianceRuleRepo();

    const result = await evaluateCampaignCompliance(makeInput(), {
      campaignRepository,
      complianceRuleRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.passed).toBe(true);
      expect(result.value.violations).toEqual([]);
      expect(result.value.requiresManualReview).toHaveLength(1);
      expect(result.value.requiresManualReview[0]?.ruleKey).toBe('meta_disclaimer_required');
    }
  });

  it('consulta reglas aplicables usando clientId/platform de la campaña cargada', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi
        .fn()
        .mockResolvedValue(ok(makeCampaign({ clientId: 'client_9' as Campaign['clientId'], platform: 'google_ads' }))),
    });
    const complianceRuleRepository = makeComplianceRuleRepo();

    await evaluateCampaignCompliance(makeInput(), {
      campaignRepository,
      complianceRuleRepository,
      logger: makeLogger(),
    });

    expect(complianceRuleRepository.findApplicableRules).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      clientId: 'client_9',
      platform: 'google_ads',
    });
  });

  it('retorna NOT_FOUND si la campaña no existe / es de otra organización', async () => {
    const campaignRepository = makeCampaignRepo({
      findById: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'Campaign not found' })),
    });
    const complianceRuleRepository = makeComplianceRuleRepo();

    const result = await evaluateCampaignCompliance(makeInput(), {
      campaignRepository,
      complianceRuleRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(complianceRuleRepository.findApplicableRules).not.toHaveBeenCalled();
  });

  it('rechaza campaignId vacío con VALIDATION_ERROR', async () => {
    const campaignRepository = makeCampaignRepo();
    const complianceRuleRepository = makeComplianceRuleRepo();

    const result = await evaluateCampaignCompliance(makeInput({ campaignId: '' }), {
      campaignRepository,
      complianceRuleRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(campaignRepository.findById).not.toHaveBeenCalled();
  });

  it('propaga error del repositorio de reglas', async () => {
    const campaignRepository = makeCampaignRepo();
    const complianceRuleRepository = makeComplianceRuleRepo({
      findApplicableRules: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'db error' })),
    });

    const result = await evaluateCampaignCompliance(makeInput(), {
      campaignRepository,
      complianceRuleRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('descarta reglas inactivas / de otra plataforma vía el evaluador de dominio', async () => {
    const campaignRepository = makeCampaignRepo();
    const complianceRuleRepository = makeComplianceRuleRepo({
      findApplicableRules: vi
        .fn()
        .mockResolvedValue(
          ok([
            makeRule({ ruleKey: 'active_meta', active: true, platform: 'meta_ads' }),
            makeRule({ ruleKey: 'inactive_rule', active: false, platform: 'meta_ads' }),
            makeRule({ ruleKey: 'other_platform', active: true, platform: 'google_ads' }),
          ]),
        ),
    });

    const result = await evaluateCampaignCompliance(makeInput(), {
      campaignRepository,
      complianceRuleRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const keys = result.value.requiresManualReview.map((r) => r.ruleKey);
      expect(keys).toEqual(['active_meta']);
    }
  });
});
