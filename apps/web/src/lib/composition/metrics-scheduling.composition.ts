/**
 * Metrics Scheduling Composition Root — Phase 9B.4.
 *
 * Ensambla los use cases de orquestación runtime de sincronización de métricas
 * (Phase 9B.3/9B.4) para `apps/web`.
 *
 * Usa el cliente `service_role` (adminClient) para ejecución de worker/cron
 * de fondo multi-tenant de manera acotada y segura con Principal del sistema explícito.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ok, err } from '@bop-agency/shared';
import {
  SupabaseCampaignMetricsSyncStateRepository,
  SupabaseCampaignMetricSnapshotRepository,
  SupabaseCredentialRepository,
  SupabaseClientRepository,
  SupabaseCampaignActivationRepository,
  MetaMetricsAdapter,
  GoogleMetricsAdapter,
  consoleLogger,
} from '@bop-agency/infrastructure';
import {
  InMemoryMetricsProviderRegistry,
  executeMetricsSyncBatch,
  executeMetricsSyncTarget,
  listDueMetricsSyncTargets,
} from '@bop-agency/application';

export type MetricsSchedulingWorkerCompositionOptions = {
  readonly workerId?: string;
};

export function createMetricsSchedulingWorkerComposition(
  adminClient: SupabaseClient,
  _options?: MetricsSchedulingWorkerCompositionOptions,
) {
  const syncStateRepository = new SupabaseCampaignMetricsSyncStateRepository(adminClient);
  const snapshotRepository = new SupabaseCampaignMetricSnapshotRepository(adminClient);
  const credentialRepository = new SupabaseCredentialRepository(adminClient);
  const clientRepository = new SupabaseClientRepository(adminClient);
  const activationRepository = new SupabaseCampaignActivationRepository(adminClient);

  const metaMetricsAdapter = new MetaMetricsAdapter({
    getAccessToken: async (_organizationId, providerAccountId) => {
      if (!providerAccountId) {
        return err({
          category: 'AUTH_FAILURE',
          message: 'Provider account ID is required for Meta Ads access token',
          isRetryable: false,
        });
      }
      const tokenData = await credentialRepository.resolvePageAccessToken(providerAccountId);
      if (!tokenData?.pageAccessToken) {
        return err({
          category: 'AUTH_FAILURE',
          message: `Meta credentials not found for provider account ${providerAccountId}`,
          isRetryable: false,
        });
      }
      return ok(tokenData.pageAccessToken);
    },
  });

  const googleMetricsAdapter = new GoogleMetricsAdapter({
    getCredentials: async (_organizationId, providerAccountId) => {
      if (!providerAccountId) {
        return err({
          category: 'AUTH_FAILURE',
          message: 'Provider account ID is required for Google Ads credentials',
          isRetryable: false,
        });
      }
      const credData = await credentialRepository.resolveGoogleRefreshToken(providerAccountId);
      if (!credData?.refreshToken) {
        return err({
          category: 'AUTH_FAILURE',
          message: `Google Ads refresh token not found for provider account ${providerAccountId}`,
          isRetryable: false,
        });
      }
      const developerToken = process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] || '';
      if (!developerToken) {
        return err({
          category: 'AUTH_FAILURE',
          message: 'GOOGLE_ADS_DEVELOPER_TOKEN environment variable is not configured',
          isRetryable: false,
        });
      }
      return ok({
        accessToken: credData.refreshToken,
        developerToken,
      });
    },
  });

  const providerRegistry = new InMemoryMetricsProviderRegistry();
  providerRegistry.register(metaMetricsAdapter);
  providerRegistry.register(googleMetricsAdapter);

  return {
    repositories: {
      syncStateRepository,
      snapshotRepository,
      credentialRepository,
      clientRepository,
      activationRepository,
    },
    adapters: {
      metaMetricsAdapter,
      googleMetricsAdapter,
      providerRegistry,
    },
    useCases: {
      listDueMetricsSyncTargets: (input: Parameters<typeof listDueMetricsSyncTargets>[0]) =>
        listDueMetricsSyncTargets(input, {
          syncStateRepository,
          activationRepository,
          isOrganizationMember: async () => true,
          logger: consoleLogger,
        }),
      executeMetricsSyncTarget: (input: Parameters<typeof executeMetricsSyncTarget>[0]) =>
        executeMetricsSyncTarget(input, {
          syncStateRepository,
          snapshotRepository,
          providerRegistry,
          logger: consoleLogger,
        }),
      executeMetricsSyncBatch: (input: Parameters<typeof executeMetricsSyncBatch>[0]) =>
        executeMetricsSyncBatch(input, {
          syncStateRepository,
          snapshotRepository,
          providerRegistry,
          logger: consoleLogger,
        }),
    },

  };
}
