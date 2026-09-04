import { describe, it, expect, vi } from 'vitest';
import {
  testMetaConnection,
  type TestMetaConnectionInput,
  type TestMetaConnectionDeps,
} from '../test-meta-connection.use-case';

describe('testMetaConnection use case (Phase 9B.7B)', () => {
  const defaultInput: TestMetaConnectionInput = {
    organizationId: 'org-123',
    clientId: 'client-456',
    clientIntegrationId: 'integration-789',
    actorUserId: 'user-001',
    fetchSampleMetrics: true,
  };

  const mockDeps: TestMetaConnectionDeps = {
    organizationRepository: {
      findMember: vi.fn().mockResolvedValue({ role: 'admin' }),
    },
    clientRepository: {
      findById: vi.fn().mockResolvedValue({ id: 'client-456', organization_id: 'org-123'
      }),
    },
    integrationRepository: {
      findById: vi.fn().mockResolvedValue({
        id: 'integration-789',
        organization_id: 'org-123',
        client_id: 'client-456',
        provider: 'meta',
        external_account_id: 'act_123456789',
        status: 'active',
      }),
    },
    credentialRepository: {
      resolvePageAccessToken: vi.fn().mockResolvedValue({ pageAccessToken: 'EAA_secret_token_123'
      }),
    },
    metaGraphApiClient: {
      getAdAccountDetails: vi.fn().mockResolvedValue({
        id: 'act_123456789',
        account_id: '123456789',
        name: 'Legalink Colombia AdAccount',
        account_status: 1,
        currency: 'COP',
        timezone_name: 'America/Bogota',
      }),
      discoverAdAccountCampaigns: vi.fn().mockResolvedValue([
        {
          id: 'camp_001',
          name: 'Legalink - Awareness 2026',
          status: 'ACTIVE',
          effective_status: 'ACTIVE',
          objective: 'OUTCOME_AWARENESS',
        },
        {
          id: 'camp_002',
          name: 'Legalink - Leads 2026',
          status: 'PAUSED',
          effective_status: 'PAUSED',
          objective: 'OUTCOME_LEADS',
        },
      ]),
      getSampleCampaignInsights: vi.fn().mockResolvedValue([
        {
          campaign_id: 'camp_001',
          date_start: '2026-09-01',
          date_stop: '2026-09-01',
          spend: '15.5',
          impressions: 1200,
          reach: 900,
          clicks: 45,
          account_currency: 'COP',
        },
      ]),
    },
  };

  it('rejects unauthenticated requests (missing actorUserId)', async () => {
    const res = await testMetaConnection({ ...defaultInput, actorUserId: '' }, mockDeps);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('rejects unauthorized roles (e.g. member/viewer)', async () => {
    const deps = {
      ...mockDeps,
      organizationRepository: {
        findMember: vi.fn().mockResolvedValue({ role: 'viewer' }),
      },
    };
    const res = await testMetaConnection(defaultInput, deps);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('FORBIDDEN');
    }
  });

  it('rejects non-existent client or cross-tenant client', async () => {
    const deps = {
      ...mockDeps,
      clientRepository: {
        findById: vi.fn().mockResolvedValue(null),
      },
    };
    const res = await testMetaConnection(defaultInput, deps);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('NOT_FOUND');
    }
  });

  it('rejects integration that is not meta provider', async () => {
    const deps = {
      ...mockDeps,
      integrationRepository: {
        findById: vi.fn().mockResolvedValue({
          id: 'integration-789',
          organization_id: 'org-123',
          client_id: 'client-456',
          provider: 'google',
          external_account_id: '123-456-7890',
          status: 'active',
        }),
      },
    };
    const res = await testMetaConnection(defaultInput, deps);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('INVALID_STATE');
      expect(res.error.message).toContain('provider must be meta');
    }
  });

  it('rejects integration that is not in active status', async () => {
    const deps = {
      ...mockDeps,
      integrationRepository: {
        findById: vi.fn().mockResolvedValue({
          id: 'integration-789',
          organization_id: 'org-123',
          client_id: 'client-456',
          provider: 'meta',
          external_account_id: 'act_123456789',
          status: 'pending',
        }),
      },
    };
    const res = await testMetaConnection(defaultInput, deps);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('INVALID_STATE');
      expect(res.error.message).toContain("status must be active");
    }
  });

  it('handles decryption failure gracefully', async () => {
    const deps = {
      ...mockDeps,
      credentialRepository: {
        resolvePageAccessToken: vi.fn().mockRejectedValue(new Error('Ciphertext decryption failed: bad auth tag')),
      },
    };
    const res = await testMetaConnection(defaultInput, deps);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('CREDENTIAL_ERROR');
      expect(res.error.message).toContain('Ciphertext decryption failed');
    }
  });

  it('sanitizes token from error message if Meta Graph API throws an error containing access_token', async () => {
    const deps = {
      ...mockDeps,
      metaGraphApiClient: {
        ...mockDeps.metaGraphApiClient,
        getAdAccountDetails: vi.fn().mockRejectedValue(new Error('Graph request failed: https://graph.facebook.com/v21.0/act_123?access_token=SECRET_TOKEN_HERE error')),
      },
    };
    const res = await testMetaConnection(defaultInput, deps);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe('PROVIDER_ERROR');
      expect(res.error.message).not.toContain('SECRET_TOKEN_HERE');
      expect(res.error.message).toContain('access_token=REDACTED');
    }
  });

  it('successfully executes test, discovers campaigns, samples metrics, and never leaks accessToken', async () => {
    const res = await testMetaConnection(defaultInput, mockDeps);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.value.decryptionSucceeded).toBe(true);
      expect(res.value.account.name).toBe('Legalink Colombia AdAccount');
      expect(res.value.campaignsCount).toBe(2);
      expect(res.value.campaigns).toHaveLength(2);
      expect(res.value.campaigns[0]?.name).toBe('Legalink - Awareness 2026');
      expect(res.value.candidateCampaignId).toBe('camp_001');
      expect(res.value.sampleMetrics).toHaveLength(1);
      expect(res.value.sampleMetrics?.[0]?.impressions).toBe(1200);

      const serialized = JSON.stringify(res.value);
      expect(serialized).not.toContain('EAA_secret_token_123');
      expect(serialized).not.toContain('pageAccessToken');
      expect(serialized).not.toContain('accessToken');
    }
  });
});