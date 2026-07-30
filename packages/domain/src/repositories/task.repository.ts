import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Task, TaskId } from '../entities/task';

export interface TaskRepository {
  findById(id: TaskId): Promise<Result<Task>>;
  findAll(pagination: PaginationParams): Promise<PaginatedResult<Task>>;
  create(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Task>>;
  update(id: TaskId, data: Partial<Task>): Promise<Result<Task>>;
  delete(id: TaskId): Promise<Result<void>>;
}
