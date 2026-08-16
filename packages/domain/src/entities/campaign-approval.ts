import type { OrganizationId } from './organization';
import type { CampaignId } from './campaign';

/**
 * CampaignApproval — Phase 7B (tipo) / Phase 7C (repositorio + invariantes).
 *
 * Modela el audit trail append-only de decisiones sobre una campaña
 * (tabla `campaign_approvals`). Phase 7B solo definió el tipo. Phase 7C
 * agrega `CampaignApprovalRepository` (solo lectura — findByCampaignId/
 * findLatestByCampaignId) porque ahora sí hay callers reales
 * (listCampaignApprovals). La ESCRITURA de filas en `campaign_approvals`
 * ocurre EXCLUSIVAMENTE dentro de las RPCs `approve_campaign`/
 * `reject_campaign` (SECURITY DEFINER) — ver
 * 20260816140000_phase7c_campaign_approval_workflow.sql. No existe (ni debe
 * existir) un método `create`/`insert` en el repositorio de dominio: crearlo
 * invitaría a escribir el audit trail por fuera del workflow atómico de
 * aprobación, exactamente lo que Phase 7C decidió cerrar (ver "Cambios en
 * campaign_approvals" en PHASE_7C_APPROVAL_COMPLIANCE_REPORT.md).
 */
export type CampaignApprovalId = string & { readonly _brand: 'CampaignApprovalId' };

export type CampaignApprovalAction = 'approved' | 'rejected';

export type CampaignApproval = {
  readonly id: CampaignApprovalId;
  readonly organizationId: OrganizationId;
  readonly campaignId: CampaignId;
  readonly action: CampaignApprovalAction;
  /** Requerida (no vacía) cuando action === 'rejected' — reforzado también por CHECK en BD y por la RPC. */
  readonly note: string | null;
  readonly actorUserId: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
};

// ─── Invariantes puras — Phase 7C ──────────────────────────────────────────────
//
// isValidRejectionNote replica, a nivel de dominio, la misma regla que ya
// existe en dos capas de BD (CHECK ck_campaign_approvals_rejection_note en
// campaign_approvals, y la validación explícita dentro de reject_campaign()):
// una nota de rechazo no puede ser null, undefined, ni contener solo
// espacios en blanco. Tenerla también aquí permite que el use case
// rejectCampaign falle rápido (VALIDATION_ERROR) antes de siquiera llamar al
// repositorio/RPC, sin duplicar la política en cada capa que la necesite.

/** Regla de negocio fijada #7: el rechazo exige nota no vacía (trimmed). */
export function isValidRejectionNote(note: string | null | undefined): boolean {
  return typeof note === 'string' && note.trim().length > 0;
}
