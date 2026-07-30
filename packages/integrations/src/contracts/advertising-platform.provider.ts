import type { Result } from '@bop-agency/shared';
import type { AdPlatform } from '@bop-agency/shared';

export type AdAccountId = string;
export type AdCampaignId = string;

export type PlatformCampaignMetrics = {
  readonly campaignId: AdCampaignId;
  readonly platform: AdPlatform;
  readonly periodId: string;
  readonly spend: number;
  readonly impressions: number;
  readonly clicks: number;
  readonly leads: number;
  readonly conversions: number;
};

export type PlatformCampaignSummary = {
  readonly id: AdCampaignId;
  readonly name: string;
  readonly status: string;
  readonly objective: string;
};

/** Primary port — Meta Ads API adapter (via n8n in Fase 1, direct in Fase 2+). */
export interface AdvertisingPlatformProvider {
  getAccountMetrics(
    accountId: AdAccountId,
    periodId: string,
  ): Promise<Result<readonly PlatformCampaignMetrics[]>>;

  getCampaigns(accountId: AdAccountId): Promise<Result<readonly PlatformCampaignSummary[]>>;
}
