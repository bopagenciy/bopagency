import type { ClientId } from './client';
import type { UserId } from './user';
import type { TaskStatus } from '@bop-agency/shared';

export type TaskId = string & { readonly _brand: 'TaskId' };

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type Task = {
  readonly id: TaskId;
  readonly clientId?: ClientId;
  readonly assigneeId?: UserId;
  readonly title: string;
  readonly description?: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly dueDate?: Date;
  readonly requiresApproval: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
