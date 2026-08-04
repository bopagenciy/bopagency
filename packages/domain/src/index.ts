// Entities
export type {
  OrganizationId,
  OrganizationRole,
  OrganizationPlan,
  MembershipStatus,
  Organization,
  OrganizationMember,
  OrganizationInvitation,
} from './entities/organization';
export { organizationId, hasMinimumRole, canManageOrganization } from './entities/organization';
export type { UserProfileId, UserProfile, UserPreferences } from './entities/user-profile';
export { userProfileId } from './entities/user-profile';
export type { UserId, User } from './entities/user';
export type {
  ClientId,
  ClientContactId,
  ClientDocumentId,
  ClientIntegrationId,
  ClientStatus,
  ClientIndustry,
  DocumentStatus,
  IntegrationStatus,
  Client,
  ClientContact,
  ClientDocument,
  ClientIntegration,
  ClientWithDocuments,
  ClientFilter,
  CreateClientInput,
  UpdateClientInput,
  UpsertClientDocumentInput,
  CreateClientContactInput,
} from './entities/client';
export type { CampaignId, CampaignObjective, Campaign, CampaignFilter } from './entities/campaign';
export type { TaskId, TaskPriority, Task, TaskFilter } from './entities/task';
export { canTransitionTask, getTaskNextStates, isTaskOverdue } from './entities/task';
export type { AlertId, Alert, AlertFilter } from './entities/alert';
export { canTransitionAlert, getAlertNextStates } from './entities/alert';
export type {
  MetricId,
  Metric,
  MetricSummary,
  MetricFilter,
  MetricValues,
  MetricTraffic,
  MetricEngagement,
  MetricConversations,
  CampaignMetric,
  DataQuality,
  DataQualityStatus,
} from './entities/metric';
export { validateMetricValues, validateMetricPeriod } from './entities/metric';
export type { ReportId, ReportType, ReportStatus, Report } from './entities/report';
export type { AutomationId, AutomationStatus, Automation } from './entities/automation';
export type { AgentId, AgentType, Agent } from './entities/agent';
export type { SkillId, Skill } from './entities/skill';
export type { TemplateId, TemplateType, Template } from './entities/template';

// Repositories
export type { ClientRepository } from './repositories/client.repository';
export type { CampaignRepository } from './repositories/campaign.repository';
export type { AlertRepository, AlertCountBySeverity } from './repositories/alert.repository';
export type { ReportRepository } from './repositories/report.repository';
export type { TaskRepository, TaskCountByStatus } from './repositories/task.repository';
export type {
  MetricsRepository,
  AvailablePeriod,
  MetricOrganizationSummary,
} from './repositories/metrics.repository';
export type { AgentRepository } from './repositories/agent.repository';
export type { SkillRepository } from './repositories/skill.repository';
export type { TemplateRepository } from './repositories/template.repository';
export type { AutomationRepository } from './repositories/automation.repository';
export type {
  OrganizationRepository,
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from './repositories/organization.repository';
export type {
  UserProfileRepository,
  UpdateProfileInput,
  UpdatePreferencesInput,
} from './repositories/user-profile.repository';

// Value objects
export { parseEmail, isValidEmail } from './value-objects/email';
export type { Email } from './value-objects/email';
export { money, addMoney, formatMoney } from './value-objects/money';
export type { Money, Currency } from './value-objects/money';
export {
  dateRange,
  dateRangeFromStrings,
  isDateInRange,
  daysInRange,
} from './value-objects/date-range';
export type { DateRange } from './value-objects/date-range';
export { percentage, percentageFromDecimal, formatPercentage } from './value-objects/percentage';
export type { Percentage } from './value-objects/percentage';

// Domain errors
export * from './errors/domain.errors';
