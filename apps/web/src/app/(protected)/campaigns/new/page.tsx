import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { CampaignWizardForm } from '@/components/campaigns/CampaignWizardForm';
import { requireOrganizationRole } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Nueva campaña' };

export default async function NewCampaignPage() {
  // Crear campañas (manual o vía IA) requiere rol mínimo operator — mismo
  // criterio que generateCampaignDraftWithAI/createCampaignDraft (actions.ts).
  const { organization } = await requireOrganizationRole('operator');
  const supabase = await createServerSupabaseClient();

  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name, status')
    .eq('organization_id', organization.id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('name');

  const clients = (clientRows ?? []).map((row) => ({ id: row.id as string, name: row.name as string }));

  return (
    <>
      <Header
        breadcrumbs={[{ label: 'Campañas', href: '/campaigns' }, { label: 'Nueva campaña' }]}
      />
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Nueva campaña</h1>
          <p className="text-sm text-gray-500 mt-1">
            Genera una propuesta con IA a partir de un brief, o crea un borrador manualmente.
            En ambos casos la campaña queda en estado <span className="font-medium">borrador</span> —
            nunca se publica ni se envía a revisión automáticamente.
          </p>
        </div>

        {clients.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
            No hay clientes activos en esta organización. Crea o activa un cliente antes de generar una campaña.
          </div>
        ) : (
          <CampaignWizardForm clients={clients} />
        )}
      </div>
    </>
  );
}
