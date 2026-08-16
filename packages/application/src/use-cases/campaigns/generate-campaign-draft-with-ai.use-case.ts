/**
 * generateCampaignDraftWithAI — Phase 7D.
 *
 * Genera una propuesta de campaña estructurada vía IA y la persiste como
 * campaña nueva en status='draft'. Reutiliza exactamente la infraestructura
 * de Phase 7B (CampaignRepository.create — SIEMPRE crea en 'draft', el tipo
 * CreateCampaignInput ni siquiera acepta un `status`) y de Phase 7C
 * (ComplianceRuleRepository.findApplicableRules /
 * evaluateCampaignCompliance).
 *
 * REGLA DE NEGOCIO FIJADA — NO AUTO-APROBACIÓN (§5 de la tarea):
 * el contenido generado por IA NUNCA se aprueba ni se envía a revisión
 * automáticamente, sin importar qué tan "limpio" luzca el resultado
 * (compliance sin manualReview, actor owner/admin, etc.). La única vía a
 * 'review'/'approved' sigue siendo `submitCampaignForReview`/`approveCampaign`
 * (Phase 7C), ejecutados explícitamente por un humano en un paso posterior.
 * Esto no es una validación adicional aquí: es una garantía estructural,
 * porque `CampaignRepository.create()` no expone ningún parámetro de status.
 *
 * Flujo:
 * 1. Valida input con Zod (generateCampaignDraftWithAiSchema).
 * 2. Verifica rol mínimo operator+ (mismo criterio que submitCampaignForReview
 *    / approveCampaign — owner/admin/strategist/operator sí, viewer no).
 * 3. Verifica que la plataforma tenga builder de generación implementado
 *    (isSupportedGenerationPlatform — dominio; solo meta_ads/google_ads en
 *    7D) — ver comentario de capas en campaign.schema.ts.
 * 4. Carga el cliente (aísla automáticamente por organización — cubre
 *    "cliente inexistente" y "cliente de otra organización" con el mismo
 *    NOT_FOUND) y verifica que esté 'active' (a diferencia de
 *    createCampaignDraft — Phase 7B —, que documenta esta verificación pero
 *    no la ejecuta; aquí SÍ se ejecuta explícitamente, ver clientInactive).
 * 5. Carga reglas de compliance aplicables (organización/cliente/plataforma)
 *    — se usan como CONTEXTO del prompt, nunca como bloqueo automático (§11:
 *    "NO automáticamente bloquear persistencia de draft salvo regla técnica
 *    determinística explícita" — no existe tal regla hoy).
 * 6. Carga opcionalmente el documento `brand-profile` del cliente
 *    (ClientRepository.getDocumentByKey — repositorio real y seguro de
 *    Phase 3). Si no existe o falla la carga, continúa sin él (el prompt
 *    marcará `assumptions` en su lugar) — NUNCA se bloquea la generación por
 *    falta de este contexto opcional.
 * 7. Invoca CampaignGeneratorPort.generate() — el adapter de infraestructura
 *    construye el prompt, llama al proveedor de IA, y valida el output
 *    (JSON.parse + Zod discriminated union) antes de retornar. Ningún output
 *    sin validar llega a este use case.
 * 8. Verifica en profundidad que `content.platform` coincida con la
 *    plataforma solicitada (defense in depth — el adapter ya lo garantiza
 *    vía el discriminated union, pero un mismatch aquí indicaría un bug de
 *    prompt/parsing, no una falla de proveedor).
 * 9. Calcula el resultado de compliance determinístico
 *    (`evaluateCampaignCompliance`, dominio puro) ANTES de persistir, usando
 *    un objeto Campaign construido en memoria con los valores reales que se
 *    van a persistir (todos excepto `id`, que aún no existe — la función de
 *    dominio solo lee `.platform` para filtrar reglas y ecoa `.id` en el
 *    resultado, que aquí se descarta). Esto evita una segunda llamada al
 *    repositorio y mantiene la garantía de "una sola persistencia" (ver
 *    tests §17).
 * 10. Persiste la campaña UNA SOLA VEZ vía CampaignRepository.create(), con
 *     `generatedContent` = contenido validado y `metadata.ai` = metadata de
 *     generación + resultado de compliance. Si el output de IA es inválido o
 *     el proveedor falla, NO se persiste nada (se retorna antes de este
 *     paso).
 *
 * NOTA — nombre de campaña: la especificación (§4) no incluye `name` entre
 * los campos de input (a diferencia de `createCampaignDraft`, Phase 7B, que
 * sí lo recibe del caller). Como `Campaign.name`/`CreateCampaignInput.name`
 * son obligatorios en el dominio, este use case deriva el nombre del
 * `campaignConcept` ya generado por la IA (truncado a 200 caracteres, mismo
 * límite que `createCampaignDraftSchema.name`) — es la fuente más
 * significativa disponible en este flujo. Si el proveedor devolviera un
 * concept vacío (rechazado por Zod aguas arriba, min(1)), no debería llegar
 * aquí.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignRepository,
  ClientId,
  ClientRepository,
  ComplianceRuleRepository,
  OrganizationRepository,
  OrganizationId,
  CampaignGeneratedContent,
  AIGenerationMetadata,
} from '@bop-agency/domain';
import {
  clientNotFound,
  clientInactive,
  unsupportedCampaignPlatform,
  invalidAiOutput,
  isSupportedGenerationPlatform,
  evaluateCampaignCompliance,
  hasMinimumRole,
  insufficientRole,
  notOrganizationMember,
} from '@bop-agency/domain';
import { generateCampaignDraftWithAiSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';
import type { CampaignGeneratorPort } from '../../ports/campaign-generator.port';

/** Convención de `ClientDocument.documentKey` para el perfil de marca — ver §14. */
export const BRAND_PROFILE_DOCUMENT_KEY = 'brand-profile';

