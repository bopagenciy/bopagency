/**
 * SupabaseAlertRepository
 *
 * Implementación de AlertRepository respaldada por Supabase.
 * Todas las operaciones filtran por organization_id (multi-tenant).
 * Usa el cliente del usuario con RLS activo — nunca service_role en esta capa.
 *
 * MUTACIONES (acknowledge / resolve):
 * Llaman exclusivamente a RPCs de Supabase.
 * NO usan UPDATE directo: el trigger `trg_alerts_70_audit_fields`
 * bloquea escrituras directas a los campos de auditoría.
 *
 * countBySeverity:
 * Cuenta alertas ACTIVAS (status='active') agrupadas por severidad.
 * Se agrega en TypeScript a partir de un SELECT mínimo (solo severity).
 * Funcional para el volumen actual; candidato a RPC si el volumen escala.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { AlertSeverity, AlertStatus } from '@bop-agency/shared';
import type {
  Alert,
  AlertFilter,
  AlertId,
  AlertRepository,
  AlertCountBySeverity,
} from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToAlert, type AlertRow } from '../mappers/alert.mapper';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupabaseAlertRepository implements AlertRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── findById ─────────────────────────────────────────────────────────────────

  async findById(id: AlertId, organizationId: OrganizationId): Promise<Result<Alert>> {
    const { data, error } = await this.supabase
      .from('alerts')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return err({
        code: 'NOT_FOUND' as const,
        message: `Alerta ${id} no encontrada en la organización`,
      });
    }

    try {
      return ok(rowToAlert(data as unknown as AlertRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos de la alerta',
        details: mappingError,
      });
    }
  }

  // ── findByOrganization ────────────────────────────────────────────────────────

  async findByOrganization(
    filter: AlertFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase
      .from('alerts')
      .select('*', { count: 'exact' })
      .eq('organization_id', filter.organizationId);

    if (filter.status !== undefined) {
      query = query.eq('status', filter.status);
    }
    if (filter.severity !== undefined) {
      query = query.eq('severity', filter.severity);
    }
    if (filter.clientId !== undefined) {
      query = query.eq('client_id', filter.clientId);
    }
    if (filter.platform !== undefined) {
      query = query.eq('platform', filter.platform);
    }

    const { data, error, count } = await query
      .order('detected_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    const total = count ?? 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const items = mapSafe(data ?? [], (row) => rowToAlert(row as unknown as AlertRow));

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

  // ── findActiveByOrganization ───────────────────────────────────────────────────

  async findActiveByOrganization(
    organizationId: OrganizationId,
    filters: { clientId?: ClientId; severity?: AlertSeverity },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>> {
    return this.findByOrganization(
      {
        organizationId,
        status: 'active' as AlertStatus,
        ...(filters.clientId !== undefined && { clientId: filters.clientId }),
        ...(filters.severity !== undefined && { severity: filters.severity }),
      },
      pagination,
    );
  }

  // ── findByClient ──────────────────────────────────────────────────────────────

  async findByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
    filters: { status?: AlertStatus },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>> {
    return this.findByOrganization(
      {
        organizationId,
        clientId,
        ...(filters.status !== undefined && { status: filters.status }),
      },
      pagination,
    );
  }

  // ── countBySeverity ───────────────────────────────────────────────────────────

  /**
   * Cuenta alertas ACTIVAS por severidad.
   * Selecciona solo la columna `severity` para minimizar transferencia de datos.
   *
   * NOTA: Se agrega en TypeScript. Para grandes volúmenes de alertas activas,
   * considerar una RPC `count_active_alerts_by_severity(p_org_id)`.
   */
  async countBySeverity(organizationId: OrganizationId): Promise<Result<AlertCountBySeverity>> {
    const { data, error } = await this.supabase
      .from('alerts')
      .select('severity')
      .eq('organization_id', organizationId)
      .eq('status', 'active');

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al contar alertas por severidad',
        details: error.message,
      });
    }

    const mutable = { critical: 0, warning: 0, info: 0 };

    for (const row of data ?? []) {
      const severity = row.severity as AlertSeverity;
      if (severity === 'critical') mutable.critical++;
      else if (severity === 'warning') mutable.warning++;
      else if (severity === 'info') mutable.info++;
    }

    return ok(mutable);
  }

  // ── acknowledge ───────────────────────────────────────────────────────────────

  /**
   * Registra un reconocimiento de alerta via RPC.
   *
   * OBLIGATORIO: usa `acknowledge_alert(p_alert_id)` de Supabase.
   * El trigger `trg_alerts_70_audit_fields` bloquea UPDATE directo
   * sobre los campos de auditoría (acknowledged_at, acknowledged_by).
   * La RPC verifica membership del usuario y aplica los campos de auditoría
   * desde auth.uid() en el contexto de BD.
   */
  async acknowledge(alertId: AlertId, organizationId: OrganizationId): Promise<Result<void>> {
    // Verificar que la alerta pertenece a la organización antes de llamar la RPC
    const alertCheck = await this.findById(alertId, organizationId);
    if (!alertCheck.success) return alertCheck;

    const { error } = await (
      this.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      }
    ).rpc('acknowledge_alert', { p_alert_id: alertId });

    if (error) {
      const msg = error.message ?? 'Error al reconocer la alerta';
      if (msg.includes('not found')) {
        return err({ code: 'NOT_FOUND' as const, message: msg });
      }
      if (msg.includes('permission') || msg.includes('role')) {
        return err({ code: 'FORBIDDEN' as const, message: msg });
      }
      return err({ code: 'INTERNAL_ERROR' as const, message: msg });
    }

    return ok(undefined);
  }

  // ── resolve ───────────────────────────────────────────────────────────────────

  /**
   * Registra una resolución de alerta via RPC.
   *
   * OBLIGATORIO: usa `resolve_alert(p_alert_id)` de Supabase.
   * La RPC verifica que el usuario tenga rol `operator` o superior.
   */
  async resolve(alertId: AlertId, organizationId: OrganizationId): Promise<Result<void>> {
    // Verificar que la alerta pertenece a la organización antes de llamar la RPC
    const alertCheck = await this.findById(alertId, organizationId);
    if (!alertCheck.success) return alertCheck;

    const { error } = await (
      this.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      }
    ).rpc('resolve_alert', { p_alert_id: alertId });

    if (error) {
      const msg = error.message ?? 'Error al resolver la alerta';
      if (msg.includes('not found')) {
        return err({ code: 'NOT_FOUND' as const, message: msg });
      }
      if (msg.includes('permission') || msg.includes('role')) {
        return err({ code: 'FORBIDDEN' as const, message: msg });
      }
      return err({ code: 'INTERNAL_ERROR' as const, message: msg });
    }

    return ok(undefined);
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
