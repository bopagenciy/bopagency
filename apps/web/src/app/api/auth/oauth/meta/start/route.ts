/**
 * /api/auth/oauth/meta/start/route.ts — Phase 8E.
 *
 * Route Handler para iniciar el flujo de OAuth con Meta.
 * Requiere autenticación de usuario. Genera el state nonce y retorna la URL de redirección a Meta.
 */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { connectMetaIntegration } from '@bop-agency/application';
import { getMetaGraphApiVersion, getMetaAppConfig, getMetaLoginConfigId } from '@bop-agency/infrastructure';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get('organizationId');
  const clientId = searchParams.get('clientId');
  const redirectUri =
    searchParams.get('redirectUri') ||
    `${new URL(request.url).origin}/api/auth/oauth/meta/callback`;

  if (!organizationId || !clientId) {
    return NextResponse.json(
      { error: 'organizationId and clientId are required' },
      { status: 400 },
    );
  }

  let appId: string;
  let apiVersion: string;
  let configId: string | undefined;

  try {
    const config = getMetaAppConfig();
    appId = config.appId;
    apiVersion = getMetaGraphApiVersion();
    configId = getMetaLoginConfigId();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Server configuration error: ${msg}` }, { status: 500 });
  }

  const result = await connectMetaIntegration(supabase, {
    organizationId,
    clientId,
    actorUserId: user.id,
    redirectUri,
    appId,
    apiVersion,
    configId,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    oauthUrl: result.value.oauthUrl,
    expiresAt: result.value.expiresAt,
  });
}
