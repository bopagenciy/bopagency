import { requireOrganizationRole } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout/Header';
import { DocumentEditor } from '@/components/clients/DocumentEditor';
import { upsertDocumentAction } from '../../../actions';
import type { ClientRow, ClientDocumentRow } from '@/lib/supabase/types';

type Params = Promise<{ clientId: string; key: string }>;
type Props = { params: Params };

export async function generateMetadata({ params }: Props) {
  const { key } = await params;
  return { title: `Documento: ${key}` };
}

export default async function DocumentEditorPage({ params }: Props) {
  const { clientId, key: documentKey } = await params;
  const { organization } = await requireOrganizationRole('operator');
  const supabase = await createServerSupabaseClient();

  // Fetch client name for breadcrumb
  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .eq('organization_id', organization.id)
    .single();

  const typedClient = client as Pick<ClientRow, 'name'> | null;

  // Fetch existing document (null → new document mode)
  const { data: doc } = await supabase
    .from('client_documents')
    .select('*')
    .eq('client_id', clientId)
    .eq('organization_id', organization.id)
    .eq('document_key', documentKey)
    .maybeSingle();

  const typedDoc = doc as ClientDocumentRow | null;

  const defaultTitle = typedDoc?.title ?? documentKey.replace(/-|_/g, ' ');
  const defaultContent = typedDoc?.content ?? '';
  const defaultStatus = typedDoc?.status ?? 'draft';
  const defaultCategory = typedDoc?.category ?? 'general';
  const version = typedDoc?.version ?? 0;

  return (
    <>
      <Header
        breadcrumbs={[
          { label: 'Clientes', href: '/clients' },
          { label: typedClient?.name ?? clientId, href: `/clients/${clientId}` },
          { label: defaultTitle },
        ]}
      />
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">{defaultTitle}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Clave: <code className="font-mono bg-gray-100 px-1 rounded">{documentKey}</code>
            {version > 0 && ` · Versión ${version}`}
          </p>
        </div>
        <DocumentEditor
          clientId={clientId}
          documentKey={documentKey}
          defaultTitle={defaultTitle}
          defaultContent={defaultContent}
          defaultStatus={defaultStatus}
          defaultCategory={defaultCategory}
          version={version}
          action={upsertDocumentAction}
        />
      </div>
    </>
  );
}
