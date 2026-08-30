/**
 * SupabaseCampaignMetricSnapshotRepository — Implementación de CampaignMetricSnapshotRepository respaldada por Supabase.
 */

import { ok, err, paginate } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  CampaignMetricSnapshot,
  CampaignMetricSnapshotId,
  CampaignMetricSnapshotRepository,
  SnapshotFilter,
  SaveCampaignMetricSnapshotInput,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToCampaignMetricSnapshot,
  type CampaignMetricSnapshotRow,
} from '../mappers/campaign-metric-snapshot.mapper';

const DEFAULT_PAGE_SIZE = 20;

export class SupabaseCampaignMetricSnapshotRepository implements CampaignMetricSnapshotRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: CampaignMetricSnapshotId, organizationId: OrganizationId): Promise<Result<CampaignMetricSnapshot>> {
    try {
      const { data, error } = await this.client
        .from('campaign_metric_snapshots')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (error || !data) {
        return err({
          code: 'NOT_FOUND',
          message: `Campaign metric snapshot not found: ${id}`,
        });
      }

      return ok(rowToCampaignMetricSnapshot(data as CampaignMetricSnapshotRow));
    } catch (e) {
      return err({
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Unknown error finding metric snapshot',
      });
    }
  }

  async findByFilter(
    filter: SnapshotFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignMetricSnapshot>> {
    const page = Math.max(1, pagination.page || 1);
    const pageSize = pagination.pageSize || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
      let query = this.client
        .from('campaign_metric_snapshots')
        .select('*', { count: 'exact' })
        .eq('organization_id', filter.organizationId);

      if (filter.clientId) query = query.eq('client_id', filter.clientId);
      if (filter.campaignId !== undefined) {
        if (filter.campaignId === null) {
          query = query.is('campaign_id', null);
        } else {
          query = query.eq('campaign_id', filter.campaignId);
        }
      }
      if (filter.platform) query = query.eq('platform', filter.platform);
      if (filter.granularity) query = query.eq('granularity', filter.granularity);
      if (filter.scope) query = query.eq('scope', filter.scope);
      if (filter.startDate) query = query.gte('snapshot_date', filter.startDate.toISOString().split('T')[0]);
      if (filter.endDate) query = query.lte('snapshot_date', filter.endDate.toISOString().split('T')[0]);

      query = query.order('snapshot_date', { ascending: false }).range(from, to);

      const { data, count, error } = await query;

      if (error) {
        return paginate([], 0, pagination);
      }

      const snapshots = (data || []).map((row) => rowToCampaignMetricSnapshot(row as CampaignMetricSnapshotRow));
      return paginate(snapshots, count || 0, pagination);
    } catch {
      return paginate([], 0, pagination);
    }
  }

  private mapInputToRow(input: SaveCampaignMetricSnapshotInput): Record<string, unknown> {
    return {
      organization_id: input.organizationId,
      client_id: input.clientId,
      campaign_id: input.campaignId || null,
      activation_id: input.activationId || null,
      platform: input.platform,
      provider_account_id: input.providerAccountId || null,
      external_campaign_id: input.externalCampaignId || null,
      snapshot_date: input.snapshotDate.toISOString().split('T')[0],
      granularity: input.granularity || 'daily',
      scope: input.scope || 'campaign',
      currency: input.currency || 'COP',
      spend: input.metrics.spend,
      impressions: input.metrics.impressions,
      reach: input.metrics.reach,
      clicks: input.metrics.clicks,
      leads: input.metrics.leads,
      conversions: input.metrics.conversions,
      revenue: input.metrics.revenue,
      ctr: input.metrics.ctr,
      cpc: input.metrics.cpc,
      cpm: input.metrics.cpm,
      roas: input.metrics.roas,
      metadata: input.metadata || {},
    };
  }

  async save(input: SaveCampaignMetricSnapshotInput): Promise<Result<CampaignMetricSnapshot>> {
    const batchRes = await this.upsertBatch([input]);
    if (!batchRes.success || batchRes.value.length === 0) {
      return err({
        code: 'INTERNAL_ERROR',
        message: batchRes.success ? 'Failed to save campaign metric snapshot' : batchRes.error.message,
      });
    }
    const saved = batchRes.value[0];
    if (!saved) {
      return err({ code: 'INTERNAL_ERROR', message: 'Failed to save campaign metric snapshot' });
    }
    return ok(saved);
  }

  async upsertBatch(inputs: SaveCampaignMetricSnapshotInput[]): Promise<Result<CampaignMetricSnapshot[]>> {
    if (inputs.length === 0) return ok([]);

    try {
      const payloads = inputs.map((inp) => this.mapInputToRow(inp));
      const recordsToInsert: Record<string, unknown>[] = [];
      const recordsToUpdate: Record<string, unknown>[] = [];

      for (const payload of payloads) {
        let query = this.client
          .from('campaign_metric_snapshots')
          .select('id')
          .eq('organization_id', payload['organization_id'] as string)
          .eq('client_id', payload['client_id'] as string)
          .eq('platform', payload['platform'] as string)
          .eq('snapshot_date', payload['snapshot_date'] as string)
          .eq('granularity', payload['granularity'] as string)
          .eq('scope', payload['scope'] as string);

        if (payload['campaign_id']) query = query.eq('campaign_id', payload['campaign_id'] as string);
        else query = query.is('campaign_id', null);

        if (payload['activation_id']) query = query.eq('activation_id', payload['activation_id'] as string);
        else query = query.is('activation_id', null);

        if (payload['provider_account_id']) query = query.eq('provider_account_id', payload['provider_account_id'] as string);
        else query = query.is('provider_account_id', null);

        if (payload['external_campaign_id']) query = query.eq('external_campaign_id', payload['external_campaign_id'] as string);
        else query = query.is('external_campaign_id', null);

        const { data: existing } = await query.maybeSingle();
        if (existing?.id) {
          payload['id'] = existing.id;
          recordsToUpdate.push(payload);
        } else {
          recordsToInsert.push(payload);
        }
      }

      const resultRows: CampaignMetricSnapshotRow[] = [];

      if (recordsToInsert.length > 0) {
        const { data: inserted, error: insertError } = await this.client
          .from('campaign_metric_snapshots')
          .insert(recordsToInsert)
          .select('*');

        if (insertError || !inserted) {
          return err({
            code: 'INTERNAL_ERROR',
            message: insertError?.message || 'Failed to insert new campaign metric snapshots',
          });
        }
        resultRows.push(...(inserted as CampaignMetricSnapshotRow[]));
      }

      if (recordsToUpdate.length > 0) {
        const { data: updated, error: updateError } = await this.client
          .from('campaign_metric_snapshots')
          .upsert(recordsToUpdate, { onConflict: 'id' })
          .select('*');

        if (updateError || !updated) {
          return err({
            code: 'INTERNAL_ERROR',
            message: updateError?.message || 'Failed to update existing campaign metric snapshots',
          });
        }
        resultRows.push(...(updated as CampaignMetricSnapshotRow[]));
      }

      const snapshots = resultRows.map((row) => rowToCampaignMetricSnapshot(row));
      return ok(snapshots);
    } catch (e) {
      return err({
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Unknown error batch upserting campaign metric snapshots',
      });
    }
  }
}
