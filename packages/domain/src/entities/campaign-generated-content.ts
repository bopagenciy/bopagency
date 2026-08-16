import type { ComplianceRuleId, ComplianceRuleSeverity } from './compliance-rule';

/**
 * CampaignGeneratedContent — Phase 7D.
 *
 * Output estructurado de `generateCampaignDraftWithAI` / `regenerateCampaignContent`,
 * persistido tal cual (validado) en `campaigns.generated_content` (jsonb,
 * columna ya existente desde Phase 7B — ver `packages/domain/src/entities/campaign.ts`).
 *
 * DISEÑO — estructura base común + discriminated union por plataforma:
 * la mayoría de campos (concepto, audiencia, propuesta de valor, mensajes,
 * creatividades, CTAs, recomendaciones de landing page, notas de compliance,
 * assumptions) son comunes a cualquier plataforma publicitaria. Lo que varía
 * es la estructura de "unidades de entrega" (ad sets en Meta vs. ad groups +
 * keywords en Google) — de ahí el discriminant `platform`.
 *
 * PLATAFORMAS SOPORTADAS EN 7D: 'meta_ads' | 'google_ads' únicamente — ver
 * `SUPPORTED_GENERATION_PLATFORMS` y la justificación en
 * PHASE_7D_AI_CAMPAIGN_BUILDER_REPORT.md §"Platform support". Cualquier otro
 * valor de `AdPlatform` (incluido `youtube_ads`, pese a tener evidencia
 * legacy MIGRATE-clasificada) es explícitamente NO soportado en esta fase —
 * ver `UnsupportedCampaignPlatformError` (domain.errors.ts).
 *
 * VERSIONADO: `schemaVersion` permite evolucionar este contrato sin romper
 * contenido ya persistido — un consumidor futuro (UI, 7E) debe verificar
 * `schemaVersion` antes de asumir la forma exacta del objeto.
 */

export const GENERATED_CONTENT_SCHEMA_VERSION = 'campaign-content-v1' as const;
export type GeneratedContentSchemaVersion = typeof GENERATED_CONTENT_SCHEMA_VERSION;

/** Plataformas con builder de generación implementado en Phase 7D. */
export const SUPPORTED_GENERATION_PLATFORMS = ['meta_ads', 'google_ads'] as const;
export type SupportedGenerationPlatform = (typeof SUPPORTED_GENERATION_PLATFORMS)[number];

export function isSupportedGenerationPlatform(
  platform: string,
): platform is SupportedGenerationPlatform {
  return (SUPPORTED_GENERATION_PLATFORMS as readonly string[]).includes(platform);
}

// ─── Shared building blocks ───────────────────────────────────────────────────

/**
 * Sugerencia de creatividad — común a ambas plataformas soportadas.
 * `format` queda como texto libre documentado (no enum estricto) porque los
 * formatos reales de cada plataforma difieren (imagen/video/carrusel en
 * Meta; RSA en Google) y fijar un enum compartido sería artificial.
 */
export type CreativeSuggestion = {
  /** Primera línea / gancho visual o textual — crítico para detener el scroll. */
  readonly hook: string;
  readonly headline: string;
  readonly primaryText: string;
  /** Ej: "image", "video", "carousel" (Meta) — "responsive_search_ad" (Google). Texto libre, documentado. */
  readonly format: string;
  readonly visualSuggestion: string;
};

// ─── Meta Ads ─────────────────────────────────────────────────────────────────

export type MetaAdSetAudienceType = 'cold' | 'warm' | 'retargeting';

export type MetaAdSetSuggestion = {
  readonly name: string;
  readonly audienceType: MetaAdSetAudienceType;
  readonly targetingSummary: string;
  readonly placementSuggestions: readonly string[];
  readonly creatives: readonly CreativeSuggestion[];
};

export type MetaAdsGeneratedContent = {
  readonly schemaVersion: GeneratedContentSchemaVersion;
  readonly platform: 'meta_ads';
  readonly language: string;
  readonly campaignConcept: string;
  readonly targetAudience: string;
  readonly valueProposition: string;
  readonly messaging: readonly string[];
  readonly adSets: readonly MetaAdSetSuggestion[];
  readonly callsToAction: readonly string[];
  readonly landingPageRecommendations: readonly string[];
  readonly complianceNotes: readonly string[];
  readonly assumptions: readonly string[];
};

// ─── Google Ads ───────────────────────────────────────────────────────────────

export type GoogleAdGroupSuggestion = {
  readonly name: string;
  readonly theme: string;
  /** Máximo 15 — mismo límite que Responsive Search Ads reales (legacy skill google-ads-campaign-builder). */
  readonly headlines: readonly string[];
  /** Máximo 4 — mismo límite que RSA descriptions. */
  readonly descriptions: readonly string[];
};

export type GoogleAdsGeneratedContent = {
  readonly schemaVersion: GeneratedContentSchemaVersion;
  readonly platform: 'google_ads';
  readonly language: string;
  readonly campaignConcept: string;
  readonly targetAudience: string;
  readonly valueProposition: string;
  readonly messaging: readonly string[];
  readonly adGroups: readonly GoogleAdGroupSuggestion[];
  readonly keywordSuggestions: readonly string[];
  readonly negativeKeywordSuggestions: readonly string[];
  readonly callsToAction: readonly string[];
  readonly landingPageRecommendations: readonly string[];
  readonly complianceNotes: readonly string[];
  readonly assumptions: readonly string[];
};

// ─── Discriminated union ───────────────────────────────────────────────────────

export type CampaignGeneratedContent = MetaAdsGeneratedContent | GoogleAdsGeneratedContent;

// ─── AI generation metadata — Phase 7D ─────────────────────────────────────────
//
// Persistido en `campaigns.metadata.ai` (jsonb genérico ya existente desde
// 7B — NO se crea ninguna columna nueva, ver §12 de la tarea). NUNCA debe
// contener secretos: ni API keys, ni raw authorization headers, ni el prompt
// completo (solo su versión/id).

export type AITokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

/** Referencia liviana a una regla de compliance — reexportado para conveniencia del caller. */
export type AIComplianceRuleReference = {
  readonly ruleId: ComplianceRuleId;
  readonly ruleKey: string;
  readonly title: string;
  readonly severity: ComplianceRuleSeverity;
};

export type AIGenerationMetadata = {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: GeneratedContentSchemaVersion;
  /** ISO 8601 — estampado por el adapter en el momento en que el provider respondió. */
  readonly generatedAt: string;
  readonly tokenUsage?: AITokenUsage;
  readonly latencyMs?: number;
  /** Idioma/mercado efectivamente usados en esta generación (para que regenerateCampaignContent pueda reutilizarlos). */
  readonly language: string;
  readonly market?: string;
  /**
   * Reglas de compliance activas y aplicables consideradas como contexto de
   * generación, evaluadas de forma determinística (Phase 7C) — NUNCA implica
   * que la IA "cumple" compliance por declararlo. Ver
   * `evaluateCampaignCompliance` (domain) y §11 de la tarea.
   */
  readonly complianceReview: {
    readonly passed: boolean;
    readonly requiresManualReview: readonly AIComplianceRuleReference[];
  };
};
