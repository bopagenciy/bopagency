/**
 * CampaignGeneratorPort — Puerto de la capa de aplicación para el generador
 * de campañas por IA (Phase 7D).
 *
 * Abstracción que aísla los use cases (`generateCampaignDraftWithAI`,
 * `regenerateCampaignContent`) del proveedor de IA concreto. La
 * implementación concreta (`CampaignGeneratorAdapter`, que compone
 * `ClaudeAPIProvider` + `buildCampaignGenerationPrompt` +
 * `campaignGeneratedContentSchema`) se conecta en el composition root —
 * mismo patrón que `WorkflowDispatcherPort` / `N8nDispatcherAdapter`.
 *
 * Restricciones (mismo criterio que WorkflowDispatcherPort):
 * - `application`/`domain` NUNCA importan SDKs de IA, `fetch`, ni
 *   `process.env` — todo eso vive en el adapter de `infrastructure`.
 * - `GeneratedCampaignResult` expone únicamente metadata segura — nunca
 *   headers de autorización, API keys, ni el texto crudo sin validar del
 *   proveedor.
 * - `content` YA fue validado (JSON.parse + Zod discriminated union) por el
 *   adapter antes de retornar — ningún output de IA sin validar llega a
 *   application/domain.
 */

import type { Result } from '@bop-agency/shared';
import type { AdPlatform } from '@bop-agency/shared';
import type { CampaignGeneratedContent, GeneratedContentSchemaVersion } from '@bop-agency/domain';

// ─── Input ────────────────────────────────────────────────────────────────────

/**
 * Contexto de cliente enviado al prompt — solo datos ya existentes y
 * seguros (Client + ClientDocument opcional vía
 * ClientRepository.getDocumentByKey, convención documentKey='brand-profile').
 * NUNCA se hace web scraping ni se leen documentos arbitrarios del filesystem
 * en runtime — ver §14 de la especificación de Phase 7D.
 */
export type CampaignGenerationClientContext = {
  readonly name: string;
  readonly industry: string | null;
  readonly website: string | null;
  /**
   * Contenido de texto libre del documento `brand-profile` del cliente, si
   * existe. NULL si el cliente no tiene ese documento — el prompt debe
   * entonces basarse solo en el brief y marcar explícitamente las
   * suposiciones (`assumptions`) en el output.
   */
  readonly brandProfile: string | null;
};

/**
 * Referencia mínima y segura a una regla de compliance aplicable — nunca se
 * envía el registro completo de `ComplianceRule` (evita filtrar columnas
 * internas como `id`/`organizationId`/`metadata` al proveedor de IA).
 */
export type CampaignGenerationComplianceRule = {
  readonly ruleKey: string;
  readonly title: string;
  readonly description: string;
  readonly severity: string;
};

export type GenerateCampaignInput = {
  readonly platform: AdPlatform;
  readonly objective: string;
  readonly brief: string;
  readonly budget: number;
  readonly currency: string;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  readonly language: string;
  readonly market?: string;
  readonly clientContext: CampaignGenerationClientContext;
  readonly complianceRules: readonly CampaignGenerationComplianceRule[];
};

// ─── Output ───────────────────────────────────────────────────────────────────

/**
 * Metadata segura de la generación. NO incluye `complianceReview`: esa
 * pieza la calcula el use case (defense in depth vía
 * `evaluateCampaignCompliance`, función pura de dominio), no el adapter de
 * IA — el adapter no tiene por qué conocer la evaluación de compliance. Ver
 * `generate-campaign-draft-with-ai.use-case.ts` /
 * `regenerate-campaign-content.use-case.ts`.
 */
export type GeneratedCampaignMetadata = {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: GeneratedContentSchemaVersion;
  readonly generatedAt: string;
  readonly tokenUsage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  readonly latencyMs?: number;
};

export type GeneratedCampaignResult = {
  readonly content: CampaignGeneratedContent;
  readonly metadata: GeneratedCampaignMetadata;
};

// ─── Port ─────────────────────────────────────────────────────────────────────

export interface CampaignGeneratorPort {
  /**
   * Genera contenido de campaña estructurado vía IA.
   * Retorna Result<GeneratedCampaignResult> — nunca lanza excepciones.
   * En caso de error, el errorCode en AppError identifica el tipo de fallo
   * (ver campaignGenerationUnavailable / invalidAiOutput / aiProviderFailure
   * / aiGenerationTimeout / aiRateLimited en @bop-agency/domain).
   */
  generate(input: GenerateCampaignInput): Promise<Result<GeneratedCampaignResult>>;
}
