/**
 * CampaignActivation — entidad de dominio para la tabla
 * `public.campaign_activations` (Phase 8A.1).
 *
 * Ver docs/implementation/phase-8/PHASE_8A_ACTIVATION_AUDIT.md §4/§5/§6/§14
 * para la justificación completa de diseño. Resumen de las decisiones ya
 * aprobadas (NO reabiertas en 8A.1 — ver PHASE_8A1 kickoff §2):
 *
 * - Approval != Publication: crear una activation NUNCA publica nada.
 * - La creación de una activation es SIEMPRE explícita (nunca automática al
 *   aprobar una campaña) — ese use case seguro se implementa en 8A.2, no
 *   aquí; este archivo solo define el modelo y sus invariantes puras.
 * - El snapshot aprobado es INMUTABLE desde la perspectiva de dominio: este
 *   módulo no expone ninguna función para "actualizar" un snapshot.
 * - CampaignActivation es dominio de negocio — nunca se fusiona con
 *   `AutomationExecution` (runtime técnico, ver automation-execution.ts).
 * - Crear una activation NUNCA transiciona `Campaign.status` a 'active' —
 *   la activation tiene un lifecycle propio, completamente separado del de
 *   `Campaign`.
 */

import type { OrganizationId } from './organization';
import type { ClientId } from './client';
import type { CampaignId, CampaignObjective } from './campaign';
import type { CampaignApprovalId } from './campaign-approval';
import type { CampaignGeneratedContent } from './campaign-generated-content';
import type {
  AdPlatform,
  ActivationStatus,
  ActivationTargetStatus,
  GoogleAdsActivationConfigShape as GoogleAdsActivationConfig,
} from '@bop-agency/shared';
import { ACTIVATION_TERMINAL_STATUSES } from '@bop-agency/shared';

export type { GoogleAdsActivationConfig };

// ─── Branded ID ───────────────────────────────────────────────────────────────

export type CampaignActivationId = string & { readonly _brand: 'CampaignActivationId' };

export function campaignActivationId(id: string): CampaignActivationId {
  if (!id || id.trim().length === 0) {
    throw new Error('CampaignActivationId cannot be empty');
  }
  return id as CampaignActivationId;
}

// ─── Snapshot — audit §14 (Opción B: JSON embebido, inmutable) ────────────────
//
// Contenido exacto congelado en el momento de creación de la activation, a
// partir de la campaña real + su última aprobación. NUNCA se actualiza
// después de creado — ningún método de este módulo, del repositorio, ni de
// ningún use case futuro debe exponer una operación de "actualizar
// snapshot". Si una futura fase necesita reflejar un cambio de campaign,
// la respuesta es crear una NUEVA CampaignActivation, no mutar esta.

export const ACTIVATION_SNAPSHOT_SCHEMA_VERSION = 'activation-snapshot-v1' as const;
export type ActivationSnapshotSchemaVersion = typeof ACTIVATION_SNAPSHOT_SCHEMA_VERSION;

export type CampaignActivationSnapshotCampaign = {
  readonly id: CampaignId;
  readonly name: string;
  readonly objective: CampaignObjective;
  readonly platform: AdPlatform;
  readonly budget: number;
  readonly currency: string;
  readonly startDate: string | null;
  readonly endDate: string | null;
};

export type CampaignActivationSnapshotApproval = {
  readonly campaignApprovalId: CampaignApprovalId;
  readonly approvedAt: string;
  readonly approvedBy: string;
};

/**
 * Value object explícito y tipado — deliberadamente NO un
 * `Record<string, unknown>` sin estructura (instrucción explícita del
 * kickoff de 8A.1 §5). Serializable 1:1 a JSON para persistir en
 * `campaign_activations.approved_snapshot` (jsonb).
 */
export type CampaignActivationSnapshot = {
  readonly schemaVersion: ActivationSnapshotSchemaVersion;
  readonly campaign: CampaignActivationSnapshotCampaign;
  readonly generatedContent: CampaignGeneratedContent | null;
  readonly metadata: Record<string, unknown>;
  readonly approval: CampaignActivationSnapshotApproval;
  readonly googleAdsConfig?: GoogleAdsActivationConfig | null;
};

// ─── CampaignActivation entity ─────────────────────────────────────────────────

export type CampaignActivation = {
  readonly id: CampaignActivationId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId: CampaignId;
  /** Aprobación real que autorizó esta activation — ver audit §13/§15. */
  readonly campaignApprovalId: CampaignApprovalId;
  readonly status: ActivationStatus;
  readonly approvedSnapshot: CampaignActivationSnapshot;
  readonly scheduledAt: Date | null;
  readonly preparedAt: Date | null;
  readonly readyAt: Date | null;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelledBy: string | null;
  /** Requerida (no vacía) cuando status === 'cancelled' — mismo criterio que campaign_approvals.note en rechazos. */
  readonly cancellationReason: string | null;
  readonly notes: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdBy: string;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── Filter ───────────────────────────────────────────────────────────────────

export type CampaignActivationFilter = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly campaignId?: CampaignId;
  readonly status?: ActivationStatus;
};

