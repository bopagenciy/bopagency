import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabasePendingConnectionRepository } from '../supabase-pending-connection.repository';

describe('SupabasePendingConnectionRepository (Phase 9B.6B)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = {
      ...originalEnv,
      META_CREDENTIAL_ENCRYPTION_KEY: 'a1'.repeat(32), // valid 32-byte hex key
    };
  });

  it('stores both pages and adAccounts with properly encrypted credentials', async () => {
    let capturedConnRow: Record<string, unknown> | null = null;
    let capturedResourceRows: Array<Record<string, unknown>> = [];

    const mockClient = {
      from: vi.fn((table: string) => {
        if (table === 'pending_oauth_connections') {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              capturedConnRow = row;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'pending-conn-123' },
                    error: null,
                  }),
                }),
              };
            }),
          };
        }
        if (table === 'pending_oauth_resources') {
          return {
            insert: vi.fn((rows: Array<Record<string, unknown>>) => {
              capturedResourceRows = rows;
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    const repo = new SupabasePendingConnectionRepository(mockClient);

    const result = await repo.createPendingSession({
      organizationId: 'org-1',
      clientId: 'cli-1',
      userId: 'user-1',
      pages: [
        {
          page_id: 'page-100',
          page_name: 'Brand Facebook Page',
          page_access_token: 'raw-page-token-secret',
          instagram_account_id: 'ig-200',
          instagram_username: 'brand_ig',
        },
      ],
      adAccounts: [
        {
          id: 'act_300400',
          canonicalAdAccountId: '300400',
          name: 'Brand Ad Account',
          account_status: 1,
          currency: 'USD',
          timezone_name: 'America/New_York',
        },
      ],
      userAccessToken: 'raw-user-token-with-ads-read',
      ttlMinutes: 15,
    });

    expect(result.pendingConnectionId).toBe('pending-conn-123');
    expect(capturedConnRow).toMatchObject({
      organization_id: 'org-1',
      client_id: 'cli-1',
      user_id: 'user-1',
      provider: 'meta',
    });

    expect(capturedResourceRows).toHaveLength(2);

    // Page row
    const pageRow = capturedResourceRows[0];
    expect(pageRow?.['page_id']).toBe('page-100');
    expect(pageRow?.['page_name']).toBe('Brand Facebook Page');
    expect(pageRow?.['encrypted_page_token']).not.toBe('raw-page-token-secret');
    expect(pageRow?.['iv']).toBeDefined();
    expect(pageRow?.['auth_tag']).toBeDefined();

    // Ad Account row
    const adRow = capturedResourceRows[1];
    expect(adRow?.['page_id']).toBe('300400');
    expect(adRow?.['page_name']).toBe('Brand Ad Account');
    expect(adRow?.['instagram_account_id']).toBe('USD');
    expect(adRow?.['instagram_username']).toBe('America/New_York');
    expect(adRow?.['encrypted_page_token']).not.toBe('raw-user-token-with-ads-read');
    expect(adRow?.['iv']).toBeDefined();
    expect(adRow?.['auth_tag']).toBeDefined();
  });
});
