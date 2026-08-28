import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout/Header';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { softDeleteClientAction } from '../actions';
import type {
  ClientRow,
  ClientContactRow,
  ClientDocumentRow,
  ClientIntegrationRow,
} from '@/lib/supabase/types';

type Params = Promise<{ clientId: string }>;

type Props = { params: Params };

export async function generateMetadata({ params }: Props) {
  const { clientId } = await params;
  return { title: `Cliente: ${clientId}` };
}

export default async function ClientDetailPage({ params }: Props) {
  const { clientId } = await params;
  const { organization, membership } = await requireOrganization();
  const supabase = await createServerSupabaseClient();

  // Fetch client
  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .eq('organization_id', organization.id)
    .is('deleted_at', null)
    .single();

  if (!client) notFound();

  const typedClient = client as ClientRow;

  // Fetch related data in parallel
  const [{ data: contacts }, { data: documents }, { data: integrations }] = await Promise.all([
    supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', clientId)
      .eq('organization_id', organization.id)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('name'),
    supabase
      .from('client_documents')
      .select('*')
      .eq('client_id', clientId)
      .eq('organization_id', organization.id)
      .order('document_key'),
    supabase
      .from('client_integrations')
      .select('*')
      .eq('client_id', clientId)
      .eq('organization_id', organization.id)
      .order('provider'),
  ]);

  const typedContacts = (contacts ?? []) as ClientContactRow[];
  const typedDocuments = (documents ?? []) as ClientDocumentRow[];
  const typedIntegrations = (integrations ?? []) as ClientIntegrationRow[];

  const canManage = ['operator', 'strategist', 'admin', 'owner'].includes(membership.role);
  const canDelete = ['admin', 'owner'].includes(membership.role);

  const INDUSTRY_LABELS: Record<string, string> = {
    hospitality: 'Hospitalidad',
    legal: 'Legal',
    ecommerce: 'E-commerce',
    retail: 'Retail',
    healthcare: 'Salud',
    technology: 'Tecnología',
    education: 'Educación',
    real_estate: 'Inmobiliaria',
    finance: 'Finanzas',
    food_beverage: 'Alimentos y Bebidas',
    other: 'Otro',
  };

  return (
    <>
      <Header
        breadcrumbs={[{ label: 'Clientes', href: '/clients' }, { label: typedClient.name }]}
        actions={
          canManage ? (
            <Link
              href={`/clients/${clientId}/edit`}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Editar
            </Link>
          ) : undefined
        }
      />

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Client header card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{typedClient.name}</h1>
                <ClientStatusBadge status={typedClient.status} />
              </div>
              {typedClient.legal_name && (
                <p className="text-sm text-gray-500">{typedClient.legal_name}</p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {typedClient.industry && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Industria</p>
                <p className="text-gray-700">
                  {INDUSTRY_LABELS[typedClient.industry] ?? typedClient.industry}
                </p>
              </div>
            )}
            {typedClient.email && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Email</p>
                <a
                  href={`mailto:${typedClient.email}`}
                  className="text-blue-600 hover:underline truncate block"
                >
                  {typedClient.email}
                </a>
              </div>
            )}
            {typedClient.phone && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Teléfono</p>
                <p className="text-gray-700">{typedClient.phone}</p>
              </div>
            )}
            {typedClient.website && (
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Sitio web</p>
                <a
                  href={typedClient.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate block"
                >
                  {typedClient.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Moneda</p>
              <p className="text-gray-700">{typedClient.currency}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wide mb-0.5">Zona horaria</p>
              <p className="text-gray-700">{typedClient.timezone}</p>
            </div>
          </div>

          {typedClient.notes && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Notas</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{typedClient.notes}</p>
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Documentos</h2>
            {canManage && (
              <Link
                href={`/clients/${clientId}/documents/nuevo`}
                className="text-sm text-red-600 hover:underline"
              >
                + Nuevo documento
              </Link>
            )}
          </div>
          {typedDocuments.length === 0 ? (
            <p className="text-sm text-gray-400">
              Sin documentos. Crea el primero con el botón de arriba.
            </p>
          ) : (
            <div className="divide-y divide-gray-50">
              {typedDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/clients/${clientId}/documents/${doc.document_key}`}
                      className="font-medium text-gray-800 hover:text-red-600 transition-colors"
                    >
                      {doc.title}
                    </Link>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {doc.category} · v{doc.version} · {doc.status}
                    </p>
                  </div>
                  <Link
                    href={`/clients/${clientId}/documents/${doc.document_key}`}
                    className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                  >
                    Editar →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contacts */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Contactos</h2>
          {typedContacts.length === 0 ? (
            <p className="text-sm text-gray-400">Sin contactos registrados.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {typedContacts.map((contact) => (
                <div key={contact.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800 text-sm">{contact.name}</p>
                    {contact.is_primary && (
                      <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        Principal
                      </span>
                    )}
                  </div>
                  {contact.title && <p className="text-xs text-gray-400 mt-0.5">{contact.title}</p>}
                  <div className="flex gap-4 mt-1 text-xs text-gray-500">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="hover:underline">
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && <span>{contact.phone}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Integrations */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Integraciones</h2>
            {canManage && (
              <a
                href={`/api/auth/oauth/google/start?organizationId=${organization.id}&clientId=${clientId}&intent=connect`}
                className="text-xs px-3 py-1.5 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors"
              >
                + Conectar Google Ads
              </a>
            )}
          </div>

          {typedIntegrations.length === 0 ? (
            <p className="text-sm text-gray-400">Sin integraciones configuradas.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {typedIntegrations.map((integration) => (
                <div key={integration.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-gray-800 text-sm capitalize">
                      {integration.provider.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">{integration.external_account_id}</p>
                    {typeof (integration.configuration as Record<string, unknown> | null)?.['customer_name'] === 'string' && (
                      <p className="text-xs text-gray-500 font-medium">
                        {(integration.configuration as Record<string, unknown>)['customer_name'] as string}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        integration.status === 'active'
                          ? 'bg-green-50 text-green-700'
                          : integration.status === 'error'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-gray-50 text-gray-500'
                      }`}
                    >
                      {integration.status}
                    </span>

                    {integration.provider === 'google' && canManage && (
                      <a
                        href={`/api/auth/oauth/google/start?organizationId=${organization.id}&clientId=${clientId}&intent=reconnect`}
                        className="text-xs text-indigo-600 hover:text-indigo-800 underline ml-2"
                      >
                        Reconectar
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


        {/* Danger zone */}
        {canDelete && (
          <div className="bg-white rounded-xl border border-red-200 p-6">
            <h2 className="font-semibold text-red-700 mb-2">Zona de peligro</h2>
            <p className="text-sm text-gray-500 mb-4">
              Eliminar el cliente lo marcará como eliminado y no aparecerá en la lista. Esta acción
              puede revertirse desde la base de datos.
            </p>
            <form
              action={async () => {
                'use server';
                await softDeleteClientAction(clientId);
              }}
            >
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                Eliminar cliente
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
