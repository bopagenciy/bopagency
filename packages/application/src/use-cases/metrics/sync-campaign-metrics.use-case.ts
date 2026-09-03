/**
 * syncCampaignMetrics — Caso de uso endurecido para la sincronización e ingestión de métricas de proveedores (Phase 9B.0 / Phase 9B.2A Hardened).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  OrganizationId,
  ClientId,
  CampaignId,
  CampaignActivationId,
  SnapshotGranularity,
  SnapshotScope,
  CampaignMetricSnapshotRepository,
  SaveCampaignMetricSnapshotInput,
} from '@bop-agency/domain';
import { parseMonetaryAmount, computeDerivedSnapshotMetrics } from '@bop-agency/domain';
import type { MetricPlatform } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';
import type { MetricsProviderRegistry } from '../../ports/metrics-provider-registry';
import type { NormalizedMetricRecord, MetricsProviderFetchRequest } from '../../dtos/normalized-metric-record.dto';
import type { MetricsProviderError } from '../../ports/metrics-provider.port';

export type SyncCampaignMetricsInput = {
  readonly actorUserId: string;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly platform: MetricPlatform;
  readonly startDate: string; // YYYY-MM-DD
  readonly endDate: string;   // YYYY-MM-DD
  readonly campaignId?: CampaignId | null;
  readonly activationId?: CampaignActivationId | string | null;
  readonly providerAccountId?: string | null;
  readonly externalCampaignId?: string | null;
  readonly granularity?: SnapshotGranularity;
  readonly scope?: SnapshotScope;
};

export type SyncCampaignMetricsDeps = {
  readonly snapshotRepository: CampaignMetricSnapshotRepository;
  readonly providerRegistry: MetricsProviderRegistry;
  readonly isOrganizationMember: (organizationId: OrganizationId, userId: string) => Promise<boolean>;
  readonly logger: LoggerPort;
};

export type SyncCampaignMetricsSummary = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly platform: MetricPlatform;
  readonly recordsFetched: number;
  readonly pagesFetched: number;
  readonly recordsSaved: number;
  readonly startDate: string;
  readonly endDate: string;
};

export type SyncCampaignMetricsError =
  | { readonly code: 'UNAUTHORIZED'; readonly message: string }
  | { readonly code: 'INVALID_ARGUMENT'; readonly message: string }
  | { readonly code: 'NOT_FOUND'; readonly message: string }
  | { readonly code: 'PROVIDER_ERROR'; readonly message: string; readonly providerError: MetricsProviderError }
  | { readonly code: 'INTERNAL_ERROR'; readonly message: string };

/** Constantes y Políticas Endurecidas (Named Policy Constants) */
export const MAX_METRICS_SYNC_RANGE_DAYS = 90;
export const MAX_PAGINATION_PAGES = 50;

/** Capacidad máxima canónica de conversiones atribuidas en BopAgency (NUMERIC(14,4) = 10 enteros + 4 decimales) */
export const MAX_CANONICAL_ATTRIBUTED_CONVERSIONS = 9999999999.9999;
export const CANONICAL_ATTRIBUTION_SCALE = 4;

const CURRENCY_REGEX = /^[A-Z]{3}$/;

/**
 * Normaliza una métrica de conteo atribuido (e.g. conversions) a la escala decimal canónica de BopAgency (4 decimales)
 * usando redondeo determinista half-up sin imprecisión aritmética flotante.
 */
