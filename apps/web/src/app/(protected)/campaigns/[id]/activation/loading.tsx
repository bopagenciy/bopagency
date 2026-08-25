import { Header } from '@/components/layout/Header';

/**
 * Loading skeleton para /campaigns/[id]/activation — Phase 8A.3.
 */
export default function CampaignActivationLoading() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Campañas', href: '/campaigns' }, { label: 'Activación' }]} />
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 animate-pulse">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="h-5 w-56 bg-gray-200 rounded" />
              <div className="h-4 w-32 bg-gray-100 rounded" />
            </div>
            <div className="h-6 w-20 bg-gray-200 rounded" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-16 bg-gray-100 rounded" />
                <div className="h-4 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 animate-pulse">
          <div className="h-4 w-40 bg-gray-200 rounded" />
          <div className="h-4 w-full bg-gray-100 rounded" />
          <div className="h-4 w-2/3 bg-gray-100 rounded" />
        </div>
      </div>
    </>
  );
}
