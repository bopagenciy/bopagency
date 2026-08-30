import type { Metadata } from 'next';
import Image from 'next/image';
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-2 mb-8 text-center">
          <Image
            src="/brand/bopagency-logo.png"
            alt="BopAgency"
            width={160}
            height={42}
            priority
            className="h-10 w-auto object-contain"
          />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-1">
            Configuración Inicial de Cuenta
          </p>
        </div>

        <div className="bg-card text-card-foreground rounded-lg border border-border p-6 sm:p-8 shadow-sm">
          <h1 className="text-xl font-bold tracking-tight text-foreground mb-1">Crea tu organización</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Bienvenido{profile?.full_name ? `, ${profile.full_name}` : ''}. Configura tu
            organización para empezar.
          </p>

          <OnboardingForm userId={user.id} />
        </div>
      </div>
    </div>
  );
}
