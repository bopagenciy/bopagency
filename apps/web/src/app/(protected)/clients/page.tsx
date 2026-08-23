import Link from 'next/link';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Header } from '@/components/layout/Header';
import { ClientList } from '@/components/clients/ClientList';
import type { ClientListItem } from '@/components/clients/ClientList';
import type { ClientRow } from '@/lib/supabase/types';

type SearchParams = {
  search?: string;
  status?: string;
  page?: string;
};

type Props = {
  searchParams: Promise<SearchParams>;
};

export const metadata = { title: 'Clientes' };

export default async function ClientsPage({ searchParams }: Props) {
  const { organization } = await requireOrganization();
  const params = await searchParams;

  const search = params.search?.trim() ?? '';
  const status = params.status ?? '';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const pageSize = 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('clients')
    .select('*', { count: 'exact' })
    .eq('organization_id', organization.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) {
    query = query.eq('status', status as ClientRow['status']);
  }
  if (search) {
    query = query.ilike('name', `%${search}%`);
  }

  const { data, count } = await query;

  const total = count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const clients: ClientListItem[] = (data ?? []).map((row: ClientRow) => ({
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    slug: row.slug,
    status: row.status,
    industry: row.industry,
    email: row.email,
    createdAt: row.created_at,
  }));

  return (
    <>
      <Header
        breadcrumbs={[{ label: 'Clientes', href: '/clients' }]}
        actions={
          <Link
            href="/clients/new"
            className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors"
          >
            + Nuevo cliente
          </Link>
        }
      />
      <div className="p-6 max-w-6xl mx-auto">
        <ClientList
          clients={clients}
          total={total}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          search={search}
          status={status}
        />
      </div>
    </>
  );
}
