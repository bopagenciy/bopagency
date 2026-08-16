/**
 * getApplicableComplianceRules use case — tests unitarios (Phase 7C).
 *
 * Cubre: delega correctamente en ComplianceRuleRepository.findApplicableRules
 * con organizationId SIEMPRE resuelto del input del servidor, solo agrega
 * clientId/platform/jurisdiction al filtro cuando el caller los provee,
 * rechaza platform inválida, y propaga errores del repositorio.
 */

import { describe, it, expect, vi } from 'vitest';
import { getApplicableComplianceRules } from '../get-applicable-compliance-rules.use-case';
import type { GetApplicableComplianceRulesInput } from '../get-applicable-compliance-rules.use-case';
import { ok, err } from '@bop-agency/shared';
import type {
  ClientId,
  ComplianceRule,
  ComplianceRuleId,
  ComplianceRuleRepository,
  OrganizationId,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

const ORG_ID = 'org-uuid-1' as OrganizationId;

function makeRule(overrides: Partial<ComplianceRule> = {}): ComplianceRule {
  return {
    id: 'rule-uuid-1' as ComplianceRuleId,
    organizationId: null,
    clientId: null,
    platform: null,
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

function makeComplianceRuleRepo(
  overrides: Partial<ComplianceRuleRepository> = {},
): ComplianceRuleRepository {
  return {
    findApplicableRules: vi.fn().mockResolvedValue(ok([makeRule()])),
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<GetApplicableComplianceRulesInput> = {},
): GetApplicableComplianceRulesInput {
  return { organizationId: ORG_ID, ...overrides };
}

describe('getApplicableComplianceRules use case', () => {
  it('delega en el repositorio con solo organizationId cuando no hay filtros adicionales', async () => {
    const complianceRuleRepository = makeComplianceRuleRepo();

    const result = await getApplicableComplianceRules(makeInput(), {
      complianceRuleRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(true);
    expect(complianceRuleRepository.findApplicableRules).toHaveBeenCalledWith({
      organizationId: ORG_ID,
    });
  });

  it('incluye clientId/platform/jurisdiction en el filtro cuando se proveen', async () => {
    const complianceRuleRepository = makeComplianceRuleRepo();

    const result = await getApplicableComplianceRules(
      makeInput({ clientId: 'client_1', platform: 'meta_ads', jurisdiction: 'CO' }),
      { complianceRuleRepository, logger: makeLogger() },
    );

    expect(result.success).toBe(true);
    expect(complianceRuleRepository.findApplicableRules).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      clientId: 'client_1' as ClientId,
      platform: 'meta_ads',
      jurisdiction: 'CO',
    });
  });

  it('rechaza una plataforma inválida con VALIDATION_ERROR', async () => {
    const complianceRuleRepository = makeComplianceRuleRepo();

    const result = await getApplicableComplianceRules(
      makeInput({ platform: 'myspace_ads' } as unknown as Partial<GetApplicableComplianceRulesInput>),
      { complianceRuleRepository, logger: makeLogger() },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
    expect(complianceRuleRepository.findApplicableRules).not.toHaveBeenCalled();
  });

  it('nunca acepta organizationId del filtro del caller (siempre usa el del input del servidor)', async () => {
    const complianceRuleRepository = makeComplianceRuleRepo();

    await getApplicableComplianceRules(makeInput(), {
      complianceRuleRepository,
      logger: makeLogger(),
    });

    const callArg = (complianceRuleRepository.findApplicableRules as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(callArg?.organizationId).toBe(ORG_ID);
  });

  it('propaga error del repositorio', async () => {
    const complianceRuleRepository = makeComplianceRuleRepo({
      findApplicableRules: vi.fn().mockResolvedValue(err({ code: 'INTERNAL_ERROR', message: 'db error' })),
    });

    const result = await getApplicableComplianceRules(makeInput(), {
      complianceRuleRepository,
      logger: makeLogger(),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});
