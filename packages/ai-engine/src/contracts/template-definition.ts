import type { TemplateType } from '@bop-agency/domain';

export type TemplateDefinition = {
  readonly type: TemplateType;
  readonly name: string;
  readonly description: string;
  readonly promptTemplate: string;
  readonly requiredVariables: readonly string[];
};
