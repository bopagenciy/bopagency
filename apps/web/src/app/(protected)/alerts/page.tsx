import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { UnderConstruction } from '@/components/common';

export const metadata: Metadata = { title: 'Alertas' };

export default function AlertsPage() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Alertas' }]} />
      <div className="p-6">
        <UnderConstruction
          module="Sistema de Alertas"
          description="El sistema de alertas estará disponible en la Fase 5 como parte del Dashboard Principal."
          availableIn="Fase 5"
        />
      </div>
    </>
  );
}
