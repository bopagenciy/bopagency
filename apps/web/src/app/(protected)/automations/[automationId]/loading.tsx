import { Header } from '@/components/layout/Header';
import { ExecutionsTableSkeleton } from '@/components/automations/ExecutionsTableSkeleton';

export default function AutomationDetailLoading() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Automatizaciones', href: '/automations' }, { label: '…' }]} />
      <div className="p-6 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="h-6 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-100 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-20 bg-gray-100 rounded" />
                <div className="h-4 w-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-5 w-40 bg-gray-200 rounded" />
          <ExecutionsTableSkeleton />
        </div>
      </div>
    </>
  );
}
