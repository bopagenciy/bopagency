/**
 * CampaignMetricsSyncState — Entidad de dominio para la orquestación, frescura y seguimiento de reintentos
 * en la ingestión repetible de métricas por stream de proveedor (Phase 9B.3).
 */

import type { MetricPlatform } from '@bop-agency/shared';
import type { OrganizationId } from './organization';
import type { ClientId } from './client';
import type { CampaignId } from './campaign';
import type { CampaignActivationId } from './campaign-activation';
import type { CampaignActivationTargetId } from './campaign-activation-target';

export type CampaignMetricsSyncStateId = string & { readonly _brand: 'CampaignMetricsSyncStateId' };

export function campaignMetricsSyncStateId(id: string): CampaignMetricsSyncStateId {
  return id as CampaignMetricsSyncStateId;
}

export type MetricsSyncStatus =
  | 'never_synced'
  | 'fresh'
  | 'due'
  | 'syncing'
  | 'failed'
  | 'backoff';

export type MetricsSyncErrorCategory =
  | 'AUTH_FAILURE'
  | 'RATE_LIMIT'
  | 'INVALID_REQUEST'
  | 'TRANSIENT_FAILURE'
  | 'PROVIDER_UNAVAILABLE'
  | 'TENANT_MISMATCH'
  | 'UNKNOWN';

export type CampaignMetricsSyncState = {
  readonly id: CampaignMetricsSyncStateId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId: CampaignId;
  readonly activationId: CampaignActivationId;
  readonly targetId: CampaignActivationTargetId;
  readonly platform: MetricPlatform;
  readonly providerAccountId: string;
  readonly externalCampaignId: string;
  readonly scope: 'campaign';
  readonly granularity: 'daily';
  readonly status: MetricsSyncStatus;
  readonly lastAttemptAt: Date | null;
  readonly lastSuccessAt: Date | null;
  readonly lastFailureAt: Date | null;
  readonly lastSyncedThroughDate: string | null; // YYYY-MM-DD
  readonly nextEligibleSyncAt: Date;
  readonly consecutiveFailures: number;
  readonly claimToken: string | null;
  readonly claimedAt: Date | null;
  readonly claimExpiresAt: Date | null;
  readonly lastErrorCategory: MetricsSyncErrorCategory | null;
  readonly lastErrorMessage: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/** Constantes de Política Nombradas (Named Policy Constants for 9B.3) */
export const DEFAULT_SYNC_LOOKBACK_DAYS = 7;
export const DEFAULT_SYNC_INTERVAL_MINUTES = 1440; // 24 horas
export const CLAIM_LEASE_MINUTES = 15;
export const MAX_SYNC_BATCH_SIZE = 50;
export const MAX_CONSECUTIVE_FAILURES = 10;
export const MAX_SYNC_ERROR_MESSAGE_LENGTH = 1000;

/** Tabla de Backoff de Reintento por Categoría Canónica de Error (en minutos) */
export const ERROR_BACKOFF_MINUTES: Record<MetricsSyncErrorCategory, number> = {
  AUTH_FAILURE: 1440,        // 24 horas
  RATE_LIMIT: 120,           // 2 horas
  INVALID_REQUEST: 1440,     // 24 horas
  TRANSIENT_FAILURE: 60,     // 1 hora
  PROVIDER_UNAVAILABLE: 60,  // 1 hora
  TENANT_MISMATCH: 1440,     // 24 horas
  UNKNOWN: 240,              // 4 horas
};
