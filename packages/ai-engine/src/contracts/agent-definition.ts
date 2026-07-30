import type { AgentType } from '@bop-agency/domain';
import type { SkillId } from '@bop-agency/domain';

export type AgentDefinition = {
  readonly type: AgentType;
  readonly systemPrompt: string;
  readonly availableSkills: readonly SkillId[];
  readonly maxTokensPerCall: number;
};
