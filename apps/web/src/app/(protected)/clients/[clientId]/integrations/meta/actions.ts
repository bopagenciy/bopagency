'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const orgRepo = await getOrgRepository(supabase);
  const result = await getPendingMetaResources(
    supabase,
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
