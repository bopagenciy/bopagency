import { notFound } from 'next/navigation';
import { requireOrganizationRole } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout/Header';
import { ClientForm } from '@/components/clients/ClientForm';
import { updateClientAction } from '../../actions';
import type { ClientRow, ClientIndustry } from '@/lib/supabase/types';

type Params = Promise<{ clientId: string }>;
type Props = { params: Params };

export async function generateMetadata({ params }: Props) {
  const { clientId } = await params;
  return { title: `Editar cliente: ${clientId}` };
}

export default async function EditClientPage({ params }: Props) {
  const { clientId } = await params;
  const { organization } = await requireOrganizationRole('operator');
  const supabase = await createServerSupabaseClient();

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('organization_id', organization.id)
    .is('deleted_at', null)
    .single();

  if (!client) notFound();

  const typedClient = client as ClientRow;

  // Curry the action to include the clientId
  async function boundUpdateAction(formData: FormData) {
    'use server';
    return updateClientAction(clientId, formData);
  }

  return (
    <>
      <Header
        breadcrumbs={[
          { label: 'Clientes', href: '/clients' },
          { label: typedClient.name, href: `/clients/${clientId}` },
          { label: 'Editar' },
        ]}
      />
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">Editar cliente</h1>
          <p className="text-sm text-muted-foreground mt-1">{typedClient.name}</p>
        </div>
        <ClientForm
          action={boundUpdateAction}
          mode="edit"
          defaultValues={{
            id: typedClient.id,
            name: typedClient.name,
            legalName: typedClient.legal_name,
            slug: typedClient.slug,
            status: typedClient.status,
            industry: (typedClient.industry as ClientIndustry | null) ?? null,
            timezone: typedClient.timezone,
            currency: typedClient.currency,
            website: typedClient.website,
            email: typedClient.email,
            phone: typedClient.phone,
            notes: typedClient.notes,
          }}
        />
      </div>
    </>
  );
}
