/**
 * evaluateCampaignCompliance (use case) — Phase 7C.
 *
 * Wrapper delgado: carga la campaña, obtiene las reglas de compliance
 * aplicables (por organización/cliente/plataforma) y delega la evaluación
 * determinística a la función pura de dominio `evaluateCampaignCompliance`.
 * NO bloquea ningún flujo — ver §10 de la tarea: no existe una regla de
 * negocio fijada que exija que compliance bloquee approve en Phase 7C, así
 * que este use case es puramente informativo (expone el resultado para que
 * una UI/7D lo consuma), y `approveCampaign` NO lo invoca.
 *
 * LIMITACIÓN: dado el schema actual de `compliance_rules` (contenido
 * narrativo, no estructurado), el resultado siempre marca las reglas
 * aplicables como `requiresManualReview` — ver la documentación extensa en
 * `packages/domain/src/entities/compliance-rule.ts`.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignId,
  CampaignRepository,
  ComplianceEvaluationResult,
  ComplianceRuleRepository,
} from '@bop-agency/domain';
import { evaluateCampaignCompliance as evaluateCompliance } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import { campaignIdSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type EvaluateCampaignComplianceInput = {
  readonly campaignId: string;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
};

export type EvaluateCampaignComplianceDeps = {
  campaignRepository: CampaignRepository;
  complianceRuleRepository: ComplianceRuleRepository;
  logger: LoggerPort;
};

export async function evaluateCampaignCompliance(
  input: EvaluateCampaignComplianceInput,
  deps: EvaluateCampaignComplianceDeps,
): Promise<Result<ComplianceEvaluationResult>> {
  deps.logger.debug('evaluateCampaignCompliance', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
  });

  const parsed = campaignIdSchema.safeParse(input.campaignId);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const campaignId = parsed.data as CampaignId;

  const campaignResult = await deps.campaignRepository.findById(campaignId, input.organizationId);
  if (!isOk(campaignResult)) {
    return campaignResult;
  }
  const campaign = campaignResult.value;

  const rulesResult = await deps.complianceRuleRepository.findApplicableRules({
    organizationId: input.organizationId,
    clientId: campaign.clientId,
    platform: campaign.platform,
  });
  if (!isOk(rulesResult)) {
    return rulesResult;
  }

  const evaluation = evaluateCompliance(campaign, rulesResult.value);

  deps.logger.info('evaluateCampaignCompliance: ok', {
    campaignId,
    requiresManualReviewCount: evaluation.requiresManualReview.length,
  });

  return ok(evaluation);
}
