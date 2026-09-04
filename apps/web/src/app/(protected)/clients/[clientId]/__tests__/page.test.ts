import { describe, it, expect, vi, beforeEach } from 'vitest';
import ClientDetailPage from '../page';

const mockRequireOrganization = vi.fn();
vi.mock('@/lib/auth/server', () => ({
  requireOrganization: () => mockRequireOrganization(),
}));

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

vi.mock('@/components/layout/Header', () => ({
  Header: () => ({ type: 'header' }),
}));

vi.mock('@/components/clients/ClientStatusBadge', () => ({
  ClientStatusBadge: () => ({ type: 'badge' }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => ({
    type: 'a',
    props: { href, children },
  }),
}));

const mockSupabaseFrom = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: (table: string) => mockSupabaseFrom(table),
  })),
}));

describe('ClientDetailPage — Integrations Section (Phase 9B.6E)', () => {
  const orgId = 'org-legalink-colombia-123';
  const clientId = 'cli-legalink-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMocks({
    role = 'operator',
    client = { id: clientId, organization_id: orgId, name: 'Legalink Colombia', status: 'active' },
    integrations = [] as Array<Record<string, unknown>>,
  }) {
    mockRequireOrganization.mockResolvedValue({
      user: { id: 'usr-1', email: 'operator@bopagency.co' },
      organization: { id: orgId, name: 'BopAgency Org' },
      membership: { role },
    });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'clients') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: client }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'client_contacts' || table === 'client_documents') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: [] }),
                  }),
                }),
                order: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
          }),
        };
      }
      if (table === 'client_integrations') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: integrations }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      };
    });
  }

  it('renders both Google Ads and Meta connection buttons when canManage is true and Meta is not connected', async () => {
    setupMocks({ role: 'operator', integrations: [] });

    const jsx = await ClientDetailPage({ params: Promise.resolve({ clientId }) });
    const stringified = JSON.stringify(jsx);

    // Google Ads button must be present
    expect(stringified).toContain('+ Conectar Google Ads');
    expect(stringified).toContain(
      `/api/auth/oauth/google/start?organizationId=${orgId}&clientId=${clientId}&intent=connect`,
    );

    // Meta connection button must be present alongside Google
    expect(stringified).toContain('+ Conectar Meta');
    expect(stringified).toContain(
      `/api/auth/oauth/meta/start?organizationId=${orgId}&clientId=${clientId}&redirect=true`,
    );
  });

  it('renders "Meta conectada" and Reconectar link when Meta is already connected and active', async () => {
    setupMocks({
      role: 'admin',
      integrations: [
        {
          id: 'int-meta-789',
          organization_id: orgId,
          client_id: clientId,
          provider: 'meta',
          external_account_id: 'act_1020304050',
          status: 'active',
          configuration: { account_name: 'Legalink Meta Ads' },
        },
      ],
    });

    const jsx = await ClientDetailPage({ params: Promise.resolve({ clientId }) });
    const stringified = JSON.stringify(jsx);

    // Top action bar shows "Meta conectada" instead of duplicate "+ Conectar Meta"
    expect(stringified).toContain('Meta conectada');
    expect(stringified).not.toContain('+ Conectar Meta');

    // Google Ads button remains available
    expect(stringified).toContain('+ Conectar Google Ads');

    // Integrations list shows active Meta row and Reconectar action
    expect(stringified).toContain('act_1020304050');
    expect(stringified).toContain('Legalink Meta Ads');
    expect(stringified).toContain('Reconectar');
    expect(stringified).toContain(
      `/api/auth/oauth/meta/start?organizationId=${orgId}&clientId=${clientId}&redirect=true`,
    );
  });

  it('does not render connection buttons when user has viewer role', async () => {
    setupMocks({ role: 'viewer', integrations: [] });

    const jsx = await ClientDetailPage({ params: Promise.resolve({ clientId }) });
    const stringified = JSON.stringify(jsx);

    expect(stringified).not.toContain('+ Conectar Google Ads');
    expect(stringified).not.toContain('+ Conectar Meta');
  });

  it('triggers notFound when client does not belong to the active organization', async () => {
    setupMocks({ role: 'admin', client: null as unknown as { id: string; organization_id: string; name: string; status: string } });

    await expect(
      ClientDetailPage({ params: Promise.resolve({ clientId: 'wrong-client-id' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
