import { describe, it, expect, vi } from 'vitest';
import { listClients } from '../use-cases/clients/list-clients.use-case';
import { paginate, isOk } from '@bop-agency/shared';
import type { LoggerPort } from '../ports/logger.port';
import type { ClientRepository, Client } from '@bop-agency/domain';

const mockLogger: LoggerPort = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

const demoClient: Client = {
  id: 'client_1' as Client['id'],
  organizationId: 'org_1' as Client['organizationId'],
  name: 'Cliente Demo',
  legalName: null,
  slug: 'cliente-demo',
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
};

const mockRepo: ClientRepository = {
  findById: vi.fn(),
  findAll: vi.fn().mockResolvedValue(paginate([demoClient], 1, { page: 1, pageSize: 20 })),
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

describe('listClients use case', () => {
  it('returns a paginated list of clients', async () => {
    const result = await listClients(
      { filter: {}, pagination: { page: 1, pageSize: 20 } },
      { clientRepository: mockRepo, logger: mockLogger },
    );

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.data).toHaveLength(1);
      expect(result.value.total).toBe(1);
      expect(result.value.data[0]?.name).toBe('Cliente Demo');
    }
  });

  it('calls logger.debug', async () => {
    await listClients(
      { filter: {}, pagination: {} },
      { clientRepository: mockRepo, logger: mockLogger },
    );
    expect(mockLogger.debug).toHaveBeenCalledWith('listClients', expect.any(Object));
  });
});
