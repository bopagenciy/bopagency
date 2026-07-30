import { err } from '@bop-agency/shared';
import { notImplemented } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { Campaign } from '@bop-agency/domain';

export type CreateCampaignDraftInput = {
  name: string;
  clientId: string;
};

/**
 * Stub — Fase 2+: implementar con validación de presupuesto y configuración Meta API.
 */
export async function createCampaignDraft(
  _input: CreateCampaignDraftInput,
): Promise<Result<Campaign>> {
  return err(notImplemented('createCampaignDraft'));
}
