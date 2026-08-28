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
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand — mismo tratamiento que (auth)/layout.tsx (Phase 8A.0 polish),
            asset recortado + contenedor no-cuadrado (149x80) en el micro-polish */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div className="shrink-0 w-[149px] h-20 rounded-2xl bg-white flex items-center justify-center overflow-hidden p-2 shadow-sm border border-border">
            <Image
              src="/brand/bopagency-logo-trimmed.png"
              alt="Bop Agency"
              width={149}
              height={80}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <div className="text-center">
            <p className="font-bold text-foreground text-lg leading-tight">BopIAgency</p>
            <p className="text-xs text-muted-foreground leading-tight">Sistema Operativo Digital</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">
          <h1 className="text-xl font-bold text-foreground mb-1">Crea tu organización</h1>
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
