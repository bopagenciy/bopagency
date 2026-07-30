import type { ClientId } from './client';
import type { AlertSeverity, AlertStatus, AdPlatform } from '@bop-agency/shared';

export type AlertId = string & { readonly _brand: 'AlertId' };

export type AlertRuleType =
  | 'ctr_below_threshold'
  | 'cpc_above_threshold'
  | 'spend_above_budget'
  | 'zero_conversions'
  | 'roas_below_threshold'
  | 'campaign_paused_unexpectedly'
  | 'custom';

export type Alert = {
  readonly id: AlertId;
  readonly clientId: ClientId;
  readonly platform: AdPlatform;
  readonly ruleType: AlertRuleType;
  readonly severity: AlertSeverity;
  readonly status: AlertStatus;
  readonly title: string;
  readonly message: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: Date;
  readonly acknowledgedAt?: Date;
  readonly resolvedAt?: Date;
};
