'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { ClientStatusBadge } from './ClientStatusBadge';
import type { ClientStatus } from '@/lib/supabase/types';

export type ClientListItem = {
  id: string;
  name: string;
  legalName: string | null;
  slug: string;
  status: ClientStatus;
  industry: string | null;
  email: string | null;
  createdAt: string;
};

type ClientListProps = {
  clients: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  status: string;
};

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

export function ClientList({
  clients,
  total,
  page,
  pageSize: _pageSize,
  totalPages,
  search,
  status,
}: ClientListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateSearch(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page'); // reset to page 1 on filter change
    startTransition(() => {
      router.push(`/clients?${params.toString()}`);
    });
  }

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    startTransition(() => {
      router.push(`/clients?${params.toString()}`);
    });
  }

  return (
    <div className={isPending ? 'opacity-70 transition-opacity' : ''}>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="search"
          placeholder="Buscar clientes..."
          defaultValue={search}
          onChange={(e) => updateSearch('search', e.target.value)}
          className="flex-1 px-3.5 py-2 border border-border rounded-md bg-card text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Buscar clientes"
        />
        <select
          defaultValue={status}
          onChange={(e) => updateSearch('status', e.target.value)}
          className="px-3 py-2 border border-border rounded-md bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="onboarding">Onboarding</option>
          <option value="inactive">Inactivo</option>
          <option value="churned">Churn</option>
        </select>
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground mb-4">
        {total === 0
          ? 'Sin clientes'
          : `${total} cliente${total !== 1 ? 's' : ''}${page > 1 || totalPages > 1 ? ` — página ${page} de ${totalPages}` : ''}`}
      </p>

      {/* Empty state */}
      {clients.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">👥</div>
          <p className="font-medium text-foreground mb-1">
            {search || status ? 'Sin resultados' : 'Sin clientes aún'}
          </p>
          <p className="text-sm">
            {search || status ? 'Prueba con otros filtros' : 'Crea tu primer cliente para empezar'}
          </p>
        </div>
      )}

      {/* Table */}
      {clients.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
                  Industria
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium text-foreground hover:underline transition-colors"
                      >
                        {client.name}
                      </Link>
                      {client.email && (
                        <p className="text-xs text-muted-foreground mt-0.5">{client.email}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {client.industry ? (INDUSTRY_LABELS[client.industry] ?? client.industry) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ClientStatusBadge status={client.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/clients/${client.id}`}
                      className="text-xs font-medium text-foreground hover:underline"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1 || isPending}
            className="px-3 py-1.5 text-sm border border-border bg-card rounded-md disabled:opacity-40 hover:bg-muted transition-colors text-foreground"
          >
            ← Anterior
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || isPending}
            className="px-3 py-1.5 text-sm border border-border bg-card rounded-md disabled:opacity-40 hover:bg-muted transition-colors text-foreground"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
