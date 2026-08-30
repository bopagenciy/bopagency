/**
 * google-metrics.adapter.ts — Adaptador concreto de Google Ads Metrics (GAQL Search) para MetricsProvider (Phase 9B.2).
 * Transformaciones de respuestas de Google Ads API v25 en DTOs neutrales NormalizedMetricRecord.
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
import { DEFAULT_GOOGLE_ADS_API_VERSION, getGoogleAdsApiVersion } from './google-config';
import {
  mapGoogleResponseToMetricsError,
  convertCostMicrosToMonetaryString,
} from './google-metrics-error.mapper';

export type ExternalGoogleCampaignResolutionContext = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId: CampaignId;
  readonly activationId?: CampaignActivationId | string | null | undefined;
  readonly providerAccountId: string;
};

export type ResolvedGoogleCampaignResource = {
  readonly externalCampaignId: string;
  readonly providerAccountId?: string | null | undefined;
  readonly organizationId?: OrganizationId | null | undefined;
  readonly clientId?: ClientId | null | undefined;
};

export type GoogleAdsCredentials = {
  readonly accessToken: string;
  readonly developerToken: string;
  readonly managerCustomerId?: string | null | undefined;
};

export type GoogleMetricsAdapterConfig = {
  readonly getCredentials: (
    organizationId: OrganizationId,
    providerAccountId?: string | null,
  ) => Promise<Result<GoogleAdsCredentials, MetricsProviderError>>;
  readonly resolveExternalCampaignId?: (
    context: ExternalGoogleCampaignResolutionContext,
  ) => Promise<Result<ResolvedGoogleCampaignResource | null, MetricsProviderError>>;
  readonly fetchFn?: typeof fetch;
  readonly apiVersion?: string;
};

export type GoogleAdsSearchRow = {
  campaign?: {
    id?: string | number;
    resourceName?: string;
    name?: string;
  };
  customer?: {
    currencyCode?: string;
    currency_code?: string;
  };
  segments?: {
    date?: string;
  };
  metrics?: {
    impressions?: string | number;
    clicks?: string | number;
    costMicros?: string | number;
    cost_micros?: string | number;
    conversions?: string | number;
  };
};

export type GoogleAdsSearchResponse = {
  results?: GoogleAdsSearchRow[];
  nextPageToken?: string;
  fieldMask?: string;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export class GoogleMetricsAdapter implements MetricsProvider {
  public readonly platform: MetricPlatform = 'google';
  private readonly fetchFn: typeof fetch;
  private readonly getCredentials: (
    organizationId: OrganizationId,
    providerAccountId?: string | null,
  ) => Promise<Result<GoogleAdsCredentials, MetricsProviderError>>;
  private readonly resolveExternalCampaignId?: ((
    context: ExternalGoogleCampaignResolutionContext,
  ) => Promise<Result<ResolvedGoogleCampaignResource | null, MetricsProviderError>>) | undefined;
  private readonly version: string;

  constructor(config: GoogleMetricsAdapterConfig) {
    this.fetchFn = config.fetchFn || globalThis.fetch;
    this.getCredentials = config.getCredentials;
    this.resolveExternalCampaignId = config.resolveExternalCampaignId;
    let resolvedVersion = DEFAULT_GOOGLE_ADS_API_VERSION;
    if (config.apiVersion) {
      resolvedVersion = config.apiVersion;
    } else {
      try {
        resolvedVersion = getGoogleAdsApiVersion();
      } catch {
        resolvedVersion = DEFAULT_GOOGLE_ADS_API_VERSION;
      }
    }
    this.version = resolvedVersion;
  }

  async fetchMetrics(
    request: MetricsProviderFetchRequest,
  ): Promise<Result<MetricsProviderPageResult, MetricsProviderError>> {
    // 1. Validar alcance (Sub-Phase 9B.2 soporta exclusivamente scope 'campaign')
    const reqScope = request.scope || 'campaign';
    if (reqScope !== 'campaign') {
      return err({
        category: 'INVALID_REQUEST',
        message: `GoogleMetricsAdapter in Sub-Phase 9B.2 only supports scope='campaign' (requested scope='${reqScope}')`,
        isRetryable: false,
      });
    }

    // 2. Normalizar identidad canónica del Customer ID (formato puro de 10 dígitos sin guiones)
    const cleanCustomerId = (request.providerAccountId || '').replace(/-/g, '').trim();
    if (!cleanCustomerId || !/^\d{10}$/.test(cleanCustomerId)) {
      return err({
        category: 'INVALID_REQUEST',
        message: `Google Ads query requires a valid 10-digit providerAccountId (Customer ID), got "${request.providerAccountId}"`,
        isRetryable: false,
      });
    }

    // 3. Invariante estricta: Se requiere campaignId para scope 'campaign'
    if (!request.campaignId) {
      return err({
        category: 'INVALID_REQUEST',
        message: 'Google Ads campaign-scoped fetch requires a non-null campaignId',
        isRetryable: false,
      });
    }

    // 4. Invariante estricta: resolveExternalCampaignId DEBE existir en el adaptador para resolver el ID de Google Ads
    if (!this.resolveExternalCampaignId) {
      return err({
        category: 'INVALID_REQUEST',
        message: `GoogleMetricsAdapter requires a resolveExternalCampaignId resolver to query metrics for BopAgency campaignId '${request.campaignId}'`,
        isRetryable: false,
      });
    }

    // 5. Invocación al resolver confiable de recursos de Phase 8F
    const resolutionRes = await this.resolveExternalCampaignId({
      organizationId: request.organizationId,
      clientId: request.clientId,
      campaignId: request.campaignId,
      activationId: request.activationId ?? null,
      providerAccountId: cleanCustomerId,
    });

    if (!resolutionRes.success) {
      return err(resolutionRes.error);
    }

    const resolved = resolutionRes.value;
    if (!resolved || !resolved.externalCampaignId || resolved.externalCampaignId.trim().length === 0) {
      return err({
        category: 'INVALID_REQUEST',
        message: `No valid external Google Ads campaign resource mapping found for internal BopAgency campaignId '${request.campaignId}'`,
        isRetryable: false,
      });
    }

    // 6. Validar consistencia de Cuenta, Organización y Cliente devueltos por el resolver
    if (resolved.providerAccountId && resolved.providerAccountId.replace(/-/g, '').trim() !== cleanCustomerId) {
      return err({
        category: 'INVALID_REQUEST',
        message: `Resource account mismatch: resolved Google campaign belongs to account '${resolved.providerAccountId}', but request specified '${cleanCustomerId}'`,
        isRetryable: false,
      });
    }

    if (resolved.organizationId && resolved.organizationId !== request.organizationId) {
      return err({
        category: 'INVALID_REQUEST',
        message: `Resource organization mismatch: resolved Google campaign belongs to organization '${resolved.organizationId}', but request specified '${request.organizationId}'`,
        isRetryable: false,
      });
    }

    if (resolved.clientId && resolved.clientId !== request.clientId) {
      return err({
        category: 'INVALID_REQUEST',
        message: `Resource client mismatch: resolved Google campaign belongs to client '${resolved.clientId}', but request specified '${request.clientId}'`,
        isRetryable: false,
      });
    }

    const expectedExternalCampaignId = resolved.externalCampaignId.trim();
    if (!/^\d+$/.test(expectedExternalCampaignId)) {
      return err({
        category: 'INVALID_REQUEST',
        message: `Malformed external campaign ID resolved for Google Ads: "${expectedExternalCampaignId}"`,
        isRetryable: false,
      });
    }

    // Validar formato de fechas de solicitud (ISO YYYY-MM-DD) para prevenir inyecciones
    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(request.endDate)) {
      return err({
        category: 'INVALID_REQUEST',
        message: `Invalid date range format: startDate='${request.startDate}', endDate='${request.endDate}'`,
        isRetryable: false,
      });
    }

    // 7. Obtener credenciales OAuth y Developer Token
    const credsRes = await this.getCredentials(request.organizationId, cleanCustomerId);
    if (!credsRes.success) {
      return err(credsRes.error);
    }
    const creds = credsRes.value;

    // 8. Construir GAQL Search Request
    const endpoint = `https://googleads.googleapis.com/${this.version}/customers/${cleanCustomerId}/googleAds:search`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${creds.accessToken}`,
      'developer-token': creds.developerToken,
      'Content-Type': 'application/json',
    };

    if (creds.managerCustomerId && creds.managerCustomerId.trim().length > 0) {
      const cleanManagerId = creds.managerCustomerId.replace(/-/g, '').trim();
      if (/^\d{10}$/.test(cleanManagerId)) {
        headers['login-customer-id'] = cleanManagerId;
      }
    }

    const gaqlQuery = `SELECT campaign.id, customer.currency_code, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE campaign.id = ${expectedExternalCampaignId} AND segments.date BETWEEN '${request.startDate}' AND '${request.endDate}' ORDER BY segments.date ASC`;

    const requestBody: Record<string, unknown> = {
      query: gaqlQuery,
      pageSize: 1000,
    };

    if (request.pageCursor) {
      requestBody['pageToken'] = request.pageCursor;
    }

    // 9. Ejecutar HTTP fetch sanitizando errores de red
    let res: Response;
    try {
      res = await this.fetchFn(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      const sanitizedMsg = msg
        .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer REDACTED')
        .replace(/developer-token[=:\s]+[^\s&]+/gi, 'developer-token=REDACTED');
      return err({
        category: 'TRANSIENT_FAILURE',
        message: `Network error connecting to Google Ads API: ${sanitizedMsg}`,
        isRetryable: true,
      });
    }

    // 10. Parsear respuesta JSON y validar errores de Google Ads API
    let data: GoogleAdsSearchResponse;
    try {
      data = (await res.json()) as GoogleAdsSearchResponse;
    } catch {
      return err({
        category: 'UNKNOWN',
        message: `Failed to parse Google Ads API response body as JSON (HTTP ${res.status})`,
        isRetryable: false,
      });
    }

    if (!res.ok || data.error) {
      return err(mapGoogleResponseToMetricsError(res.status, data));
    }

    // 11. Validar estructura de respuesta
    const rawRows = Array.isArray(data.results) ? data.results : [];
    const normalizedRecords: NormalizedMetricRecord[] = [];
    let detectedAccountCurrency: string | null = null;
    let matchedRowCount = 0;

    for (const row of rawRows) {
      // 11.1 Validar fecha de reporte del segmento (segments.date)
      const snapshotDate = row.segments?.date ? String(row.segments.date).trim() : '';
      if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
        return err({
          category: 'UNKNOWN',
          message: 'Google Ads row contains missing or invalid segments.date format',
          isRetryable: false,
        });
      }

      // 11.2 Validar que la moneda de la cuenta sea explícita y válida (3 letras mayúsculas ISO)
      const rawCurrency = row.customer?.currencyCode || row.customer?.currency_code ? String(row.customer.currencyCode || row.customer.currency_code).trim() : '';
      if (!rawCurrency || !/^[A-Z]{3}$/.test(rawCurrency)) {
        return err({
          category: 'INVALID_REQUEST',
          message: `Google Ads row contains missing or invalid customer.currency_code: "${rawCurrency}"`,
          isRetryable: false,
        });
      }

      // Validar consistencia de moneda a lo largo de las filas de la misma respuesta
      if (detectedAccountCurrency === null) {
        detectedAccountCurrency = rawCurrency;
      } else if (detectedAccountCurrency !== rawCurrency) {
        return err({
          category: 'INVALID_REQUEST',
          message: `Inconsistent customer.currency_code across rows in Google Ads response: "${detectedAccountCurrency}" vs "${rawCurrency}"`,
          isRetryable: false,
        });
      }

      // 11.3 Validar presencia de ID de campaña externa de Google Ads y aislamiento estricto
      const rowExternalCampaignId = row.campaign?.id ? String(row.campaign.id).trim() : '';
      if (!rowExternalCampaignId) {
        return err({
          category: 'UNKNOWN',
          message: 'Google Ads row contains missing or empty campaign.id',
          isRetryable: false,
        });
      }

      // Aislamiento estricto: descartar filas cuyo ID externo no coincida con el ID externo esperado
      if (rowExternalCampaignId !== expectedExternalCampaignId) {
        continue;
      }

      matchedRowCount += 1;

      // 11.4 Parsear métricas numéricas primitivas respetando 0, null y decimales en conversiones (sin redondeo ni floor)
      const impressionsRaw = row.metrics?.impressions;
      let impressions: number | null = null;
      if (impressionsRaw !== undefined && impressionsRaw !== null) {
        const parsedImp = Number(impressionsRaw);
        if (Number.isNaN(parsedImp) || parsedImp < 0 || parsedImp > Number.MAX_SAFE_INTEGER) {
          return err({
            category: 'UNKNOWN',
            message: `Google Ads returned out-of-range or malformed impressions value: ${String(impressionsRaw)}`,
            isRetryable: false,
          });
        }
        impressions = parsedImp;
      }

      const clicksRaw = row.metrics?.clicks;
      let clicks: number | null = null;
      if (clicksRaw !== undefined && clicksRaw !== null) {
        const parsedClick = Number(clicksRaw);
        if (Number.isNaN(parsedClick) || parsedClick < 0 || parsedClick > Number.MAX_SAFE_INTEGER) {
          return err({
            category: 'UNKNOWN',
            message: `Google Ads returned out-of-range or malformed clicks value: ${String(clicksRaw)}`,
            isRetryable: false,
          });
        }
        clicks = parsedClick;
      }

      const conversionsRaw = row.metrics?.conversions;
      let conversions: number | null = null;
      if (conversionsRaw !== undefined && conversionsRaw !== null) {
        const parsedConv = Number(conversionsRaw);
        if (Number.isNaN(parsedConv) || parsedConv < 0 || !Number.isFinite(parsedConv)) {
          return err({
            category: 'UNKNOWN',
            message: `Google Ads returned out-of-range or malformed conversions value: ${String(conversionsRaw)}`,
            isRetryable: false,
          });
        }
        // Preserva el valor numérico completo (incluyendo decimales fraccionales como 2.5, 0.33) sin trunca o truncamiento
        conversions = parsedConv;
      }

      // Convertir cost_micros a cadena decimal de moneda canónica
      const rawCostMicros = row.metrics?.costMicros ?? row.metrics?.cost_micros;
      const spendStr = convertCostMicrosToMonetaryString(rawCostMicros);

      normalizedRecords.push({
        organizationId: request.organizationId,
        clientId: request.clientId,
        campaignId: request.campaignId, // Asigna el campaignId INTERNO de BopAgency
        activationId: request.activationId ? String(request.activationId) : null,
        platform: 'google',
        providerAccountId: cleanCustomerId, // Canónico puro de 10 dígitos sin guiones
        externalCampaignId: rowExternalCampaignId, // ID EXTERNO de Google Ads
        snapshotDate,
        granularity: 'daily',
        scope: 'campaign',
        currency: rawCurrency,
        spend: spendStr,
        impressions,
        reach: null, // Google Search campaign daily report no expone alcances estilo Meta; explícitamente null
        clicks,
        leads: null, // No se asume lead arbitrario en la consulta genérica de campaña; explícitamente null
        conversions, // metrics.conversions (preserva decimales como DOUBLE)
        revenue: null, // metrics.conversions_value no se mapea universalmente a revenue de compras; explícitamente null
      });
    }

    // 12. Si Google devolvió datos pero NINGUNA fila coincidió con expectedExternalCampaignId: falla explícita de identidad
    if (rawRows.length > 0 && matchedRowCount === 0) {
      return err({
        category: 'UNKNOWN',
        message: `Google Ads returned data, but 0 rows matched expected external campaign ID '${expectedExternalCampaignId}'`,
        isRetryable: false,
      });
    }

    // 13. Mapear paginación usando nextPageToken
    const nextCursor = data.nextPageToken ? String(data.nextPageToken).trim() : null;
    const hasMore = Boolean(nextCursor && nextCursor.length > 0);

    return ok({
      records: normalizedRecords,
      nextCursor,
      hasMore,
    });
  }
}
