import type { SkillId } from '@bop-agency/domain';
import type { AIRequest } from './ai-provider';

export type SkillInput = Record<string, unknown>;
export type SkillOutput = Record<string, unknown>;

export type SkillDefinition = {
  readonly id: SkillId;
  readonly name: string;
  readonly description: string;
  buildRequest(input: SkillInput): AIRequest;
  parseOutput(raw: string): SkillOutput;
};
