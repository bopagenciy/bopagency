/**
 * AutomationExecutionMapper — Supabase DB rows → Domain AutomationExecution entities.
 *
 * Alineado con la tabla `public.automation_executions` (Phase 6B).
 *
 * SEGURIDAD:
 * - error_message se sanitiza: se trunca a 500 chars, se elimina contenido
 *   que parezca token (regex conservador).
 * - input_metadata y output_metadata se parsean como Record<string,unknown> opaco.
 *   El caller es responsable de sanitizar antes de persistir.
 * - idempotency_key se valida como no vacío.
 * - attempt se valida como entero >= 1.
 *
 * NOTA: No existe compatibilidad legacy de execution_status (tabla nueva en 6B).
 */

import type {
  AutomationExecution,
  AutomationExecutionStatus,
  AutomationTriggerType,
  IdempotencyKey,
} from '@bop-agency/domain';
import { automationExecutionId, idempotencyKeyFromString } from '@bop-agency/domain';
import type { OrganizationId, ClientId } from '@bop-agency/domain';
import type { AutomationId } from '@bop-agency/domain';

// ─── Row type (alineado con public.automation_executions) ─────────────────────

export type AutomationExecutionRow = {
  id: string;
  organization_id: string;
  automation_id: string;
  client_id: string | null;
  status: string;
  attempt: number;
  idempotency_key: string;
  triggered_by: string;
  trigger_type: string;
  input_metadata: unknown | null;
  output_metadata: unknown | null;
  error_code: string | null;
  error_message: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Validation constants ─────────────────────────────────────────────────────

const VALID_EXECUTION_STATUSES: readonly string[] = [
  'queued', 'running', 'succeeded', 'failed', 'cancelled', 'retrying',
];

const VALID_TRIGGER_TYPES: readonly string[] = [
  'schedule', 'webhook', 'event', 'manual',
];

// ─── Internal parsers ─────────────────────────────────────────────────────────

function parseExecutionStatus(raw: string, rowId: string): AutomationExecutionStatus {
  if ((VALID_EXECUTION_STATUSES as readonly string[]).includes(raw)) {
    return raw as AutomationExecutionStatus;
  }
  throw new Error(
    `AutomationExecutionMapper: status "${raw}" no es válido (row.id=${rowId}). ` +
    `Valores válidos: ${VALID_EXECUTION_STATUSES.join(', ')}`,
  );
}

function parseTriggerType(raw: string, rowId: string): AutomationTriggerType {
  if ((VALID_TRIGGER_TYPES as readonly string[]).includes(raw)) {
    return raw as AutomationTriggerType;
  }
  throw new Error(
    `AutomationExecutionMapper: trigger_type "${raw}" no es válido (row.id=${rowId}). ` +
    `Valores válidos: ${VALID_TRIGGER_TYPES.join(', ')}`,
  );
}

function parseAttempt(raw: number, rowId: string): number {
  if (!Number.isInteger(raw) || raw < 1) {
    throw new Error(
      `AutomationExecutionMapper: attempt "${raw}" debe ser entero >= 1 (row.id=${rowId})`,
    );
  }
  return raw;
}

function parseIdempotencyKey(raw: string, rowId: string): IdempotencyKey {
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      `AutomationExecutionMapper: idempotency_key no puede estar vacío (row.id=${rowId})`,
    );
  }
  return idempotencyKeyFromString(raw);
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(
      `AutomationExecutionMapper: "${field}" no es fecha válida (row.id=${rowId}): "${raw}"`,
    );
  }
  return d;
}

function parseOptionalDate(raw: string | null, field: string, rowId: string): Date | null {
  if (raw === null || raw === undefined) return null;
  return parseDate(raw, field, rowId);
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function parseNullableMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * Sanitiza error_message:
 * - Trunca a 500 caracteres.
 * - Redacta patrones que parezcan tokens (Bearer, sk-, ey*, etc.) como [REDACTED].
 * - No lanza errores — nunca debería fallar.
 */
const TOKEN_PATTERN = /\b(Bearer\s+\S+|sk-[a-zA-Z0-9]{10,}|ey[a-zA-Z0-9._-]{20,})\b/gi;

function sanitizeErrorMessage(raw: string | null): string | null {
  if (raw === null || raw === undefined) return null;
  const truncated = raw.slice(0, 500);
  return truncated.replace(TOKEN_PATTERN, '[REDACTED]');
}

// ─── Public mapper ────────────────────────────────────────────────────────────

export function rowToAutomationExecution(row: AutomationExecutionRow): AutomationExecution {
  return {
    id:              automationExecutionId(row.id),
    organizationId:  row.organization_id as unknown as OrganizationId,
    automationId:    row.automation_id as unknown as AutomationId,
    clientId:        row.client_id ? (row.client_id as ClientId) : null,
    status:          parseExecutionStatus(row.status, row.id),
    attempt:         parseAttempt(row.attempt, row.id),
    idempotencyKey:  parseIdempotencyKey(row.idempotency_key, row.id),
    triggeredBy:     row.triggered_by,
    triggerType:     parseTriggerType(row.trigger_type, row.id),
    inputMetadata:   parseMetadata(row.input_metadata),
    outputMetadata:  parseNullableMetadata(row.output_metadata),
    errorCode:       row.error_code ?? null,
    errorMessage:    sanitizeErrorMessage(row.error_message),
    queuedAt:        parseDate(row.queued_at, 'queued_at', row.id),
    startedAt:       parseOptionalDate(row.started_at, 'started_at', row.id),
    completedAt:     parseOptionalDate(row.completed_at, 'completed_at', row.id),
    createdAt:       parseDate(row.created_at, 'created_at', row.id),
    updatedAt:       parseDate(row.updated_at, 'updated_at', row.id),
  };
}

// ─── Re-exports para tests ────────────────────────────────────────────────────

export { sanitizeErrorMessage as _sanitizeErrorMessageForTest };
