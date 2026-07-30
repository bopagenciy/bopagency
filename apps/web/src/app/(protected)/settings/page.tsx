import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout/Header';
import { SettingsClient } from './SettingsClient';

export const metadata: Metadata = { title: 'Configuración' };

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, active_organization_id')
    .eq('id', user.id)
    .single();

  // Fetch preferences
  const { data: preferences } = await supabase
    .from('user_preferences')
    .select('language, timezone, email_notifications')
    .eq('user_id', user.id)
    .single();

  // Fetch organizations with membership roles
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('role, organizations(id, name, slug, plan)')
    .eq('user_id', user.id);

  const organizations = (memberships ?? [])
    .map((m: { role: string; organizations: unknown }) => {
      const org = m.organizations as {
        id: string;
        name: string;
        slug: string;
        plan: string;
      } | null;
      if (!org) return null;
      return { ...org, role: m.role };
    })
    .filter(Boolean) as Array<{
    id: string;
    name: string;
    slug: string;
    plan: string;
    role: string;
  }>;

  return (
    <>
      <Header breadcrumbs={[{ label: 'Configuración' }]} />
      <div className="p-6 max-w-3xl">
        <SettingsClient
          userId={user.id}
          userEmail={user.email ?? ''}
          profile={{
            fullName: profile?.full_name ?? null,
            avatarUrl: profile?.avatar_url ?? null,
            activeOrganizationId: profile?.active_organization_id ?? null,
          }}
          preferences={{
            language: preferences?.language ?? 'es',
            timezone: preferences?.timezone ?? 'America/Bogota',
            emailNotifications: preferences?.email_notifications ?? true,
          }}
          organizations={organizations}
        />
      </div>
    </>
  );
}
