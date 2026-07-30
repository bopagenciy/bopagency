import type { Result } from '@bop-agency/shared';
import type { ClientId } from '../entities/client';
import type { AdPlatform } from '@bop-agency/shared';

export type MetricsPeriod = {
  readonly clientId: ClientId;
  readonly platform: AdPlatform;
  readonly periodId: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly leads: number;
  readonly conversions: number;
  readonly revenue: number;
  readonly ctr: number;
  readonly cpc: number;
  readonly cpm: number;
  readonly roas: number;
};

export interface MetricsRepository {
  findByPeriod(clientId: ClientId, periodId: string): Promise<Result<MetricsPeriod>>;
  upsert(data: MetricsPeriod): Promise<Result<MetricsPeriod>>;
}
