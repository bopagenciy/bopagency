/**
 * ArchiveAutomation use case — Phase 6E
 *
 * Transiciona una automatización a archived (estado final).
 * Idempotente: archivar una ya archivada retorna ok sin error.
 *
 * Roles permitidos: admin, owner (verificado en Server Action).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AutomationId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { AutomationRepository } from '@bop-agency/domain';
import { canArchiveAutomation, automationInvalidTransition } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ArchiveAutomationInput = {
  readonly automationId: AutomationId;
  readonly organizationId: OrganizationId;
};

export type ArchiveAutomationDeps = {
  automationRepository: AutomationRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function archiveAutomation(
  input: ArchiveAutomationInput,
  deps: ArchiveAutomationDeps,
): Promise<Result<void>> {
  deps.logger.debug('archiveAutomation', {
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
  if (automation.status === 'archived') return ok(undefined);

  if (!canArchiveAutomation(automation.status)) {
    return err(automationInvalidTransition(automation.status, 'archived'));
  }

  return deps.automationRepository.archive(input.automationId, input.organizationId);
}
