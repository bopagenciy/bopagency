import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { MetricSummary, MetricFilter, MetricsRepository } from '@bop-agency/domain';
import type { OrganizationId, ClientId } from '@bop-agency/domain';
import type { MetricPlatform } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type ListClientMetricsInput = {
  /** organizationId SIEMPRE viene del servidor (sesión). Nunca del cliente. */
  organizationId: OrganizationId;
  clientId?: ClientId;
  platform?: MetricPlatform;
  periodStart?: Date;
  periodEnd?: Date;
  pagination: PaginationParams;
};

export type ListClientMetricsDeps = {
  metricsRepository: MetricsRepository;
  logger: LoggerPort;
};

export async function listClientMetrics(
  input: ListClientMetricsInput,
  deps: ListClientMetricsDeps,
): Promise<Result<PaginatedResult<MetricSummary>>> {
  deps.logger.debug('listClientMetrics', {
    organizationId: input.organizationId,
    clientId: input.clientId,
    platform: input.platform,
  });

  // Construir el filtro sin propiedades undefined (exactOptionalPropertyTypes)
  const filter: MetricFilter = {
    organizationId: input.organizationId,
    ...(input.clientId !== undefined && { clientId: input.clientId }),
    ...(input.platform !== undefined && { platform: input.platform }),
    ...(input.periodStart !== undefined && { periodStart: input.periodStart }),
    ...(input.periodEnd !== undefined && { periodEnd: input.periodEnd }),
  };

  try {
    const result = await deps.metricsRepository.findByOrganization(filter, input.pagination);
    return ok(result);
  } catch (e) {
    return err({
      code: 'INTERNAL_ERROR' as const,
      message: 'Error al listar métricas',
      details: e,
    });
  }
}
