import { createHash } from 'crypto';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import {
  GoogleOAuthClient,
  GoogleAdsDiscoveryClient,
  encryptCredential,
} from '@bop-agency/infrastructure';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const stateNonce = requestUrl.searchParams.get('state');
  const errorParam =
    requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      `${requestUrl.origin}/clients?error=${encodeURIComponent(errorParam)}`,
    );
  }

  if (!code || !stateNonce) {
    return NextResponse.redirect(
      `${requestUrl.origin}/clients?error=missing_oauth_parameters`,
    );
  }

  // 1. Autenticar usuario desde cookies
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.redirect(`${requestUrl.origin}/login?error=unauthenticated`);
  }

  // 2. Consumir oauth_state con p_expected_provider = 'google'
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
    p_expected_provider: 'google',
  });

  if (stateErr || !stateResult || stateResult.success !== true) {
    const errMsg = stateResult?.message || stateErr?.message || 'Invalid or expired OAuth state';
    return NextResponse.redirect(
      `${requestUrl.origin}/clients?error=${encodeURIComponent(errMsg)}`,
    );
  }

  const organizationId = stateResult.organization_id || '';
  const clientId = stateResult.client_id || '';
  const redirectUri =
    process.env['GOOGLE_OAUTH_REDIRECT_URI'] ||
    `${requestUrl.origin}/api/auth/oauth/google/callback`;

  // 3. Intercambiar authorization code por tokens
  const googleClientId = process.env['GOOGLE_CLIENT_ID'];
  const googleClientSecret = process.env['GOOGLE_CLIENT_SECRET'];

  if (!googleClientId || !googleClientSecret) {
    return NextResponse.redirect(
      `${requestUrl.origin}/clients/${clientId}?error=server_configuration_missing`,
    );
  }

  const oauthClient = new GoogleOAuthClient(googleClientId, googleClientSecret);
  let tokenResult;

  try {
    tokenResult = await oauthClient.exchangeCodeForTokens(code, redirectUri);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      `${requestUrl.origin}/clients/${clientId}?error=${encodeURIComponent(msg)}`,
    );
  }

  // 4. Crear pending_oauth_connection
  const adminClient = createAdminClient();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { data: pendingConn, error: pendingErr } = await adminClient
    .from('pending_oauth_connections')
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      user_id: user.id,
      provider: 'google',
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (pendingErr || !pendingConn) {
    return NextResponse.redirect(
      `${requestUrl.origin}/clients/${clientId}?error=failed_pending_connection`,
    );
  }

  const pendingConnectionId = pendingConn.id;

  const dbClient = adminClient as unknown as {
    from: (table: string) => {
      insert: (data: unknown) => Promise<{ error: unknown }>;
      upsert: (data: unknown, options: unknown) => Promise<{ error: unknown }>;
    };
  };

  if (tokenResult.refreshToken) {
    const encrypted = encryptCredential(tokenResult.refreshToken);
    await dbClient.from('pending_google_oauth_credentials').insert({
      pending_connection_id: pendingConnectionId,
      key_version: encrypted.keyVersion,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      auth_tag: encrypted.authTag,
    });
  }

  // 6. Ejecutar Google Ads Discovery de cuentas accesibles y guardar metadata en pending_google_oauth_resources
  const devToken = process.env['GOOGLE_ADS_DEVELOPER_TOKEN'] || '';
  const apiVersion = process.env['GOOGLE_ADS_API_VERSION'] || 'v25';
  const discoveryClient = new GoogleAdsDiscoveryClient(devToken, apiVersion);

  try {
    const accessibleIds = await discoveryClient.listAccessibleCustomers(tokenResult.accessToken);
    const pendingResources: Array<{
      pending_connection_id: string;
      customer_id: string;
      customer_name: string;
      manager_customer_id: string | null;
      is_manager: boolean;
      currency_code: string | null;
      time_zone: string | null;
    }> = [];

    for (const custId of accessibleIds) {
      const meta = await discoveryClient.searchCustomerMetadata(tokenResult.accessToken, custId);
      if (meta) {
        pendingResources.push({
          pending_connection_id: pendingConnectionId,
          customer_id: meta.customerId,
          customer_name: meta.customerName,
          manager_customer_id: null,
          is_manager: meta.isManager,
          currency_code: meta.currencyCode || null,
          time_zone: meta.timeZone || null,
        });

        // Si es cuenta manager, descubrir clientes hijo
        if (meta.isManager) {
          const children = await discoveryClient.searchCustomerClientHierarchy(
            tokenResult.accessToken,
            meta.customerId,
          );
          for (const child of children) {
            pendingResources.push({
              pending_connection_id: pendingConnectionId,
              customer_id: child.customerId,
              customer_name: child.customerName,
              manager_customer_id: meta.customerId,
              is_manager: child.isManager,
              currency_code: child.currencyCode || null,
              time_zone: child.timeZone || null,
            });
          }
        }
      }
    }

    if (pendingResources.length > 0) {
      await dbClient.from('pending_google_oauth_resources').upsert(pendingResources, {
        onConflict: 'pending_connection_id,customer_id,manager_customer_id',
      });
    }
  } catch {
    // Si falla discovery (ej. token de desarrollador sin permiso), continua a la pantalla de selección sin recursos parciales
  }

  // 7. Redirigir al frontend a la página pública de selección de cuenta
  return NextResponse.redirect(
    `${requestUrl.origin}/clients/${clientId}/integrations/google/select?pendingId=${pendingConnectionId}`,
  );
}
