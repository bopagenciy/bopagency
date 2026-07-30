import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { UnderConstruction } from '@/components/common';

export const metadata: Metadata = { title: 'Campañas' };

export default function CampaignsPage() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Campañas' }]} />
      <div className="p-6">
        <UnderConstruction
          module="Campaign Studio"
          description="El estudio de campañas estará disponible en la Fase 7. Crea, revisa y aprueba campañas de Meta, Google y YouTube con asistencia de IA."
          availableIn="Fase 7"
        />
      </div>
    </>
  );
}
