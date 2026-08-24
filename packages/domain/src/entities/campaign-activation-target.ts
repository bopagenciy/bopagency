/**
 * CampaignActivationTarget — entidad de dominio para la tabla
 * `public.campaign_activation_targets` (Phase 8A.1).
 *
 * Representa UN canal de distribución dentro de una CampaignActivation
 * (audit §7). El canal `manual` es de primera clase (audit §8) — es la
 * MISMA entidad e implementación que un canal automatizado futuro, solo
 * que sin `clientIntegrationId` y sin fase de `publishing` intermedia
 * obligatoria (el operador puede ir de `ready` directo a `published`).
 */

import type { OrganizationId } from './organization';
import type { ClientId } from './client';
import type { ClientIntegrationId } from './client';
import type { CampaignActivationId } from './campaign-activation';
import type {
  ActivationChannel,
  ActivationProvider,
  ActivationTargetStatus,
} from '@bop-agency/shared';
import {
  ACTIVATION_TARGET_TERMINAL_STATUSES,
  isValidChannelProviderPair,
} from '@bop-agency/shared';

// ─── Branded ID ───────────────────────────────────────────────────────────────

export type CampaignActivationTargetId = string & { readonly _brand: 'CampaignActivationTargetId' };

export function campaignActivationTargetId(id: string): CampaignActivationTargetId {
  if (!id || id.trim().length === 0) {
    throw new Error('CampaignActivationTargetId cannot be empty');
  }
  return id as CampaignActivationTargetId;
}

// ─── CampaignActivationTarget entity ───────────────────────────────────────────

export type CampaignActivationTarget = {
  readonly id: CampaignActivationTargetId;
  readonly activationId: CampaignActivationId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  readonly placement: string | null;
  /** NULL siempre que channel === 'manual'. No-NULL para canales con proveedor real (8E/8F). */
  readonly clientIntegrationId: ClientIntegrationId | null;
  readonly status: ActivationTargetStatus;
  /** Freeform en el MVP (jsonb) — ver audit §15, estructurado en 8D. */
  readonly readinessChecklist: Record<string, unknown>;
  readonly scheduledAt: Date | null;
  readonly publishedAt: Date | null;
  readonly publishedBy: string | null;
  /** Referencia externa opcional (post id, ad id) — nunca una credencial. */
  readonly externalReference: string | null;
  readonly failedAt: Date | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly cancelledAt: Date | null;
  readonly cancelledBy: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── Filter ───────────────────────────────────────────────────────────────────

export type CampaignActivationTargetFilter = {
  readonly activationId: CampaignActivationId;
  readonly organizationId: OrganizationId;
  readonly status?: ActivationTargetStatus;
};

// ─── Input types ──────────────────────────────────────────────────────────────

export type CreateActivationTargetInput = {
  readonly activationId: CampaignActivationId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  readonly placement?: string | null;
  readonly clientIntegrationId?: ClientIntegrationId | null;
  readonly metadata?: Record<string, unknown>;
};

/**
 * Valida la invariante channel/provider/manual ANTES de llegar al
 * repositorio (defensa en profundidad — la migración también la refuerza
 * vía CHECK, ver audit §11/§15). Retorna el primer mensaje de error, o
 * `null` si el input es válido.
 */
export function validateCreateActivationTargetInput(
  input: Pick<CreateActivationTargetInput, 'channel' | 'provider' | 'clientIntegrationId'>,
): string | null {
  if (!isValidChannelProviderPair(input.channel, input.provider)) {
    return `El canal "${input.channel}" no corresponde al proveedor "${input.provider}"`;
  }
  if (input.channel === 'manual' && input.clientIntegrationId) {
    return 'Un target manual no debe referenciar una client_integration';
  }
  if (input.channel !== 'manual' && !input.clientIntegrationId) {
    return `El canal "${input.channel}" requiere una client_integration (clientIntegrationId)`;
  }
  return null;
}

// ─── Transition rules — audit §6.B ─────────────────────────────────────────────
//
//   pending   → preparing, cancelled
//   preparing → ready, cancelled
//   ready     → scheduled, publishing, published, cancelled   (manual: ready → published directo)
//   scheduled → publishing, published, cancelled
//   publishing→ published, failed                              (sin cancelación mientras publica)
//   published / failed / cancelled → (terminal)

const ACTIVATION_TARGET_TRANSITIONS: Record<ActivationTargetStatus, ActivationTargetStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['scheduled', 'publishing', 'published', 'cancelled'],
  scheduled: ['publishing', 'published', 'cancelled'],
  publishing: ['published', 'failed'],
  published: [],
  failed: [],
  cancelled: [],
};

export function canTransitionActivationTarget(
  from: ActivationTargetStatus,
  to: ActivationTargetStatus,
): boolean {
  return ACTIVATION_TARGET_TRANSITIONS[from].includes(to);
}

export function getActivationTargetNextStates(
  status: ActivationTargetStatus,
): ActivationTargetStatus[] {
  return [...ACTIVATION_TARGET_TRANSITIONS[status]];
}

export function isActivationTargetStatusTerminal(status: ActivationTargetStatus): boolean {
  return (ACTIVATION_TARGET_TERMINAL_STATUSES as readonly ActivationTargetStatus[]).includes(status);
}

/**
 * Retorna `true` si el target puede marcarse `published` directamente desde
 * `status` — cubre tanto el camino manual (`ready → published`) como el
 * automatizado futuro (`publishing → published`). Nunca desde `pending`
 * (regla explícita del audit §6.B: "pending → published directo: inválido").
 */
export function canMarkActivationTargetPublished(status: ActivationTargetStatus): boolean {
  return canTransitionActivationTarget(status, 'published');
}

export function canCancelActivationTarget(status: ActivationTargetStatus): boolean {
  return canTransitionActivationTarget(status, 'cancelled');
}
