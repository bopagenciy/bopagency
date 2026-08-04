/**
 * MetricMapper — Supabase DB rows → Domain Metric entities.
 *
 * Parsing seguro de JSONB:
 * - `metrics` y `campaigns` son `Json` en DB (tipo Supabase genérico).
 * - Se parsean a tipos tipados con validación explícita.
 * - Si los campos obligatorios faltan, se lanza un error descriptivo.
 * - Los campos opcionales ausentes se tratan como undefined (NO se coercen a 0).
 *
 * ADVERTENCIA sobre campaigns:
 * - Solo usar `rowToMetric` (que incluye campaigns) en vistas de detalle.
 * - Para listas, usar `rowToMetricSummary` que excluye campaigns.
 */

import type {
  Metric,
  MetricSummary,
  MetricId,
  MetricValues,
  MetricTraffic,
  MetricEngagement,
  MetricConversations,
  CampaignMetric,
  DataQuality,
} from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type { MetricPlatform } from '@bop-agency/shared';
import { METRIC_PLATFORMS } from '@bop-agency/shared';

// ─── Row type (alineado con client_metrics en database.types.ts) ──────────────

export type MetricRow = {
  id: string;
  organization_id: string;
  client_id: string;
  platform: string;
  account_id: string;
  account_name: string | null;
  period_start: string;
  period_end: string;
  currency: string;
  metrics: unknown; // Json en Supabase
  campaigns: unknown; // Json en Supabase
  data_quality: unknown | null; // Json en Supabase
  created_at: string;
  updated_at: string;
};

/** Fila de lista: sin campaigns para eficiencia. */
export type MetricSummaryRow = Omit<MetricRow, 'campaigns'>;

// ─── Internal parsers ─────────────────────────────────────────────────────────

function parseFiniteNumber(val: unknown, field: string): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(
    `MetricMapper: campo "${field}" debe ser número finito (recibido: ${String(val)})`,
  );
}

function parseOptionalNumber(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const n = parseFloat(val);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseTraffic(obj: Record<string, unknown>): MetricTraffic | undefined {
  if (!obj.traffic || typeof obj.traffic !== 'object') return undefined;
  const t = obj.traffic as Record<string, unknown>;
  return {
    linkClicks: parseOptionalNumber(t.linkClicks) ?? 0,
    landingPageViews: parseOptionalNumber(t.landingPageViews) ?? 0,
  };
}

function parseEngagement(obj: Record<string, unknown>): MetricEngagement | undefined {
  if (!obj.engagement || typeof obj.engagement !== 'object') return undefined;
  const e = obj.engagement as Record<string, unknown>;
  return {
    postReactions: parseOptionalNumber(e.postReactions) ?? 0,
    postEngagement: parseOptionalNumber(e.postEngagement) ?? 0,
    pageEngagement: parseOptionalNumber(e.pageEngagement) ?? 0,
  };
}

function parseConversations(obj: Record<string, unknown>): MetricConversations | undefined {
  if (!obj.conversations || typeof obj.conversations !== 'object') return undefined;
  const c = obj.conversations as Record<string, unknown>;
  return {
    started: parseOptionalNumber(c.started) ?? 0,
    replied: parseOptionalNumber(c.replied) ?? 0,
  };
}

function parseMetricValues(raw: unknown, rowId: string): MetricValues {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`MetricMapper: campo "metrics" no es un objeto (row.id=${rowId})`);
  }
  const obj = raw as Record<string, unknown>;
  const conversionRate = parseOptionalNumber(obj.conversionRate);
  const traffic = parseTraffic(obj);
  const engagement = parseEngagement(obj);
  const conversations = parseConversations(obj);
  return {
    spend: parseFiniteNumber(obj.spend, 'spend'),
    impressions: parseFiniteNumber(obj.impressions, 'impressions'),
    reach: parseFiniteNumber(obj.reach ?? 0, 'reach'),
    clicks: parseFiniteNumber(obj.clicks, 'clicks'),
    leads: parseFiniteNumber(obj.leads, 'leads'),
    purchases: parseFiniteNumber(obj.purchases ?? 0, 'purchases'),
    conversions: parseFiniteNumber(obj.conversions, 'conversions'),
    revenue: parseFiniteNumber(obj.revenue, 'revenue'),
    ctr: parseFiniteNumber(obj.ctr, 'ctr'),
    cpc: parseFiniteNumber(obj.cpc, 'cpc'),
    cpm: parseFiniteNumber(obj.cpm, 'cpm'),
    cpl: parseFiniteNumber(obj.cpl, 'cpl'),
    roas: parseFiniteNumber(obj.roas, 'roas'),
    ...(conversionRate !== undefined && { conversionRate }),
    ...(traffic !== undefined && { traffic }),
    ...(engagement !== undefined && { engagement }),
    ...(conversations !== undefined && { conversations }),
  };
}

