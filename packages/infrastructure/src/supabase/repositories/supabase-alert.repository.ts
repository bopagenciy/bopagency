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
  CreateAlertInput,
  UpsertAlertResult,
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
  // ── Phase 6F: upsertByAlertKey ────────────────────────────────────────────────
  //
  // Usa INSERT ... ON CONFLICT (organization_id, alert_key) DO UPDATE.
  // El trigger trg_alerts_70_audit_fields permite INSERTs y UPDATEs desde
  // service_role (auth.uid() IS NULL) sin restricciones en audit fields.
  // Para operaciones de automatización, siempre usar adminClient.

  async upsertByAlertKey(input: CreateAlertInput): Promise<Result<UpsertAlertResult>> {
    const now = new Date().toISOString();

    // Intentar INSERT primero; en conflicto, el DO UPDATE actualiza campos editables.
    const { data, error } = await this.supabase
      .from('alerts')
      .upsert(
        {
          organization_id: String(input.organizationId),
          client_id: input.clientId ? String(input.clientId) : null,
          alert_key: input.alertKey,
          alert_type: input.alertType,
          severity: input.severity,
          status: 'active',
          title: input.title,
          description: input.description,
          metadata: (input.metadata ?? {}) as Record<string, unknown>,
          detected_at: now,
          updated_at: now,
        },
        {
          onConflict: 'organization_id,alert_key',
          ignoreDuplicates: false,
        },
      )
      .select('*')
      .single();

    if (error || !data) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al crear o actualizar la alerta de automatización',
        details: error?.code,
      });
    }

    let alert: Alert;
    try {
      alert = rowToAlert(data as unknown as AlertRow);
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar datos de alerta',
        details: mappingError,
      });
    }

    // Determinar si fue creación o actualización basándonos en created_at vs updated_at
    const isNew = data.created_at === data.updated_at || !data.updated_at;

    return ok({ alert, created: isNew });
  }

  // ── Phase 6F: findActiveByAlertKey ────────────────────────────────────────────

  async findActiveByAlertKey(
    alertKey: string,
    organizationId: OrganizationId,
  ): Promise<Result<Alert | null>> {
    const { data, error } = await this.supabase
      .from('alerts')
      .select('*')
      .eq('organization_id', String(organizationId))
      .eq('alert_key', alertKey)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al buscar alerta por clave',
        details: error.code,
      });
    }

    if (!data) return ok(null);

    try {
      return ok(rowToAlert(data as unknown as AlertRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar datos de alerta',
        details: mappingError,
      });
    }
  }

  // ── Phase 6F: resolveActiveByAlertKeyPrefixes ────────────────────────────────
  //
  // Resuelve alertas activas cuyo alert_key empiece con alguno de los prefijos.
  // Requiere service_role (adminClient) para que auth.uid() IS NULL y el trigger
  // permita actualizar resolved_at directamente.
  //
  // NOTA (fix Phase 6 local staging — recovery resolve best-effort):
  // `resolved_by` es `uuid NULL REFERENCES auth.users(id)` en el schema
  // (ver 20260730150000_phase4_data_migration_targets.sql). El caller de
  // esta recuperación automática (evaluate-automation-incident.use-case.ts)
  // no tiene un usuario autenticado real — la resolución la dispara el
  // sistema al recibir `execution_succeeded`. Por eso `resolvedByLabel`
  // (p.ej. "automation-recovery:<executionId>") NUNCA debe escribirse
  // directamente en `resolved_by`: al no ser un UUID válido, Postgres
  // rechaza el UPDATE con 22P02 (invalid input syntax for type uuid),
  // que PostgREST reporta como error genérico — visible como
  // `evaluateAutomationIncident: recovery resolve failed (best-effort)`.
  // Si el label es un UUID válido (p.ej. un usuario real forzando una
  // recuperación manual) se persiste tal cual; en cualquier otro caso
  // (incluida la recuperación automática del sistema) se deja NULL,
  // que es un valor válido para una columna FK nullable.
  //
  // SEGUNDO DEFECTO (validación E2E posterior, 2026-08-07): el fix de arriba
  // era necesario pero NO suficiente. `20260730150000_phase4_data_migration_targets.sql`
  // nunca otorgó GRANT explícito a `service_role` sobre `public.alerts` (solo
  // a `authenticated`, líneas 909-928 de esa migración) — a diferencia de las
  // 4 tablas de Phase 6B, que sí recibieron su GRANT correctivo. `service_role`
  // bypasea RLS pero NO exime del chequeo de privilegios GRANT/REVOKE: sin ese
  // GRANT, PostgREST devuelve 42501 "permission denied for table alerts" en
  // CUALQUIER UPDATE/SELECT que este método intente, sin importar el valor de
  // `resolved_by`. Corregido en la migración correctiva
  // `20260807150000_fix_alerts_service_role_grant.sql` (Phase 4 ya está en
  // `main`/aplicada — no se edita in-place, se agrega una migración nueva).
  //
  // TERCER DEFECTO (validación E2E, 2026-08-07): con el GRANT ya aplicado, el
  // UPDATE seguía fallando con `42703 column alerts.alert_key does not exist`
  // pese a que la columna SÍ existe. Se intentó corregir envolviendo el valor
  // de cada condición LIKE entre comillas dobles dentro de `.or(...)`, por ser
  // ':' un carácter reservado en la gramática or()/and() de PostgREST
  // (https://docs.postgrest.org/en/stable/references/api/url_grammar.html#reserved-characters).
  // El quoting se verificó correcto en runtime (logging temporal
  // `RECOVERY_FILTER_V2`, con Next.js y PostgREST reiniciados, caché de
  // `.next` limpia): el string enviado a `.or()` era exactamente el esperado,
  // con cada valor completamente entre comillas — y el 42703 persistió de
  // todas formas específicamente combinando `.or()` con `UPDATE`/`PATCH`.
  //
  // RESOLUCIÓN FINAL: en vez de seguir depurando la gramática interna de
  // `or=(...)` de PostgREST combinada con UPDATE, se elimina por completo la
  // dependencia de `.or()`. Los 4 prefijos recuperables
  // (`recoverableAlertKeyPrefixes`) son mutuamente excluyentes por diseño
  // (dispatch-failed / execution-failed / max-attempts / stuck no se
  // solapan), así que no hace falta una única condición OR: se ejecuta un
  // UPDATE independiente por prefijo con `.like('alert_key', ...)` — el
  // operador de filtro simple de PostgREST, sin gramática de combinador de
  // por medio — y se acumulan los ids de alertas resueltas (deduplicados) en
  // un Set. Es secuencial (no `Promise.all`) para mantener el logging y el
  // mapeo de errores deterministas y simples.

  async resolveActiveByAlertKeyPrefixes(
    prefixes: string[],
    organizationId: OrganizationId,
    resolvedByLabel: string,
  ): Promise<Result<number>> {
    if (prefixes.length === 0) return ok(0);

    const now = new Date().toISOString();
    const safeLabel = resolvedByLabel.slice(0, 200).replace(/['"]/g, '');
    const resolvedBy = UUID_PATTERN.test(safeLabel) ? safeLabel : null;

    const resolvedIds = new Set<string>();

    for (const prefix of prefixes) {
      const safePrefix = prefix.replace(/[%_]/g, '');

      const { data, error } = await this.supabase
        .from('alerts')
        .update({
          status: 'resolved',
          resolved_at: now,
          resolved_by: resolvedBy,
          updated_at: now,
        })
        .eq('organization_id', String(organizationId))
        .eq('status', 'active')
        .like('alert_key', `${safePrefix}%`)
        .select('id');

      if (error) {
        // Logging seguro del error REAL de Postgres/PostgREST antes de
        // mapearlo a INTERNAL_ERROR — necesario para distinguir en runtime,
        // sin adivinar, entre 42501 (permission denied / grants), 22P02
        // (uuid inválido), RLS, triggers, o cualquier otra causa. Solo
        // campos de diagnóstico del error de Postgres (code/message/details/
        // hint) y el prefijo (determinístico, sin PII) que estaba
        // procesando — nunca secretos, tokens, headers, payload completo ni
        // PII. `error.message`/`error.details` de Postgres para fallos de
        // schema/permiso no contienen datos de usuario.
        console.error('[SupabaseAlertRepository.resolveActiveByAlertKeyPrefixes] Postgres/PostgREST error', {
          operation: 'UPDATE public.alerts (recovery best-effort)',
          prefix:  safePrefix,
          code:    error.code,
          message: error.message,
          details: error.details,
          hint:    error.hint,
        });
        return err({
          code: 'INTERNAL_ERROR' as const,
          message: 'Error al resolver alertas por prefijo de clave',
          details: error.code,
        });
      }

      for (const row of data ?? []) {
        resolvedIds.add(row.id as string);
      }
    }

    return ok(resolvedIds.size);
  }

}

// UUID v4/general formato estándar (8-4-4-4-12 hex). Usado únicamente para
// decidir si `resolvedByLabel` puede persistirse en la columna `resolved_by`
// (uuid FK a auth.users). Ver nota en resolveActiveByAlertKeyPrefixes.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
