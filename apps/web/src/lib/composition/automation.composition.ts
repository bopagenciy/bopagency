/**
 * Automation Composition Root — Phase 6E
 *
 * Ensambla todos los use cases de gestión de automatizaciones:
 * - Estado: getAutomation, activateAutomation, pauseAutomation, archiveAutomation, listAutomations
 * - Ejecución: startExecution, cancelExecution, retryExecution, getExecution, listExecutions
 *
 * SEGURIDAD:
 * - Recibe el Supabase client como parámetro (nunca lo crea internamente).
 * - El client debe ser el del usuario (con sesión y RLS), NO service_role.
 * - Solo usar en contextos servidor (Server Components / Server Actions).
 *
 * USO DESDE SERVER COMPONENT / SERVER ACTION:
 * ```typescript
 * import { createServerSupabaseClient } from '@/lib/supabase/server';
 * import { createAutomationComposition } from '@/lib/composition/automation.composition';
 *
 * const supabase = await createServerSupabaseClient();
 * const { useCases } = createAutomationComposition(supabase);
 * const result = await useCases.listAutomations({ organizationId, pagination });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseAutomationRepository,
  SupabaseAutomationExecutionRepository,
  SupabaseExecutionLogRepository,
  N8nWebhookDispatcher,
  N8nDispatcherAdapter,
  consoleLogger,
} from '@bop-agency/infrastructure';
import {
  listAutomations,
  getAutomation,
  activateAutomation,
  pauseAutomation,
  archiveAutomation,
  startAutomationExecution,
  cancelAutomationExecution,
  retryAutomationExecution,
  getAutomationExecution,
  listAutomationExecutions,
} from '@bop-agency/application';
import type {
  ListAutomationsInput,
  GetAutomationInput,
  ActivateAutomationInput,
  PauseAutomationInput,
  ArchiveAutomationInput,
  StartAutomationExecutionInput,
  CancelAutomationExecutionInput,
  RetryAutomationExecutionInput,
  GetAutomationExecutionInput,
  ListAutomationExecutionsInput,
} from '@bop-agency/application';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAutomationComposition(supabase: SupabaseClient) {
  // ── Repositorios (RLS aplicada — cliente de usuario) ─────────────────────
  const automationRepository        = new SupabaseAutomationRepository(supabase);
  const executionRepository         = new SupabaseAutomationExecutionRepository(supabase);
  const executionLogRepository      = new SupabaseExecutionLogRepository(supabase);

  // ── Dispatcher (server-only — lee env vars en runtime) ──────────────────
  const n8nDispatcher = new N8nWebhookDispatcher();
  const dispatcher    = new N8nDispatcherAdapter(n8nDispatcher);

  const logger = consoleLogger;

  // ── Deps compartidos ────────────────────────────────────────────────────
  const automationDeps = { automationRepository, logger };

  const startDeps = { automationRepository, executionRepository, executionLogRepository, dispatcher, logger };
  const cancelDeps = { executionRepository, executionLogRepository, dispatcher, logger };
  const retryDeps = { automationRepository, executionRepository, executionLogRepository, dispatcher, logger };
  const readExecDeps = { executionRepository, logger };

  // ── Use cases ────────────────────────────────────────────────────────────
  const useCases = {
    // Automation CRUD / status
    listAutomations: (input: ListAutomationsInput) =>
      listAutomations(input, automationDeps),
    getAutomation: (input: GetAutomationInput) =>
      getAutomation(input, automationDeps),
    activateAutomation: (input: ActivateAutomationInput) =>
      activateAutomation(input, automationDeps),
    pauseAutomation: (input: PauseAutomationInput) =>
      pauseAutomation(input, automationDeps),
    archiveAutomation: (input: ArchiveAutomationInput) =>
      archiveAutomation(input, automationDeps),

    // Execution orchestration
    startExecution: (input: StartAutomationExecutionInput) =>
      startAutomationExecution(input, startDeps),
    cancelExecution: (input: CancelAutomationExecutionInput) =>
      cancelAutomationExecution(input, cancelDeps),
    retryExecution: (input: RetryAutomationExecutionInput) =>
      retryAutomationExecution(input, retryDeps),
    getExecution: (input: GetAutomationExecutionInput) =>
      getAutomationExecution(input, readExecDeps),
    listExecutions: (input: ListAutomationExecutionsInput) =>
      listAutomationExecutions(input, readExecDeps),
  };

  return {
    repositories: { automationRepository, executionRepository, executionLogRepository },
    useCases,
  };
}

export type AutomationComposition = ReturnType<typeof createAutomationComposition>;
