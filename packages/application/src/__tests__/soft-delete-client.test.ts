import { describe, it, expect, vi, beforeEach } from 'vitest';
import { softDeleteClient } from '../use-cases/clients/soft-delete-client.use-case';
import { ok, err, isOk, isErr } from '@bop-agency/shared';
import type { LoggerPort } from '../ports/logger.port';
import type { ClientRepository, Client } from '@bop-agency/domain';
import type { OrganizationId, OrganizationRole } from '@bop-agency/domain';
import { paginate } from '@bop-agency/shared';

const mockLogger: LoggerPort = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function makeClient(overrides: Partial<Client> = {}): Client {
  return {
    id: 'client_1' as Client['id'],
    organizationId: 'org_1' as Client['organizationId'],
    name: 'Test Client',
    legalName: null,
    slug: 'test-client',
    status: 'active',
    industry: 'retail',
    timezone: 'America/Bogota',
    currency: 'COP',
    website: null,
    email: null,
    phone: null,
    notes: null,
    metadata: {},
    createdBy: 'user_1',
    updatedBy: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    deletedBy: null,
    ...overrides,
  };
}

function makeRepo(client: Client): ClientRepository {
  const deletedClient = { ...client, deletedAt: new Date(), deletedBy: 'admin_1' };
  return {
    findById: vi.fn().mockResolvedValue(ok(client)),
    findAll: vi.fn().mockResolvedValue(paginate([], 0, { page: 1, pageSize: 20 })),
    findBySlug: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn().mockResolvedValue(ok(deletedClient)),
    findByIdWithDocuments: vi.fn(),
    listContacts: vi.fn(),
    listDocuments: vi.fn(),
    getDocumentByKey: vi.fn(),
    upsertDocument: vi.fn(),
    listIntegrations: vi.fn(),
  };
}

describe('softDeleteClient use case', () => {
  beforeEach(() => vi.clearAllMocks());

  it('elimina el cliente si el caller es admin', async () => {
    const client = makeClient();
    const repo = makeRepo(client);

    const result = await softDeleteClient(
      {
        clientId: client.id,
        organizationId: 'org_1' as OrganizationId,
        deletedBy: 'admin_1',
        callerRole: 'admin',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(repo.softDelete).toHaveBeenCalledOnce();
  });

  it('elimina el cliente si el caller es owner', async () => {
    const client = makeClient();
    const repo = makeRepo(client);

    const result = await softDeleteClient(
      {
        clientId: client.id,
        organizationId: 'org_1' as OrganizationId,
        deletedBy: 'owner_1',
        callerRole: 'owner',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(isOk(result)).toBe(true);
  });

  it('rechaza si el caller es operator (role insuficiente)', async () => {
    const client = makeClient();
    const repo = makeRepo(client);

    const result = await softDeleteClient(
      {
        clientId: client.id,
        organizationId: 'org_1' as OrganizationId,
        deletedBy: 'operator_1',
        callerRole: 'operator' as OrganizationRole,
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('rechaza si el cliente ya está eliminado', async () => {
    const deletedClient = makeClient({ deletedAt: new Date() });
    const repo = makeRepo(deletedClient);

    const result = await softDeleteClient(
      {
        clientId: deletedClient.id,
        organizationId: 'org_1' as OrganizationId,
        deletedBy: 'admin_1',
        callerRole: 'admin',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('rechaza si el cliente no existe', async () => {
    const notFoundErr = err({
      ok: false as const,
      code: 'NOT_FOUND' as const,
      message: 'Not found',
    });
    const repo: ClientRepository = {
      findById: vi.fn().mockResolvedValue(notFoundErr),
      findAll: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
      findByIdWithDocuments: vi.fn(),
      listContacts: vi.fn(),
      listDocuments: vi.fn(),
      getDocumentByKey: vi.fn(),
      upsertDocument: vi.fn(),
      listIntegrations: vi.fn(),
    };

    const result = await softDeleteClient(
      {
        clientId: 'nonexistent' as Client['id'],
        organizationId: 'org_1' as OrganizationId,
        deletedBy: 'admin_1',
        callerRole: 'admin',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(isErr(result)).toBe(true);
  });
});
