import type { Result } from '@bop-agency/shared';
import type { AutomationId } from '@bop-agency/domain';
import type { AutomationRun } from './automation-run';

export type DispatchOptions = {
  readonly idempotencyKey: string;
  readonly payload: Record<string, unknown>;
};

/** Primary port — n8n webhook adapter in Fase 2+. */
export interface WorkflowDispatcher {
  dispatch(automationId: AutomationId, options: DispatchOptions): Promise<Result<AutomationRun>>;
  cancel(runId: string): Promise<Result<void>>;
}
