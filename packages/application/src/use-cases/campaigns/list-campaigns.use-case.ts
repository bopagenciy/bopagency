import { ok } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Campaign, CampaignFilter, CampaignRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListCampaignsInput = {
  filter: CampaignFilter;
  pagination: PaginationParams;
};

export type ListCampaignsDeps = {
  campaignRepository: CampaignRepository;
  logger: LoggerPort;
};

export async function listCampaigns(
  input: ListCampaignsInput,
  deps: ListCampaignsDeps,
): Promise<Result<PaginatedResult<Campaign>>> {
  deps.logger.debug('listCampaigns', { filter: input.filter });

  const result = await deps.campaignRepository.findAll(input.filter, input.pagination);
  return ok(result);
}
