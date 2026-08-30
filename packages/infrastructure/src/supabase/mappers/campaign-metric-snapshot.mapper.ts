/**
 * CampaignMetricSnapshotMapper — Supabase DB rows <-> Domain CampaignMetricSnapshot entities.
 */

import type { CampaignMetricSnapshot, CampaignMetricSnapshotId, CampaignMetricSnapshotValues, SnapshotGranularity, SnapshotScope } from '@bop-agency/domain';
import type { ClientId, OrganizationId, CampaignId, CampaignActivationId } from '@bop-agency/domain';
import { parseMonetaryAmount } from '@bop-agency/domain';
import type { MetricPlatform } from '@bop-agency/shared';
import { METRIC_PLATFORMS } from '@bop-agency/shared';

export type CampaignMetricSnapshotRow = {
  id: string;
  organization_id: string;
  client_id: string;
  campaign_id: string | null;
  activation_id?: string | null;
  platform: string;
  provider_account_id?: string | null;
  external_campaign_id?: string | null;
  snapshot_date: string;
  granularity?: string;
  scope?: string;
  currency?: string;
  spend: number | string | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  leads: number | null;
  conversions: number | null;
  revenue: number | string | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

function parsePlatform(raw: string, rowId: string): MetricPlatform {
  if ((METRIC_PLATFORMS as readonly string[]).includes(raw)) {
    return raw as MetricPlatform;
  }
  throw new Error(`CampaignMetricSnapshotMapper: platform "${raw}" no es válido (row.id=${rowId})`);
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(`CampaignMetricSnapshotMapper: "${field}" no es una fecha válida (row.id=${rowId}): ${raw}`);
  }
  return d;
}

function parseNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

export function rowToCampaignMetricSnapshot(row: CampaignMetricSnapshotRow): CampaignMetricSnapshot {
  const metrics: CampaignMetricSnapshotValues = {
    spend: parseMonetaryAmount(row.spend),
    impressions: parseNullableNumber(row.impressions),
    reach: parseNullableNumber(row.reach),
    clicks: parseNullableNumber(row.clicks),
    leads: parseNullableNumber(row.leads),
    conversions: parseNullableNumber(row.conversions),
    revenue: parseMonetaryAmount(row.revenue),
    ctr: parseNullableNumber(row.ctr),
    cpc: parseNullableNumber(row.cpc),
    cpm: parseNullableNumber(row.cpm),
    roas: parseNullableNumber(row.roas),
  };

  const metadata = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
    ? (row.metadata as Record<string, unknown>)
    : {};

  return {
    id: row.id as CampaignMetricSnapshotId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId: row.client_id as ClientId,
    campaignId: row.campaign_id ? (row.campaign_id as CampaignId) : null,
    activationId: row.activation_id ? (row.activation_id as CampaignActivationId) : null,
    platform: parsePlatform(row.platform, row.id),
    providerAccountId: row.provider_account_id ?? null,
    externalCampaignId: row.external_campaign_id ?? null,
    snapshotDate: parseDate(row.snapshot_date, 'snapshot_date', row.id),
    granularity: (row.granularity as SnapshotGranularity) || 'daily',
    scope: (row.scope as SnapshotScope) || 'campaign',
    currency: row.currency || 'COP',
    metrics,
    metadata,
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
  };
}
