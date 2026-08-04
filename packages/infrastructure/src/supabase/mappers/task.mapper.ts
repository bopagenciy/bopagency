/**
 * TaskMapper — Supabase DB rows → Domain Task entities.
 *
 * Alineado con la tabla `tasks` en database.types.ts.
 *
 * IMPORTANTE:
 * - La tabla `tasks` NO tiene columna `assignee_id`. La entidad Task tampoco.
 * - `status` y `priority` se validan contra los enums reales de DB.
 * - `tags` en DB es `string[]` (no JSONB); puede ser array vacío.
 * - `deleted_at` es soft-delete; las queries de producción deben filtrar IS NULL.
 */

import type { Task, TaskId, TaskPriority } from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type { TaskStatus } from '@bop-agency/shared';
import { TASK_STATUSES } from '@bop-agency/shared';

// ─── Row type (alineado con tasks.Row en database.types.ts) ───────────────────

export type TaskRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  tags: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// ─── DB enum values ───────────────────────────────────────────────────────────

const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

// ─── Internal validators ──────────────────────────────────────────────────────

function parseTaskStatus(raw: string, rowId: string): TaskStatus {
  if ((TASK_STATUSES as readonly string[]).includes(raw)) {
    return raw as TaskStatus;
  }
  throw new Error(
    `TaskMapper: status "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${TASK_STATUSES.join(', ')}`,
  );
}

function parseTaskPriority(raw: string, rowId: string): TaskPriority {
  if ((TASK_PRIORITIES as string[]).includes(raw)) {
    return raw as TaskPriority;
  }
  throw new Error(
    `TaskMapper: priority "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${TASK_PRIORITIES.join(', ')}`,
  );
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(`TaskMapper: "${field}" no es una fecha válida (row.id=${rowId}): ${raw}`);
  }
  return d;
}

function parseOptionalDate(raw: string | null, field: string, rowId: string): Date | null {
  if (raw === null || raw === undefined) return null;
  return parseDate(raw, field, rowId);
}

// ─── Public mapper ────────────────────────────────────────────────────────────

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id as TaskId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId: row.client_id ? (row.client_id as ClientId) : null,
    title: row.title,
    description: row.description,
    status: parseTaskStatus(row.status, row.id),
    priority: parseTaskPriority(row.priority, row.id),
    dueDate: parseOptionalDate(row.due_date, 'due_date', row.id),
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
    deletedAt: parseOptionalDate(row.deleted_at, 'deleted_at', row.id),
  };
}
