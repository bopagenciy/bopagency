/**
 * Mapeador entre filas de Supabase/PostgreSQL (campaign_metrics_sync_states) y la entidad de dominio CampaignMetricsSyncState (Phase 9B.3).
 */

import type {
  CampaignMetricsSyncState,
  MetricsSyncStatus,
  MetricsSyncErrorCategory,
  ClientId,
  CampaignId,
} from '@bop-agency/domain';
import { campaignMetricsSyncStateId, organizationId, campaignActivationId, campaignActivationTargetId } from '@bop-agency/domain';
import type { MetricPlatform } from '@bop-agency/shared';

export type SupabaseCampaignMetricsSyncStateRow = {
  id: string;
  organization_id: string;
  client_id: string;
  campaign_id: string;
  activation_id: string;
  target_id: string;
  platform: string;
  provider_account_id: string;
  external_campaign_id: string;
  scope: string;
  granularity: string;
  status: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_synced_through_date: string | null;
  next_eligible_sync_at: string;
  consecutive_failures: number;
  claim_token: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  last_error_category: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToCampaignMetricsSyncState(row: SupabaseCampaignMetricsSyncStateRow): CampaignMetricsSyncState {
  return {
    id: campaignMetricsSyncStateId(row.id),
    organizationId: organizationId(row.organization_id),
    clientId: row.client_id as ClientId,
    campaignId: row.campaign_id as CampaignId,
    activationId: campaignActivationId(row.activation_id),
    targetId: campaignActivationTargetId(row.target_id),
    platform: row.platform as MetricPlatform,
    providerAccountId: row.provider_account_id,
    externalCampaignId: row.external_campaign_id,
    scope: 'campaign',
    granularity: 'daily',
    status: row.status as MetricsSyncStatus,
    lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
    lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
    lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at) : null,
    lastSyncedThroughDate: row.last_synced_through_date || null,
    nextEligibleSyncAt: new Date(row.next_eligible_sync_at),
    consecutiveFailures: Number(row.consecutive_failures || 0),
    claimToken: row.claim_token || null,
    claimedAt: row.claimed_at ? new Date(row.claimed_at) : null,
    claimExpiresAt: row.claim_expires_at ? new Date(row.claim_expires_at) : null,
    lastErrorCategory: row.last_error_category ? (row.last_error_category as MetricsSyncErrorCategory) : null,
    lastErrorMessage: row.last_error_message || null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
