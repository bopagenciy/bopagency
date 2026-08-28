import type { ActivationEventType } from '@bop-agency/shared';

export type ActivationEventRow = {
  id: string;
  eventType: string;
  actorUserId: string | null;
  isSystem: boolean;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
};

const EVENT_LABELS: Record<ActivationEventType, string> = {
  activation_created: 'Activación creada',
  target_added: 'Canal agregado',
  target_removed: 'Canal eliminado',
  activation_status_changed: 'Cambio de estado de la activación',
  target_status_changed: 'Cambio de estado del canal',
  activation_cancelled: 'Activación cancelada',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Timeline de auditoría append-only de una activación (activation_created,
 * target_added, cambios de estado, cancelaciones) — Phase 8A.3, sección E.
 * Puramente de solo lectura; los eventos se escriben exclusivamente desde
 * triggers/RPCs de infraestructura (nunca desde aquí).
 */
export function ActivationEventTimeline({ events }: { events: ActivationEventRow[] }) {
  if (events.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-border p-6" data-testid="events-empty-state">
        <h2 className="font-semibold text-gray-900 mb-2">Historial de eventos</h2>
        <p className="text-sm text-gray-500">Todavía no hay eventos registrados.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6 space-y-3">
      <h2 className="font-semibold text-gray-900">Historial de eventos</h2>
      <ul className="space-y-3">
        {events.map((event) => (
          <li key={event.id} className="text-sm border-l-2 border-gray-200 pl-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-800">
                {EVENT_LABELS[event.eventType as ActivationEventType] ?? event.eventType}
              </span>
              {event.fromStatus && event.toStatus && (
                <span className="text-xs text-gray-400">
                  {event.fromStatus} → {event.toStatus}
                </span>
              )}
              <span className="text-gray-400 text-xs">{formatDate(event.createdAt)}</span>
              {event.isSystem && (
                <span className="text-xs text-gray-400 italic">(sistema)</span>
              )}
            </div>
            {event.note && <p className="text-gray-600 mt-0.5">{event.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
