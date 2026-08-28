/**
 * Campaign schemas — Zod validation for Campaign Studio Server Actions / use cases.
 *
 * Schemas son intencionalmente mínimos: solo los campos que el caller
 * (Server Action o use case caller) provee. organizationId y createdBy/
 * updatedBy/actorUserId NUNCA se aceptan del cliente — se obtienen de la
 * sesión del servidor (mismo patrón que automation.schema.ts).
 *
 * Phase 7C añade submitCampaignForReviewSchema / approveCampaignSchema /
 * rejectCampaignSchema (campaignId + note) y complianceRuleFilterSchema.
 *
 * Phase 7D añade generateCampaignDraftWithAiSchema / regenerateCampaignContentSchema.
 * `platform` aquí solo valida "es un AdPlatform válido" (forma) — la
 * restricción de negocio "¿hay builder de generación implementado para esta
 * plataforma?" (meta_ads/google_ads únicamente en 7D) es una regla de
 * dominio, no de shape, y se aplica en el use case vía
 * `isSupportedGenerationPlatform` (domain), retornando
 * `unsupportedCampaignPlatform` — mismo criterio de capas ya usado en el
 * resto del proyecto (Zod = forma, dominio = regla de negocio).
 */

import { z } from 'zod';
import { AD_PLATFORMS } from '../constants/platforms';
import { AI_PROVIDER_IDS } from '../constants/ai-providers';
import { CAMPAIGN_STATUSES } from '../constants/status';
import { PaginationSchema } from './common.schema';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CAMPAIGN_OBJECTIVES = [
  'brand_awareness',
  'reach',
  'traffic',
  'engagement',
  'lead_generation',
  'conversions',
  'catalog_sales',
] as const;

export const CAMPAIGN_CURRENCIES = ['USD', 'COP', 'MXN', 'EUR'] as const;
export type Currency = (typeof CAMPAIGN_CURRENCIES)[number];


/**
 * Status alcanzables vía un update genérico de campaña en Phase 7B/7C.
 * 'approved'/'rejected' se reservan a las RPCs dedicadas de Phase 7C
 * (approve_campaign/reject_campaign) — ver campaigns_update RLS policy en
 * la migración 7B y las RPCs en la migración 7C.
 */
export const CAMPAIGN_EDITABLE_STATUSES = ['draft', 'review'] as const;

/** Longitud máxima de nota de rechazo — alineada con el CHECK de BD (5000). */
const REJECTION_NOTE_MAX_LENGTH = 5000;

// ─── budgetAmountSchema — Phase 7D.1.1 ────────────────────────────────────────
//
// BUG REAL CORREGIDO AQUÍ: el smoke con Gemini creó una campaña cuyo
// presupuesto se mostraba como $0 pese a haberse ingresado uno en el
// formulario.
//
// Causa raíz: `z.coerce.number()` es un footgun para dinero. `Number(null)`,
// `Number('')`, `Number(false)` y `Number([])` valen TODOS 0, y 0 pasa
// `.min(0)` sin objeción. Es decir: cualquier forma en que el presupuesto NO
// llegara como número real al servidor (campo vacío, valor perdido en la
// serialización de la Server Action, payload construido a mano) se convertía
// silenciosamente en un presupuesto de 0 y se persistía como tal, en vez de
// fallar con un error de validación visible.
//
// `budgetAmountSchema` cierra esa vía: solo acepta un número finito o una
// cadena estrictamente numérica (tolerando espacios y separadores de miles
// habituales al pegar un valor), y RECHAZA null/undefined/''/booleanos/
// arrays/objetos/NaN/Infinity con un mensaje explícito.
//
// El presupuesto SIEMPRE proviene del formulario/usuario — NUNCA se deriva del
// contenido generado por la IA.

const BUDGET_INVALID_MESSAGE = 'El presupuesto es requerido y debe ser un número válido';
const BUDGET_NEGATIVE_MESSAGE = 'El presupuesto no puede ser negativo';

/**
 * Normaliza una entrada de dinero a número, o `null` si no es interpretable.
 * Exportada para poder testear la regla de forma aislada.
 */
