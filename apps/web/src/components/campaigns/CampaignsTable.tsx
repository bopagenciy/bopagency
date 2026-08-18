import Link from 'next/link';
import type { Campaign } from '@bop-agency/domain';
import { PLATFORM_LABELS } from '@bop-agency/shared';
import type { AdPlatform } from '@bop-agency/shared';
import { CampaignStatusBadge } from './CampaignStatusBadge';
import { EmptyState } from '@/components/common/EmptyState';

function formatBudget(budget: number, currency: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(budget);
}

type CampaignsTableProps = {
  campaigns: Campaign[];
  clientNames: Record<string, string>;
};

export function CampaignsTable({ campaigns, clientNames }: CampaignsTableProps) {
  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon="📣"
        title="Sin campañas"
        description="No hay campañas que coincidan con los filtros seleccionados."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm" aria-label="Lista de campañas">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Campaña</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
              Cliente
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden sm:table-cell">
              Plataforma
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600 hidden md:table-cell">
              Presupuesto
            </th>
            <th className="px-4 py-3 text-left font-medium text-gray-600 hidden md:table-cell">
              Actualizada
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {campaigns.map((campaign) => (
            <tr key={campaign.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="font-medium text-gray-900 hover:text-red-600 transition-colors"
                >
                  {campaign.name}
                </Link>
                {campaign.generatedContent && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 ring-1 ring-inset ring-purple-200">
                    IA
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                {clientNames[campaign.clientId] ?? '—'}
              </td>
              <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                {PLATFORM_LABELS[campaign.platform as AdPlatform] ?? campaign.platform}
              </td>
              <td className="px-4 py-3">
                <CampaignStatusBadge status={campaign.status} />
              </td>
              <td className="px-4 py-3 text-right text-gray-700 hidden md:table-cell">
                {formatBudget(campaign.budget, campaign.currency)}
              </td>
              <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                {new Date(campaign.updatedAt).toLocaleDateString('es-CO', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
