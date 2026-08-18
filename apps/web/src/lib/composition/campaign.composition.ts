/**
 * Campaign Composition Root — Phase 7E
 *
 * Ensambla todos los use cases de Campaign Studio (Phases 7B–7D) para que
 * las Server Actions / Server Components de `apps/web` puedan invocarlos sin
 * conocer los detalles de infraestructura (Supabase, proveedor de IA).
 *
 * Ámbitos cubiertos:
 * - Lectura: listCampaigns, getCampaign, listCampaignApprovals,
 *   getApplicableComplianceRules, evaluateCampaignCompliance.
 * - Escritura manual (7B): createCampaignDraft.
 * - Workflow de aprobación (7C): submitCampaignForReview, approveCampaign,
 *   rejectCampaign.
 * - IA (7D, multi-provider desde 7D.1): generateCampaignDraftWithAI,
 *   regenerateCampaignContent.
 *
 * SEGURIDAD:
 * - Recibe el Supabase client como parámetro (nunca lo crea internamente).
 * - El client debe ser el del usuario (con sesión y RLS), NO service_role —
 *   ningún flujo de Campaign Studio en 7B–7E requiere service_role (ver
 *   PHASE_7_IMPLEMENTATION_PLAN.md §9).
 * - Solo usar en contextos servidor (Server Components / Server Actions).
 * - Phase 7D.1: el adapter de IA recibe la FACTORÍA `createCampaignAIProvider`,
 *   no una instancia fija de proveedor. El proveedor concreto (OpenAI /
 *   Gemini / Anthropic Claude) se resuelve por llamada, a partir del
 *   `provider` opcional del use case o de `CAMPAIGN_AI_DEFAULT_PROVIDER`.
 * - Cada provider lee su propia API key (`OPENAI_API_KEY` / `GEMINI_API_KEY` /
 *   `ANTHROPIC_API_KEY`) desde `process.env` en el momento de la llamada —
 *   NUNCA se pasan secretos desde este composition root ni se guardan en el
 *   grafo de objetos (mismo patrón que `N8nWebhookDispatcher`).
 * - Ninguna de esas variables usa el prefijo `NEXT_PUBLIC_`: este módulo es
 *   server-only y jamás debe importarse desde un Client Component.
 *
 * USO DESDE SERVER COMPONENT / SERVER ACTION:
 * ```typescript
 * import { createServerSupabaseClient } from '@/lib/supabase/server';
 * import { createCampaignComposition } from '@/lib/composition/campaign.composition';
 *
 * const supabase = await createServerSupabaseClient();
 * const { useCases } = createCampaignComposition(supabase);
 * const result = await useCases.listCampaigns({ filter, pagination });
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseCampaignRepository,
  SupabaseCampaignApprovalRepository,
  SupabaseComplianceRuleRepository,
  SupabaseClientRepository,
  SupabaseOrganizationRepository,
  createCampaignAIProvider,
  CampaignGeneratorAdapter,
  consoleLogger,
} from '@bop-agency/infrastructure';
import {
  listCampaigns,
  getCampaign,
  createCampaignDraft,
  editCampaignDraft,
  submitCampaignForReview,
  approveCampaign,
  rejectCampaign,
  listCampaignApprovals,
  getApplicableComplianceRules,
  evaluateCampaignCompliance,
  generateCampaignDraftWithAI,
  regenerateCampaignContent,
} from '@bop-agency/application';
import type {
  ListCampaignsInput,
  GetCampaignInput,
  CreateCampaignDraftInput,
  EditCampaignDraftInput,
  SubmitCampaignForReviewInput,
  ApproveCampaignInput,
  RejectCampaignInput,
  ListCampaignApprovalsInput,
  GetApplicableComplianceRulesInput,
  EvaluateCampaignComplianceInput,
  GenerateCampaignDraftWithAiInput,
  RegenerateCampaignContentInput,
} from '@bop-agency/application';

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createCampaignComposition(supabase: SupabaseClient) {
  // ── Repositorios (RLS aplicada — cliente de usuario) ─────────────────────
  const campaignRepository = new SupabaseCampaignRepository(supabase);
  const campaignApprovalRepository = new SupabaseCampaignApprovalRepository(supabase);
  const complianceRuleRepository = new SupabaseComplianceRuleRepository(supabase);
  const clientRepository = new SupabaseClientRepository(supabase);
  const organizationRepository = new SupabaseOrganizationRepository(supabase);

  // ── Puerto de IA (server-only — resuelve proveedor por llamada, nunca secretos aquí) ──
  const campaignGeneratorPort = new CampaignGeneratorAdapter(createCampaignAIProvider);

  const logger = consoleLogger;

  // ── Deps compartidos ────────────────────────────────────────────────────
  const readDeps = { campaignRepository, logger };
  const draftDeps = { campaignRepository, clientRepository, logger };
  const approvalDeps = { campaignRepository, organizationRepository, logger };
  const approvalsListDeps = { campaignRepository, campaignApprovalRepository, logger };
  const complianceDeps = { complianceRuleRepository, logger };
  const complianceEvalDeps = { campaignRepository, complianceRuleRepository, logger };
  const aiDeps = {
    campaignRepository,
    clientRepository,
    complianceRuleRepository,
    organizationRepository,
    campaignGeneratorPort,
    logger,
  };

  // ── Use cases ────────────────────────────────────────────────────────────
  const useCases = {
    // Lectura
    listCampaigns: (input: ListCampaignsInput) => listCampaigns(input, readDeps),
    getCampaign: (input: GetCampaignInput) => getCampaign(input, readDeps),
    listCampaignApprovals: (input: ListCampaignApprovalsInput) =>
      listCampaignApprovals(input, approvalsListDeps),
    getApplicableComplianceRules: (input: GetApplicableComplianceRulesInput) =>
      getApplicableComplianceRules(input, complianceDeps),
    evaluateCampaignCompliance: (input: EvaluateCampaignComplianceInput) =>
      evaluateCampaignCompliance(input, complianceEvalDeps),

    // Creación manual (7B)
    createCampaignDraft: (input: CreateCampaignDraftInput) => createCampaignDraft(input, draftDeps),

    // Edición de draft (7E, cierre)
    editCampaignDraft: (input: EditCampaignDraftInput) => editCampaignDraft(input, approvalDeps),

    // Workflow de aprobación (7C)
    submitCampaignForReview: (input: SubmitCampaignForReviewInput) =>
      submitCampaignForReview(input, approvalDeps),
    approveCampaign: (input: ApproveCampaignInput) => approveCampaign(input, approvalDeps),
    rejectCampaign: (input: RejectCampaignInput) => rejectCampaign(input, approvalDeps),

    // AI Campaign Builder (7D)
    generateCampaignDraftWithAI: (input: GenerateCampaignDraftWithAiInput) =>
      generateCampaignDraftWithAI(input, aiDeps),
    regenerateCampaignContent: (input: RegenerateCampaignContentInput) =>
      regenerateCampaignContent(input, aiDeps),
  };

  return {
    repositories: {
      campaignRepository,
      campaignApprovalRepository,
      complianceRuleRepository,
      clientRepository,
      organizationRepository,
    },
    useCases,
  };
}

export type CampaignComposition = ReturnType<typeof createCampaignComposition>;
