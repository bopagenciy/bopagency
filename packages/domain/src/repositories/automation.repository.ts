import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Automation, AutomationId } from '../entities/automation';

export interface AutomationRepository {
  findById(id: AutomationId): Promise<Result<Automation>>;
  findAll(pagination: PaginationParams): Promise<PaginatedResult<Automation>>;
  update(id: AutomationId, data: Partial<Automation>): Promise<Result<Automation>>;
}
