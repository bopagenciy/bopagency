/**
 * SupabaseExecutionLogRepository
 *
 * Implementación de ExecutionLogRepository respaldada por Supabase,
 * usando la tabla `automation_execution_logs` (Phase 6B).
 *
 * SEGURIDAD:
 * - organizationId requerido en todas las operaciones.
 * - Nunca se persiste raw body, HMAC, API keys, ni stack traces.
 * - El campo `context` del dominio (CreateExecutionLogInput.context) es
 *   sanitizado antes de persistir y se guarda en la columna real de la
 *   tabla `public.automation_execution_logs`, que se llama `metadata`
 *   (ver 20260804000000_phase6b_automation_runtime.sql). El nombre del
 *   campo a nivel de dominio ("context") es intencionalmente distinto del
 *   nombre de la columna en DB ("metadata") — este repositorio es el único
 *   punto de traducción entre ambos.
 * - error_message truncado a 500 chars.
 * - Claves prohibidas eliminadas del contexto.
 *
 * RESILIENCIA:
 * - log() no lanza excepciones — retorna Result<void>.
 * - Los use cases llaman log() de forma best-effort (logSilently).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  ExecutionLogRepository,
  CreateExecutionLogInput,
  ExecutionLog,
  ExecutionLogEventType,
  ExecutionLogLevel,
} from '@bop-agency/domain';
import type {
  AutomationExecutionId,
  OrganizationId,
} from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Constants ────────────────────────────────────────────────────────────────

const TABLE = 'automation_execution_logs' as const;
const DEFAULT_PAGE_SIZE = 50;

/** Claves de contexto prohibidas — nunca persistir en logs. */
const FORBIDDEN_CONTEXT_KEYS = new Set([
  'secret', 'token', 'key', 'password', 'auth', 'credential',
  'hmac', 'signature', 'bearer', 'oauth', 'apikey', 'api_key',
  'authorization', 'cookie', 'session',
]);

// ─── Row type ─────────────────────────────────────────────────────────────────

type ExecutionLogRow = {
  id: string;
  execution_id: string;
  organization_id: string;
  level: string;
  event_type: string;
  message: string;
  // Columna real en SQL: `metadata` (ver 20260804000000_phase6b_automation_runtime.sql).
  // El dominio la expone como `context` — ver nota de traducción arriba.
  metadata: Record<string, unknown>;
  occurred_at: string;
};

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupabaseExecutionLogRepository implements ExecutionLogRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── log ───────────────────────────────────────────────────────────────────────

  async log(input: CreateExecutionLogInput): Promise<Result<void>> {
    const safeContext = sanitizeContext(input.context ?? {});

    const { error } = await this.supabase.from(TABLE).insert({
      execution_id:    String(input.executionId),
      organization_id: String(input.organizationId),
      level:           input.level,
      event_type:      input.event,
      message:         input.message.slice(0, 500),
      // Columna real: `metadata` (no `context` — ver nota de traducción arriba).
      metadata:        safeContext,
      occurred_at:     new Date().toISOString(),
    });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al registrar log de ejecución',
        details: error.code, // solo código, no message completo
      });
    }

    return ok(undefined);
  }

  // ── findByExecution ───────────────────────────────────────────────────────────

  async findByExecution(
    executionId: AutomationExecutionId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ExecutionLog>> {
    const page     = pagination.page     ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from     = (page - 1) * pageSize;
    const to       = from + pageSize - 1;

    const { data, error, count } = await this.supabase
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('execution_id',    String(executionId))
      .eq('organization_id', String(organizationId))
      .order('occurred_at', { ascending: true })
      .range(from, to);

    if (error) {
      return emptyPage(page, pageSize);
    }

    const total      = count ?? 0;
    const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
    const items      = (data ?? []).map((row) => rowToLog(row as ExecutionLogRow));

    return {
      data:            items,
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage:     page < totalPages,
      hasPreviousPage: page > 1,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeContext(ctx: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(ctx).filter(([k]) => {
      const lower = k.toLowerCase();
      return !Array.from(FORBIDDEN_CONTEXT_KEYS).some((p) => lower.includes(p));
    }),
  );
}

function rowToLog(row: ExecutionLogRow): ExecutionLog {
  return {
    id:            row.id,
    executionId:   row.execution_id as AutomationExecutionId,
    organizationId: row.organization_id as OrganizationId,
    level:         row.level as ExecutionLogLevel,
    event:         row.event_type as ExecutionLogEventType,
    message:       row.message,
    // row.metadata (columna real) se expone como `context` en el dominio.
    context:       row.metadata ?? {},
    occurredAt:    new Date(row.occurred_at),
  };
}

function emptyPage<T>(page: number, pageSize: number): PaginatedResult<T> {
  return {
    data:            [],
    total:           0,
    page,
    pageSize,
    totalPages:      0,
    hasNextPage:     false,
    hasPreviousPage: false,
  };
}
