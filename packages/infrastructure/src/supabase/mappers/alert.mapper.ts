/**
 * AlertMapper — Supabase DB rows → Domain Alert entities.
 *
 * Alineado con la tabla `alerts` en database.types.ts.
 *
 * IMPORTANTE:
 * - El campo `description` en DB corresponde al campo `description` en dominio.
 *   La entidad Alert NO tiene campo `message`.
 * - `status` y `severity` se validan contra los enums reales de DB.
 * - `platform` puede ser null; si tiene valor, debe ser MetricPlatform válido.
 * - Los campos de auditoría `acknowledged_by/at` y `resolved_by/at` son inmutables
 *   en DB (protegidos por trigger). Solo se pueden escribir mediante RPC.
 */

import type { Alert, AlertId } from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type { AlertStatus, AlertSeverity, MetricPlatform } from '@bop-agency/shared';
import { ALERT_STATUSES, ALERT_SEVERITIES, METRIC_PLATFORMS } from '@bop-agency/shared';

// ─── Row type (alineado con alerts.Row en database.types.ts) ──────────────────

export type AlertRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  alert_key: string;
  alert_type: string;
  platform: string | null;
  account_id: string | null;
  severity: string;
  status: string;
  title: string | null;
  description: string | null;
  metadata: unknown; // Json en Supabase
  detected_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  snoozed_until: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Internal validators ──────────────────────────────────────────────────────

function parseAlertStatus(raw: string, rowId: string): AlertStatus {
  if ((ALERT_STATUSES as readonly string[]).includes(raw)) {
    return raw as AlertStatus;
  }
  throw new Error(
    `AlertMapper: status "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${ALERT_STATUSES.join(', ')}`,
  );
}

function parseAlertSeverity(raw: string, rowId: string): AlertSeverity {
  if ((ALERT_SEVERITIES as readonly string[]).includes(raw)) {
    return raw as AlertSeverity;
  }
  throw new Error(
    `AlertMapper: severity "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${ALERT_SEVERITIES.join(', ')}`,
  );
}

function parseAlertPlatform(raw: string | null, rowId: string): MetricPlatform | null {
  if (raw === null || raw === undefined) return null;
  if ((METRIC_PLATFORMS as readonly string[]).includes(raw)) {
    return raw as MetricPlatform;
  }
  throw new Error(
    `AlertMapper: platform "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${METRIC_PLATFORMS.join(', ')}`,
  );
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(`AlertMapper: "${field}" no es una fecha válida (row.id=${rowId}): ${raw}`);
  }
  return d;
}

function parseOptionalDate(raw: string | null, field: string, rowId: string): Date | null {
  if (raw === null || raw === undefined) return null;
  return parseDate(raw, field, rowId);
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

// ─── Public mapper ────────────────────────────────────────────────────────────

export function rowToAlert(row: AlertRow): Alert {
  return {
    id: row.id as AlertId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId: row.client_id ? (row.client_id as ClientId) : null,
    alertKey: row.alert_key,
    alertType: row.alert_type,
    platform: parseAlertPlatform(row.platform, row.id),
    accountId: row.account_id,
    severity: parseAlertSeverity(row.severity, row.id),
    status: parseAlertStatus(row.status, row.id),
    title: row.title,
    description: row.description,
    metadata: parseMetadata(row.metadata),
    detectedAt: parseOptionalDate(row.detected_at, 'detected_at', row.id),
    acknowledgedAt: parseOptionalDate(row.acknowledged_at, 'acknowledged_at', row.id),
    acknowledgedBy: row.acknowledged_by,
    snoozedUntil: parseOptionalDate(row.snoozed_until, 'snoozed_until', row.id),
    resolvedAt: parseOptionalDate(row.resolved_at, 'resolved_at', row.id),
    resolvedBy: row.resolved_by,
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
  };
}