// ─── Input types ──────────────────────────────────────────────────────────────
//
// CreateCampaignActivationInput recibe el snapshot YA CONSTRUIDO (por el
// caller — el use case seguro de 8A.2). Este módulo no construye el
// snapshot a partir de una Campaign real (eso requeriría leer
// CampaignRepository/CampaignApprovalRepository, que es responsabilidad de
// application, no de domain).

export type CreateCampaignActivationInput = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId: CampaignId;
  readonly campaignApprovalId: CampaignApprovalId;
  readonly approvedSnapshot: CampaignActivationSnapshot;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly createdBy: string;
};

// ─── Transition rules — audit §6.A ─────────────────────────────────────────────
//
//   pending   → preparing, cancelled
//   preparing → ready, cancelled
//   ready     → scheduled, executing, cancelled
//   scheduled → executing, cancelled
//   executing → completed, partially_completed, failed
//   completed / partially_completed / failed / cancelled → (terminal)
//
// `cancelled` es SIEMPRE una transición COMANDADA explícitamente (nunca
// derivada) y solo válida antes de `executing` — una vez que un target
// entró en `publishing` no hay cancelación de la activation en 8A.1 (ver
// audit R-ACT-10: cancelación durante ejecución se difiere a 8B).
// El resto de transiciones normalmente se DERIVAN de los targets vía
// `deriveActivationStatus` — este grafo es la autoridad de qué transición
// es válida, la usen o no explícitamente los callers.

const ACTIVATION_TRANSITIONS: Record<ActivationStatus, ActivationStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['scheduled', 'executing', 'cancelled'],
  scheduled: ['executing', 'cancelled'],
  executing: ['completed', 'partially_completed', 'failed'],
  completed: [],
  partially_completed: [],
  failed: [],
  cancelled: [],
};

export function canTransitionActivation(from: ActivationStatus, to: ActivationStatus): boolean {
  return ACTIVATION_TRANSITIONS[from].includes(to);
}

export function getActivationNextStates(status: ActivationStatus): ActivationStatus[] {
  return [...ACTIVATION_TRANSITIONS[status]];
}

export function isActivationStatusTerminal(status: ActivationStatus): boolean {
  return (ACTIVATION_TERMINAL_STATUSES as readonly ActivationStatus[]).includes(status);
}

/** Retorna `true` si la activation puede cancelarse explícitamente desde `status`. */
export function canCancelActivation(status: ActivationStatus): boolean {
  return canTransitionActivation(status, 'cancelled');
}

// ─── deriveActivationStatus — audit §6.A ───────────────────────────────────────
//
// El status de la activation se DERIVA de los status de sus targets — no se
// setea libremente (evita inconsistencia entre "lo que dicen los targets" y
// "lo que dice la activation", ver audit §6.A). Función PURA, sin I/O.
//
// Reglas (en orden de evaluación):
// 1. Sin targets → 'pending'.
// 2. Todos los targets en estado terminal (published/failed/cancelled):
//    - Al menos un published y ningún failed → 'completed'.
//    - Al menos un published y al menos un failed → 'partially_completed'
//      (NUNCA oculta un fallo parcial como éxito — principio central del
//      audit §2: approval != publication, y "falla en un canal no debe
//      esconderse").
//    - Ningún published, al menos un failed → 'failed'.
//    - Ningún published, ningún failed (todos cancelled) → 'cancelled'.
// 3. Si no todos son terminales:
//    - Algún target 'publishing' → 'executing'.
//    - Algún target 'scheduled' (y ninguno 'publishing') → 'scheduled'.
//    - Todos los targets 'pending' → 'pending'.
//    - Si todos los targets no-terminales están en 'ready' (con o sin
//      terminales ya resueltos) → 'ready'.
//    - En cualquier otro caso intermedio → 'preparing'.

export function deriveActivationStatus(
  targetStatuses: readonly ActivationTargetStatus[],
): ActivationStatus {
  if (targetStatuses.length === 0) return 'pending';

  const isTerminal = (s: string) => s === 'published' || s === 'failed' || s === 'cancelled';
  const allTerminal = targetStatuses.every(isTerminal);

  if (allTerminal) {
    const publishedCount = targetStatuses.filter((s) => s === 'published').length;
    const failedCount = targetStatuses.filter((s) => s === 'failed').length;

    if (publishedCount > 0 && failedCount === 0) return 'completed';
    if (publishedCount > 0 && failedCount > 0) return 'partially_completed';
    if (publishedCount === 0 && failedCount > 0) return 'failed';
    return 'cancelled'; // publishedCount === 0 && failedCount === 0 → todos cancelled
  }

  if (targetStatuses.some((s) => s === 'publishing')) return 'executing';
  if (targetStatuses.some((s) => s === 'scheduled')) return 'scheduled';
  if (targetStatuses.every((s) => s === 'pending')) return 'pending';

  const nonTerminal = targetStatuses.filter((s) => !isTerminal(s));
  if (nonTerminal.length > 0 && nonTerminal.every((s) => s === 'ready')) return 'ready';

  return 'preparing';
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Regla de negocio: cancelar exige una razón no vacía (mismo criterio que isValidRejectionNote). */
export function isValidCancellationReason(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && reason.trim().length > 0;
}
