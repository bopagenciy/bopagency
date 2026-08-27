import React from 'react';
import { PublicationJobStatusBadge } from './PublicationJobStatusBadge';

export type JobListItem = {
  readonly id: string;
  readonly targetId: string;
  readonly channel: string;
  readonly provider: string;
  readonly status: string;
  readonly retryCount: number;
  readonly retryOfJobId: string | null;
  readonly createdAt: string;
  readonly attemptsCount?: number;
};

type Props = {
  readonly jobs: readonly JobListItem[];
  readonly userRole: string;
  readonly onQueue?: (targetId: string) => Promise<void>;
  readonly onCancel?: (jobId: string) => Promise<void>;
  readonly onRetry?: (jobId: string) => Promise<void>;
  readonly onOpenReconcile?: (jobId: string) => void;
  readonly onOpenDetails?: (job: JobListItem) => void;
};

export function PublicationJobsTable({
  jobs,
  userRole,
  onCancel,
  onRetry,
  onOpenReconcile,
  onOpenDetails,
}: Props) {
  const isOperatorOrHigher = ['operator', 'strategist', 'admin', 'owner'].includes(userRole);
  const isStrategistOrHigher = ['strategist', 'admin', 'owner'].includes(userRole);

  if (jobs.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-gray-500 border border-dashed border-border rounded-xl bg-gray-50">
        No hay trabajos de publicación registrados para esta activación.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-border rounded-xl bg-white shadow-sm">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider border-b border-border">
          <tr>
            <th className="px-4 py-3">Canal / Proveedor</th>
            <th className="px-4 py-3">Estado</th>
            <th className="px-4 py-3">Reintentos</th>
            <th className="px-4 py-3">ID Trabajo</th>
            <th className="px-4 py-3 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {jobs.map((job) => {
            const isQueuedOrClaimed = ['queued', 'claimed'].includes(job.status);
            const isInProgress = job.status === 'in_progress';
            const isFailed = job.status === 'failed';
            const isUnknown = job.status === 'unknown_outcome';

            const canCancel =
              (isQueuedOrClaimed && isOperatorOrHigher) ||
              (isInProgress && isStrategistOrHigher);

            const canRetry = isFailed && isStrategistOrHigher;
            const canReconcile = isUnknown && isStrategistOrHigher;

            return (
              <tr key={job.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 capitalize">
                  {job.channel} <span className="text-gray-400 font-normal">/ {job.provider}</span>
                </td>
                <td className="px-4 py-3">
                  <PublicationJobStatusBadge status={job.status} />
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {job.retryCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-purple-700 font-semibold" title={`Reintento de ${job.retryOfJobId}`}>
                      #{job.retryCount} 🔗
                    </span>
                  ) : (
                    '0'
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{job.id.substring(0, 8)}...</td>
                <td className="px-4 py-3 text-right space-x-2">
                  {/* Cancel action */}
                  {canCancel && onCancel && (
                    <button
                      type="button"
                      onClick={() => onCancel(job.id)}
                      className="px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100"
                      title={isInProgress ? 'Solicitar cancelación cooperativa de publicación en progreso' : 'Cancelar trabajo encolado'}
                    >
                      {isInProgress ? 'Solicitar Cancelación' : 'Cancelar'}
                    </button>
                  )}

                  {/* Retry action */}
                  {canRetry && onRetry && (
                    <button
                      type="button"
                      onClick={() => onRetry(job.id)}
                      className="px-2.5 py-1 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100"
                    >
                      Reintentar
                    </button>
                  )}

                  {/* Disabled retry explanation for unknown_outcome */}
                  {isUnknown && !isStrategistOrHigher && (
                    <span
                      className="inline-block px-2 py-1 text-xs text-gray-400 bg-gray-100 rounded cursor-not-allowed"
                      title="No se puede reintentar un trabajo con resultado indeterminado. Se requiere reconciliación previa por un estratega."
                    >
                      Reintentar (Desactivado)
                    </span>
                  )}

                  {/* Reconcile action */}
                  {canReconcile && onOpenReconcile && (
                    <button
                      type="button"
                      onClick={() => onOpenReconcile(job.id)}
                      className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-100 border border-amber-300 rounded hover:bg-amber-200"
                    >
                      Reconciliar
                    </button>
                  )}

                  {/* Details action */}
                  {onOpenDetails && (
                    <button
                      type="button"
                      onClick={() => onOpenDetails(job)}
                      className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded hover:bg-gray-200"
                    >
                      Detalles
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
