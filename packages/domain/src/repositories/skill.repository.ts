import type { Result } from '@bop-agency/shared';
import type { Skill, SkillId } from '../entities/skill';

export interface SkillRepository {
  findById(id: SkillId): Promise<Result<Skill>>;
  findAll(): Promise<Skill[]>;
}