export function normalizeAttributedCount(
  val: number | null | undefined,
  scale: number = CANONICAL_ATTRIBUTION_SCALE,
): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) return null;
  if (val > MAX_CANONICAL_ATTRIBUTED_CONVERSIONS) return null;

  const fixedStr = val.toFixed(scale + 6);
  const [intPart = '0', fracPart = ''] = fixedStr.split('.');

  if (fracPart.length <= scale) {
    return parseFloat(fixedStr);
  }

  const targetFrac = fracPart.slice(0, scale);
  const roundDigit = parseInt(fracPart[scale] || '0', 10);

  if (roundDigit < 5) {
    return parseFloat(`${intPart}.${targetFrac}`);
  }

  const factor = 10 ** scale;
  const scaledInt = BigInt(intPart) * BigInt(factor) + BigInt(targetFrac) + 1n;
  const newInt = scaledInt / BigInt(factor);
  const newFrac = (scaledInt % BigInt(factor)).toString().padStart(scale, '0');
  const normalizedVal = parseFloat(`${newInt}.${newFrac}`);

  if (normalizedVal > MAX_CANONICAL_ATTRIBUTED_CONVERSIONS) {
    return null;
  }
  return normalizedVal;
}

/**
 * Valida la validez de un formato y una fecha en el calendario real (e.g. rechaza 2026-02-30 o 2026-13-01).
 */
export function isValidCalendarDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Calcula la diferencia exacta de días calendarios sin conversión a Date local ni sensibilidad a zonas horarias.
 */
export function diffCalendarDays(startDateStr: string, endDateStr: string): number {
  const partsS = startDateStr.split('-');
  const partsE = endDateStr.split('-');
  const sYear = Number(partsS[0]);
  const sMonth = Number(partsS[1]);
  const sDay = Number(partsS[2]);
  const eYear = Number(partsE[0]);
  const eMonth = Number(partsE[1]);
  const eDay = Number(partsE[2]);
  const startUtcMs = Date.UTC(sYear, sMonth - 1, sDay);
  const endUtcMs = Date.UTC(eYear, eMonth - 1, eDay);
  return Math.floor((endUtcMs - startUtcMs) / (1000 * 60 * 60 * 24)) + 1;
}

