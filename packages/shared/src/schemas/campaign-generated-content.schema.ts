/**
 * campaignGeneratedContentSchema — Phase 7D.
 *
 * Valida el JSON crudo devuelto por el proveedor de IA ANTES de persistirlo
 * en `campaigns.generated_content`. Espejo exacto (misma forma, mismos
 * campos) de `CampaignGeneratedContent` en `@bop-agency/domain` — ver ese
 * archivo para la justificación de diseño (estructura base común +
 * discriminated union por plataforma, solo meta_ads/google_ads en 7D).
 *
 * Este schema vive en `shared` (no en `domain`, que debe permanecer libre de
 * Zod) y en `infrastructure` es el punto de validación real: el adapter
 * (`CampaignGeneratorAdapter`) hace `JSON.parse` sobre el texto crudo del
 * proveedor y corre `campaignGeneratedContentSchema.safeParse(...)` antes de
 * construir el `GeneratedCampaignResult` — ningún output de IA llega a
 * `application`/`domain` sin haber pasado esta validación.
 */

import { z } from 'zod';

export const GENERATED_CONTENT_SCHEMA_VERSION = 'campaign-content-v1' as const;

// ─── Shared building blocks ───────────────────────────────────────────────────

const creativeSuggestionSchema = z.object({
  hook: z.string().trim().min(1).max(300),
  headline: z.string().trim().min(1).max(200),
  primaryText: z.string().trim().min(1).max(3000),
  format: z.string().trim().min(1).max(60),
  visualSuggestion: z.string().trim().min(1).max(500),
});

const baseFieldsSchema = {
  schemaVersion: z.literal(GENERATED_CONTENT_SCHEMA_VERSION),
  language: z.string().trim().min(2).max(10),
  campaignConcept: z.string().trim().min(1).max(2000),
  targetAudience: z.string().trim().min(1).max(2000),
  valueProposition: z.string().trim().min(1).max(1000),
  messaging: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  callsToAction: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
  landingPageRecommendations: z.array(z.string().trim().min(1).max(500)).max(10),
  complianceNotes: z.array(z.string().trim().min(1).max(1000)).max(20),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(20),
};

// ─── Meta Ads ─────────────────────────────────────────────────────────────────

const metaAdSetSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  audienceType: z.enum(['cold', 'warm', 'retargeting']),
  targetingSummary: z.string().trim().min(1).max(1000),
  placementSuggestions: z.array(z.string().trim().min(1).max(100)).min(1).max(10),
  creatives: z.array(creativeSuggestionSchema).min(1).max(6),
});

export const metaAdsGeneratedContentSchema = z.object({
  ...baseFieldsSchema,
  platform: z.literal('meta_ads'),
  adSets: z.array(metaAdSetSuggestionSchema).min(1).max(10),
});

// ─── Google Ads ───────────────────────────────────────────────────────────────

const googleAdGroupSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  theme: z.string().trim().min(1).max(300),
  /** Máximo 15 — mismo límite real de Responsive Search Ads. */
  headlines: z.array(z.string().trim().min(1).max(30)).min(3).max(15),
  /** Máximo 4 — mismo límite real de RSA descriptions. */
  descriptions: z.array(z.string().trim().min(1).max(90)).min(1).max(4),
});

export const googleAdsGeneratedContentSchema = z.object({
  ...baseFieldsSchema,
  platform: z.literal('google_ads'),
  adGroups: z.array(googleAdGroupSuggestionSchema).min(1).max(10),
  keywordSuggestions: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  negativeKeywordSuggestions: z.array(z.string().trim().min(1).max(100)).max(50),
});

// ─── Discriminated union ───────────────────────────────────────────────────────

export const campaignGeneratedContentSchema = z.discriminatedUnion('platform', [
  metaAdsGeneratedContentSchema,
  googleAdsGeneratedContentSchema,
]);

export type CampaignGeneratedContentFormValues = z.infer<typeof campaignGeneratedContentSchema>;
