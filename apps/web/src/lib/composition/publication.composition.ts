/**
 * Campaign Publication Composition Root — Phase 8B.2.
 *
 * Ensambla los use cases de orquestación de publicación (Phase 8B.2) para
 * `apps/web` — mismo patrón que `activation.composition.ts` (8A.3),
 * DUPLICADO EN DOS FACTORIES separadas porque las RPCs de 8B.1 exigen dos
 * clientes Supabase distintos:
 *
 * 1. `createPublicationComposition(supabase)` — cliente de SESIÓN del
 *    usuario (RLS activo). Cubre las 4 RPCs `authenticated`
 *    (create/cancel/reconcile/prepare_retry) — todo lo que un actor humano
 *    hace desde la UI/Server Actions: queuePublication,
 *    cancelPublicationJob, preparePublicationRetry, retryPublication,
 *    reconcilePublicationOutcome, y las 4 lecturas.
 *
 * 2. `createPublicationWorkerComposition(adminClient, options)` — cliente
 *    `service_role` (bypasea RLS). Cubre EXCLUSIVAMENTE
 *    `dispatchPublicationJob` — las 11 RPCs `service_role`
 *    (claim/start/attempt/record*) NUNCA deben invocarse con el cliente de
 *    un usuario. Este composition root NO debe usarse desde una Server
 *    Action expuesta directamente a un actor humano — está pensado para
 *    un futuro entrypoint de worker/cron/queue (8B.3+) o, mientras tanto,
 *    para un diagnóstico interno estrictamente admin-only.
 *
 * NINGÚN use case de este composition root llama a un proveedor externo
 * real (Meta/Google/etc.) — `createPublicationWorkerComposition` recibe
 * un `ChannelPublisherRegistry` ya construido por el caller; 8B.2 no
 * registra ningún publisher real, solo expone el punto de extensión (ver
 * `channel-publisher.port.ts`/`channel-publisher.fakes.ts` en
 * `@bop-agency/application`).
 *
 * USO (interactivo, Server Component/Action):
 * ```typescript
 * import { createServerSupabaseClient } from '@/lib/supabase/server';
 * import { createPublicationComposition } from '@/lib/composition/publication.composition';
 *
 * const supabase = await createServerSupabaseClient();
 * const { useCases } = createPublicationComposition(supabase);
 * const result = await useCases.queuePublication({ targetId, organizationId, actorUserId });
 * ```
 *
 * USO (worker/diagnóstico admin-only):
 * ```typescript
 * import { createAdminClient } from '@/lib/supabase/server';
 * import { createPublicationWorkerComposition } from '@/lib/composition/publication.composition';
 * import { ChannelPublisherRegistry, FakeSuccessfulPublisher } from '@bop-agency/application';
 *
 * const adminClient = createAdminClient();
 * const registry = new ChannelPublisherRegistry([new FakeSuccessfulPublisher()]); // 8B.3+: publisher real
 * const { useCases } = createPublicationWorkerComposition(adminClient, { registry, workerId: 'local-dev-worker' });
 * const result = await useCases.dispatchPublicationJob({ jobId, organizationId });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseCampaignPublicationRepository,
  SupabaseOrganizationRepository,
  consoleLogger,
} from '@bop-agency/infrastructure';
import {
  queuePublication,
  cancelPublicationJob,
  preparePublicationRetry,
  retryPublication,
  reconcilePublicationOutcome,
  getPublicationJob,
  listPublicationJobsByActivation,
  listPublicationJobsByTarget,
  getPublicationTimeline,
  listPublicationWebhookEvidenceByJob,
  dispatchPublicationJob,
  listDispatchablePublicationJobs,
  processPublicationWebhookEvidence,
} from '@bop-agency/application';
import type {
  QueuePublicationInput,
  CancelPublicationJobInput,
  PreparePublicationRetryInput,
  RetryPublicationInput,
  ReconcilePublicationOutcomeInput,
  GetPublicationJobInput,
  ListPublicationJobsByActivationInput,
  ListPublicationJobsByTargetInput,
  GetPublicationTimelineInput,
  ListPublicationWebhookEvidenceByJobInput,
  DispatchPublicationJobInput,
  ListDispatchablePublicationJobsInput,
  ProcessPublicationWebhookEvidenceInput,
  ChannelPublisherRegistry,
} from '@bop-agency/application';

// ─── Factory (interactivo — cliente de usuario) ────────────────────────────────

export function createPublicationComposition(supabase: SupabaseClient) {
  const publicationRepository = new SupabaseCampaignPublicationRepository(supabase);
  const organizationRepository = new SupabaseOrganizationRepository(supabase);
  const logger = consoleLogger;

  const deps = { publicationRepository, organizationRepository, logger };

  const useCases = {
    // Escritura / orquestación de usuario
    queuePublication: (input: QueuePublicationInput) => queuePublication(input, deps),
    cancelPublicationJob: (input: CancelPublicationJobInput) => cancelPublicationJob(input, deps),
    preparePublicationRetry: (input: PreparePublicationRetryInput) => preparePublicationRetry(input, deps),
    retryPublication: (input: RetryPublicationInput) => retryPublication(input, deps),
    reconcilePublicationOutcome: (input: ReconcilePublicationOutcomeInput) =>
      reconcilePublicationOutcome(input, deps),

    // Lectura
    getPublicationJob: (input: GetPublicationJobInput) => getPublicationJob(input, deps),
    listPublicationJobsByActivation: (input: ListPublicationJobsByActivationInput) =>
      listPublicationJobsByActivation(input, deps),
    listPublicationJobsByTarget: (input: ListPublicationJobsByTargetInput) =>
      listPublicationJobsByTarget(input, deps),
    getPublicationTimeline: (input: GetPublicationTimelineInput) => getPublicationTimeline(input, deps),
    listPublicationWebhookEvidenceByJob: (input: ListPublicationWebhookEvidenceByJobInput) =>
      listPublicationWebhookEvidenceByJob(input, deps),
  };

  return {
    repositories: { publicationRepository, organizationRepository },
    useCases,
  };
}

export type PublicationComposition = ReturnType<typeof createPublicationComposition>;

// ─── Factory (worker — cliente service_role) ───────────────────────────────────

export type PublicationWorkerOptions = {
  readonly registry: ChannelPublisherRegistry;
  readonly workerId: string;
  readonly reconciliationTimeoutMinutes?: number;
};

export function createPublicationWorkerComposition(
  adminClient: SupabaseClient,
  options: PublicationWorkerOptions,
) {
  const publicationRepository = new SupabaseCampaignPublicationRepository(adminClient);
  const logger = consoleLogger;

  const deps = {
    publicationRepository,
    registry: options.registry,
    logger,
    workerId: options.workerId,
    ...(options.reconciliationTimeoutMinutes !== undefined
      ? { reconciliationTimeoutMinutes: options.reconciliationTimeoutMinutes }
      : {}),
  };

  const useCases = {
    dispatchPublicationJob: (input: DispatchPublicationJobInput) => dispatchPublicationJob(input, deps),
    listDispatchablePublicationJobs: (input: ListDispatchablePublicationJobsInput) =>
      listDispatchablePublicationJobs(input, { publicationRepository }),
    processPublicationWebhookEvidence: (input: ProcessPublicationWebhookEvidenceInput) =>
      processPublicationWebhookEvidence(input, { publicationRepository }),
  };

  return {
    repositories: { publicationRepository },
    useCases,
  };
}

export type PublicationWorkerComposition = ReturnType<typeof createPublicationWorkerComposition>;