export async function syncCampaignMetrics(
  input: SyncCampaignMetricsInput,
  deps: SyncCampaignMetricsDeps,
): Promise<Result<SyncCampaignMetricsSummary, SyncCampaignMetricsError>> {
  deps.logger.debug('syncCampaignMetrics init', {
    organizationId: input.organizationId,
    clientId: input.clientId,
    platform: input.platform,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  // 1. Autorización del actor
  if (!input.actorUserId || input.actorUserId.trim().length === 0) {
    return err({ code: 'UNAUTHORIZED', message: 'Actor user ID is required' });
  }

  let isMember = false;
  try {
    isMember = await deps.isOrganizationMember(input.organizationId, input.actorUserId);
  } catch (cause) {
    deps.logger.error('Authorization dependency failure', { cause });
    return err({
      code: 'INTERNAL_ERROR',
      message: `Authorization check failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    });
  }

  if (!isMember) {
    return err({
      code: 'UNAUTHORIZED',
      message: `User ${input.actorUserId} is not authorized for organization ${input.organizationId}`,
    });
  }

  // 2. Validación de formato y rango de fechas (Sin ambigüedad de zona horaria y validez en el calendario real)
  if (!isValidCalendarDate(input.startDate) || !isValidCalendarDate(input.endDate)) {
    return err({
      code: 'INVALID_ARGUMENT',
      message: 'startDate and endDate must be valid calendar dates in YYYY-MM-DD format',
    });
  }

  const rangeDays = diffCalendarDays(input.startDate, input.endDate);
  if (rangeDays < 1) {
    return err({
      code: 'INVALID_ARGUMENT',
      message: `startDate (${input.startDate}) must be prior to or equal to endDate (${input.endDate})`,
    });
  }

  if (rangeDays > MAX_METRICS_SYNC_RANGE_DAYS) {
    return err({
      code: 'INVALID_ARGUMENT',
      message: `Date range exceeds maximum allowed limit of ${MAX_METRICS_SYNC_RANGE_DAYS} days (requested: ${rangeDays} days)`,
    });
  }

  // 3. Resolver proveedor desde la abstracción de registro
  const provider = deps.providerRegistry.get(input.platform);
  if (!provider) {
    return err({
      code: 'NOT_FOUND',
      message: `No metrics provider registered for platform '${input.platform}'`,
    });
  }

  // 4. Bucle endurecido de paginación
  const accumulatedRecords: NormalizedMetricRecord[] = [];
  const consumedCursors = new Set<string>();
  let pageCursor: string | null = null;
  let pagesFetched = 0;
  let hasMore = true;

  while (hasMore) {
    if (pagesFetched >= MAX_PAGINATION_PAGES) {
      return err({
        code: 'PROVIDER_ERROR',
        message: `Pagination limit exceeded maximum safety guard of ${MAX_PAGINATION_PAGES} pages`,
        providerError: {
          category: 'INVALID_REQUEST',
          message: `Provider '${input.platform}' generated more than ${MAX_PAGINATION_PAGES} pagination pages`,
          isRetryable: false,
        },
      });
    }

    const fetchReq: MetricsProviderFetchRequest = {
      organizationId: input.organizationId,
      clientId: input.clientId,
      platform: input.platform,
      startDate: input.startDate,
      endDate: input.endDate,
      campaignId: input.campaignId ?? null,
      activationId: input.activationId ?? null,
      providerAccountId: input.providerAccountId ?? null,
      externalCampaignId: input.externalCampaignId ?? null,
      granularity: input.granularity,
      scope: input.scope,
      pageCursor,
    };

    const providerRes = await provider.fetchMetrics(fetchReq);

    if (!providerRes.success) {
      deps.logger.error('Metrics provider fetch failed (atomic abort - no partial writes)', {
        platform: input.platform,
        error: providerRes.error,
        pagesFetched,
      });
      return err({
        code: 'PROVIDER_ERROR',
        message: `Provider '${input.platform}' failed on page ${pagesFetched + 1}: ${providerRes.error.message}`,
        providerError: providerRes.error,
      });
    }

    const pageData = providerRes.value;
    pagesFetched += 1;
    accumulatedRecords.push(...pageData.records);

    if (pageData.hasMore) {
      const nextCursor = pageData.nextCursor;
      if (!nextCursor || nextCursor.trim().length === 0) {
        return err({
          code: 'PROVIDER_ERROR',
          message: `Malformed provider pagination: hasMore=true but nextCursor is null or empty`,
          providerError: {
            category: 'INVALID_REQUEST',
            message: `Provider '${input.platform}' returned hasMore=true without nextCursor`,
            isRetryable: false,
          },
        });
      }

      if (nextCursor === pageCursor) {
        return err({
          code: 'PROVIDER_ERROR',
          message: `Malformed provider pagination: nextCursor equals current pageCursor '${nextCursor}' (infinite self loop)`,
          providerError: {
            category: 'INVALID_REQUEST',
            message: `Provider '${input.platform}' returned identical cursor`,
            isRetryable: false,
          },
        });
      }

      if (consumedCursors.has(nextCursor)) {
        return err({
          code: 'PROVIDER_ERROR',
          message: `Malformed provider pagination: cursor cycle detected for cursor '${nextCursor}'`,
          providerError: {
            category: 'INVALID_REQUEST',
            message: `Provider '${input.platform}' cycle detected`,
            isRetryable: false,
          },
        });
      }

      if (pageCursor) {
        consumedCursors.add(pageCursor);
      }
      pageCursor = nextCursor;
      hasMore = true;
    } else {
      hasMore = false;
    }
  }

  // 5. Validación exhaustiva de registros del proveedor (External Trust Boundary & Scope Identity)
  for (const record of accumulatedRecords) {
    if (record.organizationId !== input.organizationId) {
      return err({
        code: 'INVALID_ARGUMENT',
        message: `Tenant mismatch: record organization '${record.organizationId}' does not match request '${input.organizationId}'`,
      });
    }

    if (record.clientId !== input.clientId) {
      return err({
        code: 'INVALID_ARGUMENT',
        message: `Client mismatch: record client '${record.clientId}' does not match request '${input.clientId}'`,
      });
    }

    if (record.platform !== input.platform) {
      return err({
        code: 'INVALID_ARGUMENT',
        message: `Platform mismatch: record platform '${record.platform}' does not match request '${input.platform}'`,
      });
    }

    if (!isValidCalendarDate(record.snapshotDate)) {
      return err({
        code: 'INVALID_ARGUMENT',
        message: `Invalid provider snapshotDate '${record.snapshotDate}' (must be a valid YYYY-MM-DD calendar date)`,
      });
    }

    if (record.currency && !CURRENCY_REGEX.test(record.currency)) {
      return err({
        code: 'INVALID_ARGUMENT',
        message: `Invalid provider currency '${record.currency}' (must be 3 uppercase letters)`,
      });
    }

    // Métricas primitivas estrictamente enteras (impressions, reach, clicks, leads)
    const intMetrics = [
      { name: 'impressions', val: record.impressions },
      { name: 'reach', val: record.reach },
      { name: 'clicks', val: record.clicks },
      { name: 'leads', val: record.leads },
    ];
    for (const m of intMetrics) {
      if (m.val !== null && m.val !== undefined) {
        if (m.val < 0 || !Number.isInteger(m.val) || m.val > Number.MAX_SAFE_INTEGER) {
          return err({
            code: 'INVALID_ARGUMENT',
            message: `Invalid provider metric '${m.name}': must be a non-negative integer within safe limits, got ${m.val}`,
          });
        }
      }
    }

    // Métricas fraccionales atribuidas (conversions soporta números fraccionales de atribuición como 2.5 o 0.3333 hasta MAX_CANONICAL_ATTRIBUTED_CONVERSIONS)
    if (record.conversions !== null && record.conversions !== undefined) {
      if (
        typeof record.conversions !== 'number' ||
        !Number.isFinite(record.conversions) ||
        record.conversions < 0 ||
        record.conversions > MAX_CANONICAL_ATTRIBUTED_CONVERSIONS
      ) {
        return err({
          code: 'INVALID_ARGUMENT',
          message: `Invalid provider metric 'conversions': must be a non-negative finite number <= ${MAX_CANONICAL_ATTRIBUTED_CONVERSIONS}, got ${record.conversions}`,
        });
      }
    }

    // Invariantes por Scope
    const recordScope = record.scope || input.scope || 'campaign';
    if (recordScope === 'campaign') {
      const recordCampId = record.campaignId ?? input.campaignId;
      if (!recordCampId) {
        return err({
          code: 'INVALID_ARGUMENT',
          message: `Campaign scope snapshot requires a valid campaignId`,
        });
      }
      if (input.campaignId && record.campaignId && record.campaignId !== input.campaignId) {
        return err({
          code: 'INVALID_ARGUMENT',
          message: `Campaign mismatch: record campaign '${record.campaignId}' does not match request '${input.campaignId}'`,
        });
      }
    } else if (recordScope === 'account') {
      const accId = record.providerAccountId ?? input.providerAccountId;
      if (!accId || accId.trim().length === 0) {
        return err({
          code: 'INVALID_ARGUMENT',
          message: `Account scope snapshot requires a non-empty providerAccountId`,
        });
      }
      if (record.campaignId) {
        return err({
          code: 'INVALID_ARGUMENT',
          message: `Account scope snapshot must have null campaignId`,
        });
      }
      if (input.providerAccountId && record.providerAccountId && record.providerAccountId !== input.providerAccountId) {
        return err({
          code: 'INVALID_ARGUMENT',
          message: `Account mismatch: record providerAccountId '${record.providerAccountId}' does not match requested account '${input.providerAccountId}'`,
        });
      }
    } else if (recordScope === 'client') {
      if (record.campaignId || record.providerAccountId || record.externalCampaignId) {
        return err({
          code: 'INVALID_ARGUMENT',
          message: `Client scope snapshot must have null campaignId, providerAccountId, and externalCampaignId`,
        });
      }
    }
  }

  // 6. Manejo estricto de duplicados (Identical Collapse vs Conflicting Rejection)
  const streamMap = new Map<string, NormalizedMetricRecord>();
  for (const record of accumulatedRecords) {
    const streamKey = `${record.organizationId}:${record.clientId}:${record.campaignId ?? ''}:${record.activationId ?? ''}:${record.platform}:${record.providerAccountId ?? ''}:${record.externalCampaignId ?? ''}:${record.snapshotDate}:${record.granularity ?? 'daily'}:${record.scope ?? 'campaign'}`;
    const existing = streamMap.get(streamKey);
    if (existing) {
      // Verificar si los campos métricos son idénticos o en conflicto
      const isConflicting =
        existing.spend !== record.spend ||
        existing.revenue !== record.revenue ||
        existing.impressions !== record.impressions ||
        existing.reach !== record.reach ||
        existing.clicks !== record.clicks ||
        existing.leads !== record.leads ||
        existing.conversions !== record.conversions ||
        (existing.currency || 'COP') !== (record.currency || 'COP');

      if (isConflicting) {
        return err({
          code: 'INVALID_ARGUMENT',
          message: `Conflicting duplicate provider records detected for stream key '${streamKey}'`,
        });
      }
      // Duplicados idénticos se colapsan de forma segura (no conflictivos)
    } else {
      streamMap.set(streamKey, record);
    }
  }
  const deduplicatedRecords = Array.from(streamMap.values());

  // 7. Transformación y cálculo de métricas derivadas canónicas
  const saveInputs: SaveCampaignMetricSnapshotInput[] = deduplicatedRecords.map((record) => {
    const safeSpend = parseMonetaryAmount(record.spend);
    const safeRevenue = parseMonetaryAmount(record.revenue);
    const normalizedConversions = normalizeAttributedCount(record.conversions);

    const derived = computeDerivedSnapshotMetrics({
      spend: record.spend,
      impressions: record.impressions,
      clicks: record.clicks,
      revenue: record.revenue,
    });

    return {
      organizationId: record.organizationId,
      clientId: record.clientId,
      campaignId: record.campaignId ?? null,
      activationId: record.activationId ? String(record.activationId) : null,
      platform: record.platform,
      providerAccountId: record.providerAccountId ?? null,
      externalCampaignId: record.externalCampaignId ?? null,
      snapshotDate: new Date(`${record.snapshotDate}T00:00:00Z`),
      granularity: record.granularity || input.granularity || 'daily',
      scope: record.scope || input.scope || 'campaign',
      currency: record.currency || 'COP',
      metrics: {
        spend: safeSpend,
        impressions: record.impressions ?? null,
        reach: record.reach ?? null,
        clicks: record.clicks ?? null,
        leads: record.leads ?? null,
        conversions: normalizedConversions,
        revenue: safeRevenue,
        ctr: derived.ctr,
        cpc: derived.cpc,
        cpm: derived.cpm,
        roas: derived.roas,
      },
      metadata: record.metadata || {},
    };
  });

  // 8. Persistencia atómica por lotes (Batch Upsert)
  if (saveInputs.length === 0) {
    return ok({
      organizationId: input.organizationId,
      clientId: input.clientId,
      platform: input.platform,
      recordsFetched: 0,
      pagesFetched,
      recordsSaved: 0,
      startDate: input.startDate,
      endDate: input.endDate,
    });
  }

  const saveRes = await deps.snapshotRepository.upsertBatch(saveInputs);

  if (!saveRes.success) {
    deps.logger.error('Failed to upsert snapshot metrics batch', {
      error: saveRes.error,
    });
    return err({
      code: 'INTERNAL_ERROR',
      message: `Failed to persist metrics batch: ${saveRes.error.message}`,
    });
  }

  return ok({
    organizationId: input.organizationId,
    clientId: input.clientId,
    platform: input.platform,
    recordsFetched: accumulatedRecords.length,
    pagesFetched,
    recordsSaved: saveRes.value.length,
    startDate: input.startDate,
    endDate: input.endDate,
  });
}
