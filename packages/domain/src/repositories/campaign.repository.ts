/**
 * CampaignRepository — contrato de dominio para la tabla `campaigns`.
 *
 * Phase 7B: findById, findAll (paginado + filtros), create, update.
 * NO incluye delete(): el dominio no define un concepto de borrado de
 * campañas (ni físico ni soft-delete). Los estados (`CampaignStatus`) son el
 * mecanismo de ciclo de vida; `rejected`/`completed` son terminales pero
 * preservan el registro para auditoría (campaign_approvals referencia
 * campaigns con ON DELETE RESTRICT). Si en el futuro se necesita archivar o
 * descartar un draft, la recomendación es añadir un estado `archived`
 * documentado a `CampaignStatus`, no reintroducir un borrado — ver
 * PHASE_7B_PERSISTENCE_REPORT.md "Deuda técnica diferida a 7C".
 *
 * Phase 7C: agrega `approve`/`reject`. Ambos NO son UPDATE genéricos — igual
 * que `AlertRepository.acknowledge`/`resolve`, delegan exclusivamente en las
 * RPCs `approve_campaign`/`reject_campaign` (SECURITY DEFINER). La policy
 * `campaigns_update` (7B) limita `WITH CHECK` a status IN ('draft','review')
 * precisamente para que NINGÚN UPDATE genérico —tampoco a través de este
 * repositorio— pueda fijar 'approved'/'rejected'; esa transición solo puede
 * ocurrir dentro de la RPC, que corre con los privilegios del dueño de la
 * función y por eso sí puede escribirla. Ver la migración
 * 20260816140000_phase7c_campaign_approval_workflow.sql.
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  Campaign,
  CampaignId,
  CampaignFilter,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '../entities/campaign';
import type { OrganizationId } from '../entities/organization';

export interface CampaignRepository {
  findById(id: CampaignId, organizationId: OrganizationId): Promise<Result<Campaign>>;

  findAll(filter: CampaignFilter, pagination: PaginationParams): Promise<PaginatedResult<Campaign>>;

  create(data: CreateCampaignInput): Promise<Result<Campaign>>;

  /**
   * Actualiza una campaña. Phase 7B solo la usan flujos de edición de
   * draft / envío a revisión (status 'draft' → 'review'); el repositorio no
   * valida transiciones (responsabilidad del application layer /
   * canTransitionCampaign), pero la implementación Supabase hereda la
   * restricción de RLS (WITH CHECK status IN ('draft','review')).
   */
  update(
    id: CampaignId,
    organizationId: OrganizationId,
    data: UpdateCampaignInput,
  ): Promise<Result<Campaign>>;

  /**
   * Aprueba una campaña en 'review' vía la RPC `approve_campaign`.
   * La RPC (no este repositorio) verifica rol admin/owner, que el status
   * actual sea 'review', y escribe `campaign_approvals` en la misma
   * transacción. Retorna la campaña ya actualizada (status='approved').
   */
  approve(id: CampaignId, organizationId: OrganizationId, actorUserId: string): Promise<Result<Campaign>>;

  /**
   * Rechaza una campaña en 'review' vía la RPC `reject_campaign`.
   * `note` es obligatoria (no vacía) — reforzado también por CHECK de BD y
   * por la RPC. Retorna la campaña ya actualizada (status='rejected').
   */
  reject(
    id: CampaignId,
    organizationId: OrganizationId,
    actorUserId: string,
    note: string,
  ): Promise<Result<Campaign>>;
}
