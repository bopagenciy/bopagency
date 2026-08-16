/**
 * regenerateCampaignContent — Phase 7D (§13).
 *
 * Reemplaza el `generated_content` de una campaña que sigue en 'draft' con
 * una nueva generación de IA, reutilizando el brief/objetivo/budget/plataforma
 * YA persistidos en la campaña (no se reciben de nuevo del caller — a
 * diferencia de `generateCampaignDraftWithAI`, este use case no crea nada
 * nuevo, solo regenera contenido sobre una campaña existente). `language`/
 * `market` son overrides opcionales; si se omiten, se reutilizan los valores
 * de la generación anterior (`campaign.metadata.ai`), si existen.
 *
 * Reglas de negocio (§13, verbatim):
 * - Solo campañas en status 'draft' (campaignRegenerationNotAllowed en
 *   cualquier otro status — 'review'/'approved'/'rejected'/etc. NUNCA se
 *   tocan aquí).
 * - Misma organización (CampaignRepository.findById ya aísla por
 *   organización — mismo criterio que el resto del proyecto).
 * - Rol operator+ (mismo criterio que generateCampaignDraftWithAI /
 *   submitCampaignForReview).
 * - Reemplaza `generated_content`.
 * - Metadata de generación (`metadata.ai`): se REEMPLAZA junto con el
 *   contenido — ver nota extensa más abajo sobre esta decisión de diseño.
 * - Historial de regeneraciones: DEFERIDO (§13 explícito: "no inventar una
 *   tabla de auditoría adicional a menos que sea claramente necesaria").
 *   Cada regeneración sobrescribe la anterior sin dejar rastro — riesgo
 *   documentado en PHASE_7_RISK_REGISTER.md / PHASE_7D_AI_CAMPAIGN_BUILDER_REPORT.md.
 *
 * NOTA — por qué `metadata.ai` se reemplaza (no se "mantiene"):
 * la especificación dice "keep current generation metadata", que podría
 * leerse como "no tocar metadata.ai en absoluto". Se interpretó en su lugar
 * como "mantener la FORMA/contrato de metadata.ai" (sigue siendo un
 * AIGenerationMetadata completo), porque conservar los valores ANTIGUOS
 * (provider/model/generatedAt de la generación previa) junto a un
 * `generated_content` NUEVO sería activamente engañoso: la metadata dejaría
 * de describir el contenido realmente persistido. Dado que no existe (por
 * decisión explícita de esta tarea) una tabla de historial que preserve la
 * metadata previa por separado, la alternativa menos mala es que
 * `metadata.ai` siempre describa la generación ACTUALMENTE almacenada. Esta
 * decisión queda documentada también en el reporte de Phase 7D.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  ClientRepository,
  ComplianceRuleRepository,
  OrganizationRepository,
  OrganizationId,
  AIGenerationMetadata,
} from '@bop-agency/domain';
import {
  clientNotFound,
  clientInactive,
  unsupportedCampaignPlatform,
  invalidAiOutput,
  campaignRegenerationNotAllowed,
  campaignBriefRequired,
  isSupportedGenerationPlatform,
  evaluateCampaignCompliance,
  hasMinimumRole,
  insufficientRole,
  notOrganizationMember,
} from '@bop-agency/domain';
import { regenerateCampaignContentSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';
import type { CampaignGeneratorPort } from '../../ports/campaign-generator.port';
import { BRAND_PROFILE_DOCUMENT_KEY, DEFAULT_GENERATION_LANGUAGE } from './generate-campaign-draft-with-ai.use-case';

export type RegenerateCampaignContentInput = {
  readonly campaignId: string;
  readonly language?: string;
  readonly market?: string;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
};

export type RegenerateCampaignContentDeps = {
  campaignRepository: CampaignRepository;
  clientRepository: ClientRepository;
  complianceRuleRepository: ComplianceRuleRepository;
  organizationRepository: OrganizationRepository;
  campaignGeneratorPort: CampaignGeneratorPort;
  logger: LoggerPort;
};

/** Lee `campaign.metadata.ai.<field>` de forma segura (metadata es JSON no tipado). */
function readPreviousAiMetadataField(campaign: Campaign, field: 'language' | 'market'): string | undefined {
  const ai = campaign.metadata['ai'];
  if (ai === null || typeof ai !== 'object' || Array.isArray(ai)) return undefined;
  const value = (ai as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

export async function regenerateCampaignContent(
  input: RegenerateCampaignContentInput,
  deps: RegenerateCampaignContentDeps,
): Promise<Result<Campaign>> {
  deps.logger.debug('regenerateCampaignContent', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
  });

  // 1. Validación de forma (Zod).
  const parsed = regenerateCampaignContentSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const data = parsed.data;
  const campaignId = data.campaignId as CampaignId;

  // 2. Rol mínimo operator+.
  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }
  if (!hasMinimumRole(memberResult.value.role, 'operator')) {
    return err(insufficientRole('operator', memberResult.value.role));
  }

  // 3. Cargar la campaña (aísla por organización — inexistente y otra org → NOT_FOUND).
  const campaignResult = await deps.campaignRepository.findById(campaignId, input.organizationId);
  if (!isOk(campaignResult)) {
    return campaignResult;
  }
  const campaign = campaignResult.value;

  // 4. Solo 'draft' — nunca review/approved/rejected/active/paused/completed.
  if (campaign.status !== 'draft') {
    return err(campaignRegenerationNotAllowed(campaign.status));
  }

  // 5. Defensa en profundidad: la plataforma debe seguir teniendo builder.
  if (!isSupportedGenerationPlatform(campaign.platform)) {
    return err(unsupportedCampaignPlatform(campaign.platform));
  }

  // 6. La campaña debe tener un brief (ver campaignBriefRequired — solo
  // aplica a drafts creados manualmente sin brief; los generados por IA
  // siempre lo tienen).
  if (campaign.brief === null || campaign.brief.trim().length === 0) {
    return err(campaignBriefRequired(campaign.id));
  }

  // 7. Cliente activo, misma organización (defensa — ya lo era al crear la campaña).
  const clientResult = await deps.clientRepository.findById(campaign.clientId, input.organizationId);
  if (!isOk(clientResult)) {
    return err(clientNotFound(campaign.clientId));
  }
  const client = clientResult.value;
  if (client.status !== 'active') {
    return err(clientInactive(client.id));
  }

  // 8. Reglas de compliance aplicables — contexto del prompt.
  const rulesResult = await deps.complianceRuleRepository.findApplicableRules({
    organizationId: input.organizationId,
    clientId: client.id,
    platform: campaign.platform,
  });
  if (!isOk(rulesResult)) {
    return rulesResult;
  }
  const applicableRules = rulesResult.value;

  // 9. Contexto de marca — opcional, nunca bloqueante.
  let brandProfile: string | null = null;
  const documentResult = await deps.clientRepository.getDocumentByKey(
    client.id,
    input.organizationId,
    BRAND_PROFILE_DOCUMENT_KEY,
  );
  if (isOk(documentResult) && documentResult.value !== null) {
    brandProfile = documentResult.value.content;
  } else if (!isOk(documentResult)) {
    deps.logger.warn('regenerateCampaignContent: brand-profile document lookup failed, continuing without it', {
      clientId: client.id,
    });
  }

  const language =
    data.language ?? readPreviousAiMetadataField(campaign, 'language') ?? DEFAULT_GENERATION_LANGUAGE;
  const market = data.market ?? readPreviousAiMetadataField(campaign, 'market');

  // 10. Regeneración vía IA.
  const generation = await deps.campaignGeneratorPort.generate({
    platform: campaign.platform,
    objective: campaign.objective,
    brief: campaign.brief,
    budget: campaign.budget,
    currency: campaign.currency,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    language,
    ...(market !== undefined && { market }),
    clientContext: {
      name: client.name,
      industry: client.industry,
      website: client.website,
      brandProfile,
    },
    complianceRules: applicableRules.map((rule) => ({
      ruleKey: rule.ruleKey,
      title: rule.title,
      description: rule.description,
      severity: rule.severity,
    })),
  });
  if (!isOk(generation)) {
    deps.logger.error('regenerateCampaignContent: AI generation failed', { error: generation });
    return generation;
  }

  // 11. Defense in depth: la plataforma del output debe coincidir con la de la campaña.
  if (generation.value.content.platform !== campaign.platform) {
    deps.logger.error('regenerateCampaignContent: platform mismatch in AI output', {
      campaignPlatform: campaign.platform,
      received: generation.value.content.platform,
    });
    return err(
      invalidAiOutput('El proveedor de IA devolvió contenido para una plataforma distinta a la de la campaña.'),
    );
  }
  const content = generation.value.content;

  // 12. Compliance determinístico — reusa la campaña YA persistida (sin
  // necesidad del placeholder que usa generateCampaignDraftWithAI).
  const complianceEvaluation = evaluateCampaignCompliance(campaign, applicableRules);

  const aiMetadata: AIGenerationMetadata = {
    provider: generation.value.metadata.provider,
    model: generation.value.metadata.model,
    promptVersion: generation.value.metadata.promptVersion,
    schemaVersion: generation.value.metadata.schemaVersion,
    generatedAt: generation.value.metadata.generatedAt,
    ...(generation.value.metadata.tokenUsage !== undefined && {
      tokenUsage: generation.value.metadata.tokenUsage,
    }),
    ...(generation.value.metadata.latencyMs !== undefined && {
      latencyMs: generation.value.metadata.latencyMs,
    }),
    language,
    ...(market !== undefined && { market }),
    complianceReview: {
      passed: complianceEvaluation.passed,
      requiresManualReview: complianceEvaluation.requiresManualReview,
    },
  };

  // 13. Persistencia — ÚNICA llamada a update(). Preserva cualquier otra
  // clave de metadata no relacionada con `ai` (spread de campaign.metadata).
  const updateResult = await deps.campaignRepository.update(campaignId, input.organizationId, {
    generatedContent: content as unknown as Record<string, unknown>,
    metadata: { ...campaign.metadata, ai: aiMetadata },
    updatedBy: input.actorUserId,
  });

  if (!isOk(updateResult)) {
    deps.logger.error('regenerateCampaignContent: repository error', { error: updateResult });
    return updateResult;
  }

  deps.logger.info('regenerateCampaignContent: ok', {
    campaignId,
    organizationId: input.organizationId,
    requiresManualReviewCount: complianceEvaluation.requiresManualReview.length,
  });
  return ok(updateResult.value);
}
