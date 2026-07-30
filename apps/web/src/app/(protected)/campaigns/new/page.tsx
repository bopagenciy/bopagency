import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { UnderConstruction } from '@/components/common';

export const metadata: Metadata = { title: 'Nueva Campaña' };

export default function NewCampaignPage() {
  return (
    <>
      <Header
        breadcrumbs={[{ label: 'Campañas', href: '/campaigns' }, { label: 'Nueva campaña' }]}
      />
      <div className="p-6">
        <UnderConstruction
          module="Crear Campaña"
          description="La creación de campañas con IA estará disponible en la Fase 7."
          availableIn="Fase 7"
        />
      </div>
    </>
  );
}
