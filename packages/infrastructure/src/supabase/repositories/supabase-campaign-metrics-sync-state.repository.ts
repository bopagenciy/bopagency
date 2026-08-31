/**
 * SupabaseCampaignMetricsSyncStateRepository — Implementación Supabase/PostgreSQL para la persistencia,
 * consulta de vencimientos y reclamo atómico de estados de sincronización de métricas (Phase 9B.3/9B.4).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { MetricPlatform } from '@bop-agency/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OrganizationId,
  CampaignActivationTargetId,
  CampaignMetricsSyncState,
  CampaignMetricsSyncStateId,
  CampaignMetricsSyncStateRepository,
  CreateMetricsSyncStateInput,
  MarkSyncSuccessInput,
  MarkSyncFailureInput,
  ClaimDueTargetResult,
} from '@bop-agency/domain';
import { MAX_CONSECUTIVE_FAILURES, MAX_SYNC_ERROR_MESSAGE_LENGTH } from '@bop-agency/domain';
import {
  rowToCampaignMetricsSyncState,
  type SupabaseCampaignMetricsSyncStateRow,
} from '../mappers/campaign-metrics-sync-state.mapper';

export class SupabaseCampaignMetricsSyncStateRepository implements CampaignMetricsSyncStateRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getOrCreateSyncState(input: CreateMetricsSyncStateInput): Promise<Result<CampaignMetricsSyncState>> {
    try {
      const { data: existing, error: findError } = await this.client
        .from('campaign_metrics_sync_states')
        .select('*')
        .eq('target_id', input.targetId)
        .maybeSingle();

      if (findError) {
        return err({ code: 'INTERNAL_ERROR', message: `Database query failed: ${findError.message}` });
      }

      if (existing) {
        return ok(rowToCampaignMetricsSyncState(existing as SupabaseCampaignMetricsSyncStateRow));
      }

      const pastDueTime = new Date(Date.now() - 5000);

      const { data: inserted, error: insertError } = await this.client
        .from('campaign_metrics_sync_states')
        .insert({
          organization_id: input.organizationId,
          client_id: input.clientId,
          campaign_id: input.campaignId,
          activation_id: input.activationId,
          target_id: input.targetId,
          platform: input.platform,
          provider_account_id: input.providerAccountId,
          external_campaign_id: input.externalCampaignId,
          scope: 'campaign',
          granularity: 'daily',
          status: 'never_synced',
          next_eligible_sync_at: pastDueTime.toISOString(),
          consecutive_failures: 0,
        })
        .select('*')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          const { data: reFetched } = await this.client
            .from('campaign_metrics_sync_states')
            .select('*')
            .eq('target_id', input.targetId)
            .single();
          if (reFetched) {
            return ok(rowToCampaignMetricsSyncState(reFetched as SupabaseCampaignMetricsSyncStateRow));
          }
        }
        return err({ code: 'INTERNAL_ERROR', message: `Failed to insert metrics sync state: ${insertError.message}` });
      }

      return ok(rowToCampaignMetricsSyncState(inserted as SupabaseCampaignMetricsSyncStateRow));
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Unexpected error in getOrCreateSyncState: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  async findById(id: CampaignMetricsSyncStateId): Promise<Result<CampaignMetricsSyncState>> {
    try {
      const { data, error } = await this.client
        .from('campaign_metrics_sync_states')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        return err({ code: 'INTERNAL_ERROR', message: `Database query failed: ${error.message}` });
      }

      if (!data) {
        return err({ code: 'NOT_FOUND', message: `Campaign metrics sync state '${id}' not found` });
      }

      return ok(rowToCampaignMetricsSyncState(data as SupabaseCampaignMetricsSyncStateRow));
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Unexpected error in findById: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  async findByTargetId(targetId: CampaignActivationTargetId): Promise<Result<CampaignMetricsSyncState>> {
    try {
      const { data, error } = await this.client
        .from('campaign_metrics_sync_states')
        .select('*')
        .eq('target_id', targetId)
        .maybeSingle();

      if (error) {
        return err({ code: 'INTERNAL_ERROR', message: `Database query failed: ${error.message}` });
      }

      if (!data) {
        return err({ code: 'NOT_FOUND', message: `Campaign metrics sync state for target '${targetId}' not found` });
      }

      return ok(rowToCampaignMetricsSyncState(data as SupabaseCampaignMetricsSyncStateRow));
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Unexpected error in findByTargetId: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  async listDueTargets(
    organizationId: OrganizationId,
    platform?: MetricPlatform | null,
    limit: number = 50,
  ): Promise<Result<CampaignMetricsSyncState[]>> {
    try {
      let query = this.client
        .from('campaign_metrics_sync_states')
        .select('*')
        .eq('organization_id', organizationId)
        .order('next_eligible_sync_at', { ascending: true })
        .limit(limit);

      if (platform) {
        query = query.eq('platform', platform);
      }

      const { data, error } = await query;

      if (error) {
        return err({ code: 'INTERNAL_ERROR', message: `Failed to list due sync states: ${error.message}` });
      }

      const states = (data || []).map((r) => rowToCampaignMetricsSyncState(r as SupabaseCampaignMetricsSyncStateRow));
      return ok(states);
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Unexpected error in listDueTargets: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  async listDueTargetsGlobal(
    platform?: MetricPlatform | null,
    limit: number = 50,
  ): Promise<Result<CampaignMetricsSyncState[]>> {
    try {
      let query = this.client
        .from('campaign_metrics_sync_states')
        .select('*')
        .order('next_eligible_sync_at', { ascending: true })
        .limit(limit);

      if (platform) {
        query = query.eq('platform', platform);
      }

      const { data, error } = await query;

      if (error) {
        return err({ code: 'INTERNAL_ERROR', message: `Failed to list due sync states globally: ${error.message}` });
      }

      const states = (data || []).map((r) => rowToCampaignMetricsSyncState(r as SupabaseCampaignMetricsSyncStateRow));
      return ok(states);
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Unexpected error in listDueTargetsGlobal: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  /**
   * Reclama atómicamente la ejecución de un target vencido usando UNICAMENTE el RPC de PostgreSQL.
   * Sin mutaciones client-side de fallback.
   */
  async claimDueTarget(
    syncStateId: CampaignMetricsSyncStateId,
    claimToken: string,
    leaseDurationMinutes: number = 15,
  ): Promise<Result<ClaimDueTargetResult>> {
    try {
      const { data, error } = await this.client.rpc('claim_due_metrics_sync_target', {
        p_sync_state_id: syncStateId,
        p_claim_token: claimToken,
        p_lease_duration_minutes: leaseDurationMinutes,
      });

      if (error) {
        return err({ code: 'INTERNAL_ERROR', message: `Atomic claim RPC failed: ${error.message}` });
      }

      if (data && Array.isArray(data) && data.length > 0) {
        const first = data[0];
        if (first.claimed && first.sync_state) {
          return ok({
            claimed: true,
            syncState: rowToCampaignMetricsSyncState(first.sync_state as SupabaseCampaignMetricsSyncStateRow),
          });
        }
      }

      return ok({ claimed: false, syncState: null });
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Unexpected error in claimDueTarget: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  async markSuccess(input: MarkSyncSuccessInput): Promise<Result<CampaignMetricsSyncState>> {
    try {
      const now = new Date();

      const { data, error } = await this.client
        .from('campaign_metrics_sync_states')
        .update({
          status: 'fresh',
          last_attempt_at: input.attemptedAt.toISOString(),
          last_success_at: input.attemptedAt.toISOString(),
          last_synced_through_date: input.syncedThroughDate,
          next_eligible_sync_at: input.nextEligibleSyncAt.toISOString(),
          consecutive_failures: 0,
          claim_token: null,
          claimed_at: null,
          claim_expires_at: null,
          last_error_category: null,
          last_error_message: null,
          updated_at: now.toISOString(),
        })
        .eq('id', input.syncStateId)
        .eq('claim_token', input.claimToken)
        .eq('status', 'syncing')
        .select('*')
        .maybeSingle();

      if (error) {
        return err({ code: 'INTERNAL_ERROR', message: `Failed to mark sync success: ${error.message}` });
      }

      if (!data) {
        return err({
          code: 'CONFLICT',
          message: `Stale worker lease mismatch: sync state '${input.syncStateId}' is no longer claimed by token '${input.claimToken}'`,
        });
      }

      return ok(rowToCampaignMetricsSyncState(data as SupabaseCampaignMetricsSyncStateRow));
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Unexpected error in markSuccess: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  async markFailure(input: MarkSyncFailureInput): Promise<Result<CampaignMetricsSyncState>> {
    try {
      const now = new Date();

      const { data: existing } = await this.client
        .from('campaign_metrics_sync_states')
        .select('consecutive_failures')
        .eq('id', input.syncStateId)
        .maybeSingle();

      const currentFailures = Number(existing?.consecutive_failures || 0);
      const newFailures = Math.min(currentFailures + 1, MAX_CONSECUTIVE_FAILURES);
      const newStatus = newFailures >= MAX_CONSECUTIVE_FAILURES ? 'failed' : 'backoff';

      const sanitizedMessage = input.errorMessage.slice(0, MAX_SYNC_ERROR_MESSAGE_LENGTH);

      const { data, error } = await this.client
        .from('campaign_metrics_sync_states')
        .update({
          status: newStatus,
          last_attempt_at: input.attemptedAt.toISOString(),
          last_failure_at: input.attemptedAt.toISOString(),
          next_eligible_sync_at: input.nextEligibleSyncAt.toISOString(),
          consecutive_failures: newFailures,
          claim_token: null,
          claimed_at: null,
          claim_expires_at: null,
          last_error_category: input.errorCategory,
          last_error_message: sanitizedMessage,
          updated_at: now.toISOString(),
        })
        .eq('id', input.syncStateId)
        .eq('claim_token', input.claimToken)
        .eq('status', 'syncing')
        .select('*')
        .maybeSingle();

      if (error) {
        return err({ code: 'INTERNAL_ERROR', message: `Failed to mark sync failure: ${error.message}` });
      }

      if (!data) {
        return err({
          code: 'CONFLICT',
          message: `Stale worker lease mismatch: sync state '${input.syncStateId}' is no longer claimed by token '${input.claimToken}'`,
        });
      }

      return ok(rowToCampaignMetricsSyncState(data as SupabaseCampaignMetricsSyncStateRow));
    } catch (cause) {
      return err({
        code: 'INTERNAL_ERROR',
        message: `Unexpected error in markFailure: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }
}
