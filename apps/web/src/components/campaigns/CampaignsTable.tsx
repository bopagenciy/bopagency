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
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm" aria-label="Lista de campañas">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Campaña</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
              Cliente
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
              Plataforma
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground hidden md:table-cell">
              Presupuesto
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">
              Actualizada
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {campaigns.map((campaign) => (
            <tr key={campaign.id} className="hover:bg-muted/40 transition-colors">
              <td className="px-4 py-3">
                <Link
                  href={`/campaigns/${campaign.id}`}
                  className="font-medium text-foreground hover:underline transition-colors"
                >
                  {campaign.name}
                </Link>
                {campaign.generatedContent && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100/80 text-amber-900 border border-amber-200">
                    IA
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                {clientNames[campaign.clientId] ?? '—'}
              </td>
              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                {PLATFORM_LABELS[campaign.platform as AdPlatform] ?? campaign.platform}
              </td>
              <td className="px-4 py-3">
                <CampaignStatusBadge status={campaign.status} />
              </td>
              <td className="px-4 py-3 text-right text-foreground font-medium hidden md:table-cell">
                {formatBudget(campaign.budget, campaign.currency)}
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell">
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
