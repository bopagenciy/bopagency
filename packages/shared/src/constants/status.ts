export const TASK_STATUSES = [
  'pending',
  'in_progress',
  'completed',
  'cancelled',
  'on_hold',
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

export const ALERT_STATUSES = ['open', 'acknowledged', 'resolved', 'suppressed'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const USER_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type UserRole = (typeof USER_ROLES)[number];
