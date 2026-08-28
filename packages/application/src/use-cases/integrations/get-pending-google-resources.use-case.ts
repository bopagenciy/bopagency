import type { SupabaseClient } from '@supabase/supabase-js';
import { ok, err, createError, notFound, type Result, type GoogleAdsDiscoveredCustomer } from '@bop-agency/shared';

export type GetPendingGoogleResourcesDeps = {
  organizationRepository: {
    findMember: (orgId: string, userId: string) => Promise<{ role: string } | null>;
  };
};

export type GetPendingGoogleResourcesInput = {
  pendingConnectionId: string;
  organizationId: string;
  clientId: string;
  actorUserId: string;
};

export async function getPendingGoogleResources(
  supabase: SupabaseClient,
  input: GetPendingGoogleResourcesInput,
  deps: GetPendingGoogleResourcesDeps,
): Promise<Result<GoogleAdsDiscoveredCustomer[]>> {
  const member = await deps.organizationRepository.findMember(input.organizationId, input.actorUserId);
  if (!member || !['owner', 'admin', 'strategist'].includes(member.role.toLowerCase())) {
    return err(createError('FORBIDDEN', 'Requires strategist role or higher to view pending Google resources'));
  }

  const { data: conn, error: connErr } = await supabase
    .from('pending_oauth_connections')
    .select('organization_id, client_id, user_id, provider, expires_at, consumed_at')
    .eq('id', input.pendingConnectionId)
    .maybeSingle();

  if (connErr || !conn) {
    return err(notFound('Pending OAuth connection'));
  }

  if (conn.provider !== 'google') {
    return err(createError('FORBIDDEN', 'Pending connection is not for Google'));
  }

  if (conn.user_id !== input.actorUserId) {
    return err(createError('FORBIDDEN', 'Pending OAuth connection belongs to a different user'));
  }

  if (conn.organization_id !== input.organizationId || conn.client_id !== input.clientId) {
    return err(createError('FORBIDDEN', 'Pending OAuth connection does not match request client/organization boundary'));
  }

  if (conn.consumed_at) {
    return err(createError('FORBIDDEN', 'Pending connection already consumed'));
  }

  if (new Date(conn.expires_at) <= new Date()) {
    return err(createError('FORBIDDEN', 'Pending connection expired'));
  }

  const { data: resources, error: resErr } = await supabase
    .from('pending_google_oauth_resources')
    .select('id, customer_id, customer_name, manager_customer_id, is_manager, currency_code, time_zone')
    .eq('pending_connection_id', input.pendingConnectionId);

  if (resErr) {
    return err(createError('EXTERNAL_SERVICE_ERROR', `Failed to retrieve pending resources: ${resErr.message}`));
  }

  const result: GoogleAdsDiscoveredCustomer[] = (resources || []).map(r => ({
    id: r.id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    managerCustomerId: r.manager_customer_id,
    isManager: r.is_manager,
    currencyCode: r.currency_code,
    timeZone: r.time_zone,
  }));

  return ok(result);
}