/**
 * Idioma por defecto cuando el caller no especifica `language` — la agencia
 * y su base de clientes operan primariamente en español (mismo idioma usado
 * en todos los comentarios/documentación del proyecto).
 */
export const DEFAULT_GENERATION_LANGUAGE = 'es';

const CAMPAIGN_NAME_MAX_LENGTH = 200;

export type GenerateCampaignDraftWithAiInput = {
  readonly clientId: string;
  readonly platform: string;
  readonly objective: string;
  readonly brief: string;
  readonly budget: number;
  readonly currency?: string;
  readonly startDate?: Date | null;
  readonly endDate?: Date | null;
  readonly language?: string;
  readonly market?: string;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
};

export type GenerateCampaignDraftWithAiDeps = {
  campaignRepository: CampaignRepository;
  clientRepository: ClientRepository;
  complianceRuleRepository: ComplianceRuleRepository;
  organizationRepository: OrganizationRepository;
  campaignGeneratorPort: CampaignGeneratorPort;
  logger: LoggerPort;
};

function deriveCampaignName(content: CampaignGeneratedContent): string {
  const concept = content.campaignConcept.trim();
  if (concept.length === 0) {
    return `${content.platform} — AI draft`;
  }
  return concept.length > CAMPAIGN_NAME_MAX_LENGTH
    ? `${concept.slice(0, CAMPAIGN_NAME_MAX_LENGTH - 1)}…`
    : concept;
}

