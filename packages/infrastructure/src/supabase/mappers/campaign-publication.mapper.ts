/**
 * CampaignPublicationMapper - Supabase DB rows -> Domain entities (Phase 8B.1).
 *
 * Cubre las 4 tablas: campaign_publication_jobs, campaign_publication_attempts,
 * campaign_publication_events, campaign_publication_webhook_events. Alineado
 * con 20260825120000_phase8b1_publication_domain_persistence.sql. Mismo
 * criterio que CampaignActivationMapper (8A.1) - parsers estrictos, nunca
 * mapea/almacena ningun campo de credencial/token.
 */

import type {
  CampaignPublicationJob,
  CampaignPublicationJobId,
  CampaignPublicationAttempt,
  CampaignPublicationAttemptId,
  CampaignPublicationEvent,
  CampaignPublicationEventId,
  CampaignPublicationWebhookEvent,
  CampaignPublicationWebhookEventId,
  PublicationIdempotencyKey,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { ClientId } from '@bop-agency/domain';
import type { CampaignActivationId } from '@bop-agency/domain';
import type { CampaignActivationTargetId } from '@bop-agency/domain';
import type {
  ActivationChannel,
  ActivationProvider,
  PublicationJobStatus,
  PublicationAttemptOutcome,
  PublicationEventType,
  PublicationWebhookEventStatus,
  PublicationFailureCategory,
} from '@bop-agency/shared';
import {
  ACTIVATION_CHANNELS,
  ACTIVATION_PROVIDERS,
  PUBLICATION_JOB_STATUSES,
  PUBLICATION_ATTEMPT_OUTCOMES,
  PUBLICATION_EVENT_TYPES,
  PUBLICATION_WEBHOOK_EVENT_STATUSES,
  PUBLICATION_FAILURE_CATEGORIES,
} from '@bop-agency/shared';

// --- Row types (alineados con la migracion 20260825120000) ---

export type CampaignPublicationJobRow = {
  id: string;
  organization_id: string;
  client_id: string;
  activation_id: string;
  target_id: string;
  channel: string;
  provider: string;
  client_integration_id: string | null;
  status: string;
  idempotency_key: string;
  retry_of_job_id: string | null;
  retry_count: number;
  claimed_at: string | null;
  claimed_by_worker: string | null;
  started_at: string | null;
  completed_at: string | null;
  reconciliation_deadline_at: string | null;
  cancellation_requested_at: string | null;
  cancellation_requested_by: string | null;
  failure_category: string | null;
  reconciled_by: string | null;
  reconciled_at: string | null;
  reconciliation_note: string | null;
  metadata: unknown;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type CampaignPublicationAttemptRow = {
  id: string;
  job_id: string;
  organization_id: string;
  attempt_number: number;
  idempotency_key: string;
  external_id: string | null;
  external_url: string | null;
  provider_status: string | null;
  provider_error_code: string | null;
  http_status: number | null;
  outcome: string | null;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type CampaignPublicationEventRow = {
  id: string;
  organization_id: string;
  job_id: string;
  attempt_id: string | null;
  event_type: string;
  actor_user_id: string | null;
  is_system: boolean;
  note: string | null;
  metadata: unknown;
  created_at: string;
};

export type CampaignPublicationWebhookEventRow = {
  id: string;
  organization_id: string | null;
  provider: string;
  external_event_id: string;
  payload_hash: string;
  status: string;
  job_id: string | null;
  attempt_id: string | null;
  error_code: string | null;
  received_at: string;
  processed_at: string | null;
  created_at: string;
};

// --- Internal parsers (mismo criterio que campaign-activation.mapper.ts) ---

function parseEnum<T extends string>(
  raw: string,
  validValues: readonly T[],
  fieldLabel: string,
  rowId: string,
): T {
  if ((validValues as readonly string[]).includes(raw)) {
    return raw as T;
  }
  throw new Error(
    `CampaignPublicationMapper: ${fieldLabel} "${raw}" no es valido (row.id=${rowId}). Valores validos: ${validValues.join(', ')}`,
  );
}

function parseNullableEnum<T extends string>(
  raw: string | null,
  validValues: readonly T[],
  fieldLabel: string,
  rowId: string,
): T | null {
  if (raw === null) return null;
  return parseEnum(raw, validValues, fieldLabel, rowId);
}

function parseJsonObject(raw: unknown, fieldLabel: string, rowId: string): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`CampaignPublicationMapper: ${fieldLabel} no es un objeto (row.id=${rowId})`);
  }
  return raw as Record<string, unknown>;
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(`CampaignPublicationMapper: "${field}" no es una fecha valida (row.id=${rowId}): ${raw}`);
  }
  return d;
}

function parseNullableDate(raw: string | null, field: string, rowId: string): Date | null {
  if (raw === null) return null;
  return parseDate(raw, field, rowId);
}

// --- Public mappers ---

