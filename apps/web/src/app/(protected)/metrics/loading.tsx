import { Header } from '@/components/layout/Header';

export default function MetricsLoading() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Métricas' }]} />
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        {/* Summary cards skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 animate-pulse">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
              <div className="h-6 bg-gray-200 rounded w-16" />
            </div>
          ))}
        </div>

        {/* Table skeleton */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white animate-pulse">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="h-4 bg-gray-200 rounded w-full" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-4 py-3 border-b border-gray-50 flex gap-4">
              <div className="flex-1 h-4 bg-gray-100 rounded" />
              <div className="w-20 h-4 bg-gray-100 rounded" />
              <div className="w-16 h-4 bg-gray-100 rounded" />
              <div className="w-16 h-4 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
