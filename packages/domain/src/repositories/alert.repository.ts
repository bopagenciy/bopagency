import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Alert, AlertId } from '../entities/alert';
import type { ClientId } from '../entities/client';

export interface AlertRepository {
  findById(id: AlertId): Promise<Result<Alert>>;
  findByClient(clientId: ClientId, pagination: PaginationParams): Promise<PaginatedResult<Alert>>;
  findOpen(pagination: PaginationParams): Promise<PaginatedResult<Alert>>;
  create(data: Omit<Alert, 'id' | 'createdAt'>): Promise<Result<Alert>>;
  update(id: AlertId, data: Partial<Alert>): Promise<Result<Alert>>;
}
