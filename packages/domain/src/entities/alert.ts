/**
 * Alert — entidad de dominio para la tabla `alerts` en Supabase.
 *
 * IMPORTANTE — diferencias con la entidad anterior:
 * - `AlertStatus` ahora usa los valores reales del enum DB:
 *   'active' | 'acknowledged' | 'snoozed' | 'resolved'
 *   (anteriormente 'open' | ... | 'suppressed')
 * - `AlertPlatform` usa MetricPlatform (valores del CHECK constraint de DB),
 *   no AdPlatform.
 * - Eliminado `ruleType` (no existe en DB; reemplazado por `alertType` libre).
 * - La tabla NO tiene campo `message`; el campo equivalente es `description`.
 * - Añadidos: organizationId, alertKey, alertType, accountId, detectedAt,
 *   acknowledgedBy, snoozedUntil, resolvedBy.
 * - Reglas de transición de estado implementadas como funciones puras.
 */

import type { ClientId } from './client';
import type { OrganizationId } from './organization';
import type { AlertSeverity, AlertStatus, MetricPlatform } from '@bop-agency/shared';

export type AlertId = string & { readonly _brand: 'AlertId' };

// ─── Alert entity ─────────────────────────────────────────────────────────────

export type Alert = {
  readonly id: AlertId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId | null;
  /** Clave única de deduplicación. Generada por el sistema de alertas. */
  readonly alertKey: string;
  /** Tipo de alerta en texto libre (ej. 'ctr_drop', 'budget_exceeded'). */
  readonly alertType: string;
  readonly platform: MetricPlatform | null;
  readonly accountId: string | null;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus;
  readonly title: string | null;
  /**
   * Descripción detallada de la alerta.
   * Corresponde a la columna `description` en DB (NO `message`).
   */
  readonly description: string | null;
  readonly metadata: Record<string, unknown>;
  readonly detectedAt: Date | null;
  readonly acknowledgedAt: Date | null;
  readonly acknowledgedBy: string | null;
  readonly snoozedUntil: Date | null;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── Alert filter ─────────────────────────────────────────────────────────────

export type AlertFilter = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly status?: AlertStatus;
  readonly severity?: AlertSeverity;
  readonly platform?: MetricPlatform;
};

// ─── Transition rules ─────────────────────────────────────────────────────────

/**
 * Grafo de transiciones válidas de AlertStatus.
 *
 * active → acknowledged  (cualquier miembro)
 * active → resolved      (operator+)
 * acknowledged → resolved (operator+)
 * acknowledged → snoozed  (cualquier miembro)
 * snoozed → active        (reactivación tras snooze)
 * snoozed → resolved      (operator+)
 * resolved → *            NO permitido (estado final)
 */
const ALERT_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
  active: ['acknowledged', 'resolved'],
  acknowledged: ['resolved', 'snoozed'],
  snoozed: ['active', 'resolved'],
  resolved: [], // estado final
};

/**
 * Retorna `true` si la transición de `from` a `to` es válida según las
 * reglas de dominio. No verifica permisos de usuario (eso es competencia
 * del application layer y las RPCs de Supabase).
 */
export function canTransitionAlert(from: AlertStatus, to: AlertStatus): boolean {
  return ALERT_TRANSITIONS[from].includes(to);
}

/**
 * Retorna los estados válidos a los que puede transicionar una alerta
 * desde su estado actual.
 */
export function getAlertNextStates(status: AlertStatus): AlertStatus[] {
  return [...ALERT_TRANSITIONS[status]];
}
