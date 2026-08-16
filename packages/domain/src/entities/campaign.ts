import type { ClientId } from './client';
import type { OrganizationId } from './organization';
import type { AdPlatform } from '@bop-agency/shared';
import type { CampaignStatus } from '@bop-agency/shared';

// ─── Branded ID ───────────────────────────────────────────────────────────────

export type CampaignId = string & { readonly _brand: 'CampaignId' };

// ─── Enums / Unions ───────────────────────────────────────────────────────────

export type CampaignObjective =
  | 'brand_awareness'
  | 'reach'
  | 'traffic'
  | 'engagement'
  | 'lead_generation'
  | 'conversions'
  | 'catalog_sales';

// ─── Core Campaign entity ─────────────────────────────────────────────────────
//
// Phase 7B — reconciliación con la entidad Campaign de Phase 1:
// - organizationId: NUEVO. Toda campaña pertenece obligatoriamente a una
//   organización (regla de negocio fijada). Corrige el gap documentado en
//   PHASE_7_AUDIT.md §1.1 / PHASE_7_RISK_REGISTER.md R-DOM-01.
// - budget/currency/startDate/endDate: CONSERVADOS de Phase 1 — no son
//   columnas nuevas inventadas para 7B, son parte del dominio ya aprobado.
// - brief/generatedContent/metadata/createdBy/updatedBy/
//   submittedForReviewAt/approvedAt/rejectedAt: NUEVOS, preparan la
//   persistencia y el flujo de aprobación (Phase 7C) / IA (Phase 7D).
export type Campaign = {
  readonly id: CampaignId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly name: string;
  readonly platform: AdPlatform;
  readonly objective: CampaignObjective;
  readonly status: CampaignStatus;
  /** Brief/input de la campaña (creativo, dirección, contexto). NULL si se creó sin brief. */
  readonly brief: string | null;
  readonly budget: number;
  readonly currency: string;
  readonly startDate: Date | null;
  readonly endDate: Date | null;
  /**
   * Contenido estructurado generado por IA (Phase 7D). NULL hasta entonces.
   * Su sola presencia NUNCA implica aprobación automática (regla de negocio fijada).
   */
  readonly generatedContent: Record<string, unknown> | null;
  readonly metadata: Record<string, unknown>;
  readonly createdBy: string;
  readonly updatedBy: string | null;
  readonly submittedForReviewAt: Date | null;
  readonly approvedAt: Date | null;
  readonly rejectedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── Filter ───────────────────────────────────────────────────────────────────

export type CampaignFilter = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly status?: CampaignStatus;
  readonly platform?: AdPlatform;
};

// ─── Input types ──────────────────────────────────────────────────────────────

/** Input de creación — usado por CampaignRepository.create() y por createCampaignDraft. */
export type CreateCampaignInput = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly name: string;
  readonly platform: AdPlatform;
  readonly objective: CampaignObjective;
  readonly brief?: string | null;
  readonly budget: number;
  readonly currency?: string;
  readonly startDate?: Date | null;
  readonly endDate?: Date | null;
  readonly metadata?: Record<string, unknown>;
  readonly createdBy: string;
};

/**
 * Input de actualización — Phase 7B solo cubre edición de campañas en
 * 'draft' (regla de negocio #4). Transiciones de status a 'approved'/
 * 'rejected' NO pasan por aquí — pertenecen a Phase 7C (RPC dedicada).
 */
export type UpdateCampaignInput = {
  readonly name?: string;
  readonly platform?: AdPlatform;
  readonly objective?: CampaignObjective;
  readonly brief?: string | null;
  readonly budget?: number;
  readonly currency?: string;
  readonly startDate?: Date | null;
  readonly endDate?: Date | null;
  readonly metadata?: Record<string, unknown>;
  /** Único status alcanzable vía update genérico (regla de negocio #5). */
  readonly status?: 'draft' | 'review';
  readonly updatedBy: string;
};

// ─── Transition rules ─────────────────────────────────────────────────────────
//
// Grafo de transiciones válidas de CampaignStatus.
//
//   draft     → review
//   review    → approved, rejected
//   approved  → active                  (fase de publicación posterior)
//   active    → paused, completed       (fase de publicación posterior)
//   paused    → active, completed       (fase de publicación posterior)
//   completed → (ninguna — estado final)
//   rejected  → (ninguna — estado final; no se modela resubmisión en Phase 7B/7C)
//
// Esta función es una invariante PURA de dominio: no decide QUIÉN puede
// ejecutar la transición (eso es autorización — RLS + use cases), solo SI
// la transición es válida dado el grafo de estados. Ningún use case de
// Phase 7B la invoca todavía (createCampaignDraft solo crea en 'draft');
// queda lista para approveCampaign/rejectCampaign/submitCampaignForReview
// en Phase 7C.
const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ['review'],
  review: ['approved', 'rejected'],
  approved: ['active'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed'],
  completed: [],
  rejected: [],
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to);
}

export function getCampaignNextStates(status: CampaignStatus): CampaignStatus[] {
  return [...CAMPAIGN_TRANSITIONS[status]];
}

/** Retorna `true` si el estado es terminal (sin transiciones salientes). */
export function isCampaignStatusTerminal(status: CampaignStatus): boolean {
  return CAMPAIGN_TRANSITIONS[status].length === 0;
}
