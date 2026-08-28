import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { connectGoogleIntegration } from '@bop-agency/application';

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
  const rawIntent = searchParams.get('intent');
  const intent = rawIntent === 'reconnect' || rawIntent === 'reconsent' ? rawIntent : 'connect';

  if (!organizationId || !clientId) {
    return NextResponse.json(
      { error: 'organizationId and clientId are required' },
      { status: 400 },
    );
  }

  const googleClientId = process.env['GOOGLE_CLIENT_ID'];
  if (!googleClientId) {
    return NextResponse.json(
      { error: 'Server configuration error: GOOGLE_CLIENT_ID is missing' },
      { status: 500 },
    );
  }

  const redirectUri =
    process.env['GOOGLE_OAUTH_REDIRECT_URI'] ||
    `${new URL(request.url).origin}/api/auth/oauth/google/callback`;

  // Crear adaptador simple para encontrar miembros de la organización
  const orgRepo = {
    findMember: async (orgId: string, uId: string) => {
      const { data } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', uId)
        .maybeSingle();
      return data;
    },
  };

  const result = await connectGoogleIntegration(
    supabase,
    {
      organizationId,
      clientId,
      actorUserId: user.id,
      intent,
      redirectUri,
      clientIdGoogle: googleClientId,
    },
    { organizationRepository: orgRepo },
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ url: result.value.authUrl });
}
