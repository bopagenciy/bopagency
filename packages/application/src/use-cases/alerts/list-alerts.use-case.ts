import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Alert, AlertFilter, AlertRepository } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { AlertStatus, AlertSeverity } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type ListAlertsInput = {
  /** organizationId SIEMPRE viene del servidor (sesión). Nunca del cliente. */
  organizationId: OrganizationId;
  status?: AlertStatus;
  severity?: AlertSeverity;
  pagination: PaginationParams;
};

export type ListAlertsDeps = {
  alertRepository: AlertRepository;
  logger: LoggerPort;
};

export async function listAlerts(
  input: ListAlertsInput,
  deps: ListAlertsDeps,
): Promise<Result<PaginatedResult<Alert>>> {
  deps.logger.debug('listAlerts', {
    organizationId: input.organizationId,
    status: input.status,
  });

  // Construir el filtro sin propiedades undefined (exactOptionalPropertyTypes)
  const filter: AlertFilter = {
    organizationId: input.organizationId,
    ...(input.status !== undefined && { status: input.status }),
    ...(input.severity !== undefined && { severity: input.severity }),
  };

  try {
    const result = await deps.alertRepository.findByOrganization(filter, input.pagination);
    return ok(result);
  } catch (e) {
    return err({
      code: 'INTERNAL_ERROR' as const,
      message: 'Error al listar alertas',
      details: e,
    });
  }
}
