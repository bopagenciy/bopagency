/**
 * getApplicableComplianceRules — Phase 7C.
 *
 * Lectura pura: delega en ComplianceRuleRepository.findApplicableRules, que
 * ya resuelve scope (global/organización/cliente) y precedencia. No hace
 * falta ningún chequeo de rol adicional — la policy `compliance_rules_select`
 * (Phase 7B) ya permite a cualquier miembro autenticado leer las reglas
 * aplicables a su organización, y las globales a cualquier autenticado.
 * organizationId SIEMPRE viene de la sesión del servidor, nunca del cliente
 * — el resto de filtros (clientId/platform/jurisdiction) sí puede
 * proveerlos el caller.
 */

import { err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { ClientId, ComplianceRule, ComplianceRuleRepository } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { AdPlatform } from '@bop-agency/shared';
import { complianceRuleFilterSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type GetApplicableComplianceRulesInput = {
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  readonly clientId?: string;
  readonly platform?: AdPlatform;
  readonly jurisdiction?: string;
};

export type GetApplicableComplianceRulesDeps = {
  complianceRuleRepository: ComplianceRuleRepository;
  logger: LoggerPort;
};

export async function getApplicableComplianceRules(
  input: GetApplicableComplianceRulesInput,
  deps: GetApplicableComplianceRulesDeps,
): Promise<Result<ComplianceRule[]>> {
  deps.logger.debug('getApplicableComplianceRules', {
    organizationId: input.organizationId,
    clientId: input.clientId,
    platform: input.platform,
  });

  const parsed = complianceRuleFilterSchema.safeParse({
    clientId: input.clientId,
    platform: input.platform,
    jurisdiction: input.jurisdiction,
  });
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }

  return deps.complianceRuleRepository.findApplicableRules({
    organizationId: input.organizationId,
    ...(parsed.data.clientId !== undefined && { clientId: parsed.data.clientId as ClientId }),
    ...(parsed.data.platform !== undefined && { platform: parsed.data.platform }),
    ...(parsed.data.jurisdiction !== undefined && { jurisdiction: parsed.data.jurisdiction }),
  });
}
