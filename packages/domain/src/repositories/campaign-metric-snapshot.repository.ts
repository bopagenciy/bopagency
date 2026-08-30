/**
 * CampaignMetricSnapshotRepository — Contrato de dominio para la persistencia de snapshots de métricas.
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { CampaignMetricSnapshot, CampaignMetricSnapshotId, SnapshotGranularity, SnapshotScope } from '../entities/campaign-metric-snapshot';
import type { ClientId } from '../entities/client';
import type { CampaignId } from '../entities/campaign';
import type { OrganizationId } from '../entities/organization';
import type { MetricPlatform } from '@bop-agency/shared';

export type SnapshotFilter = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly campaignId?: CampaignId | null;
  readonly platform?: MetricPlatform;
  readonly granularity?: SnapshotGranularity;
  readonly scope?: SnapshotScope;
  readonly startDate?: Date;
  readonly endDate?: Date;
};

export type SaveCampaignMetricSnapshotInput = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId?: CampaignId | null;
  readonly activationId?: string | null;
  readonly platform: MetricPlatform;
  readonly providerAccountId?: string | null;
  readonly externalCampaignId?: string | null;
  readonly snapshotDate: Date;
  readonly granularity?: SnapshotGranularity;
  readonly scope?: SnapshotScope;
  readonly currency?: string;
  readonly metrics: CampaignMetricSnapshot['metrics'];
  readonly metadata?: Record<string, unknown>;
};

export interface CampaignMetricSnapshotRepository {
  findById(id: CampaignMetricSnapshotId, organizationId: OrganizationId): Promise<Result<CampaignMetricSnapshot>>;

  findByFilter(
    filter: SnapshotFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignMetricSnapshot>>;

  save(input: SaveCampaignMetricSnapshotInput): Promise<Result<CampaignMetricSnapshot>>;

  upsertBatch(inputs: SaveCampaignMetricSnapshotInput[]): Promise<Result<CampaignMetricSnapshot[]>>;
}
