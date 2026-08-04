/**
 * MetricsRepository — contrato de dominio para client_metrics.
 *
 * Solo métodos de lectura para Phase 5A.
 * Mutaciones (upsert para sync con APIs) corresponden a Phase 8 (Inngest).
 *
 * IMPORTANTE:
 * - `findByOrganization` y `findByClient` devuelven `MetricSummary` (sin campaigns)
 *   para evitar cargar JSONB grande en consultas de lista.
 * - Solo `findById` devuelve `Metric` completo (con campaigns).
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Metric, MetricSummary, MetricFilter, MetricId } from '../entities/metric';
import type { ClientId } from '../entities/client';
import type { OrganizationId } from '../entities/organization';
import type { MetricPlatform } from '@bop-agency/shared';

export type AvailablePeriod = {
  readonly periodStart: Date;
  readonly periodEnd: Date;
};

export type MetricOrganizationSummary = {
  readonly totalSpend: number;
  readonly totalImpressions: number;
  readonly totalClicks: number;
  readonly totalLeads: number;
  readonly totalConversions: number;
  readonly totalRevenue: number;
  readonly avgRoas: number;
};

export interface MetricsRepository {
  /**
   * Busca un registro de métricas por ID.
   * Incluye el campo `campaigns` (solo para vista de detalle).
   */
  findById(id: MetricId, organizationId: OrganizationId): Promise<Result<Metric>>;

  /**
   * Lista métricas de la organización con filtros opcionales.
   * Devuelve MetricSummary (SIN campaigns) para eficiencia.
   */
  findByOrganization(
    filter: MetricFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<MetricSummary>>;

  /**
   * Lista métricas de un cliente específico.
   * Devuelve MetricSummary (SIN campaigns).
   */
  findByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
    filters: { platform?: MetricPlatform; periodStart?: Date; periodEnd?: Date },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<MetricSummary>>;

  /**
   * Obtiene la métrica más reciente de un cliente (por period_start DESC).
   * Útil para el dashboard summary.
   */
  findLatestByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<MetricSummary | null>>;

  /**
   * Devuelve los períodos distintos disponibles para la organización.
   * Usado para construir el selector de período en la UI.
   */
  getAvailablePeriods(organizationId: OrganizationId): Promise<Result<AvailablePeriod[]>>;

  /**
   * Agrega métricas totales de la organización.
   * Usado en el panel de KPIs del dashboard.
   */
  getOrganizationSummary(
    organizationId: OrganizationId,
  ): Promise<Result<MetricOrganizationSummary>>;
}
