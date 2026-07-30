import type { Result } from '@bop-agency/shared';
import type { Template, TemplateId } from '../entities/template';

export interface TemplateRepository {
  findById(id: TemplateId): Promise<Result<Template>>;
  findAll(): Promise<Template[]>;
}
