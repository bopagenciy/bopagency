import type { ComplianceEvaluationResult } from '@bop-agency/domain';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 ring-red-200',
  high: 'bg-orange-100 text-orange-700 ring-orange-200',
  medium: 'bg-amber-100 text-amber-700 ring-amber-200',
  low: 'bg-gray-100 text-gray-600 ring-gray-200',
};

type ComplianceReviewProps = {
  evaluation: ComplianceEvaluationResult | null;
};

/**
 * Renderiza el resultado de `evaluateCampaignCompliance` (Phase 7C) —
 * evaluación DETERMINÍSTICA, no IA. `requiresManualReview` lista las reglas
 * aplicables que un humano debe interpretar contra el contenido de la
 * campaña; esto NUNCA bloquea aprobar/rechazar (ver R-PROD-01 / §10 de
 * PHASE_7_IMPLEMENTATION_PLAN.md) — es puramente informativo.
 */
export function ComplianceReview({ evaluation }: ComplianceReviewProps) {
  if (!evaluation) {
    return <p className="text-sm text-gray-400">No se pudo evaluar compliance para esta campaña.</p>;
  }

  if (evaluation.requiresManualReview.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No hay reglas de compliance aplicables registradas para esta campaña todavía.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        Reglas aplicables que requieren revisión manual — esto no bloquea la aprobación.
      </p>
      <ul className="space-y-2">
        {evaluation.requiresManualReview.map((rule) => (
          <li key={rule.ruleId} className="flex items-start gap-2 text-sm">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1 ring-inset shrink-0 mt-0.5 ${SEVERITY_STYLES[rule.severity] ?? SEVERITY_STYLES.low}`}
            >
              {rule.severity}
            </span>
            <span className="text-gray-700">{rule.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
