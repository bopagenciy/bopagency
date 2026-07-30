// Contracts (interfaces — no implementations in Fase 1)
export type {
  AIProvider,
  AIRequest,
  AIResponse,
  AIMessage,
  AIUsage,
} from './contracts/ai-provider';
export type { AgentDefinition } from './contracts/agent-definition';
export type { SkillDefinition, SkillInput, SkillOutput } from './contracts/skill-definition';
export type { PromptReference } from './contracts/prompt-reference';
export { renderPrompt } from './contracts/prompt-reference';
export type { TemplateDefinition } from './contracts/template-definition';
