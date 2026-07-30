import type { Result } from '@bop-agency/shared';

export type AIMessage = {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
};

export type AIRequest = {
  readonly model: string;
  readonly messages: readonly AIMessage[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stopSequences?: readonly string[];
};

export type AIUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

export type AIResponse = {
  readonly content: string;
  readonly model: string;
  readonly usage: AIUsage;
  readonly finishReason: 'stop' | 'max_tokens' | 'error';
};

/** Primary port — implemented in infrastructure (Claude API adapter). Not connected in Fase 1. */
export interface AIProvider {
  complete(request: AIRequest): Promise<Result<AIResponse>>;
}
