'use server';

/**
 * Server Actions para Operaciones de Publicación (Phase 8B.4).
 *
 * SEGURIDAD Y REGLAS (LOCKED ARCHITECTURE):
 * - Deriva `actorUserId` y `organizationId` SIEMPRE de la sesión del servidor (`requireOrganization`).
 * - NUNCA confía en `actorId` u `organizationId` enviados desde el cliente/browser.
 * - Usa `createPublicationComposition(supabase)` con la sesión RLS del usuario autenticado.
 * - NUNCA expone ni invoca `dispatchPublicationJob` (`service_role` worker únicamente).
 * - NUNCA expone `preparePublicationRetryAction` de forma separada — `retryPublicationAction`
 *   es una acción compuesta en la capa de aplicación.
 * - Revalida la ruta `/campaigns/[id]/activation` tras mutaciones exitosas.
 * - Preserva y retorna errores estructurados ({ success: false, error: string }).
 */

import { revalidatePath } from 'next/cache';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createPublicationComposition } from '@/lib/composition/publication.composition';
import type { OrganizationId, CampaignActivationTargetId, CampaignPublicationJobId } from '@bop-agency/domain';
import type { PublicationWebhookEvidenceItem } from '@bop-agency/application';

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function queuePublicationAction(input: {
  targetId: string;
  campaignId: string;
}): Promise<ActionResult> {
  try {
    const { organization, user } = await requireOrganization();
    const supabase = await createServerSupabaseClient();
    const { useCases } = createPublicationComposition(supabase);

    const result = await useCases.queuePublication({
      targetId: input.targetId as CampaignActivationTargetId,
      organizationId: organization.id as OrganizationId,
      actorUserId: user.id,
    });

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    revalidatePath(`/campaigns/${input.campaignId}/activation`);
    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado al encolar la publicación';
    return { success: false, error: message };
  }
}

export async function cancelPublicationJobAction(input: {
  jobId: string;
  campaignId: string;
  note?: string;
}): Promise<ActionResult> {
  try {
    const { organization, user } = await requireOrganization();
    const supabase = await createServerSupabaseClient();
    const { useCases } = createPublicationComposition(supabase);

    const result = await useCases.cancelPublicationJob({
      jobId: input.jobId as CampaignPublicationJobId,
      organizationId: organization.id as OrganizationId,
      actorUserId: user.id,
      reason: input.note?.trim() || 'Cancelación manual desde el panel operativo',
    });

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    revalidatePath(`/campaigns/${input.campaignId}/activation`);
    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado al cancelar la publicación';
    return { success: false, error: message };
  }
}

export async function retryPublicationAction(input: {
  jobId: string;
  campaignId: string;
  note?: string;
}): Promise<ActionResult> {
  try {
    const { organization, user } = await requireOrganization();
    const supabase = await createServerSupabaseClient();
    const { useCases } = createPublicationComposition(supabase);

    const result = await useCases.retryPublication({
      jobId: input.jobId,
      organizationId: organization.id as OrganizationId,
      actorUserId: user.id,
      note: input.note ?? null,
    });

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    revalidatePath(`/campaigns/${input.campaignId}/activation`);
    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado al reintentar la publicación';
    return { success: false, error: message };
  }
}

export async function reconcilePublicationOutcomeAction(input: {
  jobId: string;
  campaignId: string;
  outcome: 'published' | 'not_published';
  externalId?: string;
  externalUrl?: string;
  note: string;
}): Promise<ActionResult> {
  try {
    const { organization, user } = await requireOrganization();
    const supabase = await createServerSupabaseClient();
    const { useCases } = createPublicationComposition(supabase);

    const result = await useCases.reconcilePublicationOutcome({
      jobId: input.jobId,
      organizationId: organization.id as OrganizationId,
      actorUserId: user.id,
      outcome: input.outcome,
      externalId: input.externalId ?? null,
      externalUrl: input.externalUrl ?? null,
      note: input.note,
    });

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    revalidatePath(`/campaigns/${input.campaignId}/activation`);
    return { success: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error inesperado al reconciliar la publicación';
    return { success: false, error: message };
  }
}

export async function getPublicationWebhookEvidenceAction(input: {
  jobId: string;
}): Promise<ActionResult<PublicationWebhookEvidenceItem[]>> {
  try {
    const { organization, user } = await requireOrganization();
    const supabase = await createServerSupabaseClient();
    const { useCases } = createPublicationComposition(supabase);

    const result = await useCases.listPublicationWebhookEvidenceByJob({
      jobId: input.jobId,
      organizationId: organization.id as OrganizationId,
      actorUserId: user.id,
    });

    if (!result.success) {
      return { success: false, error: result.error.message };
    }

    return { success: true, data: result.value };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al obtener la evidencia de webhook';
    return { success: false, error: message };
  }
}
