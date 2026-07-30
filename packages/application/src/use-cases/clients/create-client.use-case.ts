import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Client, ClientRepository, CreateClientInput } from '@bop-agency/domain';
import { clientSlugTaken } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import { createClientSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type CreateClientUseCaseInput = {
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly legalName?: string | null;
  readonly slug?: string;
  readonly status?: string;
  readonly industry?: string | null;
  readonly timezone?: string;
  readonly currency?: string;
  readonly website?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly createdBy: string;
};

export type CreateClientDeps = {
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function createClient(
  input: CreateClientUseCaseInput,
  deps: CreateClientDeps,
): Promise<Result<Client>> {
  deps.logger.debug('createClient', { organizationId: input.organizationId, name: input.name });

  // Validate
  const parsed = createClientSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }

  const data = parsed.data;

  // Generate slug if not provided
  const slug = (input.slug?.trim() ?? slugify(data.name)).slice(0, 100);

  // Check slug uniqueness within org
  const existing = await deps.clientRepository.findBySlug(slug, input.organizationId);
  if (isOk(existing)) {
    return err(clientSlugTaken(slug));
  }

  const createInput: CreateClientInput = {
    organizationId: input.organizationId,
    name: data.name,
    legalName: data.legalName ?? null,
    slug,
    status: data.status,
    industry: data.industry ?? null,
    timezone: data.timezone,
    currency: data.currency,
    website: data.website ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
    notes: data.notes ?? null,
    metadata: data.metadata,
    createdBy: input.createdBy,
  };

  const result = await deps.clientRepository.create(createInput);
  if (!isOk(result)) {
    deps.logger.error('createClient: repository error', { error: result });
    return result;
  }

  deps.logger.info('createClient: created', { clientId: result.value.id, slug });
  return ok(result.value);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
