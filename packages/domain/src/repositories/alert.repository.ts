/**
 * AlertRepository — contrato de dominio para la tabla `alerts`.
 *
 * Phase 5A: solo métodos de lectura + countBySeverity.
 * Mutaciones (`acknowledge`, `resolve`) se añaden en Phase 5B
 * cuando se implementen los Server Actions correspondientes.
 * Phase 6F: métodos de creación/upsert/resolución para incidentes de automatización.
 *
 * NOTA CRÍTICA: Los métodos `acknowledge` y `resolve` deben llamar
 * a las RPCs de Supabase (`acknowledge_alert`, `resolve_alert`),
 * NO hacer UPDATE directo. El trigger `trg_alerts_70_audit_fields`
 * bloquea updates directos a los campos de auditoría cuando auth.uid() IS NOT NULL.
 *
 * EXCEPCIÓN Phase 6F: cuando se usa service_role (auth.uid() IS NULL), el trigger
 * permite INSERTs y UPDATEs directos, incluyendo resolved_at. Esto es lo que
 * permite a `upsertByAlertKey` y `resolveActiveByAlertKeyPrefixes` funcionar
 * desde el callback del webhook n8n que ya usa adminClient.
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

// ─── Phase 6F input/output types ──────────────────────────────────────────────

export type CreateAlertInput = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId | null;
  /**
   * Clave única de deduplicación (alert_key en DB).
   * Determinística: misma situación → misma clave. Sin timestamps, sin PII.
   * Longitud ≤ 255 chars (límite DB).
   */
  readonly alertKey: string;
  readonly alertType: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly description: string;
  /** Metadatos sanitizados. Sin secretos, sin PII, sin stack traces. */
  readonly metadata?: Record<string, unknown>;
};

export type UpsertAlertResult = {
  readonly alert: Alert;
  /** true si se creó una nueva alerta; false si se actualizó una existente. */
  readonly created: boolean;
};

// ─── Phase 6F task creation types ─────────────────────────────────────────────

export type CreateTaskForAutomationInput = {
  readonly organizationId: OrganizationId;
  readonly clientId?: string | null;
  readonly title: string;
  readonly description: string;
  readonly priority: 'low' | 'medium' | 'high' | 'urgent';
  readonly tags: string[];
  readonly dueDate?: Date | null;
};

// ─── Repository contract ───────────────────────────────────────────────────────

export interface AlertRepository {
  findById(id: AlertId, organizationId: OrganizationId): Promise<Result<Alert>>;

  /**
   * Lista alertas de la organización con filtros opcionales.
   * Si `filter.status` no se especifica, devuelve todas las alertas.
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
   */
  countBySeverity(organizationId: OrganizationId): Promise<Result<AlertCountBySeverity>>;

  /**
   * Registra un reconocimiento de alerta via RPC `acknowledge_alert`.
   * NO usar UPDATE directo — el trigger DB lo bloqueará si auth.uid() IS NOT NULL.
   */
  acknowledge(alertId: AlertId, organizationId: OrganizationId): Promise<Result<void>>;

  /**
   * Registra una resolución de alerta via RPC `resolve_alert`.
   * NO usar UPDATE directo desde cliente autenticado.
   */
  resolve(alertId: AlertId, organizationId: OrganizationId): Promise<Result<void>>;

  // ── Phase 6F: Automation incident methods ────────────────────────────────────

  /**
   * Crea una nueva alerta o actualiza la existente con la misma (organization_id, alert_key).
   * Usa INSERT ... ON CONFLICT DO UPDATE para deduplicación atómica.
   * Actualiza: severity, title, description, metadata, updated_at.
   * NO modifica resolved_at ni acknowledged_at (trigger lo permite en service_role).
   *
   * REQUISITO: Usar client con service_role (adminClient) o en contexto donde
   * auth.uid() IS NULL para evitar bloqueo del trigger en audit fields.
   */
  upsertByAlertKey(input: CreateAlertInput): Promise<Result<UpsertAlertResult>>;

  /**
   * Busca la alerta activa (status='active') por alert_key en la organización.
   * Retorna null si no existe alerta activa con esa clave.
   */
  findActiveByAlertKey(
    alertKey: string,
    organizationId: OrganizationId,
  ): Promise<Result<Alert | null>>;

  /**
   * Resuelve alertas activas cuyo alert_key empiece con alguno de los prefijos dados.
   * Requiere service_role para que el trigger permita el UPDATE de resolved_at.
   * Best-effort: retorna el número de alertas resueltas (puede ser 0).
   */
  resolveActiveByAlertKeyPrefixes(
    prefixes: string[],
    organizationId: OrganizationId,
    resolvedByLabel: string,
  ): Promise<Result<number>>;
}
