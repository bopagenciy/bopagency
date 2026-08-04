/**
 * Dashboard Composition Root — Phase 5C
 *
 * Instancia los repositorios y casos de uso necesarios para el dashboard,
 * recibiendo el Supabase client desde el servidor.
 *
 * REQUISITOS DE SEGURIDAD:
 * - Recibe el Supabase client como parámetro (nunca lo crea internamente).
 * - El client debe ser el del usuario (con sesión y RLS), NO el service_role.
 * - Nunca importar variables de entorno aquí; eso es responsabilidad del
 *   llamador (Server Component / Route Handler).
 * - No depende de hooks de React ni de contextos del cliente.
 *
 * USO DESDE SERVER COMPONENT:
 * ```typescript
 * import { createServerSupabaseClient } from '@/lib/supabase/server';
 * import { createDashboardComposition } from '@/lib/composition/dashboard.composition';
 *
 * const supabase = await createServerSupabaseClient();
 * const { useCases } = createDashboardComposition(supabase);
 * const result = await useCases.getAgencyDashboardSummary({ organizationId });
 * ```
 *
 * NOTA: Este archivo NO importa 'server-only' porque la composición en sí
 * no tiene dependencias de servidor — es el client quien tiene restricciones.
 * El caller (Server Component) ya importa el client desde server.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseClientRepository,
  SupabaseAlertRepository,
  SupabaseTaskRepository,
  SupabaseMetricsRepository,
  consoleLogger,
} from '@bop-agency/infrastructure';
import {
  getAgencyDashboardSummary,
  listAlerts,
  acknowledgeAlert,
  resolveAlert,
  listTasks,
  updateTaskStatus,
  listClientMetrics,
} from '@bop-agency/application';
import type {
  GetAgencyDashboardSummaryInput,
  ListAlertsInput,
  AcknowledgeAlertInput,
  ResolveAlertInput,
  ListTasksInput,
  UpdateTaskStatusInput,
  ListClientMetricsInput,
} from '@bop-agency/application';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createDashboardComposition(supabase: SupabaseClient) {
  // ── Repositorios ────────────────────────────────────────────────────────────
  const clientRepository = new SupabaseClientRepository(supabase);
  const alertRepository = new SupabaseAlertRepository(supabase);
  const taskRepository = new SupabaseTaskRepository(supabase);
  const metricsRepository = new SupabaseMetricsRepository(supabase);

  const logger = consoleLogger;

  // ── Deps compartidos ────────────────────────────────────────────────────────
  const dashboardDeps = {
    clientRepository,
    alertRepository,
    taskRepository,
    metricsRepository,
    logger,
  };

  // ── Use cases pre-enlazados ─────────────────────────────────────────────────
  const useCases = {
    // Dashboard
    getAgencyDashboardSummary: (input: GetAgencyDashboardSummaryInput) =>
      getAgencyDashboardSummary(input, dashboardDeps),

    // Alerts — read
    listAlerts: (input: ListAlertsInput) => listAlerts(input, { alertRepository, logger }),

    // Alerts — mutations (Phase 5C)
    acknowledgeAlert: (input: AcknowledgeAlertInput) =>
      acknowledgeAlert(input, { alertRepository, logger }),

    resolveAlert: (input: ResolveAlertInput) => resolveAlert(input, { alertRepository, logger }),

    // Tasks — read
    listTasks: (input: ListTasksInput) => listTasks(input, { taskRepository, logger }),

    // Tasks — mutations (Phase 5C)
    updateTaskStatus: (input: UpdateTaskStatusInput) =>
      updateTaskStatus(input, { taskRepository, logger }),

    // Metrics
    listClientMetrics: (input: ListClientMetricsInput) =>
      listClientMetrics(input, { metricsRepository, logger }),
  };

  return {
    repositories: {
      clientRepository,
      alertRepository,
      taskRepository,
      metricsRepository,
    },
    useCases,
  };
}

export type DashboardComposition = ReturnType<typeof createDashboardComposition>;
