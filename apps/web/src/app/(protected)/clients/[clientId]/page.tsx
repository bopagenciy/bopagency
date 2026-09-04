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
  const hasMetaIntegration = typedIntegrations.some(
    (i) => i.provider === 'meta' && i.status === 'active',
  );

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
              className="px-3.5 py-1.5 border border-border bg-card rounded-md text-sm font-medium hover:bg-muted transition-colors text-foreground"
            >
              Editar
            </Link>
          ) : undefined
        }
      />

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Client header card */}
        <div className="bg-card text-card-foreground rounded-lg border border-border p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">{typedClient.name}</h1>
                <ClientStatusBadge status={typedClient.status} />
              </div>
              {typedClient.legal_name && (
                <p className="text-sm text-muted-foreground">{typedClient.legal_name}</p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {typedClient.industry && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5 font-medium">Industria</p>
                <p className="text-foreground">
                  {INDUSTRY_LABELS[typedClient.industry] ?? typedClient.industry}
                </p>
              </div>
            )}
            {typedClient.email && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5 font-medium">Email</p>
                <a
                  href={`mailto:${typedClient.email}`}
                  className="text-foreground hover:underline truncate block font-medium"
                >
                  {typedClient.email}
                </a>
              </div>
            )}
            {typedClient.phone && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5 font-medium">Teléfono</p>
                <p className="text-foreground">{typedClient.phone}</p>
              </div>
            )}
            {typedClient.website && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5 font-medium">Sitio web</p>
                <a
                  href={typedClient.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline truncate block font-medium"
                >
                  {typedClient.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5 font-medium">Moneda</p>
              <p className="text-foreground">{typedClient.currency}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5 font-medium">Zona horaria</p>
              <p className="text-foreground">{typedClient.timezone}</p>
            </div>
          </div>

          {typedClient.notes && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 font-medium">Notas</p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{typedClient.notes}</p>
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="bg-card text-card-foreground rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Documentos</h2>
            {canManage && (
              <Link
                href={`/clients/${clientId}/documents/nuevo`}
                className="text-sm text-foreground font-semibold hover:underline"
              >
                + Nuevo documento
              </Link>
            )}
          </div>
          {typedDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin documentos. Crea el primero con el botón de arriba.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {typedDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/clients/${clientId}/documents/${doc.document_key}`}
                      className="font-medium text-foreground hover:underline transition-colors"
                    >
                      {doc.title}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc.category} · v{doc.version} · {doc.status}
                    </p>
                  </div>
                  <Link
                    href={`/clients/${clientId}/documents/${doc.document_key}`}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Editar →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contacts */}
        <div className="bg-card text-card-foreground rounded-lg border border-border p-6">
          <h2 className="font-semibold text-foreground mb-4">Contactos</h2>
          {typedContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin contactos registrados.</p>
          ) : (
            <div className="divide-y divide-border">
              {typedContacts.map((contact) => (
                <div key={contact.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground text-sm">{contact.name}</p>
                    {contact.is_primary && (
                      <span className="text-xs bg-amber-100/80 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                        Principal
                      </span>
                    )}
                  </div>
                  {contact.title && <p className="text-xs text-muted-foreground mt-0.5">{contact.title}</p>}
                  <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
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
        <div className="bg-card text-card-foreground rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground">Integraciones</h2>
            {canManage && (
              <div className="flex items-center gap-2">
                <a
                  href={`/api/auth/oauth/google/start?organizationId=${organization.id}&clientId=${clientId}&intent=connect`}
                  className="text-xs px-3 py-1.5 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary-hover transition-colors"
                >
                  + Conectar Google Ads
                </a>
                {!hasMetaIntegration ? (
                  <a
                    href={`/api/auth/oauth/meta/start?organizationId=${organization.id}&clientId=${clientId}&redirect=true`}
                    className="text-xs px-3 py-1.5 bg-secondary text-secondary-foreground border border-border font-medium rounded-md hover:bg-secondary/80 transition-colors"
                  >
                    + Conectar Meta
                  </a>
                ) : (
                  <span className="text-xs px-2.5 py-1 text-muted-foreground font-medium border border-border rounded-md bg-muted/40">
                    Meta conectada
                  </span>
                )}
              </div>
            )}
          </div>

          {typedIntegrations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin integraciones configuradas.</p>
          ) : (
            <div className="divide-y divide-border">
              {typedIntegrations.map((integration) => (
                <div key={integration.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-foreground text-sm capitalize">
                      {integration.provider.replace('_', ' ')}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">{integration.external_account_id}</p>
                    {typeof (integration.configuration as Record<string, unknown> | null)?.['customer_name'] === 'string' && (
                      <p className="text-xs text-muted-foreground font-medium">
                        {(integration.configuration as Record<string, unknown>)['customer_name'] as string}
                      </p>
                    )}
                    {typeof (integration.configuration as Record<string, unknown> | null)?.['page_name'] === 'string' && (
                      <p className="text-xs text-muted-foreground font-medium">
                        {(integration.configuration as Record<string, unknown>)['page_name'] as string}
                      </p>
                    )}
                    {typeof (integration.configuration as Record<string, unknown> | null)?.['account_name'] === 'string' && (
                      <p className="text-xs text-muted-foreground font-medium">
                        {(integration.configuration as Record<string, unknown>)['account_name'] as string}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        integration.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : integration.status === 'error'
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {integration.status}
                    </span>

                    {integration.provider === 'google' && canManage && (
                      <a
                        href={`/api/auth/oauth/google/start?organizationId=${organization.id}&clientId=${clientId}&intent=reconnect`}
                        className="text-xs text-foreground font-medium hover:underline ml-2"
                      >
                        Reconectar
                      </a>
                    )}
                    {integration.provider === 'meta' && canManage && (
                      <a
                        href={`/api/auth/oauth/meta/start?organizationId=${organization.id}&clientId=${clientId}&redirect=true`}
                        className="text-xs text-foreground font-medium hover:underline ml-2"
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
          <div className="bg-card rounded-lg border border-destructive/40 p-6">
            <h2 className="font-semibold text-destructive mb-2">Zona de peligro</h2>
            <p className="text-sm text-muted-foreground mb-4">
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
                className="px-4 py-2 bg-destructive text-destructive-foreground text-sm rounded-md font-medium hover:bg-destructive/90 transition-colors"
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
