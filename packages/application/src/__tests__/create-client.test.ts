import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClient } from '../use-cases/clients/create-client.use-case';
import { ok, err, isOk, isErr, paginate } from '@bop-agency/shared';
import type { LoggerPort } from '../ports/logger.port';
import type { ClientRepository, Client } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';

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

function makeRepo(overrides: Partial<ClientRepository> = {}): ClientRepository {
  return {
    findById: vi
      .fn()
      .mockResolvedValue(err({ ok: false, code: 'NOT_FOUND', message: 'Not found' })),
    findAll: vi.fn().mockResolvedValue(paginate([], 0, { page: 1, pageSize: 20 })),
    findBySlug: vi
      .fn()
      .mockResolvedValue(err({ ok: false, code: 'NOT_FOUND', message: 'Not found' })),
    create: vi.fn().mockResolvedValue(ok(makeClient())),
    update: vi.fn(),
    delete: vi.fn(),
    softDelete: vi.fn(),
    findByIdWithDocuments: vi.fn(),
    listContacts: vi.fn(),
    listDocuments: vi.fn(),
    getDocumentByKey: vi.fn(),
    upsertDocument: vi.fn(),
    listIntegrations: vi.fn(),
    ...overrides,
  };
}

describe('createClient use case', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea un cliente correctamente', async () => {
    const repo = makeRepo();

    const result = await createClient(
      {
        organizationId: 'org_1' as OrganizationId,
        name: 'Restaurante Demo',
        industry: 'hospitality',
        createdBy: 'user_1',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it('rechaza si el nombre está vacío', async () => {
    const repo = makeRepo();

    const result = await createClient(
      {
        organizationId: 'org_1' as OrganizationId,
        name: '',
        createdBy: 'user_1',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rechaza si el slug ya existe en la organización', async () => {
    const existingClient = makeClient({ slug: 'test-client' });
    const repo = makeRepo({
      findBySlug: vi.fn().mockResolvedValue(ok(existingClient)),
    });

    const result = await createClient(
      {
        organizationId: 'org_1' as OrganizationId,
        name: 'Test Client',
        slug: 'test-client',
        createdBy: 'user_1',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('CONFLICT');
    }
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('genera slug automáticamente desde el nombre', async () => {
    let capturedSlug = '';
    const repo = makeRepo({
      create: vi.fn().mockImplementation(async (input) => {
        capturedSlug = input.slug ?? '';
        return ok(makeClient({ slug: input.slug }));
      }),
    });

    await createClient(
      {
        organizationId: 'org_1' as OrganizationId,
        name: 'Restaurante El Buen Sabor',
        createdBy: 'user_1',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(capturedSlug).toBe('restaurante-el-buen-sabor');
  });

  it('acepta un slug explícito', async () => {
    let capturedSlug = '';
    const repo = makeRepo({
      create: vi.fn().mockImplementation(async (input) => {
        capturedSlug = input.slug ?? '';
        return ok(makeClient({ slug: input.slug }));
      }),
    });

    await createClient(
      {
        organizationId: 'org_1' as OrganizationId,
        name: 'Demo Restaurant',
        slug: 'mi-slug-personalizado',
        createdBy: 'user_1',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(capturedSlug).toBe('mi-slug-personalizado');
  });

  it('llama logger.debug y logger.info en flujo exitoso', async () => {
    const repo = makeRepo();

    await createClient(
      {
        organizationId: 'org_1' as OrganizationId,
        name: 'Demo',
        createdBy: 'user_1',
      },
      { clientRepository: repo, logger: mockLogger },
    );

    expect(mockLogger.debug).toHaveBeenCalledWith('createClient', expect.any(Object));
    expect(mockLogger.info).toHaveBeenCalledWith('createClient: created', expect.any(Object));
  });
});