export function parseBudgetAmount(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== 'string') return null;

  // Espacios (incl. NBSP) y separadores de miles al pegar: "1 234 567", "1,234,567".
  const compact = raw.replace(/[\s\u00A0]/g, '');
  if (compact.length === 0) return null;

  const withoutThousands = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact)
    ? compact.replace(/,/g, '')
    : compact;

  if (!/^-?\d+(\.\d+)?$/.test(withoutThousands)) return null;

  const parsed = Number(withoutThousands);
  return Number.isFinite(parsed) ? parsed : null;
}

export const budgetAmountSchema = z
  .union([z.number(), z.string()], {
    errorMap: () => ({ message: BUDGET_INVALID_MESSAGE }),
  })
  .transform((raw, ctx): number => {
    const parsed = parseBudgetAmount(raw);
    if (parsed === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: BUDGET_INVALID_MESSAGE });
      return z.NEVER;
    }
    if (parsed < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: BUDGET_NEGATIVE_MESSAGE });
      return z.NEVER;
    }
    return parsed;
  });

// ─── campaignIdSchema ─────────────────────────────────────────────────────────

export const campaignIdSchema = z.string().min(1, 'El ID de campaña es requerido').max(255);

// ─── createCampaignDraftSchema ────────────────────────────────────────────────

export const createCampaignDraftSchema = z.object({
  clientId: z.string().min(1, 'El cliente es requerido'),
  name: z.string().trim().min(1, 'El nombre es requerido').max(200, 'Máximo 200 caracteres'),
  platform: z.enum(AD_PLATFORMS),
  objective: z.enum(CAMPAIGN_OBJECTIVES),
  brief: z.string().trim().max(10000).nullable().optional(),
  budget: budgetAmountSchema,
  currency: z.enum(CAMPAIGN_CURRENCIES).default('COP'),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type CreateCampaignDraftFormValues = z.infer<typeof createCampaignDraftSchema>;

// ─── updateCampaignDraftSchema ────────────────────────────────────────────────
// Phase 7B: edición de campañas en 'draft' (regla de negocio #4) y envío a
// revisión draft → review (regla de negocio #5, status opcional aquí).

export const updateCampaignDraftSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  platform: z.enum(AD_PLATFORMS).optional(),
  objective: z.enum(CAMPAIGN_OBJECTIVES).optional(),
  brief: z.string().trim().max(10000).nullable().optional(),
  budget: budgetAmountSchema.optional(),
  currency: z.enum(CAMPAIGN_CURRENCIES).optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  status: z.enum(CAMPAIGN_EDITABLE_STATUSES).optional(),
});

export type UpdateCampaignDraftFormValues = z.infer<typeof updateCampaignDraftSchema>;

// ─── campaignFilterSchema ─────────────────────────────────────────────────────

export const campaignFilterSchema = z
  .object({
    clientId: z.string().min(1).optional(),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
    platform: z.enum(AD_PLATFORMS).optional(),
  })
  .merge(PaginationSchema);

export type CampaignFilterFormValues = z.infer<typeof campaignFilterSchema>;

// ─── submitCampaignForReviewSchema — Phase 7C ──────────────────────────────────

export const submitCampaignForReviewSchema = z.object({
  campaignId: campaignIdSchema,
});

export type SubmitCampaignForReviewFormValues = z.infer<typeof submitCampaignForReviewSchema>;

// ─── approveCampaignSchema — Phase 7C ──────────────────────────────────────────

export const approveCampaignSchema = z.object({
  campaignId: campaignIdSchema,
});

export type ApproveCampaignFormValues = z.infer<typeof approveCampaignSchema>;

// ─── rejectCampaignSchema — Phase 7C ───────────────────────────────────────────
// note: obligatoria y no vacía tras trim (regla de negocio fijada #7),
// reforzada también por isValidRejectionNote (domain) y por el CHECK/RPC en BD.

export const rejectCampaignSchema = z.object({
  campaignId: campaignIdSchema,
  note: z
    .string()
    .trim()
    .min(1, 'La nota de rechazo es requerida')
    .max(REJECTION_NOTE_MAX_LENGTH, `Máximo ${REJECTION_NOTE_MAX_LENGTH} caracteres`),
});