export async function generateCampaignDraftWithAI(
  input: GenerateCampaignDraftWithAiInput,
  deps: GenerateCampaignDraftWithAiDeps,
): Promise<Result<Campaign>> {
  deps.logger.debug('generateCampaignDraftWithAI', {
    organizationId: input.organizationId,
    clientId: input.clientId,
    platform: input.platform,
  });

  // 1. Validación de forma (Zod).
  const parsed = generateCampaignDraftWithAiSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const data = parsed.data;

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

  // 3. Regla de dominio: ¿hay builder de generación para esta plataforma?
  if (!isSupportedGenerationPlatform(data.platform)) {
    return err(unsupportedCampaignPlatform(data.platform));
  }

  // 4. Cliente existente, de esta organización, y activo.
  const clientResult = await deps.clientRepository.findById(
    data.clientId as ClientId,
    input.organizationId,
  );
  if (!isOk(clientResult)) {
    return err(clientNotFound(data.clientId));
  }
  const client = clientResult.value;
  if (client.status !== 'active') {
    return err(clientInactive(client.id));
  }

  // 5. Reglas de compliance aplicables — contexto del prompt, no bloqueo.
  const rulesResult = await deps.complianceRuleRepository.findApplicableRules({
    organizationId: input.organizationId,
    clientId: client.id,
    platform: data.platform,
  });
  if (!isOk(rulesResult)) {
    return rulesResult;
  }
  const applicableRules = rulesResult.value;

  // 6. Contexto de marca del cliente — opcional, nunca bloqueante.
  let brandProfile: string | null = null;
  const documentResult = await deps.clientRepository.getDocumentByKey(
    client.id,
    input.organizationId,
    BRAND_PROFILE_DOCUMENT_KEY,
  );
  if (isOk(documentResult) && documentResult.value !== null) {
    brandProfile = documentResult.value.content;
  } else if (!isOk(documentResult)) {
    deps.logger.warn('generateCampaignDraftWithAI: brand-profile document lookup failed, continuing without it', {
      clientId: client.id,
    });
  }

  const language = data.language ?? DEFAULT_GENERATION_LANGUAGE;

  // 7. Generación vía IA (puerto — infraestructura construye prompt/llama proveedor/valida output).
  const generation = await deps.campaignGeneratorPort.generate({
    platform: data.platform,
    objective: data.objective,
    brief: data.brief,
    budget: data.budget,
    currency: data.currency,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    language,
    ...(data.market !== undefined && { market: data.market }),
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
    deps.logger.error('generateCampaignDraftWithAI: AI generation failed', { error: generation });
    return generation;
  }

  // 8. Defense in depth: el contenido debe ser de la plataforma solicitada.
  if (generation.value.content.platform !== data.platform) {
    deps.logger.error('generateCampaignDraftWithAI: platform mismatch in AI output', {
      requested: data.platform,
      received: generation.value.content.platform,
    });
    return err(
      invalidAiOutput('El proveedor de IA devolvió contenido para una plataforma distinta a la solicitada.'),
    );
  }
  const content = generation.value.content;

  // 9. Evaluación de compliance determinística (dominio puro) — pre-persistencia
  // para mantener una sola llamada a create(). `id` es un placeholder
  // descartado: evaluateCampaignCompliance solo lee `.platform` para filtrar
  // reglas y ecoa `.id` en el resultado, que aquí no se propaga.
  const draftForCompliance: Campaign = {
    id: 'pending-generation' as CampaignId,
    organizationId: input.organizationId,
    clientId: client.id,
    name: deriveCampaignName(content),
    platform: data.platform,
    objective: data.objective,
    status: 'draft',
    brief: data.brief,
    budget: data.budget,
    currency: data.currency,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    generatedContent: content as unknown as Record<string, unknown>,
    metadata: {},
    createdBy: input.actorUserId,
    updatedBy: null,
    submittedForReviewAt: null,
    approvedAt: null,
    rejectedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const complianceEvaluation = evaluateCampaignCompliance(draftForCompliance, applicableRules);

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
    ...(data.market !== undefined && { market: data.market }),
    complianceReview: {
      passed: complianceEvaluation.passed,
      requiresManualReview: complianceEvaluation.requiresManualReview,
    },
  };

  // 10. Persistencia — ÚNICA llamada a create(). SIEMPRE status='draft'
  // (CreateCampaignInput no acepta status — ver nota de "NO AUTO-APROBACIÓN").
  const createResult = await deps.campaignRepository.create({
    organizationId: input.organizationId,
    clientId: client.id,
    name: deriveCampaignName(content),
    platform: data.platform,
    objective: data.objective,
    brief: data.brief,
    budget: data.budget,
    currency: data.currency,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    generatedContent: content as unknown as Record<string, unknown>,
    metadata: { ai: aiMetadata },
    createdBy: input.actorUserId,
  });

  if (!isOk(createResult)) {
    deps.logger.error('generateCampaignDraftWithAI: repository error', { error: createResult });
    return createResult;
  }

  deps.logger.info('generateCampaignDraftWithAI: created', {
    campaignId: createResult.value.id,
    organizationId: input.organizationId,
    clientId: client.id,
    platform: data.platform,
    requiresManualReviewCount: complianceEvaluation.requiresManualReview.length,
  });
  return ok(createResult.value);
}
