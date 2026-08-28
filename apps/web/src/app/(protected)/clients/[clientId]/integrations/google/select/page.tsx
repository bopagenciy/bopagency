import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getPendingGoogleResourcesAction, finalizeGoogleIntegrationAction } from '../actions';
import { GoogleCustomerSelector } from '@/components/integrations/GoogleCustomerSelector';

export default async function GoogleSelectAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ pendingId?: string }>;
}) {
  const { clientId } = await params;
  const { pendingId } = await searchParams;

  if (!pendingId) {
    redirect(`/clients/${clientId}?error=missing_pending_id`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Obtener la organización del cliente
  const { data: client } = await supabase
    .from('clients')
    .select('organization_id, name')
    .eq('id', clientId)
    .single();

  if (!client) {
    redirect('/clients?error=client_not_found');
  }

  const result = await getPendingGoogleResourcesAction(pendingId, client.organization_id, clientId);

  if (!result.success || !result.value) {
    redirect(`/clients/${clientId}?error=${encodeURIComponent(result.error || 'Failed to load pending resources')}`);
  }

  const handleSelectCustomer = async (selectedResourceId: string) => {
    'use server';
    const res = await finalizeGoogleIntegrationAction(
      pendingId,
      selectedResourceId,
      client.organization_id,
      clientId,
    );

    if (!res.success) {
      throw new Error(res.error || 'Finalization failed');
    }

    redirect(`/clients/${clientId}?integration=connected`);
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Google Ads Account Selection</h1>
        <p className="text-sm text-slate-500 mt-1">Client: {client.name}</p>
      </div>

      <GoogleCustomerSelector customers={result.value} onSelectCustomer={handleSelectCustomer} />
    </div>
  );
}
