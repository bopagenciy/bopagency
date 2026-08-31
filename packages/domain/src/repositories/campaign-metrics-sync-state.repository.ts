/**
 * CampaignMetricsSyncStateRepository — Puerto de repositorio de dominio para la persistencia,
 * consulta de vencimientos y reclamo atómico de estados de sincronización de métricas (Phase 9B.3/9B.4).
 */

import type { Result } from '@bop-agency/shared';
import type { MetricPlatform } from '@bop-agency/shared';
import type { OrganizationId } from '../entities/organization';
import type { ClientId } from '../entities/client';
import type { CampaignId } from '../entities/campaign';
import type { CampaignActivationId } from '../entities/campaign-activation';
import type { CampaignActivationTargetId } from '../entities/campaign-activation-target';
import type {
  CampaignMetricsSyncState,
  CampaignMetricsSyncStateId,
  MetricsSyncErrorCategory,
} from '../entities/campaign-metrics-sync-state';

export type CreateMetricsSyncStateInput = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId: CampaignId;
  readonly activationId: CampaignActivationId;
  readonly targetId: CampaignActivationTargetId;
  readonly platform: MetricPlatform;
  readonly providerAccountId: string;
  readonly externalCampaignId: string;
};

export type MarkSyncSuccessInput = {
  readonly syncStateId: CampaignMetricsSyncStateId;
  readonly claimToken: string;
  readonly attemptedAt: Date;
  readonly syncedThroughDate: string; // YYYY-MM-DD
  readonly nextEligibleSyncAt: Date;
};

export type MarkSyncFailureInput = {
  readonly syncStateId: CampaignMetricsSyncStateId;
  readonly claimToken: string;
  readonly attemptedAt: Date;
  readonly errorCategory: MetricsSyncErrorCategory;
  readonly errorMessage: string;
  readonly nextEligibleSyncAt: Date;
};

export type ClaimDueTargetResult =
  | { readonly claimed: true; readonly syncState: CampaignMetricsSyncState }
  | { readonly claimed: false; readonly syncState: null };

export interface CampaignMetricsSyncStateRepository {
  /**
   * Obtiene o crea de forma idempotente el registro de estado de sincronización para un stream de target.
   */
  getOrCreateSyncState(input: CreateMetricsSyncStateInput): Promise<Result<CampaignMetricsSyncState>>;

  /**
   * Busca un estado de sincronización por su ID.
   */
  findById(id: CampaignMetricsSyncStateId): Promise<Result<CampaignMetricsSyncState>>;

  /**
   * Busca un estado de sincronización por su target ID.
   */
  findByTargetId(targetId: CampaignActivationTargetId): Promise<Result<CampaignMetricsSyncState>>;

  /**
   * Lista los targets vencidos (due) elegibles para sincronización en una organización específica.
   */
  listDueTargets(
    organizationId: OrganizationId,
    platform?: MetricPlatform | null,
    limit?: number,
  ): Promise<Result<CampaignMetricsSyncState[]>>;

  /**
   * Lista los targets vencidos (due) elegibles para sincronización de forma global (multi-tenant) (Phase 9B.4).
   */
  listDueTargetsGlobal(
    platform?: MetricPlatform | null,
    limit?: number,
  ): Promise<Result<CampaignMetricsSyncState[]>>;

  /**
   * Reclama atómicamente la ejecución de un target vencido usando un RPC de PostgreSQL.
   */
  claimDueTarget(
    syncStateId: CampaignMetricsSyncStateId,
    claimToken: string,
    leaseDurationMinutes?: number,
  ): Promise<Result<ClaimDueTargetResult>>;

  /**
   * Registra una sincronización exitosa y avanza la frescura del estado.
   * REQUIERE pertenencia de lease verificada por claimToken.
   */
  markSuccess(input: MarkSyncSuccessInput): Promise<Result<CampaignMetricsSyncState>>;

  /**
   * Registra un fallo de sincronización y programa el tiempo de backoff/reintento.
   * REQUIERE pertenencia de lease verificada por claimToken.
   */
  markFailure(input: MarkSyncFailureInput): Promise<Result<CampaignMetricsSyncState>>;
}
