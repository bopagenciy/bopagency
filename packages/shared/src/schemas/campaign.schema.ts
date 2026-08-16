/**
 * Campaign schemas — Zod validation for Campaign Studio Server Actions / use cases.
 *
 * Schemas son intencionalmente mínimos: solo los campos que el caller
 * (Server Action o use case caller) provee. organizationId y createdBy/
 * updatedBy NUNCA se aceptan del cliente — se obtienen de la sesión del
 * servidor (mismo patrón que automation.schema.ts).
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
 * 'approved'/'rejected' se reservan a la RPC dedicada de Phase 7C — ver
 * campaigns_update RLS policy en la migración.
 */
export const CAMPAIGN_EDITABLE_STATUSES = ['draft', 'review'] as const;

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
