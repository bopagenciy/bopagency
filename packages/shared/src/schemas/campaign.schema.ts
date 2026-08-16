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
 */

import { z } from 'zod';
import { AD_PLATFORMS } from '../constants/platforms';
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

/**
 * Status alcanzables vía un update genérico de campaña en Phase 7B/7C.
 * 'approved'/'rejected' se reservan a las RPCs dedicadas de Phase 7C
 * (approve_campaign/reject_campaign) — ver campaigns_update RLS policy en
 * la migración 7B y las RPCs en la migración 7C.
 */
export const CAMPAIGN_EDITABLE_STATUSES = ['draft', 'review'] as const;

/** Longitud máxima de nota de rechazo — alineada con el CHECK de BD (5000). */
const REJECTION_NOTE_MAX_LENGTH = 5000;

// ─── campaignIdSchema ─────────────────────────────────────────────────────────

export const campaignIdSchema = z.string().min(1, 'El ID de campaña es requerido').max(255);

// ─── createCampaignDraftSchema ────────────────────────────────────────────────

export const createCampaignDraftSchema = z.object({
  clientId: z.string().min(1, 'El cliente es requerido'),
  name: z.string().trim().min(1, 'El nombre es requerido').max(200, 'Máximo 200 caracteres'),
  platform: z.enum(AD_PLATFORMS),
  objective: z.enum(CAMPAIGN_OBJECTIVES),
  brief: z.string().trim().max(10000).nullable().optional(),
  budget: z.coerce.number().min(0, 'El presupuesto no puede ser negativo'),
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
  budget: z.coerce.number().min(0).optional(),
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
