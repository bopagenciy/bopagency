// Logging
export { consoleLogger } from './logging/console.logger';

// In-memory repositories (dev / testing)
export { InMemoryClientRepository } from './in-memory/in-memory-client.repository';

// Supabase repositories
export { SupabaseOrganizationRepository } from './supabase/supabase-organization.repository';
export { SupabaseUserProfileRepository } from './supabase/supabase-user-profile.repository';
export { SupabaseClientRepository } from './supabase/supabase-client.repository';

// Phase 5B repositories
export { SupabaseMetricsRepository } from './supabase/repositories/supabase-metrics.repository';
export { SupabaseAlertRepository } from './supabase/repositories/supabase-alert.repository';
export { SupabaseTaskRepository } from './supabase/repositories/supabase-task.repository';

// Phase 7B repositories
export { SupabaseCampaignRepository } from './supabase/repositories/supabase-campaign.repository';

// Phase 7C repositories
export { SupabaseCampaignApprovalRepository } from './supabase/repositories/supabase-campaign-approval.repository';
export { SupabaseComplianceRuleRepository } from './supabase/repositories/supabase-compliance-rule.repository';

// Phase 6B repositories
export { SupabaseAutomationRepository } from './supabase/repositories/supabase-automation.repository';
export { SupabaseAutomationExecutionRepository } from './supabase/repositories/supabase-automation-execution.repository';

// Phase 8A.1 repositories
export { SupabaseCampaignActivationRepository } from './supabase/repositories/supabase-campaign-activation.repository';

// Phase 8B.1 repositories
export { SupabaseCampaignPublicationRepository } from './supabase/repositories/supabase-campaign-publication.repository';

// Phase 8C repositories
export { SupabaseContentCalendarRepository } from './supabase/repositories/supabase-content-calendar.repository';

// Mappers
export {
  rowToOrganization,
  rowToOrganizationMember,
  rowToOrganizationInvitation,
} from './supabase/mappers/organization.mapper';
export { rowToUserProfile, rowToUserPreferences } from './supabase/mappers/user-profile.mapper';
export {
  rowToClient,
  rowToClientContact,
  rowToClientDocument,
  rowToClientIntegration,
} from './supabase/mappers/client.mapper';

// Phase 5A mappers
export { rowToMetric, rowToMetricSummary } from './supabase/mappers/metric.mapper';
export type { MetricRow, MetricSummaryRow } from './supabase/mappers/metric.mapper';
export { rowToAlert } from './supabase/mappers/alert.mapper';
export type { AlertRow } from './supabase/mappers/alert.mapper';
export { rowToTask } from './supabase/mappers/task.mapper';
export type { TaskRow } from './supabase/mappers/task.mapper';

// Phase 7B mappers
export { rowToCampaign } from './supabase/mappers/campaign.mapper';
export type { CampaignRow } from './supabase/mappers/campaign.mapper';

// Phase 7C mappers
export { rowToCampaignApproval } from './supabase/mappers/campaign-approval.mapper';
export type { CampaignApprovalRow } from './supabase/mappers/campaign-approval.mapper';
export { rowToComplianceRule } from './supabase/mappers/compliance-rule.mapper';
export type { ComplianceRuleRow } from './supabase/mappers/compliance-rule.mapper';

// Phase 8A.1 mappers
export {
  rowToCampaignActivation,
  rowToCampaignActivationTarget,
  rowToCampaignActivationEvent,
} from './supabase/mappers/campaign-activation.mapper';
export type {
  CampaignActivationRow,
  CampaignActivationTargetRow,
  CampaignActivationEventRow,
} from './supabase/mappers/campaign-activation.mapper';

// Phase 8B.1 mappers
export {
  rowToCampaignPublicationJob,
  rowToCampaignPublicationAttempt,
  rowToCampaignPublicationEvent,
  rowToCampaignPublicationWebhookEvent,
} from './supabase/mappers/campaign-publication.mapper';
export type {
  CampaignPublicationJobRow,
  CampaignPublicationAttemptRow,
  CampaignPublicationEventRow as CampaignPublicationEventRowType,
  CampaignPublicationWebhookEventRow,
} from './supabase/mappers/campaign-publication.mapper';

