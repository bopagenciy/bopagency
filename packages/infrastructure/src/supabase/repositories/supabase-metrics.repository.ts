/**
 * SupabaseMetricsRepository
 *
 * Implementación de MetricsRepository respaldada por Supabase.
 * Todas las operaciones filtran por organization_id (multi-tenant).
 * Queries de lista excluyen campaigns JSONB para eficiencia.
 * Usa el cliente del usuario con RLS activo — nunca service_role en esta capa.
 *
 * NOTA DE PERFORMANCE — getOrganizationSummary:
 * La agregación JSONB no puede hacerse de forma segura con el query builder
 * actual de Supabase sin una RPC o vista. Se implementa en TypeScript con
 * un límite de MAX_SUMMARY_ROWS. Funcional para el volumen actual (~4 filas).
 *
 * DEUDA TÉCNICA (documentada):
 * Cuando el número de métricas por organización supere MAX_SUMMARY_ROWS,
 * o cuando la latencia del dashboard lo requiera, crear una RPC:
 *   get_org_metrics_summary(p_org_id uuid) → { totalSpend, totalImpressions, ... }
 * No se crea la RPC en Phase 5B per las restricciones del proyecto.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { MetricPlatform } from '@bop-agency/shared';
import type {
  Metric,
  MetricSummary,
  MetricFilter,
  MetricId,
  MetricsRepository,
  AvailablePeriod,
  MetricOrganizationSummary,
} from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToMetric,
  rowToMetricSummary,
  type MetricRow,
  type MetricSummaryRow,
} from '../mappers/metric.mapper';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Campos seleccionados en consultas de lista.
 * Excluye `campaigns` explícitamente para no cargar JSONB pesado.
 * magic-bungalow tiene 55 campañas por período.
 */
const METRIC_SUMMARY_FIELDS =
  'id, organization_id, client_id, platform, account_id, account_name, period_start, period_end, currency, metrics, data_quality, created_at, updated_at' as const;

/**
 * Límite de filas para la agregación in-memory en getOrganizationSummary.
 * Dejar por debajo de los límites razonables de paginación de Supabase.
 */
const MAX_SUMMARY_ROWS = 500;

