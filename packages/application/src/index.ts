// Ports
export type { LoggerPort, LogLevel, LogContext } from './ports/logger.port';
export type { EventBusPort, DomainEvent } from './ports/event-bus.port';

// Use cases — Clients
export { listClients } from './use-cases/clients/list-clients.use-case';
export type { ListClientsInput, ListClientsDeps } from './use-cases/clients/list-clients.use-case';
export { getClient } from './use-cases/clients/get-client.use-case';
export type { GetClientInput, GetClientDeps } from './use-cases/clients/get-client.use-case';
export { createClient } from './use-cases/clients/create-client.use-case';
export type {
  CreateClientUseCaseInput,
  CreateClientDeps,
} from './use-cases/clients/create-client.use-case';
export { updateClient } from './use-cases/clients/update-client.use-case';
export type {
  UpdateClientUseCaseInput,
  UpdateClientDeps,
} from './use-cases/clients/update-client.use-case';
export { softDeleteClient } from './use-cases/clients/soft-delete-client.use-case';
export type {
  SoftDeleteClientInput,
  SoftDeleteClientDeps,
} from './use-cases/clients/soft-delete-client.use-case';
export { getClientWithDocuments } from './use-cases/clients/get-client-with-documents.use-case';
export type {
  GetClientWithDocumentsInput,
  GetClientWithDocumentsDeps,
} from './use-cases/clients/get-client-with-documents.use-case';
export { upsertClientDocument } from './use-cases/clients/upsert-client-document.use-case';
export type {
  UpsertClientDocumentUseCaseInput,
  UpsertClientDocumentDeps,
} from './use-cases/clients/upsert-client-document.use-case';

// Use cases — Campaigns
export { listCampaigns } from './use-cases/campaigns/list-campaigns.use-case';
export type {
  ListCampaignsInput,
  ListCampaignsDeps,
} from './use-cases/campaigns/list-campaigns.use-case';
export { createCampaignDraft } from './use-cases/campaigns/create-campaign-draft.use-case';
export type { CreateCampaignDraftInput } from './use-cases/campaigns/create-campaign-draft.use-case';

// Use cases — Alerts
export { listAlerts } from './use-cases/alerts/list-alerts.use-case';
export type { ListAlertsInput, ListAlertsDeps } from './use-cases/alerts/list-alerts.use-case';
export { acknowledgeAlert } from './use-cases/alerts/acknowledge-alert.use-case';
export type {
  AcknowledgeAlertInput,
  AcknowledgeAlertDeps,
} from './use-cases/alerts/acknowledge-alert.use-case';
export { resolveAlert } from './use-cases/alerts/resolve-alert.use-case';
export type {
  ResolveAlertInput,
  ResolveAlertDeps,
} from './use-cases/alerts/resolve-alert.use-case';

// Use cases — Tasks
export { listTasks } from './use-cases/tasks/list-tasks.use-case';
export type { ListTasksInput, ListTasksDeps } from './use-cases/tasks/list-tasks.use-case';
export { updateTaskStatus } from './use-cases/tasks/update-task-status.use-case';
export type {
  UpdateTaskStatusInput,
  UpdateTaskStatusDeps,
} from './use-cases/tasks/update-task-status.use-case';

// Use cases — Metrics (Phase 5A)
export { listClientMetrics } from './use-cases/metrics/list-client-metrics.use-case';
export type {
  ListClientMetricsInput,
  ListClientMetricsDeps,
} from './use-cases/metrics/list-client-metrics.use-case';

// Use cases — Dashboard (Phase 5A)
export { getAgencyDashboardSummary } from './use-cases/dashboard/get-agency-dashboard-summary.use-case';
export type {
  GetAgencyDashboardSummaryInput,
  GetAgencyDashboardSummaryDeps,
  AgencyDashboardSummary,
} from './use-cases/dashboard/get-agency-dashboard-summary.use-case';

// Use cases — Reports
export { listReports } from './use-cases/reports/list-reports.use-case';
export type { ListReportsInput, ListReportsDeps } from './use-cases/reports/list-reports.use-case';

// Use cases — Automations
export { listAutomations } from './use-cases/automations/list-automations.use-case';
export type {
  ListAutomationsInput,
  ListAutomationsDeps,
} from './use-cases/automations/list-automations.use-case';

// Phase 6E — Automation status management use cases
export { getAutomation } from './use-cases/automations/get-automation.use-case';
export type {
  GetAutomationInput,
  GetAutomationDeps,
} from './use-cases/automations/get-automation.use-case';

export { activateAutomation } from './use-cases/automations/activate-automation.use-case';
export type {
  ActivateAutomationInput,
  ActivateAutomationDeps,
} from './use-cases/automations/activate-automation.use-case';

