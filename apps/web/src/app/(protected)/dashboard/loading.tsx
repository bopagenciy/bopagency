import { Header } from '@/components/layout/Header';
import { SummaryCardSkeleton } from '@/components/dashboard/SummaryCard';

export default function DashboardLoading() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Dashboard' }]} />
      <div className="p-6 space-y-6">
        {/* KPI skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SummaryCardSkeleton key={i} />
          ))}
        </div>

        {/* Content skeleton */}
        <div className="grid lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 animate-pulse">
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="h-4 bg-gray-200 rounded w-32" />
              </div>
              <div className="px-5 py-3 space-y-3">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-10 bg-gray-100 rounded" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
