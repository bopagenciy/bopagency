// Advertising
export type {
  AdvertisingPlatformProvider,
  AdAccountId,
  AdCampaignId,
  PlatformCampaignMetrics,
  PlatformCampaignSummary,
} from './contracts/advertising-platform.provider';

// Metrics
export type { MetricsProvider, MetricsQuery, MetricsSnapshot } from './contracts/metrics.provider';

// Email
export type {
  EmailProvider,
  EmailMessage,
  EmailAddress,
  EmailSendResult,
} from './contracts/email.provider';

// Storage
export type { StorageProvider, StorageObject, UploadOptions } from './contracts/storage.provider';
