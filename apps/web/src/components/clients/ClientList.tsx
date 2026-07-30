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
          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label="Buscar clientes"
        />
        <select
          defaultValue={status}
          onChange={(e) => updateSearch('status', e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
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
      <p className="text-sm text-gray-500 mb-4">
        {total === 0
          ? 'Sin clientes'
          : `${total} cliente${total !== 1 ? 's' : ''}${page > 1 || totalPages > 1 ? ` — página ${page} de ${totalPages}` : ''}`}
      </p>

      {/* Empty state */}
      {clients.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">👥</div>
          <p className="font-medium text-gray-600 mb-1">
            {search || status ? 'Sin resultados' : 'Sin clientes aún'}
          </p>
          <p className="text-sm">
            {search || status ? 'Prueba con otros filtros' : 'Crea tu primer cliente para empezar'}
          </p>
        </div>
      )}

      {/* Table */}
      {clients.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
                  Industria
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <Link
                        href={`/clients/${client.id}`}
                        className="font-medium text-gray-900 hover:text-red-600 transition-colors"
                      >
                        {client.name}
                      </Link>
                      {client.email && (
                        <p className="text-xs text-gray-400 mt-0.5">{client.email}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {client.industry ? (INDUSTRY_LABELS[client.industry] ?? client.industry) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ClientStatusBadge status={client.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/clients/${client.id}`}
                      className="text-xs text-red-600 hover:underline"
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
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages || isPending}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
