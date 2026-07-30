import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Report, ReportId } from '../entities/report';
import type { ClientId } from '../entities/client';

export interface ReportRepository {
  findById(id: ReportId): Promise<Result<Report>>;
  findByClient(clientId: ClientId, pagination: PaginationParams): Promise<PaginatedResult<Report>>;
  create(data: Omit<Report, 'id' | 'createdAt'>): Promise<Result<Report>>;
  update(id: ReportId, data: Partial<Report>): Promise<Result<Report>>;
}
