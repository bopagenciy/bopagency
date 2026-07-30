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

// Use cases — Tasks
export { listTasks } from './use-cases/tasks/list-tasks.use-case';
export type { ListTasksInput, ListTasksDeps } from './use-cases/tasks/list-tasks.use-case';

// Use cases — Reports
export { listReports } from './use-cases/reports/list-reports.use-case';
export type { ListReportsInput, ListReportsDeps } from './use-cases/reports/list-reports.use-case';

// Use cases — Automations
export { listAutomations } from './use-cases/automations/list-automations.use-case';
export type {
  ListAutomationsInput,
  ListAutomationsDeps,
} from './use-cases/automations/list-automations.use-case';

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
