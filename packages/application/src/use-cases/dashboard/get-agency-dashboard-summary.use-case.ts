/**
 * GetAgencyDashboardSummary — caso de uso de lectura para el panel principal.
 *
 * Agrega KPIs de la organización desde múltiples repositorios:
 * - Clientes activos (ClientRepository)
 * - Alertas activas por severidad (AlertRepository)
 * - Tareas pendientes y vencidas (TaskRepository)
 * - Métricas agregadas del período actual (MetricsRepository)
 *
 * NOTA: Este use case NO hace autorización de sesión.
 * organizationId siempre viene del servidor (composition root / Server Component).
 *
 * NOTA: No llama a ReportRepository porque el contrato actual no tiene
 * un método `countByOrganization`. Se puede añadir en una iteración futura.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  ClientRepository,
  AlertRepository,
  TaskRepository,
  MetricsRepository,
  OrganizationId,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

export type AgencyDashboardSummary = {
  /** Número de clientes con status 'active'. */
  readonly activeClients: number;
  /** Número de alertas con status 'active'. */
  readonly activeAlerts: number;
  /** Desglose de alertas activas por severidad. */
  readonly alertsBySeverity: {
    readonly critical: number;
    readonly warning: number;
    readonly info: number;
  };
  /** Número de tareas con status 'pending'. */
  readonly pendingTasks: number;
  /** Número de tareas en estado no-final con due_date pasada. */
  readonly overdueTasks: number;
  /** Número de tareas con status 'in_progress'. */
  readonly inProgressTasks: number;
  /** Suma total de gasto de todas las métricas de la organización. */
  readonly totalSpend: number;
  /** ROAS promedio de la organización. */
  readonly avgRoas: number;
};

export type GetAgencyDashboardSummaryInput = {
  organizationId: OrganizationId;
};

export type GetAgencyDashboardSummaryDeps = {
  clientRepository: ClientRepository;
  alertRepository: AlertRepository;
  taskRepository: TaskRepository;
  metricsRepository: MetricsRepository;
  logger: LoggerPort;
};

export async function getAgencyDashboardSummary(
  input: GetAgencyDashboardSummaryInput,
  deps: GetAgencyDashboardSummaryDeps,
): Promise<Result<AgencyDashboardSummary>> {
  const { organizationId } = input;
  const { clientRepository, alertRepository, taskRepository, metricsRepository, logger } = deps;

  logger.debug('getAgencyDashboardSummary', { organizationId });

  try {
    // Ejecutar consultas en paralelo para minimizar latencia
    const [clientsResult, alertSeverityResult, taskCountResult, metricSummaryResult] =
      await Promise.all([
        clientRepository.findAll(
          { organizationId, status: 'active', includeDeleted: false },
          { pageSize: 1 }, // Solo necesitamos el total
        ),
        alertRepository.countBySeverity(organizationId),
        taskRepository.countByStatus(organizationId),
        metricsRepository.getOrganizationSummary(organizationId),
      ]);

    // Manejar errores de repositorios opcionales con fallbacks seguros
    const alertSeverity = alertSeverityResult.success
      ? alertSeverityResult.value
      : { critical: 0, warning: 0, info: 0 };

    const taskCount = taskCountResult.success
      ? taskCountResult.value
      : { pending: 0, in_progress: 0, done: 0, cancelled: 0, blocked: 0 };

    const metricSummary = metricSummaryResult.success
      ? metricSummaryResult.value
      : {
          totalSpend: 0,
          totalImpressions: 0,
          totalClicks: 0,
          totalLeads: 0,
          totalConversions: 0,
          totalRevenue: 0,
          avgRoas: 0,
        };

    const activeAlerts = alertSeverity.critical + alertSeverity.warning + alertSeverity.info;
    const overdueTasks = 0; // Requiere findUpcoming — se implementa en Phase 5B con query dedicada

    const summary: AgencyDashboardSummary = {
      activeClients: clientsResult.total,
      activeAlerts,
      alertsBySeverity: alertSeverity,
      pendingTasks: taskCount.pending,
      overdueTasks,
      inProgressTasks: taskCount.in_progress,
      totalSpend: metricSummary.totalSpend,
      avgRoas: metricSummary.avgRoas,
    };

    return ok(summary);
  } catch (e) {
    logger.error('getAgencyDashboardSummary failed', e, { organizationId });
    return err({
      code: 'INTERNAL_ERROR' as const,
      message: 'Error al obtener el resumen del dashboard',
      details: e,
    });
  }
}
