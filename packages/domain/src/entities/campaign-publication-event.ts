/**
 * CampaignPublicationEvent - entidad de dominio para la tabla
 * `public.campaign_publication_events` (Phase 8B.1).
 *
 * Log de auditoria APPEND-ONLY, separado deliberadamente de
 * `campaign_activation_events` (audit S3.2 - volumen/ruido distinto,
 * owner de escritura distinto). `jobId` es SIEMPRE NOT NULL (a diferencia
 * de `campaign_activation_events.target_id`, que es opcional) - todo
 * evento de publicacion pertenece a un job real. `attemptId` es opcional -
 * NULL para eventos a nivel job (ej. `job_cancelled`).
 *
 * Metadata: NUNCA secretos/tokens/payload crudo de proveedor - mismo
 * criterio que `sanitizeActivationEventMetadata` (reimplementado aqui,
 * duplicacion intencional documentada, mismo criterio ya aceptado entre
 * domain/automation-engine).
 */

import type { OrganizationId } from './organization';
import type { CampaignPublicationJobId } from './campaign-publication-job';
import type { CampaignPublicationAttemptId } from './campaign-publication-attempt';
import type { PublicationEventType } from '@bop-agency/shared';
import { PUBLICATION_EVENT_TYPES } from '@bop-agency/shared';

// --- Branded ID ---

export type CampaignPublicationEventId = string & { readonly _brand: 'CampaignPublicationEventId' };

export function campaignPublicationEventId(id: string): CampaignPublicationEventId {
  if (!id || id.trim().length === 0) {
    throw new Error('CampaignPublicationEventId cannot be empty');
  }
  return id as CampaignPublicationEventId;
}

// --- CampaignPublicationEvent entity ---

export type CampaignPublicationEvent = {
  readonly id: CampaignPublicationEventId;
  readonly organizationId: OrganizationId;
  readonly jobId: CampaignPublicationJobId;
  readonly attemptId: CampaignPublicationAttemptId | null;
  readonly eventType: PublicationEventType;
  /** NULL cuando `isSystem === true` (evento generado por RPC de sistema/webhook, sin actor humano). */
  readonly actorUserId: string | null;
  readonly isSystem: boolean;
  readonly note: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
};

export type CreatePublicationEventInput = {
  readonly organizationId: OrganizationId;
  readonly jobId: CampaignPublicationJobId;
  readonly attemptId?: CampaignPublicationAttemptId | null;
  readonly eventType: PublicationEventType;
  readonly actorUserId?: string | null;
  readonly isSystem?: boolean;
  readonly note?: string | null;
  readonly metadata?: Record<string, unknown>;
};

export function isValidPublicationEventType(value: string): value is PublicationEventType {
  return (PUBLICATION_EVENT_TYPES as readonly string[]).includes(value);
}

// --- Metadata sanitization - mismo criterio que campaign-activation-event.ts ---

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

export function sanitizePublicationEventMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([k]) => {
      const lower = k.toLowerCase();
      return !FORBIDDEN_METADATA_KEY_FRAGMENTS.some((fragment) => lower.includes(fragment));
    }),
  );
}
