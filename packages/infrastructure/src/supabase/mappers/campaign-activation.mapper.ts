/**
 * CampaignActivationMapper — Supabase DB rows → Domain entities (Phase 8A.1).
 *
 * Cubre las 3 tablas del aggregate: campaign_activations,
 * campaign_activation_targets, campaign_activation_events. Alineado con
 * 20260824180000_phase8a1_campaign_activation_domain.sql. `approved_snapshot`
 * se transporta tal cual (ya es un objeto validado por Zod en el momento de
 * creación — este mapper no re-valida el shape, solo garantiza que sea un
 * objeto) — nunca se reconstruye ni se muta aquí.
 */

import type {
  CampaignActivation,
  CampaignActivationId,
  CampaignActivationSnapshot,
  CampaignActivationTarget,
  CampaignActivationTargetId,
  CampaignActivationEvent,
  CampaignActivationEventId,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { ClientId, ClientIntegrationId } from '@bop-agency/domain';
import type { CampaignId } from '@bop-agency/domain';
import type { CampaignApprovalId } from '@bop-agency/domain';
import type {
  ActivationStatus,
  ActivationTargetStatus,
  ActivationChannel,
  ActivationProvider,
  ActivationEventType,
} from '@bop-agency/shared';
import {
  ACTIVATION_STATUSES,
  ACTIVATION_TARGET_STATUSES,
  ACTIVATION_CHANNELS,
  ACTIVATION_PROVIDERS,
  ACTIVATION_EVENT_TYPES,
} from '@bop-agency/shared';

// ─── Row types (alineados con la migración 20260824180000) ────────────────────

export type CampaignActivationRow = {
  id: string;
  organization_id: string;
  client_id: string;
  campaign_id: string;
  campaign_approval_id: string;
  status: string;
  approved_snapshot: unknown; // jsonb
  scheduled_at: string | null;
  prepared_at: string | null;
  ready_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  notes: string | null;
  metadata: unknown; // jsonb
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignActivationTargetRow = {
  id: string;
  activation_id: string;
  organization_id: string;
  client_id: string;
  channel: string;
  provider: string;
  placement: string | null;
  client_integration_id: string | null;
  status: string;
  readiness_checklist: unknown; // jsonb
  scheduled_at: string | null;
  published_at: string | null;
  published_by: string | null;
  external_reference: string | null;
  failed_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  metadata: unknown; // jsonb
  created_at: string;
  updated_at: string;
};

export type CampaignActivationEventRow = {
  id: string;
  organization_id: string;
  activation_id: string;
  target_id: string | null;
  event_type: string;
  actor_user_id: string | null;
  is_system: boolean;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  metadata: unknown; // jsonb
  created_at: string;
};

// ─── Internal parsers ─────────────────────────────────────────────────────────

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
    `CampaignActivationMapper: ${fieldLabel} "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${validValues.join(', ')}`,
  );
}

function parseJsonObject(raw: unknown, fieldLabel: string, rowId: string): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`CampaignActivationMapper: ${fieldLabel} no es un objeto (row.id=${rowId})`);
  }
  return raw as Record<string, unknown>;
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(`CampaignActivationMapper: "${field}" no es una fecha válida (row.id=${rowId}): ${raw}`);
  }
  return d;
}

function parseNullableDate(raw: string | null, field: string, rowId: string): Date | null {
  if (raw === null) return null;
  return parseDate(raw, field, rowId);
}

// ─── Public mappers ───────────────────────────────────────────────────────────

export function rowToCampaignActivation(row: CampaignActivationRow): CampaignActivation {
  return {
    id: row.id as CampaignActivationId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId: row.client_id as unknown as ClientId,
    campaignId: row.campaign_id as CampaignId,
    campaignApprovalId: row.campaign_approval_id as CampaignApprovalId,
    status: parseEnum<ActivationStatus>(row.status, ACTIVATION_STATUSES, 'status', row.id),
    approvedSnapshot: parseJsonObject(
      row.approved_snapshot,
      'approved_snapshot',
      row.id,
    ) as unknown as CampaignActivationSnapshot,
    scheduledAt: parseNullableDate(row.scheduled_at, 'scheduled_at', row.id),
    preparedAt: parseNullableDate(row.prepared_at, 'prepared_at', row.id),
    readyAt: parseNullableDate(row.ready_at, 'ready_at', row.id),
    startedAt: parseNullableDate(row.started_at, 'started_at', row.id),
    completedAt: parseNullableDate(row.completed_at, 'completed_at', row.id),
    cancelledAt: parseNullableDate(row.cancelled_at, 'cancelled_at', row.id),
    cancelledBy: row.cancelled_by,
    cancellationReason: row.cancellation_reason,
    notes: row.notes,
    metadata: parseJsonObject(row.metadata, 'metadata', row.id),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
  };
}

export function rowToCampaignActivationTarget(row: CampaignActivationTargetRow): CampaignActivationTarget {
  return {
    id: row.id as CampaignActivationTargetId,
    activationId: row.activation_id as CampaignActivationId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId: row.client_id as unknown as ClientId,
    channel: parseEnum<ActivationChannel>(row.channel, ACTIVATION_CHANNELS, 'channel', row.id),
    provider: parseEnum<ActivationProvider>(row.provider, ACTIVATION_PROVIDERS, 'provider', row.id),
    placement: row.placement,
    clientIntegrationId: row.client_integration_id as unknown as ClientIntegrationId | null,
    status: parseEnum<ActivationTargetStatus>(row.status, ACTIVATION_TARGET_STATUSES, 'status', row.id),
    readinessChecklist: parseJsonObject(row.readiness_checklist, 'readiness_checklist', row.id),
    scheduledAt: parseNullableDate(row.scheduled_at, 'scheduled_at', row.id),
    publishedAt: parseNullableDate(row.published_at, 'published_at', row.id),
    publishedBy: row.published_by,
    externalReference: row.external_reference,
    failedAt: parseNullableDate(row.failed_at, 'failed_at', row.id),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    cancelledAt: parseNullableDate(row.cancelled_at, 'cancelled_at', row.id),
    cancelledBy: row.cancelled_by,
    metadata: parseJsonObject(row.metadata, 'metadata', row.id),
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
  };
}

export function rowToCampaignActivationEvent(row: CampaignActivationEventRow): CampaignActivationEvent {
  return {
    id: row.id as CampaignActivationEventId,
    organizationId: row.organization_id as unknown as OrganizationId,
    activationId: row.activation_id as CampaignActivationId,
    targetId: row.target_id as CampaignActivationTargetId | null,
    eventType: parseEnum<ActivationEventType>(row.event_type, ACTIVATION_EVENT_TYPES, 'event_type', row.id),
    actorUserId: row.actor_user_id,
    isSystem: row.is_system,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    metadata: parseJsonObject(row.metadata, 'metadata', row.id),
    createdAt: parseDate(row.created_at, 'created_at', row.id),
  };
}
