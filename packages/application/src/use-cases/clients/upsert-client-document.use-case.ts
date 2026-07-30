import { err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { ClientId, ClientDocument, ClientRepository } from '@bop-agency/domain';
import { clientNotFound } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import { upsertClientDocumentSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type UpsertClientDocumentUseCaseInput = {
  readonly clientId: ClientId;
  readonly organizationId: OrganizationId;
  readonly documentKey: string;
  readonly title: string;
  readonly category?: string;
  readonly content: string;
  readonly status?: string;
  readonly createdBy: string;
  readonly updatedBy: string;
  /** Control de concurrencia optimista. NULL = sin verificación. */
  readonly expectedVersion?: number | null;
};

export type UpsertClientDocumentDeps = {
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function upsertClientDocument(
  input: UpsertClientDocumentUseCaseInput,
  deps: UpsertClientDocumentDeps,
): Promise<Result<ClientDocument>> {
  deps.logger.debug('upsertClientDocument', {
    clientId: input.clientId,
    key: input.documentKey,
  });

  // Validate schema
  const parsed = upsertClientDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }

  // Verify the client exists
  const clientResult = await deps.clientRepository.findById(input.clientId, input.organizationId);
  if (!isOk(clientResult)) {
    return err(clientNotFound(input.clientId));
  }

  const result = await deps.clientRepository.upsertDocument(input.clientId, input.organizationId, {
    documentKey: parsed.data.documentKey,
    title: parsed.data.title,
    category: parsed.data.category,
    content: parsed.data.content,
    status: parsed.data.status,
    createdBy: input.createdBy,
    updatedBy: input.updatedBy,
    expectedVersion: input.expectedVersion ?? null,
  });

  if (!isOk(result)) {
    deps.logger.error('upsertClientDocument: repository error', { error: result });
    return result;
  }

  deps.logger.info('upsertClientDocument: saved', {
    clientId: input.clientId,
    key: input.documentKey,
    version: result.value.version,
  });

  return result;
}