export function rowToCampaignPublicationJob(row: CampaignPublicationJobRow): CampaignPublicationJob {
  return {
    id: row.id as CampaignPublicationJobId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId: row.client_id as unknown as ClientId,
    activationId: row.activation_id as CampaignActivationId,
    targetId: row.target_id as CampaignActivationTargetId,
    channel: parseEnum<ActivationChannel>(row.channel, ACTIVATION_CHANNELS, 'channel', row.id),
    provider: parseEnum<ActivationProvider>(row.provider, ACTIVATION_PROVIDERS, 'provider', row.id),
    clientIntegrationId: row.client_integration_id,
    status: parseEnum<PublicationJobStatus>(row.status, PUBLICATION_JOB_STATUSES, 'status', row.id),
    idempotencyKey: row.idempotency_key as PublicationIdempotencyKey,
    retryOfJobId: row.retry_of_job_id as CampaignPublicationJobId | null,
    retryCount: row.retry_count,
    claimedAt: parseNullableDate(row.claimed_at, 'claimed_at', row.id),
    claimedByWorker: row.claimed_by_worker,
    startedAt: parseNullableDate(row.started_at, 'started_at', row.id),
    completedAt: parseNullableDate(row.completed_at, 'completed_at', row.id),
    reconciliationDeadlineAt: parseNullableDate(row.reconciliation_deadline_at, 'reconciliation_deadline_at', row.id),
    cancellationRequestedAt: parseNullableDate(row.cancellation_requested_at, 'cancellation_requested_at', row.id),
    cancellationRequestedBy: row.cancellation_requested_by,
    failureCategory: parseNullableEnum<PublicationFailureCategory>(
      row.failure_category,
      PUBLICATION_FAILURE_CATEGORIES,
      'failure_category',
      row.id,
    ),
    reconciledBy: row.reconciled_by,
    reconciledAt: parseNullableDate(row.reconciled_at, 'reconciled_at', row.id),
    reconciliationNote: row.reconciliation_note,
    metadata: parseJsonObject(row.metadata, 'metadata', row.id),
    createdBy: row.created_by,
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
  };
}

export function rowToCampaignPublicationAttempt(
  row: CampaignPublicationAttemptRow,
): CampaignPublicationAttempt {
  return {
    id: row.id as CampaignPublicationAttemptId,
    jobId: row.job_id as CampaignPublicationJobId,
    organizationId: row.organization_id as unknown as OrganizationId,
    attemptNumber: row.attempt_number,
    idempotencyKey: row.idempotency_key,
    externalId: row.external_id,
    externalUrl: row.external_url,
    providerStatus: row.provider_status,
    providerErrorCode: row.provider_error_code,
    httpStatus: row.http_status,
    outcome: parseNullableEnum<PublicationAttemptOutcome>(
      row.outcome,
      PUBLICATION_ATTEMPT_OUTCOMES,
      'outcome',
      row.id,
    ),
    durationMs: row.duration_ms,
    startedAt: parseDate(row.started_at, 'started_at', row.id),
    completedAt: parseNullableDate(row.completed_at, 'completed_at', row.id),
    createdAt: parseDate(row.created_at, 'created_at', row.id),
  };
}

export function rowToCampaignPublicationEvent(row: CampaignPublicationEventRow): CampaignPublicationEvent {
  return {
    id: row.id as CampaignPublicationEventId,
    organizationId: row.organization_id as unknown as OrganizationId,
    jobId: row.job_id as CampaignPublicationJobId,
    attemptId: row.attempt_id as CampaignPublicationAttemptId | null,
    eventType: parseEnum<PublicationEventType>(row.event_type, PUBLICATION_EVENT_TYPES, 'event_type', row.id),
    actorUserId: row.actor_user_id,
    isSystem: row.is_system,
    note: row.note,
    metadata: parseJsonObject(row.metadata, 'metadata', row.id),
    createdAt: parseDate(row.created_at, 'created_at', row.id),
  };
}

export function rowToCampaignPublicationWebhookEvent(
  row: CampaignPublicationWebhookEventRow,
): CampaignPublicationWebhookEvent {
  return {
    id: row.id as CampaignPublicationWebhookEventId,
    organizationId: row.organization_id as unknown as OrganizationId | null,
    provider: parseEnum<ActivationProvider>(row.provider, ACTIVATION_PROVIDERS, 'provider', row.id),
    externalEventId: row.external_event_id,
    payloadHash: row.payload_hash,
    status: parseEnum<PublicationWebhookEventStatus>(
      row.status,
      PUBLICATION_WEBHOOK_EVENT_STATUSES,
      'status',
      row.id,
    ),
    jobId: row.job_id as CampaignPublicationJobId | null,
    attemptId: row.attempt_id as CampaignPublicationAttemptId | null,
    errorCode: row.error_code,
    receivedAt: parseDate(row.received_at, 'received_at', row.id),
    processedAt: parseNullableDate(row.processed_at, 'processed_at', row.id),
    createdAt: parseDate(row.created_at, 'created_at', row.id),
  };
}
