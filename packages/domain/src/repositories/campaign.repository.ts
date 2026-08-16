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
 * NO incluye approve/reject: pertenecen a Phase 7C y probablemente se
 * modelen como una RPC dedicada (no un UPDATE genérico vía este repositorio)
 * — ver la nota de diseño en la migración sobre RLS de campaigns.
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
}
