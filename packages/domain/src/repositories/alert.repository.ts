/**
 * AlertRepository — contrato de dominio para la tabla `alerts`.
 *
 * Phase 5A: solo métodos de lectura + countBySeverity.
 * Mutaciones (`acknowledge`, `resolve`) se añaden en Phase 5B
 * cuando se implementen los Server Actions correspondientes.
 *
 * NOTA CRÍTICA: Los métodos `acknowledge` y `resolve` deben llamar
 * a las RPCs de Supabase (`acknowledge_alert`, `resolve_alert`),
 * NO hacer UPDATE directo. El trigger `trg_alerts_70_audit_fields`
 * bloquea updates directos a los campos de auditoría.
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type { Alert, AlertFilter, AlertId } from '../entities/alert';
import type { ClientId } from '../entities/client';
import type { OrganizationId } from '../entities/organization';
import type { AlertSeverity, AlertStatus } from '@bop-agency/shared';

export type AlertCountBySeverity = {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
};

export interface AlertRepository {
  findById(id: AlertId, organizationId: OrganizationId): Promise<Result<Alert>>;

  /**
   * Lista alertas de la organización con filtros opcionales.
   * Si `filter.status` no se especifica, devuelve todas las alertas
   * (activas, reconocidas, pospuestas y resueltas).
   */
  findByOrganization(
    filter: AlertFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>>;

  /**
   * Alias semántico para findByOrganization con status='active'.
   * Usado en el dashboard para alertas que requieren atención.
   */
  findActiveByOrganization(
    organizationId: OrganizationId,
    filters: { clientId?: ClientId; severity?: AlertSeverity },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>>;

  /**
   * Lista alertas de un cliente específico.
   */
  findByClient(
    clientId: ClientId,
    organizationId: OrganizationId,
    filters: { status?: AlertStatus },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>>;

  /**
   * Cuenta alertas activas agrupadas por severidad.
   * Usado en el panel de KPIs del dashboard.
   */
  countBySeverity(organizationId: OrganizationId): Promise<Result<AlertCountBySeverity>>;

  /**
   * Registra un reconocimiento de alerta.
   *
   * IMPLEMENTACIÓN OBLIGATORIA: debe llamar a la RPC `acknowledge_alert(p_alert_id)`
   * de Supabase. NO usar UPDATE directo — el trigger DB lo bloqueará.
   */
  acknowledge(alertId: AlertId, organizationId: OrganizationId): Promise<Result<void>>;

  /**
   * Registra una resolución de alerta.
   *
   * IMPLEMENTACIÓN OBLIGATORIA: debe llamar a la RPC `resolve_alert(p_alert_id)`
   * de Supabase. NO usar UPDATE directo — el trigger DB lo bloqueará.
   * La RPC verifica que el usuario tenga rol `operator` o superior.
   */
  resolve(alertId: AlertId, organizationId: OrganizationId): Promise<Result<void>>;
}
