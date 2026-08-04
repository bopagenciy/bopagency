/**
 * Metric — entidad de dominio para client_metrics en Supabase.
 *
 * - Refleja exactamente las columnas de la tabla client_metrics.
 * - Los campos `metrics` y `campaigns` son JSONB en DB y se modelan
 *   con tipos explícitos en dominio.
 * - `campaigns` NUNCA se carga en consultas de lista (puede tener 55+ items).
 *   Se incluye solo en vista de detalle.
 * - `MetricPlatform` usa los valores del CHECK constraint de DB,
 *   NO los valores de AdPlatform (que son diferentes).
 */

import type { ClientId } from './client';
import type { OrganizationId } from './organization';
import type { MetricPlatform } from '@bop-agency/shared';

// ─── Branded ID ───────────────────────────────────────────────────────────────

export type MetricId = string & { readonly _brand: 'MetricId' };

// ─── MetricValues — estructura del JSONB `metrics` ───────────────────────────

export type MetricTraffic = {
  readonly linkClicks: number;
  readonly landingPageViews: number;
};

export type MetricEngagement = {
  readonly postReactions: number;
  readonly postEngagement: number;
  readonly pageEngagement: number;
};

export type MetricConversations = {
  readonly started: number;
  readonly replied: number;
};

export type MetricValues = {
  readonly spend: number;
  readonly impressions: number;
  readonly reach: number;
  readonly clicks: number;
  readonly leads: number;
  readonly purchases: number;
  readonly conversions: number;
  readonly revenue: number;
  readonly ctr: number;
  readonly cpc: number;
  readonly cpm: number;
  readonly cpl: number;
  readonly roas: number;
  readonly conversionRate?: number;
  // Nested — presentes en datos migrados, pueden ser undefined en métricas antiguas
  readonly traffic?: MetricTraffic;
  readonly engagement?: MetricEngagement;
  readonly conversations?: MetricConversations;
};

// ─── CampaignMetric — estructura de un item en el array `campaigns` ──────────

export type CampaignMetric = {
  readonly id: string;
  readonly name: string;
  readonly status?: string;
  readonly spend: number;
  readonly impressions: number;
  readonly reach?: number;
  readonly clicks: number;
  readonly leads: number;
  readonly purchases?: number;
  readonly conversions: number;
  readonly revenue: number;
  readonly ctr?: number;
  readonly cpc?: number;
  readonly traffic?: MetricTraffic;
  readonly engagement?: MetricEngagement;
  readonly conversations?: MetricConversations;
};

// ─── DataQuality ──────────────────────────────────────────────────────────────

export type DataQualityStatus = 'complete' | 'partial' | 'unavailable';

export type DataQuality = {
  readonly status: DataQualityStatus;
  readonly warnings: string[];
  readonly missingFields?: string[];
};

// ─── Metric — entidad principal ───────────────────────────────────────────────

export type Metric = {
  readonly id: MetricId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly platform: MetricPlatform;
  readonly accountId: string;
  readonly accountName: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly currency: string;
  /**
   * Métricas agregadas del período.
   * Corresponde al campo JSONB `metrics` en client_metrics.
   */
  readonly metrics: MetricValues;
  /**
   * Array de campañas del período.
   * Corresponde al campo JSONB `campaigns` en client_metrics.
   *
   * ADVERTENCIA: puede contener 50+ campañas. Solo cargar en vista de detalle.
   * En consultas de lista, usar `MetricSummary` (sin campaigns).
   */
  readonly campaigns: CampaignMetric[];
  readonly dataQuality: DataQuality | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * MetricSummary — proyección de Metric para listas.
 * Excluye el campo `campaigns` para evitar cargar JSONB pesado.
 */
export type MetricSummary = Omit<Metric, 'campaigns'>;

// ─── Filter ───────────────────────────────────────────────────────────────────

export type MetricFilter = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly platform?: MetricPlatform;
  readonly periodStart?: Date;
  readonly periodEnd?: Date;
};

// ─── Domain rules (pure validation functions) ─────────────────────────────────

/**
 * Valida que los valores clave de MetricValues sean números finitos.
 * Los valores 0 son válidos (indica que no hubo actividad en ese período).
 */
export function validateMetricValues(m: MetricValues): string[] {
  const errors: string[] = [];
  const numericFields: (keyof MetricValues)[] = [
    'spend',
    'impressions',
    'clicks',
    'leads',
    'conversions',
    'revenue',
    'ctr',
    'cpc',
    'cpm',
    'roas',
  ];
  for (const field of numericFields) {
    const val = m[field];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      errors.push(`MetricValues.${field} debe ser un número finito (recibido: ${String(val)})`);
    }
  }
  return errors;
}

/**
 * Valida que periodStart <= periodEnd.
 */
export function validateMetricPeriod(start: Date, end: Date): boolean {
  return start <= end;
}
