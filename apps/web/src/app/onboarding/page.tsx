import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { OnboardingForm } from './OnboardingForm';

export const metadata: Metadata = {
  title: 'Configura tu organización',
};

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Si ya tiene org activa en user_preferences, skip onboarding
  const [{ data: prefs }, { data: profile }] = await Promise.all([
    supabase
      .from('user_preferences')
      .select('active_organization_id')
      .eq('user_id', user.id)
      .single(),
    supabase.from('profiles').select('full_name').eq('id', user.id).single(),
  ]);

  if (prefs?.active_organization_id) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-white font-bold text-lg">
            B
          </div>
          <div>
            <p className="font-bold text-white text-lg leading-tight">BopIAgency</p>
            <p className="text-xs text-gray-400 leading-tight">Sistema Operativo Digital</p>
          </div>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          <h1 className="text-xl font-bold text-white mb-1">Crea tu organización</h1>
          <p className="text-sm text-gray-400 mb-6">
            Bienvenido{profile?.full_name ? `, ${profile.full_name}` : ''}. Configura tu
            organización para empezar.
          </p>

          <OnboardingForm userId={user.id} />
        </div>
      </div>
    </div>
  );
}
