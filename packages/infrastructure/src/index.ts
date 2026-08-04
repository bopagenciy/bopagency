// Logging
export { consoleLogger } from './logging/console.logger';

// In-memory repositories (dev / testing)
export { InMemoryClientRepository } from './in-memory/in-memory-client.repository';

// Supabase repositories
export { SupabaseOrganizationRepository } from './supabase/supabase-organization.repository';
export { SupabaseUserProfileRepository } from './supabase/supabase-user-profile.repository';
export { SupabaseClientRepository } from './supabase/supabase-client.repository';

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
