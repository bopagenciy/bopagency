/**
 * /api/auth/oauth/meta/callback/route.ts — Phase 8E.
 *
 * Route Handler para recibir el callback OAuth de Meta.
 * 1. Restaura sesión de usuario autenticado desde cookies.
 * 2. Consume el oauth_state nonce en Postgres (prevención CSRF).
 * 3. Intercambia code por tokens en servidor con Meta API.
 * 4. Guarda la sesión temporal pending_oauth_connections (tokens cifrados).
 * 5. Redirige al frontend sin retornar ningún token en la URL ni memoria de navegador.
 */

import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import {
  MetaGraphApiClient,
  SupabasePendingConnectionRepository,
} from '@bop-agency/infrastructure';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const stateNonce = requestUrl.searchParams.get('state');
  const errorParam =
    requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      `${requestUrl.origin}/protected/clients?error=${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code || !stateNonce) {
    return NextResponse.redirect(
      `${requestUrl.origin}/protected/clients?error=missing_oauth_parameters`,
    );
  }

  // 1. Restaurar sesión de usuario desde cookies HTTP-Only
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.redirect(`${requestUrl.origin}/login?error=unauthenticated`);
  }

  // 2. Consumir el state nonce usando el cliente del usuario autenticado
  const stateHash = createHash('sha256').update(stateNonce).digest('hex');
  const rpcClient = supabase as unknown as {
    rpc: (
      fnName: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: {
        success?: boolean;
        message?: string;
        organization_id?: string;
        client_id?: string;
      } | null;
      error: { message: string } | null;
    }>;
  };
  const { data: stateResult, error: stateErr } = await rpcClient.rpc('consume_oauth_state', {
    p_state_hash: stateHash,
  });

  if (stateErr || !stateResult || stateResult.success !== true) {
    const errMsg = stateResult?.message || stateErr?.message || 'Invalid or expired OAuth state';
    return NextResponse.redirect(
      `${requestUrl.origin}/protected/clients?error=${encodeURIComponent(errMsg)}`,
    );
  }

  const organizationId = stateResult.organization_id || '';
  const clientId = stateResult.client_id || '';
  const redirectUri = `${requestUrl.origin}/api/auth/oauth/meta/callback`;

  try {
    // 3. Intercambiar code por User Token y descubrir Páginas
    const apiClient = new MetaGraphApiClient();
    const shortUserToken = await apiClient.exchangeCodeForUserToken(code, redirectUri);
    const longUserToken = await apiClient.exchangeUserTokenForLongLived(shortUserToken);
    const pages = await apiClient.discoverPagesAndAccounts(longUserToken);

    if (!pages || pages.length === 0) {
      return NextResponse.redirect(
        `${requestUrl.origin}/clients/${clientId}/settings?error=${encodeURIComponent('No Facebook Pages found for this account')}`,
      );
    }

    // 4. Crear sesión temporal con tokens cifrados via service_role admin client
    const adminClient = createAdminClient();
    const pendingRepo = new SupabasePendingConnectionRepository(adminClient);

    const { pendingConnectionId } = await pendingRepo.createPendingSession({
      organizationId,
      clientId,
      userId: user.id,
      pages,
      ttlMinutes: 10,
    });

    // 5. Redirigir al cliente a settings con pendingConnectionId (0 tokens expuestos)
    return NextResponse.redirect(
      `${requestUrl.origin}/clients/${clientId}/settings?pendingConnectionId=${pendingConnectionId}`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'OAuth exchange failed';
    return NextResponse.redirect(
      `${requestUrl.origin}/clients/${clientId}/settings?error=${encodeURIComponent(msg)}`,
    );
  }
}
