import type { SupabaseClient } from '@supabase/supabase-js';
import { ok, err, createError, notFound, type Result } from '@bop-agency/shared';

export type DisconnectGoogleIntegrationDeps = {
  organizationRepository: {
    findMember: (orgId: string, userId: string) => Promise<{ role: string } | null>;
  };
};

export type DisconnectGoogleIntegrationInput = {
  clientIntegrationId: string;
  organizationId: string;
  clientId: string;
  actorUserId: string;
};

export async function disconnectGoogleIntegration(
  supabase: SupabaseClient,
  input: DisconnectGoogleIntegrationInput,
  deps: DisconnectGoogleIntegrationDeps,
): Promise<Result<{ success: true }>> {
  const member = await deps.organizationRepository.findMember(input.organizationId, input.actorUserId);
  if (!member || !['owner', 'admin', 'strategist'].includes(member.role.toLowerCase())) {
    return err(createError('FORBIDDEN', 'Requires strategist role or higher to disconnect Google integration'));
  }

  // Verificar que la integración pertenece al cliente y organización especificados
  const { data: integration, error: intErr } = await supabase
    .from('client_integrations')
    .select('id, organization_id, client_id, provider')
    .eq('id', input.clientIntegrationId)
    .maybeSingle();

  if (intErr || !integration) {
    return err(notFound('Client integration'));
  }

  if (
    integration.provider !== 'google' ||
    integration.organization_id !== input.organizationId ||
    integration.client_id !== input.clientId
  ) {
    return err(createError('FORBIDDEN', 'Integration does not match requested tenant boundary or provider'));
  }

  // 1. Eliminar la credencial en public.client_integration_credentials
  await supabase
    .from('client_integration_credentials')
    .delete()
    .eq('client_integration_id', input.clientIntegrationId)
    .eq('credential_type', 'google_ads_refresh_token');

  // 2. Actualizar estado de integración a 'inactive'
  await supabase
    .from('client_integrations')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', input.clientIntegrationId);

  // 3. Escribir evento de auditoría
  await supabase.from('client_integration_events').insert({
    organization_id: input.organizationId,
    client_integration_id: input.clientIntegrationId,
    event_type: 'disconnected',
    actor_user_id: input.actorUserId,
    metadata: { reason: 'User initiated disconnect' },
  });

  return ok({ success: true });
}
