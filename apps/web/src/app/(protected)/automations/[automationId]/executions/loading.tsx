import { Header } from '@/components/layout/Header';
import { ExecutionsTableSkeleton } from '@/components/automations/ExecutionsTableSkeleton';

export default function AutomationExecutionsLoading() {
  return (
    <>
      <Header
        breadcrumbs={[
          { label: 'Automatizaciones', href: '/automations' },
          { label: '…' },
          { label: 'Ejecuciones' },
        ]}
      />
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="space-y-1 animate-pulse">
          <div className="h-6 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-56 bg-gray-100 rounded" />
        </div>
        <ExecutionsTableSkeleton />
      </div>
    </>
  );
}
