/**
 * listPublicationWebhookEvidenceByJob — Phase 8B.4.
 *
 * Consulta pura de lectura para obtener la evidencia de webhooks sanitizada
 * asociada a un job de publicación específico.
 *
 * REGLAS DE SEGURIDAD:
 * - Valida la membresía del usuario en la organización (`findMember`).
 * - Acceso tenant-safe / RLS-safe para cualquier miembro (viewer+).
 * - Expora ÚNICAMENTE campos sanitizados provider-neutral:
 *   (id, provider, externalEventId, payloadHash, status, errorCode, receivedAt).
 * - NUNCA expone el payload crudo, firmas HMAC, secrets, ni tokens.
 * - Orden determinístico por fecha de recepción descendente (`received_at DESC`).
 */

import { ok, err, isOk } from '@bop-agency/shared';
import type { Result, ActivationProvider, PublicationWebhookEventStatus } from '@bop-agency/shared';
import type {
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
} from '@bop-agency/domain';
import { campaignPublicationJobId, notOrganizationMember } from '@bop-agency/domain';

export type ListPublicationWebhookEvidenceByJobInput = {
  readonly jobId: string;
  readonly organizationId: OrganizationId;
  readonly actorUserId: string;
};

export type PublicationWebhookEvidenceItem = {
  readonly id: string;
  readonly provider: ActivationProvider;
  readonly externalEventId: string;
  readonly payloadHash: string;
  readonly status: PublicationWebhookEventStatus;
  readonly errorCode: string | null;
  readonly receivedAt: Date;
};

export type ListPublicationWebhookEvidenceByJobDeps = {
  readonly publicationRepository: CampaignPublicationRepository;
  readonly organizationRepository: OrganizationRepository;
};

export async function listPublicationWebhookEvidenceByJob(
  input: ListPublicationWebhookEvidenceByJobInput,
  deps: ListPublicationWebhookEvidenceByJobDeps,
): Promise<Result<PublicationWebhookEvidenceItem[]>> {
  const memberResult = await deps.organizationRepository.findMember(
    input.organizationId,
    input.actorUserId,
  );
  if (!isOk(memberResult)) {
    return err(notOrganizationMember());
  }

  const pJobId = campaignPublicationJobId(input.jobId);
  const result = await deps.publicationRepository.listWebhookEventsByJob(
    pJobId,
    input.organizationId,
  );

  if (!isOk(result)) {
    return result;
  }

  const sanitized: PublicationWebhookEvidenceItem[] = result.value.map((e) => ({
    id: e.id,
    provider: e.provider,
    externalEventId: e.externalEventId,
    payloadHash: e.payloadHash,
    status: e.status,
    errorCode: e.errorCode,
    receivedAt: e.receivedAt,
  }));

  return ok(sanitized);
}
