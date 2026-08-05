/**
 * PauseAutomation use case — Phase 6E
 *
 * Transiciona una automatización de active → paused.
 * Idempotente: pausar una ya pausada retorna la automatización sin error.
 *
 * Roles permitidos: operator+ (verificado en Server Action).
 */

import { err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Automation, AutomationId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { AutomationRepository } from '@bop-agency/domain';
import { canPauseAutomation, automationInvalidTransition } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PauseAutomationInput = {
  readonly automationId: AutomationId;
  readonly organizationId: OrganizationId;
};

export type PauseAutomationDeps = {
  automationRepository: AutomationRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function pauseAutomation(
  input: PauseAutomationInput,
  deps: PauseAutomationDeps,
): Promise<Result<Automation>> {
  deps.logger.debug('pauseAutomation', {
    automationId: input.automationId,
    organizationId: input.organizationId,
  });

  const fetchResult = await deps.automationRepository.findById(
    input.automationId,
    input.organizationId,
  );
  if (!fetchResult.success) return fetchResult;

  const automation = fetchResult.value;

  // Idempotent
  if (automation.status === 'paused') return fetchResult;

  if (!canPauseAutomation(automation.status)) {
    return err(automationInvalidTransition(automation.status, 'paused'));
  }

  return deps.automationRepository.update(input.automationId, input.organizationId, {
    status: 'paused',
  });
}
