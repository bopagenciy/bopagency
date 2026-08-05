/**
 * N8nDispatcherAdapter — Adapta N8nWebhookDispatcher al contrato WorkflowDispatcherPort.
 *
 * La capa de aplicación define WorkflowDispatcherPort con DispatchResult.
 * N8nWebhookDispatcher implementa WorkflowDispatcher de automation-engine (devuelve AutomationRun).
 * Este adapter traduce entre ambos contratos sin modificar ninguno de los dos.
 *
 * SEGURIDAD:
 * - No expone raw body, headers ni credenciales.
 * - externalRunId extraído de AutomationRun.id (asignado por el dispatcher).
 * - safeErrorMessage no incluye detalles técnicos del HTTP error.
 *
 * NOTA ARQUITECTÓNICA:
 * El adapter vive en infrastructure (no en application) porque depende de
 * N8nWebhookDispatcher, que es un adaptador de infraestructura.
 * La composition root instancia el adapter y lo inyecta en los use cases.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AutomationId } from '@bop-agency/domain';
import type { WorkflowDispatcher, DispatchOptions } from '@bop-agency/automation-engine';
import type {
  WorkflowDispatcherPort,
  DispatchResult,
  DispatchPayload,
} from '@bop-agency/application';

export class N8nDispatcherAdapter implements WorkflowDispatcherPort {
  constructor(private readonly inner: WorkflowDispatcher) {}

  async dispatch(
    automationId: AutomationId,
    options: { idempotencyKey: string; payload: DispatchPayload },
  ): Promise<Result<DispatchResult>> {
    const dispatchOptions: DispatchOptions = {
      idempotencyKey: options.idempotencyKey,
      payload: options.payload as Record<string, unknown>,
    };

    const result = await this.inner.dispatch(automationId, dispatchOptions);

    if (!isOk(result)) {
      return err(result.error);
    }

    return ok({
      externalRunId: result.value.id ?? null,
      dispatchedAt:  result.value.startedAt ?? new Date(),
    });
  }

  async cancel(externalRunId: string): Promise<Result<void>> {
    return this.inner.cancel(externalRunId);
  }
}
