import type { OrganizationId } from './organization';
import type { ClientId } from './client';
import type { Campaign, CampaignId } from './campaign';
import type { AdPlatform } from '@bop-agency/shared';

/**
 * ComplianceRule — Phase 7B (tipo) / Phase 7C (repositorio de lectura +
 * precedencia + evaluación determinística).
 *
 * Modela una regla de compliance persistida (tabla `compliance_rules`).
 * Phase 7B solo definió el TIPO (tabla vacía, sin repositorio, sin caller).
 * Phase 7C agrega:
 *  - `resolveComplianceRulePrecedence`: colapsa reglas con el mismo
 *    `ruleKey` aplicables en más de un nivel de scope, dejando solo la más
 *    específica (cliente > organización > global).
 *  - `evaluateCampaignCompliance`: evaluador DETERMINÍSTICO, NO IA — ver
 *    nota extensa más abajo sobre por qué NO produce violations/warnings
 *    reales todavía.
 *
 * La tabla sigue sin importarse (compliance-master-guide.md / archivos por
 * cliente) — eso permanece fuera de alcance de 7B/7C, ver
 * PHASE_7C_APPROVAL_COMPLIANCE_REPORT.md.
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

// ─── Filter (usado por ComplianceRuleRepository.findApplicableRules) ──────────

export type ComplianceRuleFilter = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly platform?: AdPlatform;
  readonly jurisdiction?: string;
};

// ─── Precedencia — Phase 7C ─────────────────────────────────────────────────────
//
// Precedencia explícita cuando dos reglas activas comparten el mismo
// `ruleKey` en distintos niveles de scope: cliente > organización > global.
// La BD ya impide DOS reglas en el MISMO nivel con el mismo ruleKey (índices
// únicos parciales en la migración de 7B), así que esta función solo
// necesita decidir entre niveles distintos, no dentro de un mismo nivel.
// No se implementa ningún merge de contenido (título/descripción/severidad)
// entre reglas del mismo ruleKey — la más específica gana por completo. Se
// evita deliberadamente una lógica de merge más compleja (instrucción
// explícita de esta tarea: "no inventar merge logic compleja sin necesidad").

function scopeSpecificity(rule: ComplianceRule): number {
  if (rule.clientId !== null) return 3; // cliente
  if (rule.organizationId !== null) return 2; // organización
  return 1; // global
}

export function resolveComplianceRulePrecedence(
  rules: readonly ComplianceRule[],
): ComplianceRule[] {
  const byKey = new Map<string, ComplianceRule>();

  for (const rule of rules) {
    const existing = byKey.get(rule.ruleKey);
    if (!existing || scopeSpecificity(rule) > scopeSpecificity(existing)) {
      byKey.set(rule.ruleKey, rule);
    }
  }

  return Array.from(byKey.values());
}

// ─── Evaluación determinística — Phase 7C ──────────────────────────────────────

export type ComplianceRuleReference = {
  readonly ruleId: ComplianceRuleId;
  readonly ruleKey: string;
  readonly title: string;
  readonly severity: ComplianceRuleSeverity;
};

export type ComplianceViolation = ComplianceRuleReference & {
  readonly reason: string;
};

export type ComplianceEvaluationResult = {
  readonly campaignId: CampaignId;
  /**
   * `true` cuando el evaluador determinístico no encontró NINGUNA violación
   * automática. IMPORTANTE: esto NO es una garantía de que la campaña sea
   * compliant — ver `requiresManualReview`. Dado el schema actual de
   * `compliance_rules` (contenido narrativo: title/description/category, sin
   * ninguna columna de condición estructurada evaluable), `violations` y
   * `warnings` están siempre vacíos hoy; `passed` únicamente refleja "no se
   * detectó ninguna violación automática", no "la campaña cumple todas las
   * reglas aplicables". No usar este campo para bloquear ningún flujo (ver
   * §10 de la tarea: compliance NO bloquea approve en 7C).
   */
  readonly passed: boolean;
  readonly violations: readonly ComplianceViolation[];
  readonly warnings: readonly ComplianceViolation[];
  /**
   * Reglas activas aplicables a esta campaña (tras precedencia) que NO
   * pueden evaluarse de forma determinística con el schema actual — es
   * decir, hoy, todas las reglas aplicables. La evaluación semántica real
   * (interpretar el texto de la regla contra el contenido de la campaña)
   * queda diferida a Phase 7D (IA), fuera de alcance de esta tarea.
   */
  readonly requiresManualReview: readonly ComplianceRuleReference[];
  /** Siempre vacío en 7C — ninguna regla se evalúa de forma automática todavía. */
  readonly evaluatedRuleKeys: readonly string[];
};

function toRuleReference(rule: ComplianceRule): ComplianceRuleReference {
  return {
    ruleId: rule.id,
    ruleKey: rule.ruleKey,
    title: rule.title,
    severity: rule.severity,
  };
}

/**
 * evaluateCampaignCompliance — evaluador DETERMINÍSTICO, NO IA.
 *
 * `applicableRules` se espera ya resuelto por precedencia
 * (`resolveComplianceRulePrecedence`) y ya filtrado por scope/plataforma vía
 * `ComplianceRuleRepository.findApplicableRules`. Esta función vuelve a
 * aplicar el filtro de plataforma como defensa en profundidad (mismo
 * criterio que `createCampaignDraft` reverificando la organización del
 * cliente pese a que el trigger de BD ya lo garantiza), y descarta reglas
 * inactivas por si el caller pasó un conjunto sin filtrar.
 *
 * LIMITACIÓN DOCUMENTADA (instrucción explícita de esta tarea): el schema
 * actual de `compliance_rules` guarda el contenido de la regla como texto
 * narrativo (title/description/category), sin ninguna condición
 * estructurada (p.ej. "budget >= X", "requiere disclaimer Y") que se pueda
 * evaluar mecánicamente contra los campos de `Campaign`. Fingir una
 * evaluación automática aquí sería falso. Por eso esta función NO produce
 * violations/warnings reales: retorna cada regla aplicable como
 * `requiresManualReview`, dejando la interpretación semántica (o asistida
 * por IA) para Phase 7D. `evaluatedRuleKeys` queda vacío para reflejarlo con
 * honestidad.
 */
export function evaluateCampaignCompliance(
  campaign: Campaign,
  applicableRules: readonly ComplianceRule[],
): ComplianceEvaluationResult {
  const relevant = applicableRules.filter(
    (rule) => rule.active && (rule.platform === null || rule.platform === campaign.platform),
  );

  return {
    campaignId: campaign.id,
    passed: true,
    violations: [],
    warnings: [],
    requiresManualReview: relevant.map(toRuleReference),
    evaluatedRuleKeys: [],
  };
}