function parseCampaignMetric(raw: unknown, index: number): CampaignMetric {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`MetricMapper: campaigns[${index}] no es un objeto`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || !obj.id) {
    throw new Error(`MetricMapper: campaigns[${index}].id debe ser un string no vacío`);
  }
  if (typeof obj.name !== 'string') {
    throw new Error(`MetricMapper: campaigns[${index}].name debe ser un string`);
  }
  const status = typeof obj.status === 'string' ? obj.status : undefined;
  const reach = parseOptionalNumber(obj.reach);
  const purchases = parseOptionalNumber(obj.purchases);
  const ctr = parseOptionalNumber(obj.ctr);
  const cpc = parseOptionalNumber(obj.cpc);
  const traffic = parseTraffic(obj);
  const engagement = parseEngagement(obj);
  const conversations = parseConversations(obj);
  return {
    id: obj.id,
    name: obj.name,
    spend: parseOptionalNumber(obj.spend) ?? 0,
    impressions: parseOptionalNumber(obj.impressions) ?? 0,
    clicks: parseOptionalNumber(obj.clicks) ?? 0,
    leads: parseOptionalNumber(obj.leads) ?? 0,
    conversions: parseOptionalNumber(obj.conversions) ?? 0,
    revenue: parseOptionalNumber(obj.revenue) ?? 0,
    ...(status !== undefined && { status }),
    ...(reach !== undefined && { reach }),
    ...(purchases !== undefined && { purchases }),
    ...(ctr !== undefined && { ctr }),
    ...(cpc !== undefined && { cpc }),
    ...(traffic !== undefined && { traffic }),
    ...(engagement !== undefined && { engagement }),
    ...(conversations !== undefined && { conversations }),
  };
}

function parseCampaigns(raw: unknown, rowId: string): CampaignMetric[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`MetricMapper: campo "campaigns" debe ser un array (row.id=${rowId})`);
  }
  return raw.map((item, i) => parseCampaignMetric(item, i));
}

function parseDataQuality(raw: unknown): DataQuality | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const missingFields = Array.isArray(obj.missingFields)
    ? (obj.missingFields as string[])
    : undefined;
  return {
    status: (obj.status as DataQuality['status']) ?? 'unavailable',
    warnings: Array.isArray(obj.warnings) ? (obj.warnings as string[]) : [],
    ...(missingFields !== undefined && { missingFields }),
  };
}

function parsePlatform(raw: string, rowId: string): MetricPlatform {
  if ((METRIC_PLATFORMS as readonly string[]).includes(raw)) {
    return raw as MetricPlatform;
  }
  throw new Error(
    `MetricMapper: platform "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${METRIC_PLATFORMS.join(', ')}`,
  );
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(`MetricMapper: "${field}" no es una fecha válida (row.id=${rowId}): ${raw}`);
  }
  return d;
}

// ─── Public mappers ───────────────────────────────────────────────────────────

/**
 * rowToMetricSummary — para consultas de lista.
 * Excluye campaigns para evitar cargar JSONB pesado.
 */
export function rowToMetricSummary(row: MetricSummaryRow): MetricSummary {
  return {
    id: row.id as MetricId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId: row.client_id as ClientId,
    platform: parsePlatform(row.platform, row.id),
    accountId: row.account_id,
    accountName: row.account_name,
    periodStart: parseDate(row.period_start, 'period_start', row.id),
    periodEnd: parseDate(row.period_end, 'period_end', row.id),
    currency: row.currency,
    metrics: parseMetricValues(row.metrics, row.id),
    dataQuality: parseDataQuality(row.data_quality),
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
  };
}

/**
 * rowToMetric — para vistas de detalle.
 * Incluye el array de campaigns. Solo usar cuando se necesiten las campañas.
 */
export function rowToMetric(row: MetricRow): Metric {
  return {
    ...rowToMetricSummary(row),
    campaigns: parseCampaigns(row.campaigns, row.id),
  };
}
