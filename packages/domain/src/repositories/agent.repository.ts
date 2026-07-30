import type { Result } from '@bop-agency/shared';
import type { Agent, AgentId } from '../entities/agent';

export interface AgentRepository {
  findById(id: AgentId): Promise<Result<Agent>>;
  findAll(): Promise<Agent[]>;
}
