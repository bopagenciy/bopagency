/**
 * createCampaignDraft — Phase 7B.
 *
 * Implementación REAL (reemplaza el stub `notImplemented` de Phase 1/7A).
 * Alcance estrictamente de persistencia:
 * - Valida input con Zod (createCampaignDraftSchema).
 * - Verifica que el cliente exista, esté activo y pertenezca a la organización
 *   del actor (defensa en profundidad además del trigger de BD
 *   check_client_organization_match).
 * - Crea la campaña en estado 'draft' vía CampaignRepository.
 * - NO llama a ningún AI provider (Phase 7D).
 * - NO llama a n8n ni a ningún webhook.
 * - NO publica nada en Meta/Google/YouTube.
 * - organizationId y createdBy se reciben como parte del input pero deben
 *   originarse en la sesión del servidor (Server Action), nunca del cliente
 *   — mismo contrato que createClient/automation actions.
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Campaign, CampaignRepository, ClientRepository } from '@bop-agency/domain';
import type { OrganizationId, ClientId } from '@bop-agency/domain';
import { clientNotFound } from '@bop-agency/domain';
import { createCampaignDraftSchema } from '@bop-agency/shared';
import type { LoggerPort } from '../../ports/logger.port';

export type CreateCampaignDraftInput = {
  readonly organizationId: OrganizationId;
  readonly clientId: string;
  readonly name: string;
  readonly platform: string;
  readonly objective: string;
  readonly brief?: string | null;
  readonly budget: number;
  readonly currency?: string;
  readonly startDate?: Date | null;
  readonly endDate?: Date | null;
  readonly metadata?: Record<string, unknown>;
  /** Actor autenticado — obtenido de la sesión del servidor, nunca del cliente. */
  readonly createdBy: string;
};

export type CreateCampaignDraftDeps = {
  campaignRepository: CampaignRepository;
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function createCampaignDraft(
  input: CreateCampaignDraftInput,
  deps: CreateCampaignDraftDeps,
): Promise<Result<Campaign>> {
  deps.logger.debug('createCampaignDraft', {
    organizationId: input.organizationId,
    clientId: input.clientId,
  });

  const parsed = createCampaignDraftSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: 'VALIDATION_ERROR' as const,
      message: parsed.error.errors.map((e) => e.message).join('; '),
    });
  }
  const data = parsed.data;

  // Verifica que el cliente exista, esté activo y sea de esta organización.
  const clientResult = await deps.clientRepository.findById(
    data.clientId as ClientId,
    input.organizationId,
  );
  if (!isOk(clientResult)) {
    return err(clientNotFound(data.clientId));
  }

  const createResult = await deps.campaignRepository.create({
    organizationId: input.organizationId,
    clientId: data.clientId as ClientId,
    name: data.name,
    platform: data.platform,
    objective: data.objective,
    brief: data.brief ?? null,
    budget: data.budget,
    currency: data.currency,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    metadata: data.metadata,
    createdBy: input.createdBy,
  });

  if (!isOk(createResult)) {
    deps.logger.error('createCampaignDraft: repository error', { error: createResult });
    return createResult;
  }

  deps.logger.info('createCampaignDraft: created', {
    campaignId: createResult.value.id,
    organizationId: input.organizationId,
    clientId: data.clientId,
  });
  return ok(createResult.value);
}
