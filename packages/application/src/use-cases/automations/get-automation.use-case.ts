/**
 * GetAutomation use case — Phase 6E
 *
 * Obtiene una automatización por ID dentro de la organización.
 * Requiere organizationId para garantizar aislamiento multi-tenant.
 */

import type { Result } from '@bop-agency/shared';
import type { Automation, AutomationId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { AutomationRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GetAutomationInput = {
  readonly automationId: AutomationId;
  readonly organizationId: OrganizationId;
};

export type GetAutomationDeps = {
  automationRepository: AutomationRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function getAutomation(
  input: GetAutomationInput,
  deps: GetAutomationDeps,
): Promise<Result<Automation>> {
  deps.logger.debug('getAutomation', {
    automationId: input.automationId,
    organizationId: input.organizationId,
  });

  return deps.automationRepository.findById(input.automationId, input.organizationId);
}
