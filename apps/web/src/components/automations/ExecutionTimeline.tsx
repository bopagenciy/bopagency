import type { ExecutionLog } from '@bop-agency/domain';

const LEVEL_STYLES: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  warn: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
};

const LEVEL_DOT: Record<string, string> = {
  info: 'bg-blue-400',
  warn: 'bg-amber-400',
  error: 'bg-red-500',
};

type ExecutionTimelineProps = {
  logs: ExecutionLog[];
};

export function ExecutionTimeline({ logs }: ExecutionTimelineProps) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        No hay eventos registrados para esta ejecución.
      </p>
    );
  }

  return (
    <ol className="relative border-l border-gray-200 space-y-6 pl-6" aria-label="Timeline de ejecución">
      {logs.map((log) => (
        <li key={log.id} className="relative">
          {/* Dot */}
          <span
            className={`absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full border-2 border-white ${LEVEL_DOT[log.level] ?? 'bg-gray-400'}`}
            aria-hidden="true"
          />

          <div className="flex items-start gap-3">
            {/* Level badge */}
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase shrink-0 ${LEVEL_STYLES[log.level] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {log.level}
            </span>

            <div className="flex-1 min-w-0">
              {/* Event type */}
              <p className="text-xs font-mono text-gray-500">{log.event}</p>
              {/* Message */}
              <p className="text-sm text-gray-800 mt-0.5">{log.message}</p>
              {/* Timestamp */}
              <time
                dateTime={log.occurredAt.toISOString()}
                className="text-[11px] text-gray-400 mt-0.5 block"
              >
                {new Date(log.occurredAt).toLocaleString('es-CO', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
