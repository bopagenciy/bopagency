import { Header } from '@/components/layout/Header';

/**
 * Loading skeleton para /campaigns — auditoría de completitud Phase 7E.
 * Mismo patrón que apps/web/src/app/(protected)/alerts/loading.tsx.
 */
export default function CampaignsLoading() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Campañas' }]} />
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-9 w-36 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white animate-pulse">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-full" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-50 flex gap-4">
              <div className="flex-1 h-4 bg-gray-100 rounded" />
              <div className="w-20 h-4 bg-gray-100 rounded" />
              <div className="w-20 h-4 bg-gray-100 rounded" />
              <div className="w-16 h-4 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
