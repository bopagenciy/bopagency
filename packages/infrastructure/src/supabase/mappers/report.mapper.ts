/**
 * ReportMapper & ReportDeliveryMapper — Supabase DB rows <-> Domain Report entities.
 */

import type {
  Report,
  ReportDelivery,
  ReportId,
  ReportDeliveryId,
  ReportType,
  ReportStatus,
  DeliveryChannel,
  DeliveryStatus,
  ReportSummary,
} from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';

export type ReportRow = {
  id: string;
  organization_id: string;
  client_id: string;
  report_type: string;
  status: string;
  period_label: string | null;
  period_start: string;
  period_end: string;
  currency: string;
  generated_at: string | null;
  summary: unknown;
  payload: unknown | null;
  created_at: string;
  updated_at: string;
};

export type ReportDeliveryRow = {
  id: string;
  organization_id: string;
  report_id: string;
  recipient_email: string;
  channel: string;
  status: string;
  attempt_number?: number;
  idempotency_key?: string | null;
  provider_message_id?: string | null;
  sent_at: string | null;
  error_message: string | null;
  metadata: unknown;
  created_at: string;
};

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(`ReportMapper: "${field}" no es una fecha válida (row.id=${rowId}): ${raw}`);
  }
  return d;
}

function parseOptionalDate(raw: string | null, field: string, rowId: string): Date | null {
  if (!raw) return null;
  return parseDate(raw, field, rowId);
}

function parseSummary(raw: unknown): ReportSummary {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      title: 'Reporte de Campaña',
      executiveSummary: '',
      highlights: [],
      recommendations: [],
      metricsOverview: {
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalLeads: 0,
        totalConversions: 0,
        avgRoas: 0,
      },
    };
  }
  const obj = raw as Record<string, unknown>;
  const overview = (obj.metricsOverview && typeof obj.metricsOverview === 'object')
    ? (obj.metricsOverview as Record<string, unknown>)
    : {};

  return {
    title: typeof obj.title === 'string' ? obj.title : 'Reporte de Campaña',
    executiveSummary: typeof obj.executiveSummary === 'string' ? obj.executiveSummary : '',
    highlights: Array.isArray(obj.highlights) ? (obj.highlights as string[]) : [],
    recommendations: Array.isArray(obj.recommendations) ? (obj.recommendations as string[]) : [],
    metricsOverview: {
      totalSpend: Number(overview.totalSpend) || 0,
      totalImpressions: Number(overview.totalImpressions) || 0,
      totalClicks: Number(overview.totalClicks) || 0,
      totalLeads: Number(overview.totalLeads) || 0,
      totalConversions: Number(overview.totalConversions) || 0,
      avgRoas: Number(overview.avgRoas) || 0,
    },
  };
}

export function rowToReport(row: ReportRow): Report {
  const payload = (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload))
    ? (row.payload as Record<string, unknown>)
    : null;

  return {
    id: row.id as ReportId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId: row.client_id as ClientId,
    reportType: row.report_type as ReportType,
    status: row.status as ReportStatus,
    periodLabel: row.period_label,
    periodStart: parseDate(row.period_start, 'period_start', row.id),
    periodEnd: parseDate(row.period_end, 'period_end', row.id),
    currency: row.currency || 'COP',
    generatedAt: parseOptionalDate(row.generated_at, 'generated_at', row.id),
    summary: parseSummary(row.summary),
    payload,
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
  };
}

export function rowToReportDelivery(row: ReportDeliveryRow): ReportDelivery {
  const metadata = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
    ? (row.metadata as Record<string, unknown>)
    : {};

  return {
    id: row.id as ReportDeliveryId,
    organizationId: row.organization_id as unknown as OrganizationId,
    reportId: row.report_id as ReportId,
    recipientEmail: row.recipient_email,
    channel: row.channel as DeliveryChannel,
    status: row.status as DeliveryStatus,
    attemptNumber: row.attempt_number ?? 1,
    idempotencyKey: row.idempotency_key ?? null,
    providerMessageId: row.provider_message_id ?? null,
    sentAt: parseOptionalDate(row.sent_at, 'sent_at', row.id),
    errorMessage: row.error_message,
    metadata,
    createdAt: parseDate(row.created_at, 'created_at', row.id),
  };
}
