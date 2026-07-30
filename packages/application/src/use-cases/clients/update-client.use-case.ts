import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Client, ClientId, ClientRepository, UpdateClientInput } from '@bop-agency/domain';
import { clientNotFound } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import { updateClientSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type UpdateClientUseCaseInput = {
  readonly clientId: ClientId;
  readonly organizationId: OrganizationId;
  readonly updatedBy: string;
  readonly name?: string;
  readonly legalName?: string | null;
  readonly status?: string;
  readonly industry?: string | null;
  readonly timezone?: string;
  readonly currency?: string;
  readonly website?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown>;
};

export type UpdateClientDeps = {
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function updateClient(
  input: UpdateClientUseCaseInput,
  deps: UpdateClientDeps,
): Promise<Result<Client>> {
  deps.logger.debug('updateClient', { clientId: input.clientId });

  // Verify the client exists
  const existingResult = await deps.clientRepository.findById(input.clientId, input.organizationId);
  if (!isOk(existingResult)) {
    return err(clientNotFound(input.clientId));
  }

  // Validate the fields being updated
  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }

  const data = parsed.data;
  const updateInput: UpdateClientInput = {
    updatedBy: input.updatedBy,
    ...(data.name !== undefined && { name: data.name }),
    ...(data.legalName !== undefined && { legalName: data.legalName }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.industry !== undefined && { industry: data.industry }),
    ...(data.timezone !== undefined && { timezone: data.timezone }),
    ...(data.currency !== undefined && { currency: data.currency }),
    ...(data.website !== undefined && { website: data.website }),
    ...(data.email !== undefined && { email: data.email }),
    ...(data.phone !== undefined && { phone: data.phone }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.metadata !== undefined && { metadata: data.metadata }),
  };

  const result = await deps.clientRepository.update(
    input.clientId,
    input.organizationId,
    updateInput,
  );

  if (!isOk(result)) {
    deps.logger.error('updateClient: repository error', { error: result });
    return result;
  }

  deps.logger.info('updateClient: updated', { clientId: input.clientId });
  return ok(result.value);
}
