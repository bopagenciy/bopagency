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

import { TestMetaConnectionButton } from '@/components/clients/TestMetaConnectionButton';

vi.mock('@/components/clients/TestMetaConnectionButton', () => ({
  TestMetaConnectionButton: vi.fn(),
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

type ReactLikeNode = {
  type?: unknown;
  props?: {
    children?: unknown;
    [key: string]: unknown;
  };
};

function findElement(
  node: unknown,
  predicate: (node: ReactLikeNode) => boolean,
): ReactLikeNode | null {
  if (!node) return null;
  if (typeof node === 'object' && predicate(node as ReactLikeNode)) return node as ReactLikeNode;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  const candidate = node as ReactLikeNode;
  if (candidate.props?.children) {
    return findElement(candidate.props.children, predicate);
  }
  return null;
}

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

    // Integrations list shows active Meta row, TestMetaConnectionButton, and Reconectar action
    expect(stringified).toContain('act_1020304050');
    expect(stringified).toContain('Legalink Meta Ads');
    expect(stringified).toContain('Reconectar');
    expect(stringified).toContain(
      `/api/auth/oauth/meta/start?organizationId=${orgId}&clientId=${clientId}&redirect=true`,
    );

    // Verify TestMetaConnectionButton element is present with correct scoped props
    const testButton = findElement(jsx, (node) => node?.type === TestMetaConnectionButton);
    expect(testButton).toBeDefined();
    expect(testButton.props).toEqual({
      organizationId: orgId,
      clientId,
      clientIntegrationId: 'int-meta-789',
    });
  });

  it('does not render connection buttons or test connection button when user has viewer role', async () => {
    setupMocks({
      role: 'viewer',
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

    expect(stringified).not.toContain('+ Conectar Google Ads');
    expect(stringified).not.toContain('+ Conectar Meta');
    expect(stringified).not.toContain('Reconectar');

    const testButton = findElement(jsx, (node) => node?.type === TestMetaConnectionButton);
    expect(testButton).toBeNull();
  });

  it('triggers notFound when client does not belong to the active organization', async () => {
    setupMocks({ role: 'admin', client: null as unknown as { id: string; organization_id: string; name: string; status: string } });

    await expect(
      ClientDetailPage({ params: Promise.resolve({ clientId: 'wrong-client-id' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  describe('OAuth Feedback Banners (Phase 9B.6G)', () => {
    it('renders error alert banner visibly when searchParams.error is provided', async () => {
      setupMocks({ role: 'admin' });

      const jsx = await ClientDetailPage({
        params: Promise.resolve({ clientId }),
        searchParams: Promise.resolve({ error: 'No Facebook Pages or Meta Ad Accounts found for this account' }),
      });
      const stringified = JSON.stringify(jsx);

      expect(stringified).toContain('Error de integración:');
      expect(stringified).toContain('No Facebook Pages or Meta Ad Accounts found for this account');
    });

    it('renders success status banner when searchParams.integration is connected', async () => {
      setupMocks({ role: 'admin' });

      const jsx = await ClientDetailPage({
        params: Promise.resolve({ clientId }),
        searchParams: Promise.resolve({ integration: 'connected' }),
      });
      const stringified = JSON.stringify(jsx);

      expect(stringified).toContain('Integración conectada:');
      expect(stringified).toContain('La integración fue vinculada y guardada exitosamente.');
    });

    it('does not render error or success banners when searchParams is empty or absent', async () => {
      setupMocks({ role: 'admin' });

      const jsx = await ClientDetailPage({
        params: Promise.resolve({ clientId }),
      });
      const stringified = JSON.stringify(jsx);

      expect(stringified).not.toContain('Error de integración:');
      expect(stringified).not.toContain('Integración conectada:');
    });
  });
});
