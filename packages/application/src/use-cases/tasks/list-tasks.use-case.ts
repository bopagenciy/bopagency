import { ok } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Task, TaskRepository } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type ListTasksInput = {
  pagination: PaginationParams;
};

export type ListTasksDeps = {
  taskRepository: TaskRepository;
  logger: LoggerPort;
};

export async function listTasks(
  input: ListTasksInput,
  deps: ListTasksDeps,
): Promise<Result<PaginatedResult<Task>>> {
  deps.logger.debug('listTasks');

  const result = await deps.taskRepository.findAll(input.pagination);
  return ok(result);
}
