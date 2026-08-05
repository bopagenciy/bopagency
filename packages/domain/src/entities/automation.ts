/**
 * Automation — entidad de dominio para la tabla `public.automations`.
 *
 * Phase 6A — cambios respecto a la versión anterior:
 * - `AutomationStatus` unificado con ciclo de definición:
 *   'draft' | 'active' | 'paused' | 'archived'
 *   - Eliminado 'error' (no es estado de definición; es estado de ejecución).
 *   - Eliminado 'disabled' (reemplazado por 'archived').
 * - Incompatibilidad con valor DB legado 'inactive':
 *   El ENUM de Supabase tiene 'active|inactive|draft|archived'.
 *   Estrategia Phase 6B: mapper transitorio (inactive → paused) en el
 *   SupabaseAutomationRepository mientras se ejecuta la migración SQL
 *   `ALTER TYPE automation_status ADD VALUE 'paused'` y
 *   `UPDATE automations SET status='paused' WHERE status='inactive'`.
 *   NO modificar SQL en Phase 6A.
 * - Añadido: organizationId (multi-tenancy obligatorio).
 * - Añadido: clientId nullable (automatización global o por cliente).
 * - Añadido: triggerConfig (qué dispara la automatización).
 * - Añadido: retryPolicy (política de reintento embebida).
 * - Añadido: n8nWorkflowId nullable (referencia al workflow n8n).
 * - Añadido: metadata (configuración libre en JSON).
 * - Helpers de transición implementados como funciones puras.
 *
 * Restricciones:
 * - domain NO depende de automation-engine, infrastructure, ni apps.
 * - AutomationTrigger definido inline (misma semántica que
 *   AutomationTrigger en automation-engine, sin importar de allí).
 * - AutomationRetryPolicy definido inline (misma forma que RetryPolicy
 *   en automation-engine, sin importar de allí).
 */

import type { OrganizationId } from './organization';
import type { ClientId } from './client';

// ─── Branded ID ───────────────────────────────────────────────────────────────

export type AutomationId = string & { readonly _brand: 'AutomationId' };

export function automationId(id: string): AutomationId {
  if (!id || id.trim().length === 0) {
    throw new Error('AutomationId cannot be empty');
  }
  return id as AutomationId;
}

// ─── AutomationStatus ─────────────────────────────────────────────────────────
//
// Ciclo de vida canónico del dominio:
//   draft → active → paused → active (reversible)
//   active → archived
//   paused → archived
//   draft  → archived (cancelar antes de activar)
//
// Incompatibilidad DB:
//   'inactive' (DB legacy) → 'paused' (dominio)
//   Mapper transitorio en Phase 6B hasta ejecutar migración SQL.

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived';

// ─── AutomationTrigger ────────────────────────────────────────────────────────
//
// Definido inline para evitar dependencia circular con automation-engine.
// Semánticamente equivalente a AutomationTrigger en automation-engine.

export type AutomationTrigger =
  | { readonly type: 'schedule'; readonly cron: string }
  | { readonly type: 'webhook'; readonly path: string }
  | { readonly type: 'event'; readonly eventType: string }
  | { readonly type: 'manual' };

// ─── AutomationRetryPolicy ────────────────────────────────────────────────────
//
// Definido inline para evitar dependencia circular con automation-engine.
// Misma forma que RetryPolicy en automation-engine.

export type AutomationRetryPolicy = {
  readonly maxAttempts: number;
  readonly initialDelayMs: number;
  readonly backoffMultiplier: number;
  readonly maxDelayMs: number;
};

export const DEFAULT_AUTOMATION_RETRY_POLICY: AutomationRetryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 30_000,
};

// ─── Automation entity ────────────────────────────────────────────────────────

export type Automation = {
  readonly id: AutomationId;
  readonly organizationId: OrganizationId;
  /** Null = automatización global de la organización; non-null = vinculada a un cliente. */
  readonly clientId: ClientId | null;
  readonly name: string;
  readonly description: string | null;
  readonly status: AutomationStatus;
  readonly triggerConfig: AutomationTrigger;
  readonly retryPolicy: AutomationRetryPolicy;
  /** ID del workflow en n8n. Null hasta que sea provisionado. */
  readonly n8nWorkflowId: string | null;
  /** Metadatos libres — NO almacenar secretos aquí. */
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── AutomationFilter ─────────────────────────────────────────────────────────

export type AutomationFilter = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly status?: AutomationStatus;
};

// ─── CreateAutomationInput ────────────────────────────────────────────────────

export type CreateAutomationInput = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId | null;
  readonly name: string;
  readonly description?: string | null;
  readonly triggerConfig: AutomationTrigger;
  readonly retryPolicy?: AutomationRetryPolicy;
  readonly n8nWorkflowId?: string | null;
  readonly metadata?: Record<string, unknown>;
};

// ─── Transition rules ─────────────────────────────────────────────────────────
//
// Tabla de transiciones de AutomationStatus:
//
// | Desde    | Hacia             | Descripción                          |
// |----------|-------------------|--------------------------------------|
// | draft    | active            | Activar — requiere rol admin         |
// | draft    | archived          | Descartar borrador                   |
// | active   | paused            | Pausar — requiere rol operator       |
// | active   | archived          | Archivar definitivamente             |
// | paused   | active            | Reactivar                            |
// | paused   | archived          | Archivar desde pausa                 |
// | archived | (ninguna)         | Estado final — requiere restauración |
//
// Restricción: no se puede activar una automatización archivada sin
// una decisión explícita de restauración (use case separado en Phase 6D).

const AUTOMATION_TRANSITIONS: Record<AutomationStatus, AutomationStatus[]> = {
  draft: ['active', 'archived'],
  active: ['paused', 'archived'],
  paused: ['active', 'archived'],
  archived: [], // estado final — restauración es una operación explícita
};

/**
 * Retorna `true` si la transición de `from` a `to` es válida.
 */
export function canTransitionAutomation(from: AutomationStatus, to: AutomationStatus): boolean {
  return AUTOMATION_TRANSITIONS[from].includes(to);
}

/**
 * Retorna los estados válidos a los que puede transicionar desde `status`.
 */
export function getAutomationNextStates(status: AutomationStatus): AutomationStatus[] {
  return [...AUTOMATION_TRANSITIONS[status]];
}

/**
 * Retorna `true` si la automatización puede ser activada.
 * Una automatización archivada NO puede activarse directamente.
 */
export function canActivateAutomation(status: AutomationStatus): boolean {
  return canTransitionAutomation(status, 'active');
}

/**
 * Retorna `true` si la automatización puede ser pausada.
 */
export function canPauseAutomation(status: AutomationStatus): boolean {
  return canTransitionAutomation(status, 'paused');
}

/**
 * Retorna `true` si la automatización puede ser archivada.
 */
export function canArchiveAutomation(status: AutomationStatus): boolean {
  return canTransitionAutomation(status, 'archived');
}

/**
 * Retorna `true` si `status` es un estado terminal (no permite más transiciones).
 * En el dominio de definición, `archived` es el único estado final.
 */
export function isAutomationTerminal(status: AutomationStatus): boolean {
  return AUTOMATION_TRANSITIONS[status].length === 0;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Valida que el nombre de una automatización no esté vacío ni sea solo espacios.
 */
export function isValidAutomationName(name: string): boolean {
  return name.trim().length > 0 && name.trim().length <= 255;
}
