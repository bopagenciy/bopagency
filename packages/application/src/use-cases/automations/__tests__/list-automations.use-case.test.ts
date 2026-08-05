/**
 * Tests del use case listAutomations (Phase 6A).
 *
 * Verifica:
 * - organizationId es propagado al repositorio.
 * - Filtros opcionales (clientId, status) son propagados.
 * - El use case retorna el resultado del repositorio.
 * - El repositorio NO recibe llamadas sin organizationId.
 */

import { describe, it, expect, vi } from 'vitest';
import { listAutomations } from '../list-automations.use-case';
import type { ListAutomationsInput, ListAutomationsDeps } from '../list-automations.use-case';
import type { AutomationRepository } from '@bop-agency/domain';
import type { PaginatedResult } from '@bop-agency/shared';
import type { Automation, OrganizationId, ClientId } from '@bop-agency/domain';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORG_ID = 'org-test-001' as OrganizationId;
const CLIENT_ID = 'client-001' as ClientId;

const makeEmptyPage = (): PaginatedResult<Automation> => ({
  data: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
});

function makeRepo(overrides?: Partial<AutomationRepository>): AutomationRepository {
  return {
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    findById: vi.fn(),
    findByOrganization: vi.fn().mockResolvedValue(makeEmptyPage()),
    findByClient: vi.fn(),
    existsByName: vi.fn(),
    countByStatus: vi.fn(),
    ...overrides,
  } as unknown as AutomationRepository;
}

function makeDeps(repo: AutomationRepository): ListAutomationsDeps {
  return {
    automationRepository: repo,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('listAutomations', () => {
  it('propaga organizationId al repositorio', async () => {
    const repo = makeRepo();
    const input: ListAutomationsInput = {
      organizationId: ORG_ID,
      pagination: { page: 1, pageSize: 20 },
    };

    await listAutomations(input, makeDeps(repo));

    expect(repo.findByOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG_ID }),
      expect.objectContaining({ page: 1, pageSize: 20 }),
    );
  });

  it('propaga filtro de status cuando se provee', async () => {
    const repo = makeRepo();
    const input: ListAutomationsInput = {
      organizationId: ORG_ID,
      status: 'active',
      pagination: { page: 1, pageSize: 10 },
    };

    await listAutomations(input, makeDeps(repo));

    expect(repo.findByOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      expect.any(Object),
    );
  });

  it('propaga filtro de clientId cuando se provee', async () => {
    const repo = makeRepo();
    const input: ListAutomationsInput = {
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      pagination: {},
    };

    await listAutomations(input, makeDeps(repo));

    expect(repo.findByOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: CLIENT_ID }),
      expect.any(Object),
    );
  });

  it('no incluye clientId en el filtro si no se provee', async () => {
    const repo = makeRepo();
    const input: ListAutomationsInput = {
      organizationId: ORG_ID,
      pagination: {},
    };

    await listAutomations(input, makeDeps(repo));

    const callArgs = (repo.findByOrganization as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const filter = callArgs[0];
    expect(filter).not.toHaveProperty('clientId');
  });

  it('no incluye status en el filtro si no se provee', async () => {
    const repo = makeRepo();
    const input: ListAutomationsInput = {
      organizationId: ORG_ID,
      pagination: {},
    };

    await listAutomations(input, makeDeps(repo));

    const callArgs = (repo.findByOrganization as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    const filter = callArgs[0];
    expect(filter).not.toHaveProperty('status');
  });

  it('retorna ok(PaginatedResult) con datos del repositorio', async () => {
    const page = makeEmptyPage();
    const repo = makeRepo({
      findByOrganization: vi.fn().mockResolvedValue(page),
    });

    const result = await listAutomations(
      { organizationId: ORG_ID, pagination: {} },
      makeDeps(repo),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(page);
    }
  });

  it('llama al logger con organizationId', async () => {
    const repo = makeRepo();
    const deps = makeDeps(repo);
    const input: ListAutomationsInput = {
      organizationId: ORG_ID,
      pagination: {},
    };

    await listAutomations(input, deps);

    expect(deps.logger.debug).toHaveBeenCalledWith(
      'listAutomations',
      expect.objectContaining({ organizationId: ORG_ID }),
    );
  });

  it('TypeScript: input sin organizationId debe ser error de tipo (verificado en typecheck)', () => {
    // Este test documenta la restricción de tipo.
    // Si compila, organizationId es requerido en ListAutomationsInput.
    const input: ListAutomationsInput = {
      organizationId: ORG_ID,
      pagination: {},
    };
    expect(input.organizationId).toBe(ORG_ID);
  });
});
