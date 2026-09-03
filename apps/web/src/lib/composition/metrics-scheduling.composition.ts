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

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const metaMetricsAdapter = new MetaMetricsAdapter({
    getAccessToken: async (organizationId, providerAccountId, clientIntegrationId) => {
      const effectiveIntegrationId =
        clientIntegrationId || (providerAccountId && UUID_REGEX.test(providerAccountId) ? providerAccountId : null);

      if (!effectiveIntegrationId) {
        return err({
          category: 'AUTH_FAILURE',
          message: `No valid client integration UUID provided for Meta Ads credentials (providerAccountId='${providerAccountId}')`,
          isRetryable: false,
        });
      }

      const tokenData = await credentialRepository.resolvePageAccessToken(effectiveIntegrationId);
      if (!tokenData?.pageAccessToken) {
        return err({
          category: 'AUTH_FAILURE',
          message: `Meta credentials not found for client integration ${effectiveIntegrationId}`,
          isRetryable: false,
        });
      }

      if (tokenData.organizationId !== organizationId) {
        return err({
          category: 'AUTH_FAILURE',
          message: `Tenant mismatch: credential organization '${tokenData.organizationId}' does not match request organization '${organizationId}'`,
          isRetryable: false,
        });
      }

      return ok(tokenData.pageAccessToken);
    },
  });

  const googleMetricsAdapter = new GoogleMetricsAdapter({
    getCredentials: async (organizationId, providerAccountId, clientIntegrationId) => {
      const effectiveIntegrationId =
        clientIntegrationId || (providerAccountId && UUID_REGEX.test(providerAccountId) ? providerAccountId : null);

      if (!effectiveIntegrationId) {
        return err({
          category: 'AUTH_FAILURE',
          message: `No valid client integration UUID provided for Google Ads credentials (providerAccountId='${providerAccountId}')`,
          isRetryable: false,
        });
      }

      const credData = await credentialRepository.resolveGoogleRefreshToken(effectiveIntegrationId);
      if (!credData?.refreshToken) {
        return err({
          category: 'AUTH_FAILURE',
          message: `Google Ads refresh token not found for client integration ${effectiveIntegrationId}`,
          isRetryable: false,
        });
      }

      if (credData.organizationId !== organizationId) {
        return err({
          category: 'AUTH_FAILURE',
          message: `Tenant mismatch: credential organization '${credData.organizationId}' does not match request organization '${organizationId}'`,
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
          activationRepository,
          logger: consoleLogger,
        }),
      executeMetricsSyncBatch: (input: Parameters<typeof executeMetricsSyncBatch>[0]) =>
        executeMetricsSyncBatch(input, {
          syncStateRepository,
          snapshotRepository,
          providerRegistry,
          activationRepository,
          logger: consoleLogger,
        }),
    },

  };
}
