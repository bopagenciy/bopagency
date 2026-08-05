/**
 * AutomationMapper — Supabase DB rows → Domain Automation entities.
 *
 * Alineado con la tabla `public.automations` (Phase 4 + Phase 6B).
 *
 * COMPATIBILIDAD LEGACY (Phase 6B):
 * - El enum DB contiene valores legacy: 'inactive', 'error', 'disabled'.
 *   - 'inactive' → se mapea a 'paused' (migración SQL en curso, mapper transitorio).
 *   - 'error' y 'disabled' → no tienen equivalente en dominio; se lanza error.
 *   Este mapper transitorio debe mantenerse hasta que Phase 6E retire los valores
 *   legacy del enum y confirme que no quedan filas con esos valores.
 *
 * SEGURIDAD:
 * - trigger_config y retry_policy son JSON opaco — no se validan en profundidad aquí.
 * - metadata no debe contener secretos; el mapper no aplica sanitización activa
 *   (responsabilidad del caller antes de persistir).
 * - n8n_workflow_id es nullable; nunca es un secreto.
 *
 * CAMPOS IGNORADOS (legacy Phase 4, sin equivalente en dominio):
 * - legacy_id, legacy_path, category, provider, workflow_id, schedule,
 *   health, links, migrated_at, migration_version, source_hash.
 */

import type {
  Automation,
  AutomationId,
  AutomationStatus,
  AutomationTrigger,
  AutomationRetryPolicy,
} from '@bop-agency/domain';
import { DEFAULT_AUTOMATION_RETRY_POLICY } from '@bop-agency/domain';
import type { OrganizationId, ClientId } from '@bop-agency/domain';

// ─── Row type (alineado con public.automations) ───────────────────────────────
// Incluye columnas existentes (Phase 4) + columnas nuevas (Phase 6B).
// Los campos legacy no usados por el dominio están marcados como unknown.

export type AutomationRow = {
  id: string;
  organization_id: string;
  client_id: string | null;
  name: string;
  description: string | null;
  status: string; // enum DB: 'active'|'paused'|'draft'|'archived'|'inactive'|'error'|'disabled'
  // Phase 6B columns
  trigger_config: unknown;   // jsonb → AutomationTrigger
  retry_policy: unknown;     // jsonb → AutomationRetryPolicy
  n8n_workflow_id: string | null;
  metadata: unknown;         // jsonb → Record<string, unknown>
  is_manual_only: boolean;
  last_executed_at: string | null;
  // Legacy Phase 4 columns (presentes en DB, ignoradas por el dominio)
  legacy_id?: string;
  legacy_path?: string | null;
  category?: string | null;
  provider?: string;
  workflow_id?: string | null;
  schedule?: unknown;
  health?: unknown;
  links?: unknown;
  migrated_at?: string | null;
  migration_version?: string | null;
  source_hash?: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Validation constants ─────────────────────────────────────────────────────

/** Valores de dominio válidos para AutomationStatus. */
const DOMAIN_AUTOMATION_STATUSES: readonly string[] = ['draft', 'active', 'paused', 'archived'];

// ─── Internal parsers ─────────────────────────────────────────────────────────

/**
 * Parsea el status DB al dominio.
 * Mapper transitorio: 'inactive' → 'paused' mientras Phase 6E no retire el enum legacy.
 * 'error' y 'disabled' no tienen equivalente — lanza error descriptivo.
 */
function parseAutomationStatus(raw: string, rowId: string): AutomationStatus {
  // Compatibilidad transitoria: 'inactive' → 'paused'
  if (raw === 'inactive') return 'paused';

  if ((DOMAIN_AUTOMATION_STATUSES as readonly string[]).includes(raw)) {
    return raw as AutomationStatus;
  }

  throw new Error(
    `AutomationMapper: status "${raw}" no tiene equivalente en el dominio (row.id=${rowId}). ` +
    `Valores de dominio: ${DOMAIN_AUTOMATION_STATUSES.join(', ')}. ` +
    `Valores legacy sin mapeo: 'error', 'disabled' — deben ser migrados en Phase 6E.`,
  );
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(
      `AutomationMapper: "${field}" no es una fecha válida (row.id=${rowId}): "${raw}"`,
    );
  }
  return d;
}