export { pauseAutomation } from './use-cases/automations/pause-automation.use-case';
export type {
  PauseAutomationInput,
  PauseAutomationDeps,
} from './use-cases/automations/pause-automation.use-case';

export { archiveAutomation } from './use-cases/automations/archive-automation.use-case';
export type {
  ArchiveAutomationInput,
  ArchiveAutomationDeps,
} from './use-cases/automations/archive-automation.use-case';

// Use cases — Organizations
export { createOrganization } from './use-cases/organizations/create-organization.use-case';
export type {
  CreateOrganizationInput,
  CreateOrganizationDeps,
  CreateOrganizationOutput,
} from './use-cases/organizations/create-organization.use-case';
export { getOrganization } from './use-cases/organizations/get-organization.use-case';
export type {
  GetOrganizationInput,
  GetOrganizationDeps,
} from './use-cases/organizations/get-organization.use-case';
export { listOrganizations } from './use-cases/organizations/list-organizations.use-case';
export type {
  ListOrganizationsInput,
  ListOrganizationsDeps,
} from './use-cases/organizations/list-organizations.use-case';
export { inviteMember } from './use-cases/organizations/invite-member.use-case';
export type {
  InviteMemberInput,
  InviteMemberDeps,
} from './use-cases/organizations/invite-member.use-case';
export { updateMemberRole } from './use-cases/organizations/update-member-role.use-case';
export type {
  UpdateMemberRoleInput,
  UpdateMemberRoleDeps,
} from './use-cases/organizations/update-member-role.use-case';

// Use cases — Profile
export { getProfile } from './use-cases/profile/get-profile.use-case';
export type { GetProfileInput, GetProfileDeps } from './use-cases/profile/get-profile.use-case';
export { updateProfile } from './use-cases/profile/update-profile.use-case';
export type { UpdateProfileDeps } from './use-cases/profile/update-profile.use-case';
export { getMembership } from './use-cases/profile/get-membership.use-case';
export type {
  GetMembershipInput,
  GetMembershipDeps,
} from './use-cases/profile/get-membership.use-case';

// Phase 6D — Execution Orchestration use cases
export { startAutomationExecution } from './use-cases/automations/start-execution.use-case';
export type {
  StartAutomationExecutionInput,
  StartAutomationExecutionOutput,
  StartAutomationExecutionDeps,
} from './use-cases/automations/start-execution.use-case';

export { cancelAutomationExecution } from './use-cases/automations/cancel-execution.use-case';
export type {
  CancelAutomationExecutionInput,
  CancelAutomationExecutionDeps,
} from './use-cases/automations/cancel-execution.use-case';

export { retryAutomationExecution } from './use-cases/automations/retry-execution.use-case';
export type {
  RetryAutomationExecutionInput,
  RetryAutomationExecutionOutput,
  RetryAutomationExecutionDeps,
} from './use-cases/automations/retry-execution.use-case';

export { getAutomationExecution } from './use-cases/automations/get-execution.use-case';
export type {
  GetAutomationExecutionInput,
  GetAutomationExecutionDeps,
} from './use-cases/automations/get-execution.use-case';

export { listAutomationExecutions } from './use-cases/automations/list-executions.use-case';
export type {
  ListAutomationExecutionsInput,
  ListAutomationExecutionsDeps,
} from './use-cases/automations/list-executions.use-case';

// Phase 6D — Ports
export type {
  WorkflowDispatcherPort,
  DispatchResult,
  DispatchPayload,
} from './ports/workflow-dispatcher.port';

// Phase 6F — Automation incident evaluation
export { evaluateAutomationIncident } from './use-cases/automations/evaluate-automation-incident.use-case';
export type {
  EvaluateAutomationIncidentInput,
  EvaluateAutomationIncidentOutput,
  EvaluateAutomationIncidentDeps,
  IncidentEventType,
} from './use-cases/automations/evaluate-automation-incident.use-case';

export { evaluateStuckAutomationExecutions, systemClock } from './use-cases/automations/evaluate-stuck-automation-executions.use-case';
export type {
  EvaluateStuckAutomationExecutionsInput,
  EvaluateStuckAutomationExecutionsDeps,
  StuckExecutionSummary,
  ClockPort,
} from './use-cases/automations/evaluate-stuck-automation-executions.use-case';

// Phase 6F — Incident severity and signatures (re-exported for consumers)
export {
  classifyErrorCode,
  getAlertSeverityForIncident,
  getTaskPriorityForIncident,
  isRecoverableIncident,
} from './use-cases/automations/automation-incident-severity';
export type { AutomationIncidentType } from './use-cases/automations/automation-incident-severity';
