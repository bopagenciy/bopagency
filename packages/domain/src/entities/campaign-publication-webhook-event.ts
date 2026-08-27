/**
 * CampaignPublicationWebhookEvent - entidad de dominio para la tabla
 * `public.campaign_publication_webhook_events` (Phase 8B.1).
 *
 * FUNDAMENTO de recepcion de webhooks para 8B.3 (NO implementa el
 * endpoint HTTP en esta subfase - ver kickoff decision #4). Generaliza
 * `automation_webhook_events` (Phase 6B) - mismo patron de dedupe por
 * `(provider, externalEventId)`, `payloadHash` (SHA-256, nunca el raw
 * body), sin ningun campo de credencial/token de proveedor.
 */

import type { OrganizationId } from './organization';
import type { CampaignPublicationJobId } from './campaign-publication-job';
import type { CampaignPublicationAttemptId } from './campaign-publication-attempt';
import type { ActivationProvider } from '@bop-agency/shared';
import type { PublicationWebhookEventStatus } from '@bop-agency/shared';

// --- Branded ID ---

export type CampaignPublicationWebhookEventId = string & {
  readonly _brand: 'CampaignPublicationWebhookEventId';
};

export function campaignPublicationWebhookEventId(id: string): CampaignPublicationWebhookEventId {
  if (!id || id.trim().length === 0) {
    throw new Error('CampaignPublicationWebhookEventId cannot be empty');
  }
  return id as CampaignPublicationWebhookEventId;
}

const PAYLOAD_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function isValidPayloadHash(value: string): boolean {
  return PAYLOAD_HASH_PATTERN.test(value);
}

// --- CampaignPublicationWebhookEvent entity ---

export type CampaignPublicationWebhookEvent = {
  readonly id: CampaignPublicationWebhookEventId;
  /** NULL hasta que se resuelva la correlacion con un job/attempt real (audit S15.1). */
  readonly organizationId: OrganizationId | null;
  readonly provider: ActivationProvider;
  /** NOT NULL para publishing (a diferencia de automation_webhook_events) - audit S5.3. */
  readonly externalEventId: string;
  /** SHA-256 hex del raw body - NUNCA el body en si. */
  readonly payloadHash: string;
  readonly status: PublicationWebhookEventStatus;
  readonly jobId: CampaignPublicationJobId | null;
  readonly attemptId: CampaignPublicationAttemptId | null;
  readonly errorCode: string | null;
  readonly receivedAt: Date;
  readonly processedAt: Date | null;
  readonly createdAt: Date;
};

export type RecordWebhookReceiptInput = {
  readonly provider: ActivationProvider;
  readonly externalEventId: string;
  readonly payloadHash: string;
};

export type RecordWebhookReceiptResult = {
  readonly id: CampaignPublicationWebhookEventId;
  /** `false` cuando el (provider, externalEventId) ya existia - replay/dedupe detectado (audit S5.1/S13.1). */
  readonly isNew: boolean;
  readonly status: PublicationWebhookEventStatus;
};
