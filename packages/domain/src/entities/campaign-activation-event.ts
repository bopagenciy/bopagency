/**
 * CampaignActivationEvent — entidad de dominio para la tabla
 * `public.campaign_activation_events` (Phase 8A.1).
 *
 * Log de auditoría APPEND-ONLY (audit §10) — nunca se actualiza ni se
 * borra. `targetId` es NULL cuando el evento es a nivel de la activation
 * entera (ej. `activation_created`, `activation_cancelled`) y no-NULL
 * cuando es específico de un canal (ej. `target_status_changed`).
 *
 * Metadata: NUNCA secretos, NUNCA payload crudo de proveedor, NUNCA
 * credenciales — mismo criterio que `AutomationExecution.outputMetadata`
 * (Phase 6A) y `FORBIDDEN_METADATA_KEYS` (Phase 6F). Este módulo NO
 * escribe eventos por sí mismo (no tiene I/O) — solo define el tipo y una
 * función pura de saneamiento reutilizable por application/infrastructure.
 */

import type { OrganizationId } from './organization';
import type { CampaignActivationId } from './campaign-activation';
import type { CampaignActivationTargetId } from './campaign-activation-target';
import type { ActivationEventType } from '@bop-agency/shared';
import { ACTIVATION_EVENT_TYPES } from '@bop-agency/shared';

// ─── Branded ID ───────────────────────────────────────────────────────────────

export type CampaignActivationEventId = string & { readonly _brand: 'CampaignActivationEventId' };

export function campaignActivationEventId(id: string): CampaignActivationEventId {
  if (!id || id.trim().length === 0) {
    throw new Error('CampaignActivationEventId cannot be empty');
  }
  return id as CampaignActivationEventId;
}

// ─── CampaignActivationEvent entity ────────────────────────────────────────────

export type CampaignActivationEvent = {
  readonly id: CampaignActivationEventId;
  readonly organizationId: OrganizationId;
  readonly activationId: CampaignActivationId;
  /** NULL = evento a nivel activation. No-NULL = evento específico de un target. */
  readonly targetId: CampaignActivationTargetId | null;
  readonly eventType: ActivationEventType;
  /** NULL cuando `isSystem === true` (evento generado por el sistema, no por un actor humano). */
  readonly actorUserId: string | null;
  readonly isSystem: boolean;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly note: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
};

// ─── Input type ───────────────────────────────────────────────────────────────

export type CreateActivationEventInput = {
  readonly organizationId: OrganizationId;
  readonly activationId: CampaignActivationId;
  readonly targetId?: CampaignActivationTargetId | null;
  readonly eventType: ActivationEventType;
  readonly actorUserId?: string | null;
  readonly isSystem?: boolean;
  readonly fromStatus?: string | null;
  readonly toStatus?: string | null;
  readonly note?: string | null;
  readonly metadata?: Record<string, unknown>;
};

export function isValidActivationEventType(value: string): value is ActivationEventType {
  return (ACTIVATION_EVENT_TYPES as readonly string[]).includes(value);
}

// ─── Metadata sanitization — mismo criterio que Phase 6F ──────────────────────
//
// Filtra claves cuyo nombre (normalizado a minúsculas) contenga cualquiera
// de los fragmentos prohibidos, sin importar el valor — igual de estricto
// que `FORBIDDEN_METADATA_KEYS` en
// packages/application/src/use-cases/automations/start-execution.use-case.ts.
// Reimplementado aquí (no importado desde `application`, que depende de
// `domain` y no al revés) — duplicación intencional y documentada, mismo
// criterio ya aceptado para `IdempotencyKey` (domain/automation-engine).

const FORBIDDEN_METADATA_KEY_FRAGMENTS = [
  'secret',
  'token',
  'key',
  'password',
  'auth',
  'credential',
  'cred',
  'private',
  'bearer',
  'oauth',
  'email',
  'phone',
  'ssn',
] as const;

export function sanitizeActivationEventMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([k]) => {
      const lower = k.toLowerCase();
      return !FORBIDDEN_METADATA_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment));
    }),
  );
}
