'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { CAMPAIGN_STATUSES } from '@bop-agency/shared';
import type { CampaignStatus } from '@bop-agency/shared';
import { AD_PLATFORMS, PLATFORM_LABELS } from '@bop-agency/shared';
import type { AdPlatform } from '@bop-agency/shared';

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Borrador',
  review: 'En revisión',
  approved: 'Aprobada',
  active: 'Activa',
  paused: 'Pausada',
  completed: 'Completada',
  rejected: 'Rechazada',
};

type CampaignsFiltersProps = {
  status: string;
  platform: string;
};

export function CampaignsFilters({ status, platform }: CampaignsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete('page');
    startTransition(() => {
      router.push(`/campaigns?${params.toString()}`);
    });
  }

  return (
    <div
      className={`flex flex-col sm:flex-row gap-3 ${isPending ? 'opacity-70' : ''}`}
      role="search"
      aria-label="Filtros de campañas"
    >
      <select
        value={status}
        onChange={(e) => updateFilter('status', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
        aria-label="Filtrar por estado"
      >
        <option value="">Todos los estados</option>
        {CAMPAIGN_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <select
        value={platform}
        onChange={(e) => updateFilter('platform', e.target.value)}
        className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
        aria-label="Filtrar por plataforma"
      >
        <option value="">Todas las plataformas</option>
        {AD_PLATFORMS.map((p: AdPlatform) => (
          <option key={p} value={p}>
            {PLATFORM_LABELS[p]}
          </option>
        ))}
      </select>
    </div>
  );
}
