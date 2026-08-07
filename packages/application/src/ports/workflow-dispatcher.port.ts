/**
 * WorkflowDispatcherPort — Puerto de la capa de aplicación para el despachador
 * de workflows.
 *
 * Abstracción que aísla los use cases de la implementación concreta (n8n, etc.).
 * La implementación concreta (N8nWebhookDispatcher) se conecta en el composition root.
 *
 * Restricciones:
 * - No importa fetch, process.env ni detalles de HTTP.
 * - DispatchResult expone únicamente metadata segura — nunca raw response body,
 *   headers, stack traces ni credenciales.
 */

import type { Result } from '@bop-agency/shared';
import type { AutomationId } from '@bop-agency/domain';

// ─── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Resultado seguro del dispatch — nunca contiene detalles internos del dispatcher.
 */
export type DispatchResult = {
  /** ID externo asignado por el sistema de ejecución (n8n). Null si no está disponible. */
  readonly externalRunId: string | null;
  readonly dispatchedAt: Date;
};

/**
 * Payload mínimo y seguro enviado al dispatcher.
 * No debe contener secretos, tokens, ni PII.
 */
export type DispatchPayload = {
  readonly executionId: string;
  readonly organizationId: string;
  readonly clientId: string | null;
  readonly triggerType: string;
  /**
   * NOTA: la implementación de producción (N8nWebhookDispatcher) IGNORA
   * este valor y resuelve callbackUrl server-side — ver comentario en
   * StartAutomationExecutionInput.callbackUrl para el detalle de seguridad.
   */
  readonly callbackUrl: string;
  readonly metadata: Record<string, unknown>;
};

// ─── Port ─────────────────────────────────────────────────────────────────────

export interface WorkflowDispatcherPort {
  /**
   * Despacha una ejecución al sistema externo.
   * Retorna Result<DispatchResult> — nunca lanza excepciones.
   * En caso de error, el errorCode en AppError identifica el tipo de fallo.
   */
  dispatch(
    automationId: AutomationId,
    options: { readonly idempotencyKey: string; readonly payload: DispatchPayload },
  ): Promise<Result<DispatchResult>>;

  /**
   * Solicita la cancelación de una ejecución en curso al sistema externo.
   * Puede no estar disponible (depende de la implementación / configuración).
   * Retorna Result<void> — ok si fue cancelado o ya no existe.
   */
  cancel(externalRunId: string): Promise<Result<void>>;
}
