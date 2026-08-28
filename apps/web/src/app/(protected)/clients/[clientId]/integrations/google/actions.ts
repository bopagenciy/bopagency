'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  getPendingGoogleResources,
  finalizeGoogleConnection,
  disconnectGoogleIntegration,
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

export async function getPendingGoogleResourcesAction(
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
  const result = await getPendingGoogleResources(
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

export async function finalizeGoogleIntegrationAction(
  pendingConnectionId: string,
  selectedResourceId: string,
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
  const result = await finalizeGoogleConnection(
    supabase,
    {
      pendingConnectionId,
      selectedResourceId,
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

export async function disconnectGoogleIntegrationAction(
  clientIntegrationId: string,
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
  const result = await disconnectGoogleIntegration(
    supabase,
    {
      clientIntegrationId,
      organizationId,
      clientId,
      actorUserId: user.id,
    },
    { organizationRepository: orgRepo },
  );

  if (!result.success) {
    return { success: false, error: result.error.message };
  }

  return { success: true };
}