function parseMetadata(raw: unknown, rowId: string): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(
      `AutomationMapper: metadata debe ser un objeto JSON (row.id=${rowId})`,
    );
  }
  return raw as Record<string, unknown>;
}

/**
 * Parsea trigger_config desde jsonb.
 * El dominio define AutomationTrigger como unión de tipos con discriminante 'type'.
 * Se valida que sea un objeto con campo 'type' reconocido.
 */
function parseTriggerConfig(raw: unknown, rowId: string): AutomationTrigger {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    // Default seguro: manual trigger si el campo está vacío o es inválido (retrocompat.)
    return { type: 'manual' };
  }

  const obj = raw as Record<string, unknown>;
  const type = obj['type'];

  switch (type) {
    case 'schedule':
      return {
        type: 'schedule',
        cron: typeof obj['cron'] === 'string' ? obj['cron'] : '0 6 * * *',
      };
    case 'webhook':
      return {
        type: 'webhook',
        path: typeof obj['path'] === 'string' ? obj['path'] : '/webhook',
      };
    case 'event':
      return {
        type: 'event',
        eventType: typeof obj['eventType'] === 'string' ? obj['eventType'] : 'unknown',
      };
    case 'manual':
      return { type: 'manual' };
    default:
      // Default seguro para valores legacy desconocidos
      return { type: 'manual' };
  }

  // Supresión de TS: el switch es exhaustivo con el default.
  void rowId;
}

/**
 * Parsea retry_policy desde jsonb.
 * Si el campo está vacío o tiene valores inválidos, usa el default del dominio.
 */
function parseRetryPolicy(raw: unknown, rowId: string): AutomationRetryPolicy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_AUTOMATION_RETRY_POLICY;
  }

  const obj = raw as Record<string, unknown>;
  const maxAttempts       = typeof obj['maxAttempts']       === 'number' ? obj['maxAttempts']       : DEFAULT_AUTOMATION_RETRY_POLICY.maxAttempts;
  const initialDelayMs    = typeof obj['initialDelayMs']    === 'number' ? obj['initialDelayMs']    : DEFAULT_AUTOMATION_RETRY_POLICY.initialDelayMs;
  const backoffMultiplier = typeof obj['backoffMultiplier'] === 'number' ? obj['backoffMultiplier'] : DEFAULT_AUTOMATION_RETRY_POLICY.backoffMultiplier;
  const maxDelayMs        = typeof obj['maxDelayMs']        === 'number' ? obj['maxDelayMs']        : DEFAULT_AUTOMATION_RETRY_POLICY.maxDelayMs;

  if (
    !Number.isInteger(maxAttempts) || maxAttempts < 1 ||
    !Number.isInteger(initialDelayMs) || initialDelayMs < 0 ||
    backoffMultiplier < 1 ||
    !Number.isInteger(maxDelayMs) || maxDelayMs < 0
  ) {
    return DEFAULT_AUTOMATION_RETRY_POLICY;
  }

  void rowId;
  return { maxAttempts, initialDelayMs, backoffMultiplier, maxDelayMs };
}

// ─── Public mapper ────────────────────────────────────────────────────────────

export function rowToAutomation(row: AutomationRow): Automation {
  return {
    id:             row.id as AutomationId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId:       row.client_id ? (row.client_id as ClientId) : null,
    name:           row.name,
    description:    row.description,
    status:         parseAutomationStatus(row.status, row.id),
    triggerConfig:  parseTriggerConfig(row.trigger_config, row.id),
    retryPolicy:    parseRetryPolicy(row.retry_policy, row.id),
    n8nWorkflowId:  row.n8n_workflow_id ?? null,
    metadata:       parseMetadata(row.metadata, row.id),
    createdAt:      parseDate(row.created_at, 'created_at', row.id),
    updatedAt:      parseDate(row.updated_at, 'updated_at', row.id),
  };
}