const DEFAULT_PAGE_SIZE = 20;

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupabaseMetricsRepository implements MetricsRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── findById ─────────────────────────────────────────────────────────────────

  async findById(id: MetricId, organizationId: OrganizationId): Promise<Result<Metric>> {
    const { data, error } = await this.supabase
      .from('client_metrics')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return err({
        code: 'NOT_FOUND' as const,
        message: `Métrica ${id} no encontrada en la organización`,
      });
    }

    try {
      return ok(rowToMetric(data as unknown as MetricRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la métrica',
        details: mappingError,
      });
    }
  }

  // ── findByOrganization ────────────────────────────────────────────────────────

  async findByOrganization(
    filter: MetricFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<MetricSummary>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from('client_metrics')
      .select(METRIC_SUMMARY_FIELDS, { count: 'exact' })
      .eq('organization_id', filter.organizationId);

    if (filter.clientId !== undefined) {
      query = query.eq('client_id', filter.clientId);
    }
    if (filter.platform !== undefined) {
      query = query.eq('platform', filter.platform);
    }
    if (filter.periodStart !== undefined) {
      query = query.gte('period_start', filter.periodStart.toISOString());
    }
    if (filter.periodEnd !== undefined) {
      query = query.lte('period_end', filter.periodEnd.toISOString());
    }

    const { data, error, count } = await query
      .order('period_start', { ascending: false })
      .order('client_id', { ascending: true })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    const total = count ?? 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const items = mapSafe(data ?? [], (row) =>
      rowToMetricSummary(row as unknown as MetricSummaryRow),
    );

    return {
      data: items,
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  // ── findByClient ──────────────────────────────────────────────────────────────

  async findByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
    filters: { platform?: MetricPlatform; periodStart?: Date; periodEnd?: Date },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<MetricSummary>> {
    return this.findByOrganization(
      {
        organizationId,
        clientId,
        ...(filters.platform !== undefined && { platform: filters.platform }),
        ...(filters.periodStart !== undefined && { periodStart: filters.periodStart }),
        ...(filters.periodEnd !== undefined && { periodEnd: filters.periodEnd }),
      },
      pagination,
    );
  }

  // ── findLatestByClient ────────────────────────────────────────────────────────

  async findLatestByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<MetricSummary | null>> {
    const { data, error } = await this.supabase
      .from('client_metrics')
      .select(METRIC_SUMMARY_FIELDS)
      .eq('client_id', clientId)
      .eq('organization_id', organizationId)
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al obtener la métrica más reciente del cliente',
        details: error.message,
      });
    }

    if (!data) return ok(null);

    try {
      return ok(rowToMetricSummary(data as unknown as MetricSummaryRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la métrica',
        details: mappingError,
      });
    }
  }

  // ── getAvailablePeriods ───────────────────────────────────────────────────────

  async getAvailablePeriods(organizationId: OrganizationId): Promise<Result<AvailablePeriod[]>> {
    const { data, error } = await this.supabase
      .from('client_metrics')
      .select('period_start, period_end')
      .eq('organization_id', organizationId)
      .order('period_start', { ascending: false });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al obtener los períodos disponibles',
        details: error.message,
      });
    }

    // Deduplica períodos (múltiples clientes pueden compartir el mismo período)
    const seen = new Set<string>();
    const periods: AvailablePeriod[] = [];

    for (const row of data ?? []) {
      const key = `${String(row.period_start)}|${String(row.period_end)}`;
      if (!seen.has(key)) {
        seen.add(key);
        periods.push({
          periodStart: new Date(row.period_start as string),
          periodEnd: new Date(row.period_end as string),
        });
      }
    }

    return ok(periods);
  }

  // ── getOrganizationSummary ────────────────────────────────────────────────────

  /**
   * Agrega métricas totales de la organización sumando el JSONB `metrics` en TypeScript.
   *
   * TRATAMIENTO DE NULL / VALORES INVÁLIDOS:
   * - Filas con JSONB inválido se omiten del total (no propagan error).
   * - Un ROAS de 0 no se incluye en el promedio (indicaría sin ventas).
   * - Si no hay filas con ROAS > 0, avgRoas = 0.
   *
   * LÍMITE: MAX_SUMMARY_ROWS (500). Si la organización tiene más filas,
   * solo se agregan las primeras 500. Documentar como deuda técnica.
   */
  async getOrganizationSummary(
    organizationId: OrganizationId,
  ): Promise<Result<MetricOrganizationSummary>> {
    const { data, error } = await this.supabase
      .from('client_metrics')
      .select(METRIC_SUMMARY_FIELDS)
      .eq('organization_id', organizationId)
      .limit(MAX_SUMMARY_ROWS);

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al calcular el resumen de métricas de la organización',
        details: error.message,
      });
    }

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalLeads = 0;
    let totalConversions = 0;
    let totalRevenue = 0;
    let roasSum = 0;
    let roasCount = 0;

    for (const row of data ?? []) {
      try {
        const summary = rowToMetricSummary(row as unknown as MetricSummaryRow);
        const m = summary.metrics;
        totalSpend += m.spend;
        totalImpressions += m.impressions;
        totalClicks += m.clicks;
        totalLeads += m.leads;
        totalConversions += m.conversions;
        totalRevenue += m.revenue;
        // Solo incluir ROAS > 0 en el promedio
        if (Number.isFinite(m.roas) && m.roas > 0) {
          roasSum += m.roas;
          roasCount++;
        }
      } catch {
        // Fila con JSONB inválido — se omite silenciosamente del total
        // En producción, monitorizar a través del logger en el use case
      }
    }

    return ok({
      totalSpend,
      totalImpressions,
      totalClicks,
      totalLeads,
      totalConversions,
      totalRevenue,
      avgRoas: roasCount > 0 ? roasSum / roasCount : 0,
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyPaginatedResult<T>(page: number, pageSize: number): PaginatedResult<T> {
  return {
    data: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

/**
 * Mapea filas descartando las que fallen el mapper.
 * Evita que un JSONB inválido en una fila rompa toda la lista.
 */
function mapSafe<T>(rows: unknown[], mapper: (row: unknown) => T): T[] {
  const results: T[] = [];
  for (const row of rows) {
    try {
      results.push(mapper(row));
    } catch {
      // Fila con datos inválidos descartada
    }
  }
  return results;
}
