/**
 * MetricsProvider — Puerto de abstracción para proveedores de métricas publicitarias (Phase 9B.0).
 */

import type { Result } from '@bop-agency/shared';
import type { MetricPlatform } from '@bop-agency/shared';
import type { NormalizedMetricRecord, MetricsProviderFetchRequest } from '../dtos/normalized-metric-record.dto';

export type MetricsProviderErrorCategory =
  | 'AUTH_FAILURE'
  | 'RATE_LIMIT'
  | 'TRANSIENT_FAILURE'
  | 'INVALID_REQUEST'
  | 'PROVIDER_UNAVAILABLE'
  | 'TENANT_MISMATCH'
  | 'UNKNOWN';

export type MetricsProviderError = {
  readonly category: MetricsProviderErrorCategory;
  readonly message: string;
  readonly isRetryable: boolean;
  readonly providerCode?: string;
  readonly rawError?: unknown;
};

export type MetricsProviderPageResult = {
  readonly records: NormalizedMetricRecord[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export interface MetricsProvider {
  readonly platform: MetricPlatform;
  fetchMetrics(request: MetricsProviderFetchRequest): Promise<Result<MetricsProviderPageResult, MetricsProviderError>>;
}
