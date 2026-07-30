import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Campaign, CampaignId, CampaignFilter } from '../entities/campaign';

export interface CampaignRepository {
  findById(id: CampaignId): Promise<Result<Campaign>>;
  findAll(filter: CampaignFilter, pagination: PaginationParams): Promise<PaginatedResult<Campaign>>;
  create(data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Campaign>>;
  update(id: CampaignId, data: Partial<Campaign>): Promise<Result<Campaign>>;
  delete(id: CampaignId): Promise<Result<void>>;
}
