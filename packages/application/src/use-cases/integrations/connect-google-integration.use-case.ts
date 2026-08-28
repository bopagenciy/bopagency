import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ok, err, createError, validationError, type Result } from '@bop-agency/shared';

export type ConnectGoogleIntegrationDeps = {
  organizationRepository: {
    findMember: (orgId: string, userId: string) => Promise<{ role: string } | null>;
  };
};

export type ConnectGoogleIntegrationInput = {
  organizationId: string;
  clientId: string;
  actorUserId: string;
  intent?: 'connect' | 'reconnect' | 'reconsent';
  redirectUri: string;
  clientIdGoogle: string;
};

export async function connectGoogleIntegration(
  supabase: SupabaseClient,
  input: ConnectGoogleIntegrationInput,
  deps: ConnectGoogleIntegrationDeps,
): Promise<Result<{ authUrl: string; stateNonce: string }>> {
  const member = await deps.organizationRepository.findMember(input.organizationId, input.actorUserId);
  if (!member || !['owner', 'admin', 'strategist'].includes(member.role.toLowerCase())) {
    return err(createError('FORBIDDEN', 'Requires strategist role or higher to connect Google integration'));
  }

  // Si intent === 'reconnect', verificar que exista al menos una integración de Google para este cliente
  if (input.intent === 'reconnect') {
    const { data: existingIntegrations } = await supabase
      .from('client_integrations')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('client_id', input.clientId)
      .eq('provider', 'google')
      .limit(1);

    if (!existingIntegrations || existingIntegrations.length === 0) {
      return err(validationError('No existing Google Ads integration found for this client to reconnect'));
    }
  }

  // Generar nonce de estado OAuth
  const stateNonce = randomBytes(32).toString('hex');
  const stateHash = createHash('sha256').update(stateNonce).digest('hex');

  const ttlMinutes = 10;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

  const { error: insertErr } = await supabase.from('oauth_states').insert({
    provider: 'google',
    state_hash: stateHash,
    organization_id: input.organizationId,
    client_id: input.clientId,
    user_id: input.actorUserId,
    expires_at: expiresAt,
  });

  if (insertErr) {
    return err(createError('EXTERNAL_SERVICE_ERROR', `Failed to persist OAuth state: ${insertErr.message}`));
  }

  // Determinar parámetros OAuth según el intent
  const scope = 'https://www.googleapis.com/auth/adwords';
  const promptParam = input.intent === 'reconnect' ? 'select_account' : 'consent';

  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(input.clientIdGoogle)}&` +
    `redirect_uri=${encodeURIComponent(input.redirectUri)}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent(scope)}&` +
    `access_type=offline&` +
    `prompt=${promptParam}&` +
    `state=${stateNonce}`;

  return ok({ authUrl, stateNonce });
}
