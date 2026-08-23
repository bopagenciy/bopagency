/**
 * CampaignAutomationActivity — Phase 7F.
 *
 * Sección de solo lectura en el detalle de campaña que muestra si el
 * evento de automatización interno esperado para el status ACTUAL de la
 * campaña generó una tarea operativa activa (Phase 6 `tasks`, reutilizado
 * — NO se crea un widget/tabla nueva, ver §12 de la especificación).
 *
 * LIMITACIÓN CONOCIDA (documentada, no oculta): `TaskRepository` (Phase 6)
 * solo expone `findActiveBySignatureTag` — una búsqueda de tareas ACTIVAS
 * (pending/in_progress/blocked), no un historial completo por campaña. Por
 * eso esta sección muestra "hay una tarea activa pendiente" cuando existe,
 * pero NO un log histórico completo de automatización (eso requeriría un
 * método de repositorio nuevo — deferido, ver PHASE_7F report §"UI/dashboard
 * integration"). Es intencional y coherente con §11: "No sobrecargar
 * Campaign detail".
 *
 * Server Component — recibe la tarea ya resuelta (o null) como prop; toda
 * la lectura ocurre en el Server Component padre (page.tsx), este solo
 * renderiza.
 */

import Link from 'next/link';
import type { Task } from '@bop-agency/domain';

type CampaignAutomationActivityProps = {
  /** Tarea activa asociada al último evento de automatización relevante, si existe. */
  task: Pick<Task, 'id' | 'title' | 'priority' | 'status'> | null;
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

export function CampaignAutomationActivity({ task }: CampaignAutomationActivityProps) {
  if (!task) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
      <h2 className="font-semibold text-gray-900">Actividad / Automatización</h2>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-800">{task.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Prioridad: {PRIORITY_LABELS[task.priority] ?? task.priority}
          </p>
        </div>
        <Link
          href="/tasks"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700 shrink-0"
        >
          Ver tarea →
        </Link>
      </div>
      <p className="text-xs text-gray-400">
        Generada automáticamente por Campaign Studio. No implica ninguna publicación en un
        proveedor externo (Meta Ads, Google Ads, YouTube, email o redes sociales).
      </p>
    </div>
  );
}
