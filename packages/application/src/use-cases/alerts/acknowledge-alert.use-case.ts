/**
 * acknowledgeAlert — Caso de uso para reconocer una alerta.
 *
 * Flujo:
 * 1. Cargar la alerta actual (verifica org ownership).
 * 2. Verificar que la transición active → acknowledged es válida.
 * 3. Persistir via repository (que llama a la RPC `acknowledge_alert`).
 *
 * Responsabilidades:
 * - Validación de input tipado (actorUserId es informativo — la RPC usa auth.uid()).
 * - Verificación de tenant scope (alertId + organizationId).
 * - Validación de transición de dominio.
 * - Errores tipados (NOT_FOUND, CONFLICT, FORBIDDEN, INTERNAL_ERROR).
 *
 * Responsabilidades del caller (Server Action):
 * - Autenticación del usuario.
 * - Resolución de organizationId desde la sesión del servidor.
 * - Comprobación de rol mínimo.
 * - revalidatePath.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AlertId, AlertRepository } from '@bop-agency/domain';
import { canTransitionAlert } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Input / Deps ─────────────────────────────────────────────────────────────

export type AcknowledgeAlertInput = {
  /**
   * ID de la alerta a reconocer.
   * Viene del payload del cliente, validado con Zod (UUID).
   */
  readonly alertId: AlertId;

  /**
   * ID de la organización activa.
   * SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente.
   */
  readonly organizationId: OrganizationId;

  /**
   * ID del usuario que realiza la acción.
   * Informativo en el use case; la RPC de Supabase usa auth.uid() internamente.
   */
  readonly actorUserId: string;
};

export type AcknowledgeAlertDeps = {
  alertRepository: AlertRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function acknowledgeAlert(
  input: AcknowledgeAlertInput,
  deps: AcknowledgeAlertDeps,
): Promise<Result<void>> {
  deps.logger.debug('acknowledgeAlert', {
    alertId: input.alertId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  // 1. Cargar la alerta actual (verifica que pertenece a la organización)
  const alertResult = await deps.alertRepository.findById(input.alertId, input.organizationId);
  if (!isOk(alertResult)) {
    return alertResult;
  }

  const alert = alertResult.value;

  // 2. Verificar transición de dominio: solo 'active' puede → 'acknowledged'
  if (!canTransitionAlert(alert.status, 'acknowledged')) {
    return err({
      code: 'CONFLICT' as const,
      message: `No se puede reconocer una alerta en estado '${alert.status}'. Solo alertas activas pueden ser reconocidas.`,
    });
  }

  // 3. Persistir via RPC (el repositorio ya verificó org ownership nuevamente)
  const result = await deps.alertRepository.acknowledge(input.alertId, input.organizationId);
  if (!isOk(result)) {
    deps.logger.error('acknowledgeAlert: repository error', { error: result.error });
    return result;
  }

  deps.logger.info('acknowledgeAlert: ok', {
    alertId: input.alertId,
    actorUserId: input.actorUserId,
  });

  return ok(undefined);
}
