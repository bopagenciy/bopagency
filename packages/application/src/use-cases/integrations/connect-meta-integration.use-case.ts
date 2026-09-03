/**
 * connect-meta-integration.use-case.ts — Phase 8E.
 *
 * Inicia el flujo de OAuth con Meta. Genera un state nonce seguro de un solo uso (SHA-256 hash),
 * persiste oauth_states en base de datos y retorna la URL de redirección hacia Meta Login.
 */

import { createHash, randomBytes } from 'crypto';
import { ok, err, createError } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ConnectMetaIntegrationInput = {
  organizationId: string;
  clientId: string;
  actorUserId: string;
  redirectUri: string;
  appId: string;
  apiVersion: string;
  configId?: string | null | undefined;
};

export type ConnectMetaIntegrationResult = {
  oauthUrl: string;
  stateNonce: string;
  expiresAt: string;
};

export async function connectMetaIntegration(
  client: SupabaseClient,
  input: ConnectMetaIntegrationInput,
): Promise<Result<ConnectMetaIntegrationResult>> {
  const nonce = randomBytes(32).toString('hex');
  const stateHash = createHash('sha256').update(nonce).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await client.from('oauth_states').insert({
    provider: 'meta',
    state_hash: stateHash,
    organization_id: input.organizationId,
    client_id: input.clientId,
    user_id: input.actorUserId,
    expires_at: expiresAt,
  });

  if (error) {
    return err(createError('INTERNAL_ERROR', `Failed to create OAuth state: ${error.message}`));
  }

  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish',
    'ads_read',
  ].join(',');

  const oauthUrl = new URL(`https://www.facebook.com/${input.apiVersion}/dialog/oauth`);
  oauthUrl.searchParams.set('client_id', input.appId);
  oauthUrl.searchParams.set('redirect_uri', input.redirectUri);
  oauthUrl.searchParams.set('state', nonce);
  oauthUrl.searchParams.set('response_type', 'code');

  const trimmedConfigId = input.configId?.trim();
  if (trimmedConfigId) {
    oauthUrl.searchParams.set('config_id', trimmedConfigId);
  } else {
    oauthUrl.searchParams.set('scope', scopes);
  }

  return ok({
    oauthUrl: oauthUrl.toString(),
    stateNonce: nonce,
    expiresAt,
  });
}
