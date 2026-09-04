/**
 * test-meta-connection.use-case.ts — Phase 9B.7B.
 *
 * Caso de uso reutilizable de servidor para verificar la conexión de una integración de Meta:
 * Resuelve la credencial cifrada en base de datos, ejecuta `decryptCredential` en servidor,
 * y realiza consultas LECTURA PURA hacia Meta Graph API para validar la cuenta y descubrir campañas.
 *
 * SEGURIDAD ESTRICTA:
 * - NUNCA retorna el token ni lo expone en logs ni en la respuesta.
 * - 100% lectura pura: CERO escrituras a la base de datos (no persiste campañas, targets ni métricas).
 * - Exige verificación multi-tenant en capas: membresía de organización, rol de gestión,
 *   coherencia de cliente e integración activa de Meta.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';

export type MetaAdAccountDetails = {
  readonly id: string;
  readonly canonicalAdAccountId?: string;
  readonly account_id?: string;
  readonly name: string;
  readonly account_status: number;
  readonly currency: string | null;
  readonly timezone_name: string | null;
};

export type MetaDiscoveredCampaign = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly effective_status?: string | null;
  readonly created_time?: string | null;
  readonly updated_time?: string | null;
  readonly objective?: string | null;
  readonly start_time?: string | null;
  readonly stop_time?: string | null;
};

export type MetaSampleCampaignMetrics = {
  readonly campaign_id: string;
  readonly date_start: string;
  readonly date_stop: string;
  readonly spend: string | null;
  readonly impressions: number | null;
  readonly reach: number | null;
  readonly clicks: number | null;
  readonly account_currency: string | null;
};

export type TestMetaConnectionInput = {
  readonly organizationId: string;
  readonly clientId: string;
  readonly clientIntegrationId: string;
  readonly actorUserId: string;
  readonly fetchSampleMetrics?: boolean | undefined;
  readonly sampleMetricsDays?: number | undefined;
};

export type TestMetaConnectionDeps = {
  readonly organizationRepository: {
    findMember: (orgId: string, userId: string) => Promise<{ role: string } | null>;
  };
  readonly clientRepository: {
    findById: (clientId: string, orgId: string) => Promise<{ id: string; organization_id: string } | null>;
  };
  readonly integrationRepository: {
    findById: (
      integrationId: string,
      clientId: string,
      orgId: string,
    ) => Promise<{
      id: string;
      organization_id: string;
      client_id: string;
      provider: string;
      external_account_id: string;
      status: string;
      configuration?: unknown;
    } | null>;
  };
  readonly credentialRepository: {
    resolvePageAccessToken: (integrationId: string) => Promise<{ pageAccessToken: string } | null>;
  };
  readonly metaGraphApiClient: {
    getAdAccountDetails: (adAccountId: string, accessToken: string) => Promise<MetaAdAccountDetails>;
    discoverAdAccountCampaigns: (
      adAccountId: string,
      accessToken: string,
      limit?: number,
    ) => Promise<MetaDiscoveredCampaign[]>;
    getSampleCampaignInsights?: (
      adAccountId: string,
      campaignId: string,
      accessToken: string,
      dateRange: { since: string; until: string },
    ) => Promise<MetaSampleCampaignMetrics[]>;
  };
};

export type TestMetaConnectionResult = {
  readonly decryptionSucceeded: true;
  readonly account: MetaAdAccountDetails;
  readonly campaignsCount: number;
  readonly campaigns: readonly MetaDiscoveredCampaign[];
  readonly candidateCampaignId: string | null;
  readonly sampleMetrics: readonly MetaSampleCampaignMetrics[] | null;
};

export type TestMetaConnectionError =
  | { readonly code: 'UNAUTHORIZED'; readonly message: string }
  | { readonly code: 'FORBIDDEN'; readonly message: string }
  | { readonly code: 'NOT_FOUND'; readonly message: string }
  | { readonly code: 'INVALID_STATE'; readonly message: string }
  | { readonly code: 'CREDENTIAL_ERROR'; readonly message: string }
  | { readonly code: 'PROVIDER_ERROR'; readonly message: string };

export async function testMetaConnection(
  input: TestMetaConnectionInput,
  deps: TestMetaConnectionDeps,
): Promise<Result<TestMetaConnectionResult, TestMetaConnectionError>> {
  // 1. Validar autenticación de usuario
  if (!input.actorUserId || input.actorUserId.trim().length === 0) {
    return err({ code: 'UNAUTHORIZED', message: 'Actor user ID is required' });
  }

  // 2. Resolver membresía de organización y rol
  const member = await deps.organizationRepository.findMember(input.organizationId, input.actorUserId);
  if (!member || !['owner', 'admin', 'strategist'].includes(member.role?.toLowerCase() || '')) {
    return err({
      code: 'FORBIDDEN',
      message: 'Requires strategist, admin or owner role to test integrations',
    });
  }

  // 3. Verificar que el cliente existe y pertenece a la organización
  const client = await deps.clientRepository.findById(input.clientId, input.organizationId);
  if (!client || client.organization_id !== input.organizationId) {
    return err({ code: 'NOT_FOUND', message: 'Client not found in organization' });
  }

  // 4. Verificar que la integración existe, pertenece al cliente, es de Meta y está activa
  const integration = await deps.integrationRepository.findById(
    input.clientIntegrationId,
    input.clientId,
    input.organizationId,
  );
  if (!integration) {
    return err({ code: 'NOT_FOUND', message: 'Integration not found for client' });
  }

  if (integration.provider !== 'meta') {
    return err({ code: 'INVALID_STATE', message: 'Integration provider must be meta' });
  }

  if (integration.status !== 'active') {
    return err({ code: 'INVALID_STATE', message: `Integration status must be active (got '${integration.status}')` });
  }

  const rawAccountId = integration.external_account_id?.trim() || '';
  if (!rawAccountId) {
    return err({ code: 'INVALID_STATE', message: 'Integration has no external account ID configured' });
  }

  // 5. Resolver y descifrar credencial en servidor
  let tokenData: { pageAccessToken: string } | null = null;
  try {
    tokenData = await deps.credentialRepository.resolvePageAccessToken(input.clientIntegrationId);
  } catch (cipherErr) {
    return err({
      code: 'CREDENTIAL_ERROR',
      message: `Failed to decrypt Meta credential: ${cipherErr instanceof Error ? cipherErr.message : String(cipherErr)}`,
    });
  }

  if (!tokenData?.pageAccessToken || tokenData.pageAccessToken.trim().length === 0) {
    return err({ code: 'CREDENTIAL_ERROR', message: 'No credential payload found for integration' });
  }

  const accessToken = tokenData.pageAccessToken;

  // 6. Consultar Meta Graph API para verificar detalles de la cuenta publicitaria
  let accountDetails: MetaAdAccountDetails;
  try {
    accountDetails = await deps.metaGraphApiClient.getAdAccountDetails(rawAccountId, accessToken);
  } catch (graphErr) {
    const rawMsg = graphErr instanceof Error ? graphErr.message : String(graphErr);
    const sanitizedMsg = rawMsg.replace(/access_token=[^&]+/g, 'access_token=REDACTED');
    return err({
      code: 'PROVIDER_ERROR',
      message: `Meta Ad Account query failed: ${sanitizedMsg}`,
    });
  }

  // 7. Descubrir hasta 10 campañas reales
  let discoveredCampaigns: MetaDiscoveredCampaign[] = [];
  try {
    discoveredCampaigns = await deps.metaGraphApiClient.discoverAdAccountCampaigns(rawAccountId, accessToken, 10);
  } catch (campaignsErr) {
    const rawMsg = campaignsErr instanceof Error ? campaignsErr.message : String(campaignsErr);
    const sanitizedMsg = rawMsg.replace(/access_token=[^&]+/g, 'access_token=REDACTED');
    return err({
      code: 'PROVIDER_ERROR',
      message: `Meta campaign discovery failed: ${sanitizedMsg}`,
    });
  }

  // 8. Opcional: Leer métricas de muestra para una campaña candidata si existe
  let candidateCampaignId: string | null = null;
  let sampleMetrics: MetaSampleCampaignMetrics[] | null = null;

  if (input.fetchSampleMetrics && discoveredCampaigns.length > 0 && deps.metaGraphApiClient.getSampleCampaignInsights) {
    const activeCamp = discoveredCampaigns.find((c) => c.status.toUpperCase() === 'ACTIVE') || discoveredCampaigns[0];
    if (activeCamp) {
      candidateCampaignId = activeCamp.id;

      const lookbackDays = Math.min(Math.max(1, input.sampleMetricsDays || 7), 30);
      const now = new Date();
      const untilDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const sinceDate = new Date(untilDate.getTime() - (lookbackDays - 1) * 24 * 60 * 60 * 1000);

      const toIsoDate = (d: Date) => d.toISOString().split('T')[0] || '';
      const dateRange = { since: toIsoDate(sinceDate), until: toIsoDate(untilDate) };

      try {
        sampleMetrics = await deps.metaGraphApiClient.getSampleCampaignInsights(
          rawAccountId,
          activeCamp.id,
          accessToken,
          dateRange,
        );
      } catch (metricsErr) {
        console.warn('[testMetaConnection] Sample metrics query non-fatal error:', {
          campaignId: activeCamp.id,
          error: metricsErr instanceof Error ? metricsErr.message : String(metricsErr),
        });
        sampleMetrics = [];
      }
    }
  }

  return ok({
    decryptionSucceeded: true,
    account: accountDetails,
    campaignsCount: discoveredCampaigns.length,
    campaigns: discoveredCampaigns,
    candidateCampaignId,
    sampleMetrics,
  });
}