export type RejectCampaignFormValues = z.infer<typeof rejectCampaignSchema>;

// ─── complianceRuleFilterSchema — Phase 7C ─────────────────────────────────────
// organizationId NUNCA aquí — siempre resuelto en el servidor desde la sesión.

export const complianceRuleFilterSchema = z.object({
  clientId: z.string().min(1).optional(),
  platform: z.enum(AD_PLATFORMS).optional(),
  jurisdiction: z.string().trim().max(50).optional(),
});

export type ComplianceRuleFilterFormValues = z.infer<typeof complianceRuleFilterSchema>;

// ─── generateCampaignDraftWithAiSchema — Phase 7D ──────────────────────────────
// organizationId/actorUserId NUNCA aquí — siempre resueltos en el servidor
// desde la sesión (mismo patrón que el resto de este archivo). `platform`
// solo valida forma (AdPlatform válido) — el soporte real de generación
// (meta_ads/google_ads en 7D) es una regla de dominio, ver comentario al
// inicio del archivo y `isSupportedGenerationPlatform`.

export const generateCampaignDraftWithAiSchema = z.object({
  clientId: z.string().min(1, 'El cliente es requerido'),
  /**
   * Phase 7D.1.1 — nombre de campaña OPCIONAL también en modo IA. Si el usuario
   * lo proporciona, es la fuente de verdad y se preserva tal cual; si no, el
   * use case deriva un título CONCISO del contenido generado (nunca el párrafo
   * de concepto completo — ver `deriveCampaignNameFromConcept` en domain).
   */
  name: z.string().trim().min(1, 'El nombre no puede estar vacío').max(200, 'Máximo 200 caracteres').optional(),
  platform: z.enum(AD_PLATFORMS),
  objective: z.enum(CAMPAIGN_OBJECTIVES),
  brief: z.string().trim().min(1, 'El brief es requerido para generar con IA').max(10000),
  budget: budgetAmountSchema,
  currency: z.enum(CAMPAIGN_CURRENCIES).default('COP'),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  /** Idioma del contenido generado (ej. 'es', 'en'). Si se omite, el use case decide un default. */
  language: z.string().trim().min(2).max(10).optional(),
  /** Mercado/jurisdicción para contexto de compliance (ej. 'CO', 'MX', 'US'). */
  market: z.string().trim().max(50).optional(),
  /**
   * Phase 7D.1 — proveedor de IA para esta generación. Enum CERRADO: el
   * browser solo puede elegir uno de los proveedores implementados, nunca un
   * string arbitrario, nunca una URL de API y nunca un modelo (§19). Si se
   * omite, el servidor usa CAMPAIGN_AI_DEFAULT_PROVIDER.
   */
  provider: z.enum(AI_PROVIDER_IDS).optional(),
});

export type GenerateCampaignDraftWithAiFormValues = z.infer<
  typeof generateCampaignDraftWithAiSchema
>;

// ─── regenerateCampaignContentSchema — Phase 7D ────────────────────────────────
// Reemplaza generated_content de una campaña que sigue en 'draft' (regla de
// negocio #13). language/market son overrides opcionales — si se omiten, el
// use case reutiliza los valores de la generación anterior (campaign.metadata.ai).

export const regenerateCampaignContentSchema = z.object({
  campaignId: campaignIdSchema,
  language: z.string().trim().min(2).max(10).optional(),
  market: z.string().trim().max(50).optional(),
  /**
   * Phase 7D.1 — proveedor de IA para esta regeneración. Mismo enum cerrado
   * que `generateCampaignDraftWithAiSchema`. Si se omite, el use case reutiliza
   * el proveedor de la generación anterior (`campaign.metadata.ai.provider`) y,
   * si tampoco existe, el default del servidor.
   */
  provider: z.enum(AI_PROVIDER_IDS).optional(),
});

export type RegenerateCampaignContentFormValues = z.infer<
  typeof regenerateCampaignContentSchema
>;
