/**
 * resolveAlert — Caso de uso para resolver una alerta.
 *
 * Flujo:
 * 1. Cargar la alerta actual (verifica org ownership).
 * 2. Verificar que la transición al estado 'resolved' es válida.
 * 3. Persistir via repository (que llama a la RPC `resolve_alert`).
 *
 * Transiciones válidas a 'resolved':
 *   active      → resolved  (rol operator+)
 *   acknowledged → resolved  (rol operator+)
 *   snoozed     → resolved  (rol operator+)
 *
 * El rol operator+ se verifica en la capa web (Server Action) y también
 * internamente por la RPC SECURITY DEFINER de Supabase.
 *
 * Responsabilidades del caller (Server Action):
 * - Autenticación del usuario.
 * - Resolución de organizationId desde la sesión del servidor.
 * - Comprobación de rol mínimo (operator).
 * - revalidatePath.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AlertId, AlertRepository } from '@bop-agency/domain';
import { canTransitionAlert } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

// ─── Input / Deps ─────────────────────────────────────────────────────────────

export type ResolveAlertInput = {
  /**
   * ID de la alerta a resolver.
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

export type ResolveAlertDeps = {
  alertRepository: AlertRepository;
  logger: LoggerPort;
};

// ─── Use case ─────────────────────────────────────────────────────────────────

export async function resolveAlert(
  input: ResolveAlertInput,
  deps: ResolveAlertDeps,
): Promise<Result<void>> {
  deps.logger.debug('resolveAlert', {
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

  // 2. Verificar transición de dominio: active, acknowledged o snoozed → resolved
  if (!canTransitionAlert(alert.status, 'resolved')) {
    return err({
      code: 'CONFLICT' as const,
      message: `No se puede resolver una alerta en estado '${alert.status}'. Las alertas ya resueltas no pueden modificarse.`,
    });
  }

  // 3. Persistir via RPC (el repositorio también verifica org ownership)
  const result = await deps.alertRepository.resolve(input.alertId, input.organizationId);
  if (!isOk(result)) {
    deps.logger.error('resolveAlert: repository error', { error: result.error });
    return result;
  }

  deps.logger.info('resolveAlert: ok', {
    alertId: input.alertId,
    actorUserId: input.actorUserId,
  });

  return ok(undefined);
}
