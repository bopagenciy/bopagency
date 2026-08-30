/**
 * NormalizedMetricRecord — DTO canónico neutral para datos de rendimiento provenientes de proveedores publicitarios (Phase 9B.0).
 */

import type {
  OrganizationId,
  ClientId,
  CampaignId,
  CampaignActivationId,
  SnapshotGranularity,
  SnapshotScope,
} from '@bop-agency/domain';
import type { MetricPlatform } from '@bop-agency/shared';

export type NormalizedMetricRecord = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId?: CampaignId | null | undefined;
  readonly activationId?: CampaignActivationId | string | null | undefined;
  readonly platform: MetricPlatform;
  readonly providerAccountId?: string | null | undefined;
  readonly externalCampaignId?: string | null | undefined;
  readonly snapshotDate: string; // Fecha de reporte en formato 'YYYY-MM-DD'
  readonly granularity?: SnapshotGranularity | undefined;
  readonly scope?: SnapshotScope | undefined;
  readonly currency?: string | undefined;
  readonly spend: string | null; // Decimal string ("1234.57") o null
  readonly impressions: number | null;
  readonly reach: number | null;
  readonly clicks: number | null;
  readonly leads: number | null;
  readonly conversions: number | null;
  readonly revenue: string | null; // Decimal string ("1234.57") o null
  readonly metadata?: Record<string, unknown> | undefined;
};

/**
 * Solicitud pública de sincronización de métricas iniciada por un cliente/caso de uso.
 */
export type SyncMetricsRequest = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly platform: MetricPlatform;
  readonly startDate: string; // 'YYYY-MM-DD' (inclusive)
  readonly endDate: string;   // 'YYYY-MM-DD' (inclusive)
  readonly campaignId?: CampaignId | null | undefined;
  readonly activationId?: CampaignActivationId | string | null | undefined;
  readonly providerAccountId?: string | null | undefined;
  readonly granularity?: SnapshotGranularity | undefined;
  readonly scope?: SnapshotScope | undefined;
};

/**
 * Solicitud interna de fetch por página enviada al adaptador del proveedor.
 */
export type MetricsProviderFetchRequest = SyncMetricsRequest & {
  readonly pageCursor?: string | null | undefined;
};
