'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import {
  getPendingMetaResources,
  finalizeMetaConnection,
  disconnectMetaIntegration,
} from '@bop-agency/application';

async function getOrgRepository(supabase: SupabaseClient) {
  return {
    findMember: async (orgId: string, userId: string) => {
      const { data } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .maybeSingle();
      return data;
    },
  };
}

export async function getPendingMetaResourcesAction(
  pendingConnectionId: string,
  organizationId: string,
  clientId: string,
) {
  // 1. Authenticate the current user with user-scoped client
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // 2. Resolve organization membership & role
  const orgRepo = await getOrgRepository(supabase);
  const member = await orgRepo.findMember(organizationId, user.id);
  if (!member || !['owner', 'admin', 'strategist'].includes(member.role?.toLowerCase() || '')) {
    return { success: false, error: 'Forbidden' };
  }

  // 3. Verify client exists and belongs to the requested organization
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('id, organization_id')
    .eq('id', clientId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (clientErr || !client) {
    return { success: false, error: 'Client not found or access denied' };
  }

  // 4. Perform service-role read (RLS boundary) through getPendingMetaResources
  // which verifies pending session user_id, organization_id, client_id, and expiry
  const adminClient = createAdminClient();
  const result = await getPendingMetaResources(
    adminClient,
    {
      pendingConnectionId,
      organizationId,
      clientId,
      actorUserId: user.id,
    },
    { organizationRepository: orgRepo },
  );

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  return { success: true, value: result.value };
}

export async function finalizeMetaIntegrationAction(
  pendingConnectionId: string,
  selectedResourceId: string,
  _organizationId: string,
  _clientId: string,
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const result = await finalizeMetaConnection(supabase, {
    pendingConnectionId,
    selectedPageId: selectedResourceId,
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  return { success: true, value: result.value };
}

export async function disconnectMetaIntegrationAction(
  clientIntegrationId: string,
  organizationId: string,
  _clientId: string,
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const result = await disconnectMetaIntegration(supabase, {
    clientIntegrationId,
    organizationId,
    actorUserId: user.id,
  });

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  return { success: true };
}
