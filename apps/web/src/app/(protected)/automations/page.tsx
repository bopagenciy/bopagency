import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { UnderConstruction } from '@/components/common';

export const metadata: Metadata = { title: 'Automatizaciones' };

export default function AutomationsPage() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Automatizaciones' }]} />
      <div className="p-6">
        <UnderConstruction
          module="Motor de Automatización"
          description="El motor de automatizaciones estará disponible en la Fase 8. Gestiona workflows, historial de ejecuciones y alertas de fallos."
          availableIn="Fase 8"
        />
      </div>
    </>
  );
}
