/**
 * ComplianceRuleRepository — contrato de dominio para la tabla
 * `compliance_rules`, Phase 7C.
 *
 * Solo `findApplicableRules`. NO se agrega `findById`: ningún use case de
 * 7C necesita cargar una regla individual por id — instrucción explícita de
 * esta tarea ("findById solo si existe caller real"). Si Phase 7D o una UI
 * de gestión de reglas lo necesitan, se agrega entonces con su propio
 * caller.
 */

import type { Result } from '@bop-agency/shared';
import type { ComplianceRule, ComplianceRuleFilter } from '../entities/compliance-rule';

export interface ComplianceRuleRepository {
  /**
   * Reglas ACTIVAS aplicables a la combinación organización/cliente/
   * plataforma/jurisdicción dada, ya resueltas por precedencia (cliente >
   * organización > global — ver `resolveComplianceRulePrecedence`).
   * Nunca retorna reglas de otra organización, ni de otro cliente dentro de
   * la misma organización.
   */
  findApplicableRules(filter: ComplianceRuleFilter): Promise<Result<ComplianceRule[]>>;
}
