/**
 * ActivateAutomation use case — Phase 6E
 *
 * Transiciona una automatización de draft/paused → active.
 * Valida la transición antes de persistir.
 * Idempotente: activar una ya activa retorna la automatización sin error.
 *
 * Roles permitidos: admin, owner (verificado en Server Action).
 * Multi-tenancy: organizationId siempre de la sesión del servidor.
 */

import { err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Automation, AutomationId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { AutomationRepository } from '@bop-agency/domain';
import { canActivateAutomation, automationInvalidTransition } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivateAutomationInput = {
  readonly automationId: AutomationId;
  readonly organizationId: OrganizationId;
};

export type ActivateAutomationDeps = {
  automationRepository: AutomationRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function activateAutomation(
  input: ActivateAutomationInput,
  deps: ActivateAutomationDeps,
): Promise<Result<Automation>> {
  deps.logger.debug('activateAutomation', {
    automationId: input.automationId,
    organizationId: input.organizationId,
  });

  // 1. Fetch automation (NOT_FOUND if not in org)
  const fetchResult = await deps.automationRepository.findById(
    input.automationId,
    input.organizationId,
  );
  if (!fetchResult.success) return fetchResult;

  const automation = fetchResult.value;

  // 2. Idempotent: already active
  if (automation.status === 'active') return fetchResult;

  // 3. Validate transition
  if (!canActivateAutomation(automation.status)) {
    return err(automationInvalidTransition(automation.status, 'active'));
  }

  // 4. Persist
  return deps.automationRepository.update(input.automationId, input.organizationId, {
    status: 'active',
  });
}
