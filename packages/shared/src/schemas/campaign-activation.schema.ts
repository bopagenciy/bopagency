/**
 * campaignActivationSnapshotSchema — Phase 8A.1.
 *
 * Valida la forma de `CampaignActivationSnapshot` (el contenido aprobado,
 * congelado en el momento de crear una `CampaignActivation` — ver
 * docs/implementation/phase-8/PHASE_8A_ACTIVATION_AUDIT.md §14) ANTES de
 * persistirlo en `campaign_activations.approved_snapshot` (jsonb) y al
 * leerlo de vuelta. Mismo criterio que `campaignGeneratedContentSchema`
 * (Phase 7D): el schema vive en `shared` (no en `domain`, que permanece
 * libre de Zod); `domain` define el TYPE, `shared` valida el VALOR en los
 * bordes de persistencia/transporte.
 *
 * El snapshot es exclusivamente CONTENIDO de campaña — nunca credenciales,
 * tokens, ni configuración de `client_integrations` (ver audit §23).
 */

import { z } from 'zod';
import { AD_PLATFORMS } from '../constants/platforms';
import { CAMPAIGN_OBJECTIVES, CAMPAIGN_CURRENCIES, budgetAmountSchema } from './campaign.schema';
import { campaignGeneratedContentSchema } from './campaign-generated-content.schema';
import {
  ACTIVATION_CHANNELS,
  ACTIVATION_PROVIDERS,
} from '../constants/activation';

export const ACTIVATION_SNAPSHOT_SCHEMA_VERSION = 'activation-snapshot-v1' as const;

// ─── Metadata — mismo límite de forma que Campaign.metadata (jsonb objeto) ─────

const snapshotMetadataSchema = z.record(z.string(), z.unknown());

// ─── Snapshot ─────────────────────────────────────────────────────────────────

export const campaignActivationSnapshotSchema = z.object({
  schemaVersion: z.literal(ACTIVATION_SNAPSHOT_SCHEMA_VERSION),
  campaign: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    objective: z.enum(CAMPAIGN_OBJECTIVES),
    platform: z.enum(AD_PLATFORMS),
    budget: budgetAmountSchema,
    currency: z.enum(CAMPAIGN_CURRENCIES),
    startDate: z.string().datetime().nullable().or(z.string().date().nullable()),
    endDate: z.string().datetime().nullable().or(z.string().date().nullable()),
  }),
  // null hasta que exista contenido generado por IA (Phase 7D) — congelado
  // tal cual estaba aprobado, nunca regenerado después del snapshot.
  generatedContent: campaignGeneratedContentSchema.nullable(),
  metadata: snapshotMetadataSchema,
  approval: z.object({
    campaignApprovalId: z.string().uuid(),
    approvedAt: z.string().datetime(),
    approvedBy: z.string().uuid(),
  }),
});

export type CampaignActivationSnapshotShape = z.infer<typeof campaignActivationSnapshotSchema>;

// ─── Channel / target input schemas — validación de forma en el borde ─────────

export const activationChannelSchema = z.enum(ACTIVATION_CHANNELS);
export const activationProviderSchema = z.enum(ACTIVATION_PROVIDERS);

/** `placement` es descriptivo, acotado — nunca una URL/ID arbitrario del browser (audit §7). */
export const activationPlacementSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_]+$/, 'placement debe ser snake_case ASCII (ej. "instagram_feed")')
  .nullable()
  .optional();

export const activationCancellationReasonSchema = z
  .string()
  .trim()
  .min(1, 'La razón de cancelación no puede estar vacía')
  .max(2000);

export const activationExternalReferenceSchema = z.string().trim().min(1).max(300).nullable().optional();


// ─── Use-case input schemas — Phase 8A.2 ───────────────────────────────────────
//
// Mismo criterio que approveCampaignSchema/rejectCampaignSchema
// (campaign.schema.ts, Phase 7C): SOLO validan los campos que realmente
// vienen del cliente/form. organizationId y actorUserId NUNCA forman parte
// de estos schemas — se resuelven siempre en el servidor desde la sesión,
// nunca se aceptan del caller (ver comentario en cada *Input de los use
// cases de application).

const activationIdSchema = z.string().uuid();
const campaignIdForActivationSchema = z.string().uuid();
const activationNotesSchema = z.string().trim().max(2000).nullable().optional();
const activationMetadataSchema = z.record(z.string(), z.unknown()).optional();
const readinessChecklistSchema = z.record(z.string(), z.unknown()).nullable().optional();

export const createCampaignActivationSchema = z.object({
  campaignId: campaignIdForActivationSchema,
  notes: activationNotesSchema,
  metadata: activationMetadataSchema,
});

export type CreateCampaignActivationFormValues = z.infer<typeof createCampaignActivationSchema>;

export const addCampaignActivationTargetSchema = z.object({
  activationId: activationIdSchema,
  channel: activationChannelSchema,
  provider: activationProviderSchema,
  placement: activationPlacementSchema,
  clientIntegrationId: z.string().uuid().nullable().optional(),
  metadata: activationMetadataSchema,
});

export type AddCampaignActivationTargetFormValues = z.infer<typeof addCampaignActivationTargetSchema>;

export const prepareActivationTargetSchema = z.object({
  targetId: activationIdSchema,
  checklist: readinessChecklistSchema,
});

export type PrepareActivationTargetFormValues = z.infer<typeof prepareActivationTargetSchema>;

export const markActivationTargetReadySchema = z.object({
  targetId: activationIdSchema,
});

export type MarkActivationTargetReadyFormValues = z.infer<typeof markActivationTargetReadySchema>;

export const markActivationTargetPublishedSchema = z.object({
  targetId: activationIdSchema,
  externalReference: activationExternalReferenceSchema,
  note: z.string().trim().max(2000).nullable().optional(),
});

export type MarkActivationTargetPublishedFormValues = z.infer<typeof markActivationTargetPublishedSchema>;

export const cancelActivationTargetSchema = z.object({
  targetId: activationIdSchema,
  reason: activationCancellationReasonSchema,
});

export type CancelActivationTargetFormValues = z.infer<typeof cancelActivationTargetSchema>;

export const cancelCampaignActivationSchema = z.object({
  activationId: activationIdSchema,
  reason: activationCancellationReasonSchema,
});

export type CancelCampaignActivationFormValues = z.infer<typeof cancelCampaignActivationSchema>;
