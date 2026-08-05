/**
 * Automation Execution Composition Root — Phase 6D
 *
 * Ensambla todos los use cases de ejecución de automatizaciones con sus
 * adaptadores concretos: repositorios Supabase, dispatcher n8n, logger.
 *
 * SEGURIDAD:
 * - Recibe el Supabase client como parámetro (nunca lo crea internamente).
 * - El client debe ser el del usuario (con sesión y RLS), NO service_role.
 * - N8nWebhookDispatcher lee env vars server-side — solo usar en contextos servidor.
 * - No depende de hooks de React ni de contextos del cliente.
 *
 * NO SE CONECTA TODAVÍA CON:
 * - UI / Server Actions (Phase 6E)
 * - Scheduling / cron (Phase 6E)
 * - Alertas automáticas (Phase 6F)
 *
 * ROLLBACK:
 * - Para deshabilitar dispatch: sustituir N8nWebhookDispatcher por NoOpDispatcher.
 * - Para deshabilitar cancel: pasar dispatcher sin método cancel funcional.
 * - Para deshabilitar retry: no exportar retryAutomationExecution de este módulo.
 * - Ningún rollback requiere borrar ejecuciones ni logs existentes.
 *
 * USO DESDE SERVER COMPONENT (Phase 6E):
 * ```typescript
 * import { createServerSupabaseClient } from '@/lib/supabase/server';
 * import { createAutomationExecutionComposition } from '@/lib/composition/automation-execution.composition';
 *
 * const supabase = await createServerSupabaseClient();
 * const { useCases } = createAutomationExecutionComposition(supabase);
 * const result = await useCases.startExecution({ ... });
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
  startAutomationExecution,
  cancelAutomationExecution,
  retryAutomationExecution,
  getAutomationExecution,
  listAutomationExecutions,
} from '@bop-agency/application';
import type {
  StartAutomationExecutionInput,
  CancelAutomationExecutionInput,
  RetryAutomationExecutionInput,
  GetAutomationExecutionInput,
  ListAutomationExecutionsInput,
} from '@bop-agency/application';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAutomationExecutionComposition(supabase: SupabaseClient) {
  // ── Repositorios (RLS aplicada — cliente de usuario) ─────────────────────────
  const automationRepository          = new SupabaseAutomationRepository(supabase);
  const executionRepository           = new SupabaseAutomationExecutionRepository(supabase);
  const executionLogRepository        = new SupabaseExecutionLogRepository(supabase);

  // ── Dispatcher (server-only — lee env vars en runtime) ──────────────────────
  // N8nWebhookDispatcher está encapsulado detrás del adapter.
  // Para desactivar dispatch en staging: sustituir por NoOpDispatcher.
  const n8nDispatcher = new N8nWebhookDispatcher();
  const dispatcher    = new N8nDispatcherAdapter(n8nDispatcher);

  const logger = consoleLogger;

  // ── Deps compartidos ────────────────────────────────────────────────────────
  const startDeps = {
    automationRepository,
    executionRepository,
    executionLogRepository,
    dispatcher,
    logger,
  };

  const cancelDeps = {
    executionRepository,
    executionLogRepository,
    dispatcher, // usado para cancelación externa de ejecuciones 'running'
    logger,
  };

  const retryDeps = {
    automationRepository,
    executionRepository,
    executionLogRepository,
    dispatcher,
    logger,
  };

  const readDeps = {
    executionRepository,
    logger,
  };

  // ── Use cases pre-enlazados ─────────────────────────────────────────────────
  const useCases = {
    startExecution: (input: StartAutomationExecutionInput) =>
      startAutomationExecution(input, startDeps),

    cancelExecution: (input: CancelAutomationExecutionInput) =>
      cancelAutomationExecution(input, cancelDeps),

    retryExecution: (input: RetryAutomationExecutionInput) =>
      retryAutomationExecution(input, retryDeps),

    getExecution: (input: GetAutomationExecutionInput) =>
      getAutomationExecution(input, readDeps),

    listExecutions: (input: ListAutomationExecutionsInput) =>
      listAutomationExecutions(input, readDeps),
  };

  return {
    repositories: {
      automationRepository,
      executionRepository,
      executionLogRepository,
    },
    useCases,
  };
}

export type AutomationExecutionComposition = ReturnType<typeof createAutomationExecutionComposition>;
