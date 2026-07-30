import type { ClientId } from './client';
import type { AdPlatform } from '@bop-agency/shared';
import type { CampaignStatus } from '@bop-agency/shared';

export type CampaignId = string & { readonly _brand: 'CampaignId' };

export type CampaignObjective =
  | 'brand_awareness'
  | 'reach'
  | 'traffic'
  | 'engagement'
  | 'lead_generation'
  | 'conversions'
  | 'catalog_sales';

export type Campaign = {
  readonly id: CampaignId;
  readonly clientId: ClientId;
  readonly name: string;
  readonly platform: AdPlatform;
  readonly objective: CampaignObjective;
  readonly status: CampaignStatus;
  readonly budget: number;
  readonly currency: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CampaignFilter = {
  readonly clientId?: ClientId;
  readonly status?: CampaignStatus;
  readonly platform?: AdPlatform;
};
