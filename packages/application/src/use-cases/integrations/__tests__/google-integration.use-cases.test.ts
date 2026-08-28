import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { connectGoogleIntegration } from '../connect-google-integration.use-case';
import { getPendingGoogleResources } from '../get-pending-google-resources.use-case';
import { finalizeGoogleConnection } from '../finalize-google-connection.use-case';
import { disconnectGoogleIntegration } from '../disconnect-google-integration.use-case';

describe('Google Integration Use Cases', () => {
  const orgId = '11111111-1111-1111-1111-111111111111';
  const clientId = '22222222-2222-2222-2222-222222222222';
  const userId = '33333333-3333-3333-3333-333333333333';
  const pendingId = '44444444-4444-4444-4444-444444444444';
  const resourceId = '55555555-5555-5555-5555-555555555555';

  describe('connectGoogleIntegration', () => {
    it('rejects non-strategist role', async () => {
      const mockSupabase = {} as SupabaseClient;
      const deps = {
        organizationRepository: {
          findMember: vi.fn().mockResolvedValue({ role: 'operator' }),
        },
      };

      const result = await connectGoogleIntegration(
        mockSupabase,
        {
          organizationId: orgId,
          clientId,
          actorUserId: userId,
          redirectUri: 'https://example.com/callback',
          clientIdGoogle: 'google-client-id-xyz',
        },
        deps,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FORBIDDEN');
      }
    });

    it('generates state nonce and returns Google authorization URL for strategist role', async () => {
      const insertFn = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        from: vi.fn().mockReturnValue({ insert: insertFn }),
      } as unknown as SupabaseClient;

      const deps = {
        organizationRepository: {
          findMember: vi.fn().mockResolvedValue({ role: 'strategist' }),
        },
      };

      const result = await connectGoogleIntegration(
        mockSupabase,
        {
          organizationId: orgId,
          clientId,
          actorUserId: userId,
          redirectUri: 'https://example.com/callback',
          clientIdGoogle: 'google-client-id-xyz',
        },
        deps,
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
        expect(result.value.authUrl).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fadwords');
        expect(result.value.authUrl).toContain('prompt=consent');
      }
    });
  });

  describe('getPendingGoogleResources', () => {
    it('rejects non-strategist role', async () => {
      const mockSupabase = {} as SupabaseClient;
      const deps = {
        organizationRepository: {
          findMember: vi.fn().mockResolvedValue({ role: 'viewer' }),
        },
      };

      const result = await getPendingGoogleResources(
        mockSupabase,
        {
          pendingConnectionId: pendingId,
          organizationId: orgId,
          clientId,
          actorUserId: userId,
        },
        deps,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('finalizeGoogleConnection', () => {
    it('rejects user downgraded to operator before finalize', async () => {
      const mockSupabase = {} as SupabaseClient;
      const deps = {
        organizationRepository: {
          findMember: vi.fn().mockResolvedValue({ role: 'operator' }),
        },
      };

      const result = await finalizeGoogleConnection(
        mockSupabase,
        {
          pendingConnectionId: pendingId,
          selectedResourceId: resourceId,
          organizationId: orgId,
          clientId,
          actorUserId: userId,
        },
        deps,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FORBIDDEN');
      }
    });
  });

  describe('disconnectGoogleIntegration', () => {
    it('rejects non-strategist role', async () => {
      const mockSupabase = {} as SupabaseClient;
      const deps = {
        organizationRepository: {
          findMember: vi.fn().mockResolvedValue({ role: 'operator' }),
        },
      };

      const result = await disconnectGoogleIntegration(
        mockSupabase,
        {
          clientIntegrationId: 'int-123',
          organizationId: orgId,
          clientId,
          actorUserId: userId,
        },
        deps,
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('FORBIDDEN');
      }
    });
  });
});
