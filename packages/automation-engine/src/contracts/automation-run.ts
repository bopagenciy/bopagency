import type { AutomationId } from '@bop-agency/domain';

export type AutomationRunStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

export type AutomationRun = {
  readonly id: string;
  readonly automationId: AutomationId;
  readonly status: AutomationRunStatus;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly error?: string;
  readonly inputPayload: Record<string, unknown>;
  readonly outputPayload?: Record<string, unknown>;
};
