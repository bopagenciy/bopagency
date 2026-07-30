export type AgentId = string & { readonly _brand: 'AgentId' };

export type AgentType =
  'campaign_creator' | 'compliance_reviewer' | 'report_generator' | 'metrics_analyst' | 'custom';

export type Agent = {
  readonly id: AgentId;
  readonly name: string;
  readonly type: AgentType;
  readonly description: string;
  readonly promptPath: string;
  readonly version: string;
  readonly isEnabled: boolean;
  readonly createdAt: Date;
};
