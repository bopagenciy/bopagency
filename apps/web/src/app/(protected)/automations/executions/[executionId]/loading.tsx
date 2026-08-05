import { Header } from '@/components/layout/Header';

export default function ExecutionDetailLoading() {
  return (
    <>
      <Header
        breadcrumbs={[
          { label: 'Automatizaciones', href: '/automations' },
          { label: '…' },
          { label: 'Ejecuciones' },
          { label: '…' },
        ]}
      />
      <div className="p-6 max-w-7xl mx-auto space-y-6 animate-pulse">
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="h-6 w-72 bg-gray-200 rounded" />
          <div className="h-4 w-40 bg-gray-100 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-20 bg-gray-100 rounded" />
                <div className="h-4 w-24 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="h-5 w-36 bg-gray-200 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-3 w-3 rounded-full bg-gray-200 shrink-0 mt-1" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-24 bg-gray-100 rounded" />
                <div className="h-4 w-64 bg-gray-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
