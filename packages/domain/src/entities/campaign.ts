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
   * Contenido estructurado generado por IA (Phase 7D — ver
   * `CampaignGeneratedContent` en `campaign-generated-content.ts`). NULL
   * hasta entonces. Su sola presencia NUNCA implica aprobación automática
   * (regla de negocio fijada — ver `generateCampaignDraftWithAI`, que SIEMPRE
   * persiste en status 'draft', jamás 'review'/'approved').
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
  /**
   * Phase 7D: contenido generado por IA, ya validado (Zod +
   * discriminated union por plataforma) antes de llegar aquí. `createCampaignDraft`
   * (7B, creación manual) nunca lo envía — solo `generateCampaignDraftWithAI`.
   */
  readonly generatedContent?: Record<string, unknown> | null;
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
  /**
   * Phase 7D: usado exclusivamente por `regenerateCampaignContent` para
   * reemplazar el contenido generado de una campaña que sigue en 'draft'.
   * Ya validado (mismo contrato que `CreateCampaignInput.generatedContent`).
   */
  readonly generatedContent?: Record<string, unknown> | null;
  /** Único status alcanzable vía update genérico (regla de negocio #5). */
  readonly status?: 'draft' | 'review';
  readonly updatedBy: string;
};

// ─── Campaign name rules — Phase 7D.1.1 ───────────────────────────────────────
//
// PROBLEMA OBSERVADO EN EL SMOKE: la generación con IA producía nombres de
// campaña absurdamente largos, porque `generateCampaignDraftWithAI` usaba el
// `campaignConcept` COMPLETO (un párrafo narrativo) truncado a 200 caracteres.
// El resultado llenaba la tabla y el detalle con una frase entera.
//
// Regla fijada:
//   1. Si el usuario proporcionó un nombre, ESE es el nombre. Punto.
//   2. Si no, se deriva un título CONCISO del concepto generado: se recorta en
//      el primer límite de oración/cláusula y se acota a
//      `AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH`, cortando en frontera de palabra.
//   3. Si no queda nada utilizable, se usa un fallback determinístico.
//
// No requiere ningún cambio en el schema de `generated_content`: se deriva del
// `campaignConcept` que ya existe.

/** Límite duro, alineado con el CHECK de BD `char_length(name) BETWEEN 1 AND 200`. */
export const CAMPAIGN_NAME_MAX_LENGTH = 200;

/**
 * Límite para nombres DERIVADOS por IA. Deliberadamente muy por debajo del
 * límite de BD: un título de campaña debe caber en una celda de tabla y en un
 * breadcrumb, no ocupar dos líneas.
 */
export const AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH = 80;

/** Separadores donde se corta un concepto narrativo para quedarse con el titular. */
const SENTENCE_BOUNDARY = /[.!?;\n\r]|\s[—–]\s|:\s/;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateAtWordBoundary(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const hardCut = value.slice(0, maxLength - 1);
  const lastSpace = hardCut.lastIndexOf(' ');
  // Solo se respeta la frontera de palabra si no deja un título ridículamente
  // corto (p. ej. una primera "palabra" de 70 caracteres sin espacios).
  const base = lastSpace > maxLength * 0.5 ? hardCut.slice(0, lastSpace) : hardCut;
  return `${base.trimEnd()}…`;
}

/**
 * Deriva un nombre de campaña conciso a partir del concepto generado por IA.
 *
 * @param concept  `campaignConcept` del contenido generado (puede ser un párrafo).
 * @param fallback Nombre determinístico si el concepto no aporta nada usable.
 */
export function deriveCampaignNameFromConcept(concept: string, fallback: string): string {
  // El corte se busca sobre el texto ORIGINAL (solo trim), no sobre el ya
  // colapsado: un salto de línea es un límite de titular válido y se perdería
  // si antes se convirtiera en un espacio.
  const raw = (concept ?? '').trim();
  if (raw.length === 0) return fallback;

  const boundaryMatch = SENTENCE_BOUNDARY.exec(raw);
  const headline =
    boundaryMatch && boundaryMatch.index > 0
      ? collapseWhitespace(raw.slice(0, boundaryMatch.index))
      : collapseWhitespace(raw);

  const candidate = headline.length > 0 ? headline : collapseWhitespace(raw);
  const concise = truncateAtWordBoundary(candidate, AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH);
  return concise.length > 0 ? concise : fallback;
}

/**
 * Nombre final de una campaña creada vía IA. El nombre del usuario, si existe,
 * SIEMPRE gana — la IA nunca sobrescribe una decisión explícita del usuario.
 */
export function resolveAiCampaignName(params: {
  readonly userProvidedName?: string | undefined;
  readonly concept: string;
  readonly fallback: string;
}): string {
  const userName = params.userProvidedName?.trim() ?? '';
  if (userName.length > 0) {
    return userName.length > CAMPAIGN_NAME_MAX_LENGTH
      ? truncateAtWordBoundary(userName, CAMPAIGN_NAME_MAX_LENGTH)
      : userName;
  }
  return deriveCampaignNameFromConcept(params.concept, params.fallback);
}

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
