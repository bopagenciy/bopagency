/**
 * automation-incident-severity.ts — Phase 6F
 *
 * Mapping centralizado y determinístico de tipos de incidente de automatización
 * a severidades de alerta y prioridades de tarea.
 *
 * REGLAS:
 * - AlertSeverity en DB: 'critical' | 'warning' | 'info'
 * - TaskPriority en DB: 'low' | 'medium' | 'high' | 'urgent'
 * - Los mappings son exhaustivos y testables.
 * - No se hardcodean dispersos en otros módulos.
 *
 * Mappings canónicos:
 * | Tipo de incidente          | AlertSeverity | TaskPriority |
 * |----------------------------|---------------|--------------|
 * | DISPATCH_FAILED            | warning       | high         |
 * | MAX_ATTEMPTS_REACHED       | warning       | high         |
 * | WEBHOOK_INVALID_REPEATED   | critical      | urgent       |
 * | TIMEOUT                    | warning       | high         |
 * | STUCK_RUNNING              | warning       | high         |
 * | STUCK_QUEUED               | info          | medium       |
 * | EXECUTION_FAILED_GENERIC   | info          | medium       |
 * | EXECUTION_FAILED_CRITICAL  | warning       | high         |
 */

import type { AlertSeverity } from '@bop-agency/shared';
import type { TaskPriority } from '@bop-agency/domain';

// ─── Incident types ────────────────────────────────────────────────────────────

export type AutomationIncidentType =
  | 'DISPATCH_FAILED'
  | 'MAX_ATTEMPTS_REACHED'
  | 'WEBHOOK_INVALID_REPEATED'
  | 'TIMEOUT'
  | 'STUCK_RUNNING'
  | 'STUCK_QUEUED'
  | 'EXECUTION_FAILED_GENERIC'
  | 'EXECUTION_FAILED_CRITICAL';

// ─── Severity mapping ─────────────────────────────────────────────────────────

const ALERT_SEVERITY_MAP: Record<AutomationIncidentType, AlertSeverity> = {
  DISPATCH_FAILED:           'warning',
  MAX_ATTEMPTS_REACHED:      'warning',
  WEBHOOK_INVALID_REPEATED:  'critical',
  TIMEOUT:                   'warning',
  STUCK_RUNNING:             'warning',
  STUCK_QUEUED:              'info',
  EXECUTION_FAILED_GENERIC:  'info',
  EXECUTION_FAILED_CRITICAL: 'warning',
};

// ─── Priority mapping ─────────────────────────────────────────────────────────

const TASK_PRIORITY_MAP: Record<AutomationIncidentType, TaskPriority> = {
  DISPATCH_FAILED:           'high',
  MAX_ATTEMPTS_REACHED:      'high',
  WEBHOOK_INVALID_REPEATED:  'urgent',
  TIMEOUT:                   'high',
  STUCK_RUNNING:             'high',
  STUCK_QUEUED:              'medium',
  EXECUTION_FAILED_GENERIC:  'medium',
  EXECUTION_FAILED_CRITICAL: 'high',
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Devuelve la severidad de alerta para un tipo de incidente.
 * Determinístico y testeable.
 */
export function getAlertSeverityForIncident(type: AutomationIncidentType): AlertSeverity {
  return ALERT_SEVERITY_MAP[type];
}

/**
 * Devuelve la prioridad de tarea para un tipo de incidente.
 */
export function getTaskPriorityForIncident(type: AutomationIncidentType): TaskPriority {
  return TASK_PRIORITY_MAP[type];
}

/**
 * Clasifica un errorCode de ejecución en un tipo de incidente.
 * Si el errorCode no es reconocido, devuelve EXECUTION_FAILED_GENERIC.
 */
export function classifyErrorCode(errorCode: string | null | undefined): AutomationIncidentType {
  if (!errorCode) return 'EXECUTION_FAILED_GENERIC';

  const normalized = errorCode.toUpperCase();

  if (normalized === 'DISPATCH_FAILED') return 'DISPATCH_FAILED';
  if (normalized === 'MAX_ATTEMPTS_REACHED') return 'MAX_ATTEMPTS_REACHED';
  if (normalized === 'TIMEOUT' || normalized.includes('TIMEOUT')) return 'TIMEOUT';

  // Errores críticos de configuración de workflow
  const criticalCodes = ['AUTH_FAILED', 'WORKFLOW_NOT_FOUND', 'PERMISSION_DENIED', 'CONFIG_ERROR'];
  if (criticalCodes.some((c) => normalized.includes(c))) return 'EXECUTION_FAILED_CRITICAL';

  return 'EXECUTION_FAILED_GENERIC';
}

/**
 * Tipos de incidente recuperables — cuya alerta se puede resolver
 * automáticamente cuando una ejecución posterior tiene éxito.
 */
export const RECOVERABLE_INCIDENT_TYPES: ReadonlySet<AutomationIncidentType> = new Set([
  'DISPATCH_FAILED',
  'EXECUTION_FAILED_GENERIC',
  'EXECUTION_FAILED_CRITICAL',
  'TIMEOUT',
  'STUCK_RUNNING',
  'STUCK_QUEUED',
]);

/**
 * Retorna `true` si el tipo de incidente es recuperable automáticamente.
 */
export function isRecoverableIncident(type: AutomationIncidentType): boolean {
  return RECOVERABLE_INCIDENT_TYPES.has(type);
}
