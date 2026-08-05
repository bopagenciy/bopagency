import { Header } from '@/components/layout/Header';
import { AutomationsTableSkeleton } from '@/components/automations/AutomationsTableSkeleton';

export default function AutomationsLoading() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Automatizaciones' }]} />
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-6 w-36 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-100 rounded animate-pulse" />
          </div>
          <div className="h-9 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
        <AutomationsTableSkeleton />
      </div>
    </>
  );
}
