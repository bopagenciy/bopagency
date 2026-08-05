/**
 * AutomationRepository — contrato de dominio para la tabla `public.automations`.
 *
 * Phase 6A:
 * - organizationId es requerido en TODAS las firmas.
 * - No existe `findById(automationId)` sin organizationId — previene
 *   cross-tenant data leak.
 * - `create` y `archive` añadidos.
 * - `delete` implementado como archive (soft-delete semántico de dominio).
 *   La tabla no tiene deleted_at; archivar es el mecanismo de retiro.
 * - `listByOrganization` y `listByClient` con filtros y paginación.
 * - `countByStatus` para KPIs en dashboard futuro.
 * - `existsByName` para unicidad de nombre dentro de la organización.
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Automation, AutomationId, AutomationStatus, CreateAutomationInput, AutomationFilter } from '../entities/automation';
import type { ClientId } from '../entities/client';
import type { OrganizationId } from '../entities/organization';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutomationCountByStatus = {
  readonly draft: number;
  readonly active: number;
  readonly paused: number;
  readonly archived: number;
};

export type UpdateAutomationInput = {
  readonly name?: string;
  readonly description?: string | null;
  readonly status?: AutomationStatus;
  readonly n8nWorkflowId?: string | null;
  readonly metadata?: Record<string, unknown>;
};

// ─── Repository interface ─────────────────────────────────────────────────────

export interface AutomationRepository {
  /**
   * Crea una nueva automatización en la organización.
   * El status inicial es siempre 'draft'.
   */
  create(
    input: CreateAutomationInput,
  ): Promise<Result<Automation>>;

  /**
   * Actualiza campos de una automatización.
   * Verifica que pertenezca a organizationId antes de modificar.
   * No valida transiciones de status — esa responsabilidad es del use case.
   */
  update(
    id: AutomationId,
    organizationId: OrganizationId,
    data: UpdateAutomationInput,
  ): Promise<Result<Automation>>;

  /**
   * Archiva una automatización (retiro del servicio).
   * Equivale a `update({ status: 'archived' })` pero con semántica explícita.
   * Verifica que pertenezca a organizationId.
   * Idempotente: archivar una automatización ya archivada no es error.
   */
  archive(
    id: AutomationId,
    organizationId: OrganizationId,
  ): Promise<Result<void>>;

  /**
   * Busca una automatización por ID.
   * Requiere organizationId para garantizar aislamiento multi-tenant.
   * Retorna NOT_FOUND si el ID no existe O no pertenece a la organización.
   */
  findById(
    id: AutomationId,
    organizationId: OrganizationId,
  ): Promise<Result<Automation>>;

  /**
   * Lista automatizaciones de la organización con filtros opcionales.
   * Por defecto NO incluye archivadas — pasar `status: 'archived'` explícitamente.
   */
  findByOrganization(
    filter: AutomationFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Automation>>;

  /**
   * Lista automatizaciones vinculadas a un cliente específico.
   * Combina el filtro de cliente con el de organización para aislamiento.
   */
  findByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
    filters: { status?: AutomationStatus },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Automation>>;

  /**
   * Verifica si existe una automatización con ese nombre en la organización.
   * Usado para garantizar unicidad de nombre antes de crear.
   * Optionalmente excluye un ID (para updates).
   */
  existsByName(
    name: string,
    organizationId: OrganizationId,
    excludeId?: AutomationId,
  ): Promise<Result<boolean>>;

  /**
   * Cuenta automatizaciones agrupadas por status.
   * Usado en el panel de KPIs del dashboard.
   */
  countByStatus(
    organizationId: OrganizationId,
  ): Promise<Result<AutomationCountByStatus>>;
}
