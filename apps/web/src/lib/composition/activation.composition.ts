/**
 * Campaign Activation Composition Root — Phase 8A.3.
 *
 * Ensambla los use cases de activación manual (Phase 8A.2) para que las
 * Server Actions / Server Components de `apps/web` puedan invocarlos sin
 * conocer los detalles de infraestructura (Supabase) — mismo patrón que
 * `campaign.composition.ts` (Phase 7E).
 *
 * Ámbitos cubiertos (8A.2, ver packages/application/src/use-cases/activations):
 * - Escritura: createCampaignActivation, addCampaignActivationTarget,
 *   prepareActivationTarget, markActivationTargetReady,
 *   markActivationTargetPublished, cancelActivationTarget,
 *   cancelCampaignActivation.
 * - Lectura: getCampaignActivation, listCampaignActivationsByCampaign,
 *   listCampaignActivationsByClient, getActivationWithTargetsAndEvents.
 *
 * SEGURIDAD (mismo criterio que campaign.composition.ts):
 * - Recibe el Supabase client como parámetro (nunca lo crea internamente).
 * - El client debe ser el del usuario (con sesión y RLS), NO service_role.
 * - Solo usar en contextos servidor (Server Components / Server Actions).
 * - Ningún use case de este composition root llama a proveedores externos
 *   (Meta/Google/LinkedIn/email) — 8A.3 es exclusivamente operación manual,
 *   ver PHASE_8A3_WEB_MANUAL_OPERATIONS_REPORT.md.
 *
 * USO DESDE SERVER COMPONENT / SERVER ACTION:
 * ```typescript
 * import { createServerSupabaseClient } from '@/lib/supabase/server';
 * import { createActivationComposition } from '@/lib/composition/activation.composition';
 *
 * const supabase = await createServerSupabaseClient();
 * const { useCases } = createActivationComposition(supabase);
 * const result = await useCases.getCampaignActivation({ activationId, organizationId, actorUserId });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseCampaignActivationRepository,
  SupabaseCampaignRepository,
  SupabaseCampaignApprovalRepository,
  SupabaseOrganizationRepository,
  SupabaseClientRepository,
  consoleLogger,
} from '@bop-agency/infrastructure';
import {
  createCampaignActivation,
  addCampaignActivationTarget,
  prepareActivationTarget,
  markActivationTargetReady,
  markActivationTargetPublished,
  cancelActivationTarget,
  cancelCampaignActivation,
  getCampaignActivation,
  listCampaignActivationsByCampaign,
  listCampaignActivationsByClient,
  getActivationWithTargetsAndEvents,
} from '@bop-agency/application';
import type {
  CreateCampaignActivationInput,
  AddCampaignActivationTargetInput,
  PrepareActivationTargetInput,
  MarkActivationTargetReadyInput,
  MarkActivationTargetPublishedInput,
  CancelActivationTargetInput,
  CancelCampaignActivationInput,
  GetCampaignActivationInput,
  ListCampaignActivationsByCampaignInput,
  ListCampaignActivationsByClientInput,
  GetActivationWithTargetsAndEventsInput,
} from '@bop-agency/application';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createActivationComposition(supabase: SupabaseClient) {
  // ── Repositorios (RLS aplicada — cliente de usuario) ─────────────────────
  const activationRepository = new SupabaseCampaignActivationRepository(supabase);
  const campaignRepository = new SupabaseCampaignRepository(supabase);
  const campaignApprovalRepository = new SupabaseCampaignApprovalRepository(supabase);
  const organizationRepository = new SupabaseOrganizationRepository(supabase);
  const clientRepository = new SupabaseClientRepository(supabase);

  const logger = consoleLogger;

  // ── Deps compartidos ────────────────────────────────────────────────────
  const createDeps = {
    campaignRepository,
    campaignApprovalRepository,
    activationRepository,
    organizationRepository,
    logger,
    // alertRepository/taskRepository — deliberadamente omitidos en 8A.3: la
    // signal post-commit (evalActivationCreatedSignalSilently) es opcional
    // en los Deps del use case y degrada a no-op sin ellos (ver
    // create-campaign-activation.use-case.ts §6). Igual que
    // draftDeps/complianceDeps en campaign.composition.ts, se puede ampliar
    // sin romper la firma si una fase futura los requiere aquí también.
  };
  const targetDeps = { activationRepository, organizationRepository, clientRepository, logger };
  const readDeps = { activationRepository, organizationRepository, logger };


  // ── Use cases ────────────────────────────────────────────────────────────
  const useCases = {
    // Escritura — activation
    createCampaignActivation: (input: CreateCampaignActivationInput) =>
      createCampaignActivation(input, createDeps),
    cancelCampaignActivation: (input: CancelCampaignActivationInput) =>
      cancelCampaignActivation(input, targetDeps),

    // Escritura — targets
    addCampaignActivationTarget: (input: AddCampaignActivationTargetInput) =>
      addCampaignActivationTarget(input, targetDeps),
    prepareActivationTarget: (input: PrepareActivationTargetInput) =>
      prepareActivationTarget(input, targetDeps),
    markActivationTargetReady: (input: MarkActivationTargetReadyInput) =>
      markActivationTargetReady(input, targetDeps),
    markActivationTargetPublished: (input: MarkActivationTargetPublishedInput) =>
      markActivationTargetPublished(input, targetDeps),
    cancelActivationTarget: (input: CancelActivationTargetInput) =>
      cancelActivationTarget(input, targetDeps),

    // Lectura
    getCampaignActivation: (input: GetCampaignActivationInput) => getCampaignActivation(input, readDeps),
    listCampaignActivationsByCampaign: (input: ListCampaignActivationsByCampaignInput) =>
      listCampaignActivationsByCampaign(input, readDeps),
    listCampaignActivationsByClient: (input: ListCampaignActivationsByClientInput) =>
      listCampaignActivationsByClient(input, readDeps),
    getActivationWithTargetsAndEvents: (input: GetActivationWithTargetsAndEventsInput) =>
      getActivationWithTargetsAndEvents(input, readDeps),
  };

  return {
    repositories: {
      activationRepository,
      campaignRepository,
      campaignApprovalRepository,
      organizationRepository,
    },
    useCases,
  };
}

export type ActivationComposition = ReturnType<typeof createActivationComposition>;