// Phase 6B mappers
export { rowToAutomation } from './supabase/mappers/automation.mapper';
export type { AutomationRow } from './supabase/mappers/automation.mapper';
export { rowToAutomationExecution } from './supabase/mappers/automation-execution.mapper';
export type { AutomationExecutionRow } from './supabase/mappers/automation-execution.mapper';

// Phase 6C — n8n Gateway
export { N8nWebhookDispatcher } from './n8n/n8n-webhook-dispatcher';

// Phase 6D — ExecutionLog
export { SupabaseExecutionLogRepository } from './supabase/repositories/supabase-execution-log.repository';

// Phase 6D — Dispatcher adapter
export { N8nDispatcherAdapter } from './n8n/n8n-dispatcher-adapter';

// Phase 8B.3 — Publication Transport adapter
export { N8nPublicationTransportAdapter } from './n8n/n8n-publication-transport.adapter';

// Phase 7D — AI Campaign Builder
export { ClaudeAPIProvider, AnthropicAPIProvider } from './ai/claude-api.provider';
export {
  buildCampaignGenerationPrompt,
  CAMPAIGN_BUILDER_PROMPT_VERSION,
} from './ai/campaign-prompt-builder';
export { CampaignGeneratorAdapter } from './ai/campaign-generator.adapter';
export type { CampaignAIProviderResolver } from './ai/campaign-generator.adapter';

// Phase 7D.1 — Multi-provider AI foundation
export { OpenAIAPIProvider } from './ai/openai-api.provider';
export { GeminiAPIProvider } from './ai/gemini-api.provider';
export { createCampaignAIProvider } from './ai/campaign-ai-provider.factory';
export type {
  ResolvedCampaignAIProvider,
  CampaignAIProviderFactory,
} from './ai/campaign-ai-provider.factory';
export {
  resolveAIProviderConfig,
  resolveDefaultProviderId,
  getCampaignAiTimeoutMs,
  DEFAULT_MODELS,
  DEFAULT_CAMPAIGN_AI_TIMEOUT_MS,
} from './ai/ai-provider-config';
export type { AIProviderConfig } from './ai/ai-provider-config';

// Phase 8E — Meta Integration Infrastructure
export { encryptCredential, decryptCredential } from './security/credential-cipher';
export type { EncryptedPayload } from './security/credential-cipher';
export { getMetaGraphApiVersion, getMetaAppConfig } from './meta/meta-config';
export { MetaGraphApiClient } from './meta/meta-graph-api.client';
export type { DiscoveredMetaPage, MetaPublishResult } from './meta/meta-graph-api.client';
export { mapMetaErrorToFailureCategory } from './meta/meta-error.mapper';
export { MetaPublisherAdapter } from './meta/meta-publisher.adapter';
export type {
  CheckpointRpcFunction,
  FetchTargetMetadataFunction,
} from './meta/meta-publisher.adapter';
export { SupabaseCredentialRepository } from './supabase/repositories/supabase-credential.repository';
export type { ResolvedPageCredential } from './supabase/repositories/supabase-credential.repository';
export { SupabasePendingConnectionRepository } from './supabase/repositories/supabase-pending-connection.repository';
export type { CreatePendingSessionInput } from './supabase/repositories/supabase-pending-connection.repository';

// Phase 8F.1 & 8F.2 — Google Integration Infrastructure
export { GoogleOAuthClient } from './google/google-oauth.client';
export type { GoogleTokenExchangeResult } from './google/google-oauth.client';
export { GoogleAdsDiscoveryClient } from './google/google-ads-discovery.client';
export { GoogleAdsApiClient, GoogleAdsApiError, requireGoogleAdsApiVersion, requireGoogleAdsDeveloperToken } from './google/google-ads-api.client';
export type { GoogleAdsMutateRequestPayload, GoogleAdsMutateResponse } from './google/google-ads-api.client';
export { GoogleAdsPublisherAdapter, toGoogleBudgetMicros } from './google/google-ads-publisher.adapter';
export type { GoogleAdsPublisherAdapterDeps } from './google/google-ads-publisher.adapter';
export { GoogleAdsReconcilerAdapter } from './google/google-ads-reconciler.adapter';
export type { GoogleAdsReconcilerAdapterDeps } from './google/google-ads-reconciler.adapter';
