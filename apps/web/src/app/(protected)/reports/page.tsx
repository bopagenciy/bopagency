import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { UnderConstruction } from '@/components/common';

export const metadata: Metadata = { title: 'Reportes' };

export default function ReportsPage() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Reportes' }]} />
      <div className="p-6">
        <UnderConstruction
          module="Reportes"
          description="La generación y gestión de reportes estará disponible en la Fase 9."
          availableIn="Fase 9"
        />
      </div>
    </>
  );
}
