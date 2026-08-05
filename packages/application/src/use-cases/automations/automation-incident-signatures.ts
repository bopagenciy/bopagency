/**
 * automation-incident-signatures.ts — Phase 6F
 *
 * Firmas (alert_key) determinísticas para deduplicación de alertas y tareas
 * de automatización. Todas las firmas incluyen organizationId para aislamiento
 * multi-tenant.
 *
 * REGLAS DE FIRMA:
 * - Determinísticas: misma entrada → misma firma siempre.
 * - Sin PII, sin secretos, sin timestamps, sin payloads variables.
 * - Sin executionId (excepto cuando el incidente es estrictamente por ejecución).
 * - Longitud ≤ 255 chars (límite del campo alert_key en DB).
 * - Prefijo 'automation:' para identificar fuente.
 *
 * Firmas canónicas:
 *   automation:{orgId}:{automationId}:dispatch-failed
 *   automation:{orgId}:{automationId}:execution-failed:{errorCode}
 *   automation:{orgId}:{automationId}:max-attempts
 *   automation:{orgId}:{automationId}:webhook-invalid
 *   automation:{orgId}:{automationId}:stuck:{status}
 */

import type { OrganizationId } from '@bop-agency/domain';
import type { AutomationId } from '@bop-agency/domain';

// ─── Signature builders ───────────────────────────────────────────────────────

const PREFIX = 'automation';
const MAX_KEY_LENGTH = 255;

function buildKey(...parts: string[]): string {
  const key = [PREFIX, ...parts].join(':');
  // Safety truncation — should never exceed limit with valid inputs
  return key.slice(0, MAX_KEY_LENGTH);
}

/**
 * Firma para dispatch fallido.
 * Una alerta activa por (organización, automatización).
 */
export function dispatchFailedKey(
  organizationId: OrganizationId,
  automationId: AutomationId,
): string {
  return buildKey(String(organizationId), String(automationId), 'dispatch-failed');
}

/**
 * Firma para ejecución fallida con errorCode específico.
 * El errorCode se normaliza a mayúsculas y se trunca.
 */
export function executionFailedKey(
  organizationId: OrganizationId,
  automationId: AutomationId,
  errorCode: string,
): string {
  const safeCode = errorCode.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 50);
  return buildKey(String(organizationId), String(automationId), 'execution-failed', safeCode);
}

/**
 * Firma para máximo de intentos alcanzado.
 */
export function maxAttemptsKey(
  organizationId: OrganizationId,
  automationId: AutomationId,
): string {
  return buildKey(String(organizationId), String(automationId), 'max-attempts');
}

/**
 * Firma para callbacks HMAC inválidos repetidos.
 */
export function webhookInvalidKey(
  organizationId: OrganizationId,
  automationId: AutomationId,
): string {
  return buildKey(String(organizationId), String(automationId), 'webhook-invalid');
}

/**
 * Firma para ejecución atascada por estado.
 * @param status - 'queued' | 'running'
 */
export function stuckExecutionKey(
  organizationId: OrganizationId,
  automationId: AutomationId,
  status: 'queued' | 'running',
): string {
  return buildKey(String(organizationId), String(automationId), 'stuck', status);
}

/**
 * Prefijos de firmas recuperables para una automatización dada.
 * Al resolver alertas en éxito, se buscan alertas activas cuya
 * alert_key empiece con cualquiera de estos prefijos.
 */
export function recoverableAlertKeyPrefixes(
  organizationId: OrganizationId,
  automationId: AutomationId,
): string[] {
  const base = `${PREFIX}:${String(organizationId)}:${String(automationId)}:`;
  return [
    `${base}dispatch-failed`,
    `${base}execution-failed`,
    `${base}max-attempts`,
    `${base}stuck`,
  ];
}

/**
 * Tags de tarea para deduplicación.
 * Una tarea activa por (organización, automatización, tipo).
 */
export function buildTaskTags(
  organizationId: OrganizationId,
  automationId: AutomationId,
  incidentType: string,
): string[] {
  return [
    `automation`,
    `org:${String(organizationId)}`,
    `automation-id:${String(automationId)}`,
    `incident:${incidentType.toLowerCase()}`,
  ];
}

/**
 * Tag de firma única para deduplicación de tareas.
 * Se usa como tag adicional para buscar si ya existe una tarea activa.
 */
export function buildTaskSignatureTag(
  organizationId: OrganizationId,
  automationId: AutomationId,
  incidentType: string,
): string {
  const normalized = incidentType.toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 50);
  return `sig:${String(organizationId)}:${String(automationId)}:${normalized}`;
}
