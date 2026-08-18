// @bop-agency/shared — Kernel compartido

// Types
export type { Result, Ok, Err } from './types/result';
export { ok, err, isOk, isErr, mapResult } from './types/result';
export type { AppError, ErrorCode } from './types/errors';
export { createError, notFound, validationError, notImplemented } from './types/errors';
export type { PaginatedResult, PaginationParams } from './types/pagination';
export { paginate } from './types/pagination';

// Constants
export {
  AD_PLATFORMS,
  PLATFORM_LABELS,
  METRIC_PLATFORMS,
  METRIC_PLATFORM_LABELS,
} from './constants/platforms';
export type { AdPlatform, MetricPlatform } from './constants/platforms';
// AI providers (Phase 7D.1 — fuente única de provider ids/labels)
export { AI_PROVIDER_IDS, AI_PROVIDER_LABELS, DEFAULT_AI_PROVIDER_ID, isAIProviderId } from './constants/ai-providers';
export type { AIProviderId } from './constants/ai-providers';
export {
  TASK_STATUSES,
  CAMPAIGN_STATUSES,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  USER_ROLES,
} from './constants/status';
export type {
  TaskStatus,
  CampaignStatus,
  AlertSeverity,
  AlertStatus,
  UserRole,
} from './constants/status';

// Utils
export { formatDate, formatDateTime, formatRelative, getPeriodId, getWeekId } from './utils/date';
export { getEnvVar, getOptionalEnvVar, isDevelopment, isProduction, isTest } from './utils/env';

// Schemas
export { IdSchema, PaginationSchema, DateRangeSchema, SlugSchema } from './schemas/common.schema';
export {
  createClientSchema,
  updateClientSchema,
  clientFilterSchema,
  upsertClientDocumentSchema,
  CLIENT_STATUSES,
  CLIENT_INDUSTRIES,
  CLIENT_CURRENCIES,
  DOCUMENT_STATUSES,
} from './schemas/client.schema';
export type {
  CreateClientFormValues,
  UpdateClientFormValues,
  ClientFilterValues,
  UpsertClientDocumentFormValues,
} from './schemas/client.schema';

// Schemas — Alerts (Phase 5C)
export { acknowledgeAlertSchema, resolveAlertSchema } from './schemas/alert.schema';
export type { AcknowledgeAlertFormValues, ResolveAlertFormValues } from './schemas/alert.schema';

// Schemas — Tasks (Phase 5C)
export { taskStatusSchema, updateTaskStatusSchema } from './schemas/task.schema';
export type { UpdateTaskStatusFormValues } from './schemas/task.schema';

// Schemas — Campaigns (Phase 7B/7C/7D)
export {
  campaignIdSchema,
  createCampaignDraftSchema,
  updateCampaignDraftSchema,
  campaignFilterSchema,
  submitCampaignForReviewSchema,
  approveCampaignSchema,
  rejectCampaignSchema,
  complianceRuleFilterSchema,
  generateCampaignDraftWithAiSchema,
  regenerateCampaignContentSchema,
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_CURRENCIES,
  CAMPAIGN_EDITABLE_STATUSES,
} from './schemas/campaign.schema';
// Phase 7D.1.1 — regla de coerción estricta de dinero (cierra el bug de budget $0)
export { budgetAmountSchema, parseBudgetAmount } from './schemas/campaign.schema';
export type {
  CreateCampaignDraftFormValues,
  UpdateCampaignDraftFormValues,
  CampaignFilterFormValues,
  SubmitCampaignForReviewFormValues,
  ApproveCampaignFormValues,
  RejectCampaignFormValues,
  ComplianceRuleFilterFormValues,
  GenerateCampaignDraftWithAiFormValues,
  RegenerateCampaignContentFormValues,
} from './schemas/campaign.schema';

// Schemas — Campaign generated content (Phase 7D)
export {
  campaignGeneratedContentSchema,
  metaAdsGeneratedContentSchema,
  googleAdsGeneratedContentSchema,
  GENERATED_CONTENT_SCHEMA_VERSION,
} from './schemas/campaign-generated-content.schema';
export type { CampaignGeneratedContentFormValues } from './schemas/campaign-generated-content.schema';

// Schemas — Automations (Phase 6E)
export {
  automationIdSchema,
  executionIdSchema,
  activateAutomationSchema,
  pauseAutomationSchema,
  archiveAutomationSchema,
  startExecutionSchema,
  cancelExecutionSchema,
  retryExecutionSchema,
} from './schemas/automation.schema';
export type {
  ActivateAutomationFormValues,
  PauseAutomationFormValues,
  ArchiveAutomationFormValues,
  StartExecutionFormValues,
  CancelExecutionFormValues,
  RetryExecutionFormValues,
} from './schemas/automation.schema';
