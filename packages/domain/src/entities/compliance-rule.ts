import type { OrganizationId } from './organization';
import type { ClientId } from './client';
import type { AdPlatform } from '@bop-agency/shared';

/**
 * ComplianceRule — Phase 7B.
 *
 * Modela una regla de compliance persistida (tabla `compliance_rules`).
 * Solo se define el TIPO en Phase 7B: la tabla se crea vacía (no se importa
 * compliance-master-guide.md ni los compliance-rules.md por cliente todavía
 * — instrucción explícita de esta tarea) y ningún use case de 7B la lee o
 * escribe. No se crea `ComplianceRuleRepository` para evitar sobrearquitectura
 * sin un caller real; Phase 7C/7D lo implementan cuando createCampaignWithAI
 * necesite consultar reglas activas.
 */
export type ComplianceRuleId = string & { readonly _brand: 'ComplianceRuleId' };

export type ComplianceRuleSeverity = 'critical' | 'high' | 'medium' | 'low';

export type ComplianceRule = {
  readonly id: ComplianceRuleId;
  /** NULL = regla global (aplica a todas las organizaciones). */
  readonly organizationId: OrganizationId | null;
  /** NULL = aplica a nivel de organización completa (o global, si organizationId también es NULL). */
  readonly clientId: ClientId | null;
  /** NULL = aplica a todas las plataformas. */
  readonly platform: AdPlatform | null;
  /** Ver PHASE_7_AUDIT.md §5 — la guía maestra no está organizada sistemáticamente por jurisdicción. */
  readonly jurisdiction: string | null;
  readonly ruleKey: string;
  readonly title: string;
  readonly description: string;
  readonly severity: ComplianceRuleSeverity;
  readonly category: string;
  readonly active: boolean;
  readonly source: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
