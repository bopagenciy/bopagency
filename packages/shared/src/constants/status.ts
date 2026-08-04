export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'done', // DB enum: task_status
  'cancelled',
  'blocked', // DB enum: task_status
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const CAMPAIGN_STATUSES = [
  'draft',
  'review',
  'approved',
  'active',
  'paused',
  'completed',
  'rejected',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const ALERT_SEVERITIES = ['critical', 'warning', 'info'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export const ALERT_STATUSES = [
  'active', // DB enum: alert_status (era 'open')
  'acknowledged',
  'snoozed', // DB enum: alert_status (nuevo)
  'resolved',
] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

// Matches OrganizationRole in domain/entities/organization.ts
export const USER_ROLES = ['owner', 'admin', 'strategist', 'operator', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];
