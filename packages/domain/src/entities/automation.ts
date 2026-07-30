export type AutomationId = string & { readonly _brand: 'AutomationId' };

export type AutomationStatus = 'active' | 'paused' | 'error' | 'disabled';

export type Automation = {
  readonly id: AutomationId;
  readonly name: string;
  readonly description: string;
  readonly status: AutomationStatus;
  readonly cronExpression?: string;
  readonly lastRunAt?: Date;
  readonly nextRunAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
