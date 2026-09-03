/**
 * meta-metrics.adapter.ts — Adaptador concreto de Meta Ads Insights para MetricsProvider (Phase 9B.1 Resource Resolver Integrity Gate).
 * Implementa la interfaz MetricsProvider de la capa de aplicación transformando respuestas de Meta Graph API v26.0
 * en DTOs neutrales NormalizedMetricRecord.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { MetricPlatform } from '@bop-agency/shared';
import type { OrganizationId, ClientId, CampaignId, CampaignActivationId } from '@bop-agency/domain';
import type {
  MetricsProvider,
  MetricsProviderPageResult,
  MetricsProviderError,
  MetricsProviderFetchRequest,
  NormalizedMetricRecord,
} from '@bop-agency/application';
import { getMetaGraphApiVersion, DEFAULT_META_GRAPH_API_VERSION } from './meta-config';
import {
  extractMetaLeads,
  resolveMetaPurchaseMetrics,
  type MetaActionItem,
} from './meta-actions.mapper';
import { mapMetaResponseToMetricsError } from './meta-metrics-error.mapper';

export type ExternalCampaignResolutionContext = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId: CampaignId;
  readonly activationId?: CampaignActivationId | string | null | undefined;
  readonly providerAccountId: string;
};

export type ResolvedExternalCampaignResource = {
  readonly externalCampaignId: string;
  readonly providerAccountId?: string | null | undefined;
  readonly organizationId?: OrganizationId | null | undefined;
  readonly clientId?: ClientId | null | undefined;
};

export type MetaMetricsAdapterConfig = {
  readonly getAccessToken: (
    organizationId: OrganizationId,
    providerAccountId?: string | null,
  ) => Promise<Result<string, MetricsProviderError>>;
  readonly resolveExternalCampaignId?: (
    context: ExternalCampaignResolutionContext,
  ) => Promise<Result<ResolvedExternalCampaignResource | null, MetricsProviderError>>;
  readonly fetchFn?: typeof fetch;
  readonly apiVersion?: string;
};

export type MetaInsightsRow = {
  campaign_id?: string;
  account_id?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string | number;
  reach?: string | number;
  clicks?: string | number;
  actions?: MetaActionItem[];
  action_values?: MetaActionItem[];
  account_currency?: string;
};

export type MetaInsightsPaging = {
  cursors?: {
    before?: string;
    after?: string;
  };
  next?: string;
};

export type MetaInsightsResponse = {
  data?: MetaInsightsRow[];
  paging?: MetaInsightsPaging;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class MetaMetricsAdapter implements MetricsProvider {
  public readonly platform: MetricPlatform = 'meta';
  private readonly fetchFn: typeof fetch;
  private readonly getAccessToken: (
    organizationId: OrganizationId,
    providerAccountId?: string | null,
  ) => Promise<Result<string, MetricsProviderError>>;
  private readonly resolveExternalCampaignId?: ((
    context: ExternalCampaignResolutionContext,
  ) => Promise<Result<ResolvedExternalCampaignResource | null, MetricsProviderError>>) | undefined;
  private readonly version: string;

  constructor(config: MetaMetricsAdapterConfig) {
    this.fetchFn = config.fetchFn || globalThis.fetch;
    this.getAccessToken = config.getAccessToken;
    this.resolveExternalCampaignId = config.resolveExternalCampaignId;
    let resolvedVersion = DEFAULT_META_GRAPH_API_VERSION;
    if (config.apiVersion) {
      resolvedVersion = config.apiVersion;
    } else {
      try {
        resolvedVersion = getMetaGraphApiVersion();
      } catch {
        resolvedVersion = DEFAULT_META_GRAPH_API_VERSION;
      }
    }
    this.version = resolvedVersion;
  }

  async fetchMetrics(
    request: MetricsProviderFetchRequest,
  ): Promise<Result<MetricsProviderPageResult, MetricsProviderError>> {
    // 1. Validar alcance (Sub-Phase 9B.1 MVP soporta exclusivamente scope 'campaign')
    const reqScope = request.scope || 'campaign';
    if (reqScope !== 'campaign') {
      return err({
        category: 'INVALID_REQUEST',
        message: `MetaMetricsAdapter in Sub-Phase 9B.1 only supports scope='campaign' (requested scope='${reqScope}')`,
        isRetryable: false,
      });
    }

    // 2. Normalizar identidad canónica del Ad Account ID (formato puro sin 'act_', e.g. '123456789')
    const canonicalRawAccountId = (request.providerAccountId || '').replace(/^act_/, '').trim();
    if (!canonicalRawAccountId) {
      return err({
        category: 'INVALID_REQUEST',
        message: 'Meta Insights query requires a valid providerAccountId (Ad Account ID)',
        isRetryable: false,
      });
    }

    // 3. Invariante estricta: Se requiere campaignId para scope 'campaign'
    if (!request.campaignId) {
      return err({
        category: 'INVALID_REQUEST',
        message: 'Meta Insights campaign-scoped fetch requires a non-null campaignId',
        isRetryable: false,
      });
    }

    let expectedExternalCampaignId: string;

    // 4. Prioridad 1: externalCampaignId provisto directamente en el request (Phase 9B.5)
    if (request.externalCampaignId && request.externalCampaignId.trim().length > 0) {
      expectedExternalCampaignId = request.externalCampaignId.trim();
    } else {
      // Prioridad 2: Fallback mediante resolveExternalCampaignId (Phase 9B.1 legacy / manual)
      if (!this.resolveExternalCampaignId) {
        return err({
          category: 'INVALID_REQUEST',
          message: `MetaMetricsAdapter requires a resolveExternalCampaignId resolver to query metrics for BopAgency campaignId '${request.campaignId}'`,
          isRetryable: false,
        });
      }

      // 5. Invocación al resolver confiable de recursos de Phase 8
      const resolutionRes = await this.resolveExternalCampaignId({
        organizationId: request.organizationId,
        clientId: request.clientId,
        campaignId: request.campaignId,
        activationId: request.activationId ?? null,
        providerAccountId: canonicalRawAccountId,
      });

      if (!resolutionRes.success) {
        return err(resolutionRes.error);
      }

      const resolved = resolutionRes.value;
      if (!resolved || !resolved.externalCampaignId || resolved.externalCampaignId.trim().length === 0) {
        return err({
          category: 'INVALID_REQUEST',
          message: `No valid external Meta campaign resource mapping found for internal BopAgency campaignId '${request.campaignId}'`,
          isRetryable: false,
        });
      }

      // 6. Validar consistencia de Cuenta, Organización y Cliente devueltos por el resolver
      if (resolved.providerAccountId && resolved.providerAccountId !== canonicalRawAccountId) {
        return err({
          category: 'INVALID_REQUEST',
          message: `Resource account mismatch: resolved Meta campaign belongs to account '${resolved.providerAccountId}', but request specified '${canonicalRawAccountId}'`,
          isRetryable: false,
        });
      }

      if (resolved.organizationId && resolved.organizationId !== request.organizationId) {
        return err({
          category: 'INVALID_REQUEST',
          message: `Resource organization mismatch: resolved Meta campaign belongs to organization '${resolved.organizationId}', but request specified '${request.organizationId}'`,
          isRetryable: false,
        });
      }

      if (resolved.clientId && resolved.clientId !== request.clientId) {
        return err({
          category: 'INVALID_REQUEST',
          message: `Resource client mismatch: resolved Meta campaign belongs to client '${resolved.clientId}', but request specified '${request.clientId}'`,
          isRetryable: false,
        });
      }

      expectedExternalCampaignId = resolved.externalCampaignId.trim();
    }

    // 7. Obtener Access Token sanitizado usando la cuenta canónica
    const tokenRes = await this.getAccessToken(request.organizationId, canonicalRawAccountId);
    if (!tokenRes.success) {
      return err(tokenRes.error);
    }
    const accessToken = tokenRes.value;

    // 8. Construir URL de Graph API anteponiendo 'act_' únicamente al path HTTP del endpoint
    const url = new URL(`https://graph.facebook.com/${this.version}/act_${canonicalRawAccountId}/insights`);
    url.searchParams.set('level', 'campaign');
    url.searchParams.set(
      'time_range',
      JSON.stringify({ since: request.startDate, until: request.endDate }),
    );
    url.searchParams.set('time_increment', '1');
    url.searchParams.set('use_unified_attribution_setting', 'true');
    url.searchParams.set(
      'fields',
      'campaign_id,account_id,date_start,date_stop,spend,impressions,reach,clicks,actions,action_values,account_currency',
    );
    url.searchParams.set('access_token', accessToken);

    // Filtrar explícitamente por el ID de campaña EXTERNA de Meta (NUNCA por la ID interna de BopAgency)
    url.searchParams.set(
      'filtering',
      JSON.stringify([
        {
          field: 'campaign.id',
          operator: 'IN',
          value: [expectedExternalCampaignId],
        },
      ]),
    );

    if (request.pageCursor) {
      url.searchParams.set('after', request.pageCursor);
    }

    // 9. Ejecutar HTTP fetch sanitizando errores de red
    let res: Response;
    try {
      res = await this.fetchFn(url.toString(), { method: 'GET' });
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      const sanitizedMsg = msg.replace(/access_token=[^&]+/g, 'access_token=REDACTED');
      return err({
        category: 'TRANSIENT_FAILURE',
        message: `Network error connecting to Meta Graph API: ${sanitizedMsg}`,
        isRetryable: true,
      });
    }

    // 10. Parsear respuesta JSON y validar errores de Meta
    let data: MetaInsightsResponse;
    try {
      data = (await res.json()) as MetaInsightsResponse;
    } catch {
      return err({
        category: 'UNKNOWN',
        message: `Failed to parse Meta Graph API response body as JSON (HTTP ${res.status})`,
        isRetryable: false,
      });
    }

    if (!res.ok || data.error) {
      return err(mapMetaResponseToMetricsError(res.status, data));
    }

    // 11. Validar estructura de respuesta
    if (!data.data || !Array.isArray(data.data)) {
      return err({
        category: 'UNKNOWN',
        message: 'Meta Insights response data property is missing or not an array',
        isRetryable: false,
      });
    }

    const rawRows = data.data;
    const normalizedRecords: NormalizedMetricRecord[] = [];
    let detectedAccountCurrency: string | null = null;
    let matchedRowCount = 0;

    for (const row of rawRows) {
      // 11.1 Validar fecha de inicio y término y verificar la invariante diaria (date_start === date_stop)
      const startDate = row.date_start ? String(row.date_start).trim() : '';
      const endDate = row.date_stop ? String(row.date_stop).trim() : '';
      if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        return err({
          category: 'UNKNOWN',
          message: 'Meta Insights row contains missing or invalid date_start format',
          isRetryable: false,
        });
      }

      if (startDate !== endDate) {
        return err({
          category: 'UNKNOWN',
          message: `Meta Insights daily row invariant failed: date_start (${startDate}) does not match date_stop (${endDate})`,
          isRetryable: false,
        });
      }

      // 11.2 Validar que la moneda de la cuenta sea explícita y válida (3 letras mayúsculas ISO)
      const rawCurrency = row.account_currency ? String(row.account_currency).trim() : '';
      if (!rawCurrency || !/^[A-Z]{3}$/.test(rawCurrency)) {
        return err({
          category: 'INVALID_REQUEST',
          message: `Meta Insights row contains missing or invalid account_currency: "${rawCurrency}"`,
          isRetryable: false,
        });
      }

      // Validar consistencia de moneda a lo largo de las filas de la misma respuesta
      if (detectedAccountCurrency === null) {
        detectedAccountCurrency = rawCurrency;
      } else if (detectedAccountCurrency !== rawCurrency) {
        return err({
          category: 'INVALID_REQUEST',
          message: `Inconsistent account_currency across rows in Meta Insights response: "${detectedAccountCurrency}" vs "${rawCurrency}"`,
          isRetryable: false,
        });
      }

      // 11.3 Validar presencia de ID de campaña externa de Meta y aislamiento estricto
      const rowExternalCampaignId = row.campaign_id ? String(row.campaign_id).trim() : '';
      if (!rowExternalCampaignId) {
        return err({
          category: 'UNKNOWN',
          message: 'Meta Insights row contains missing or empty campaign_id',
          isRetryable: false,
        });
      }

      // Aislamiento estricto: descartar filas cuyo ID externo no coincida con el ID externo esperado de Meta
      if (rowExternalCampaignId !== expectedExternalCampaignId) {
        continue;
      }

      matchedRowCount += 1;

      // 11.4 Parsear métricas numéricas primitivas respetando 0 y null
      const impressions =
        row.impressions !== undefined && row.impressions !== null
          ? Number(row.impressions)
          : null;
      const reach =
        row.reach !== undefined && row.reach !== null ? Number(row.reach) : null;
      const clicks =
        row.clicks !== undefined && row.clicks !== null ? Number(row.clicks) : null;

      if (
        (impressions !== null && (Number.isNaN(impressions) || impressions < 0)) ||
        (reach !== null && (Number.isNaN(reach) || reach < 0)) ||
        (clicks !== null && (Number.isNaN(clicks) || clicks < 0))
      ) {
        return err({
          category: 'UNKNOWN',
          message: 'Meta Insights returned malformed non-integer primitive metrics',
          isRetryable: false,
        });
      }

      // Preservar cadena decimal exacta de spend
      const spendStr = row.spend !== undefined && row.spend !== null ? String(row.spend).trim() : null;
      if (spendStr !== null && !/^\d+(\.\d+)?$/.test(spendStr)) {
        return err({
          category: 'UNKNOWN',
          message: `Meta Insights returned malformed spend decimal string: "${spendStr}"`,
          isRetryable: false,
        });
      }

      // Extraer métricas de clientes potenciales (leads)
      const leads = extractMetaLeads(row.actions);

      // Resolver en conjunto conversiones de compra e ingresos desde la MISMA familia de acciones
      const purchaseMetrics = resolveMetaPurchaseMetrics(row.actions, row.action_values);

      normalizedRecords.push({
        organizationId: request.organizationId,
        clientId: request.clientId,
        campaignId: request.campaignId, // Asigna el campaignId INTERNO de BopAgency
        activationId: request.activationId ? String(request.activationId) : null,
        platform: 'meta',
        providerAccountId: canonicalRawAccountId, // Canónico puro (e.g. '123456789')
        externalCampaignId: rowExternalCampaignId, // ID EXTERNO de Meta (e.g. '120213456789012345')
        snapshotDate: startDate,
        granularity: 'daily',
        scope: 'campaign',
        currency: rawCurrency,
        spend: spendStr,
        impressions,
        reach,
        clicks,
        leads,
        conversions: purchaseMetrics.conversions,
        revenue: purchaseMetrics.revenue,
      });
    }

    // 12. Si Meta devolvió datos pero NINGUNA fila coincidió con expectedExternalCampaignId: falla explícita de identidad
    if (rawRows.length > 0 && matchedRowCount === 0) {
      return err({
        category: 'UNKNOWN',
        message: `Meta Insights returned data, but 0 rows matched expected external campaign ID '${expectedExternalCampaignId}'`,
        isRetryable: false,
      });
    }

    // 13. Mapear paginación de forma segura usando únicamente cursors.after (NUNCA fetching raw paging.next URL)
    const nextCursor = data.paging?.cursors?.after ?? null;
    const hasMore = Boolean(data.paging?.next && nextCursor);

    return ok({
      records: normalizedRecords,
      nextCursor,
      hasMore,
    });
  }
}
