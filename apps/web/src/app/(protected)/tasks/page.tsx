import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { UnderConstruction } from '@/components/common';

export const metadata: Metadata = { title: 'Tareas' };

export default function TasksPage() {
  return (
    <>
      <Header breadcrumbs={[{ label: 'Tareas' }]} />
      <div className="p-6">
        <UnderConstruction
          module="Gestión de Tareas"
          description="La gestión de tareas estará disponible en la Fase 5."
          availableIn="Fase 5"
        />
      </div>
    </>
  );
}
