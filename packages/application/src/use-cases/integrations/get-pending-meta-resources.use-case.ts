import type { SupabaseClient } from '@supabase/supabase-js';
import { ok, err, createError, notFound, type Result } from '@bop-agency/shared';

export type GetPendingMetaResourcesDeps = {
  organizationRepository: {
    findMember: (orgId: string, userId: string) => Promise<{ role: string } | null>;
  };
};

export type GetPendingMetaResourcesInput = {
  pendingConnectionId: string;
  organizationId: string;
  clientId: string;
  actorUserId: string;
};

export type MetaDiscoveredResource = {
  id: string;
  resourceId: string;
  name: string;
  currency?: string | null;
  timezone?: string | null;
};

export async function getPendingMetaResources(
  supabase: SupabaseClient,
  input: GetPendingMetaResourcesInput,
  deps: GetPendingMetaResourcesDeps,
): Promise<Result<MetaDiscoveredResource[]>> {
  const member = await deps.organizationRepository.findMember(input.organizationId, input.actorUserId);
  if (!member || !['owner', 'admin', 'strategist'].includes(member.role.toLowerCase())) {
    return err(createError('FORBIDDEN', 'Requires strategist role or higher to view pending Meta resources'));
  }

  const { data: conn, error: connErr } = await supabase
    .from('pending_oauth_connections')
    .select('organization_id, client_id, user_id, provider, expires_at, consumed_at')
    .eq('id', input.pendingConnectionId)
    .maybeSingle();

  if (connErr || !conn) {
    return err(notFound('Pending OAuth connection'));
  }

  if (conn.provider !== 'meta') {
    return err(createError('FORBIDDEN', 'Pending connection is not for Meta'));
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
    .from('pending_oauth_resources')
    .select('id, page_id, page_name, instagram_account_id, instagram_username')
    .eq('pending_connection_id', input.pendingConnectionId);

  if (resErr) {
    return err(createError('EXTERNAL_SERVICE_ERROR', `Failed to retrieve pending Meta resources: ${resErr.message}`));
  }

  const result: MetaDiscoveredResource[] = (resources || []).map((r) => ({
    id: r.id,
    resourceId: r.page_id,
    name: r.page_name,
    currency: r.instagram_account_id,
    timezone: r.instagram_username,
  }));

  return ok(result);
}
