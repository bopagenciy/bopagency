import type { Result } from '@bop-agency/shared';
import type { AdPlatform } from '@bop-agency/shared';

export type MetricsQuery = {
  readonly clientId: string;
  readonly platform: AdPlatform;
  readonly from: string;
  readonly to: string;
};

export type MetricsSnapshot = {
  readonly clientId: string;
  readonly platform: AdPlatform;
  readonly periodId: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly leads: number;
  readonly conversions: number;
  readonly roas: number;
  readonly syncedAt: Date;
};

/** Aggregated metrics provider — may compose multiple platform providers. */
export interface MetricsProvider {
  getMetrics(query: MetricsQuery): Promise<Result<MetricsSnapshot>>;
  syncMetrics(clientId: string, periodId: string): Promise<Result<MetricsSnapshot>>;
}
