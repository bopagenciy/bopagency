/**
 * editCampaignDraft — Phase 7E (cierre) / auditoría de completitud.
 *
 * Cubre el gap bloqueante detectado en la auditoría final de Phase 7E +
 * 7D.1: existía `UpdateCampaignInput` (dominio), `CampaignRepository.update`
 * (infraestructura) y `updateCampaignDraftSchema` (shared), pero ningún use
 * case / Server Action / UI los conectaba — una campaña en 'draft' no podía
 * editarse desde el producto.
 *
 * Alcance (regla de negocio fijada en esta auditoría):
 * 1. Solo campañas en status 'draft' son editables por este flujo (no
 *    'review' — a diferencia de `UpdateCampaignInput.status`, que en teoría
 *    admite 'draft'|'review' para el caso de `submitCampaignForReview`, este
 *    use case es exclusivamente edición de contenido de un borrador).
 * 2. Nunca cambia `status`: la campaña permanece en 'draft' después de
 *    editar — enviar a revisión sigue siendo una acción separada
 *    (`submitCampaignForReview`).
 * 3. Nunca toca `generatedContent` ni `metadata.ai`: regenerar contenido de
 *    IA sigue siendo responsabilidad exclusiva de `regenerateCampaignContent`.
 * 4. Nunca toca `campaign_approvals` (no hay historial de aprobación que
 *    tocar en 'draft', pero se deja explícito: este use case no escribe en
 *    ese repositorio).
 * 5. Mismo control de rol que `submitCampaignForReview`: mínimo operator
 *    (owner/admin/strategist/operator sí; viewer no) — doble capa junto con
 *    `getOrgContext('operator')` en la Server Action.
 * 6. clientId NO es editable aquí (cambiar el cliente de una campaña ya
 *    creada no está en el alcance de dominio definido — evita reabrir la
 *    invariante "cliente pertenece a la organización activa" a mitad de
 *    edición). Si en el futuro se necesita, es una decisión de producto
 *    explícita, no un efecto colateral de este fix.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Campaign, CampaignId, CampaignRepository, OrganizationRepository } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import {
  campaignEditNotAllowed,
  hasMinimumRole,
  insufficientRole,
  notOrganizationMember,
} from '@bop-agency/domain';
import { campaignIdSchema, updateCampaignDraftSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

const editableFieldsSchema = updateCampaignDraftSchema.omit({ status: true });

export type EditCampaignDraftInput = {
  readonly campaignId: string;
  readonly name?: string;
  readonly platform?: string;
  readonly objective?: string;
  readonly brief?: string | null;
  readonly budget?: number;
  readonly currency?: string;
  readonly startDate?: Date | null;
  readonly endDate?: Date | null;
  /** SIEMPRE resuelto en el servidor desde la sesión — nunca del cliente. */
  readonly organizationId: OrganizationId;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly actorUserId: string;
};

export type EditCampaignDraftDeps = {
  campaignRepository: CampaignRepository;
  organizationRepository: OrganizationRepository;
  logger: LoggerPort;
};

export async function editCampaignDraft(
  input: EditCampaignDraftInput,
  deps: EditCampaignDraftDeps,
): Promise<Result<Campaign>> {
  deps.logger.debug('editCampaignDraft', {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });

  const campaignIdParsed = campaignIdSchema.safeParse(input.campaignId);
  if (!campaignIdParsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: campaignIdParsed.error.errors.map((e) => e.message).join('; '),
    });
  }

  const parsed = editableFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const data = parsed.data;

  // 1. Verificar membresía y rol mínimo (operator+; viewer denegado).
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

  // 2. Cargar la campaña (aísla por organización — cubre inexistente y otra org).
  const campaignId = input.campaignId as CampaignId;
  const campaignResult = await deps.campaignRepository.findById(campaignId, input.organizationId);
  if (!isOk(campaignResult)) {
    return campaignResult;
  }
  const campaign = campaignResult.value;

  // 3. Solo 'draft' es editable por este flujo.
  if (campaign.status !== 'draft') {
    return err(campaignEditNotAllowed(campaign.status));
  }

  // 4. Persistir solo los campos provistos. NUNCA status/generatedContent/metadata.
  const updateResult = await deps.campaignRepository.update(campaignId, input.organizationId, {
    ...(data.name !== undefined && { name: data.name }),
    ...(data.platform !== undefined && { platform: data.platform }),
    ...(data.objective !== undefined && { objective: data.objective }),
    ...(data.brief !== undefined && { brief: data.brief }),
    ...(data.budget !== undefined && { budget: data.budget }),
    ...(data.currency !== undefined && { currency: data.currency }),
    ...(data.startDate !== undefined && { startDate: data.startDate }),
    ...(data.endDate !== undefined && { endDate: data.endDate }),
    updatedBy: input.actorUserId,
  });
  if (!isOk(updateResult)) {
    deps.logger.error('editCampaignDraft: repository error', { error: updateResult });
    return updateResult;
  }

  deps.logger.info('editCampaignDraft: ok', {
    campaignId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
  });
  return ok(updateResult.value);
}
