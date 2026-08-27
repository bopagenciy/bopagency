import React, { useState, useEffect } from 'react';
import { PublicationJobStatusBadge } from './PublicationJobStatusBadge';
import { PublicationWebhookEvidenceTable } from './PublicationWebhookEvidenceTable';
import type { PublicationWebhookEvidenceItem } from '@bop-agency/application';

type JobDetailData = {
  readonly id: string;
  readonly status: string;
  readonly channel: string;
  readonly provider: string;
  readonly retryCount: number;
  readonly retryOfJobId: string | null;
  readonly createdAt: string;
  readonly attempts?: readonly {
    readonly attemptNumber: number;
    readonly startedAt: string;
    readonly completedAt: string | null;
    readonly providerStatus: string | null;
    readonly failureCategory: string | null;
  }[];
};

type Props = {
  readonly isOpen: boolean;
  readonly job: JobDetailData | null;
  readonly onClose: () => void;
  readonly fetchEvidence?: (jobId: string) => Promise<PublicationWebhookEvidenceItem[]>;
};

export function PublicationJobDetailsDrawer({
  isOpen,
  job,
  onClose,
  fetchEvidence,
}: Props) {
  const [activeTab, setActiveTab] = useState<'attempts' | 'evidence'>('attempts');
  const [evidence, setEvidence] = useState<PublicationWebhookEvidenceItem[]>([]);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);

  useEffect(() => {
    if (isOpen && job && fetchEvidence) {
      setIsLoadingEvidence(true);
      fetchEvidence(job.id)
        .then((items) => setEvidence(items))
        .catch(() => setEvidence([]))
        .finally(() => setIsLoadingEvidence(false));
    }
  }, [isOpen, job, fetchEvidence]);

  if (!isOpen || !job) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <section
        className="absolute inset-y-0 right-0 max-w-full flex pl-10"
        aria-labelledby="drawer-title"
        role="dialog"
      >
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-6 bg-gray-50 border-b border-border flex items-center justify-between">
            <div>
              <h2 id="drawer-title" className="text-base font-semibold text-gray-900">
                Detalle del Trabajo de Publicación
              </h2>
              <p className="text-xs font-mono text-gray-500 mt-0.5">{job.id}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 font-bold p-1"
              aria-label="Cerrar detalles"
            >
              ✕
            </button>
          </div>

          {/* Job summary */}
          <div className="p-6 space-y-3 border-b border-border text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Estado:</span>
              <PublicationJobStatusBadge status={job.status} />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Canal / Proveedor:</span>
              <span className="font-medium text-gray-900 capitalize">
                {job.channel} / {job.provider}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Reintentos:</span>
              <span className="font-mono text-gray-900">{job.retryCount}</span>
            </div>
            {job.retryOfJobId && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Reintento de:</span>
                <span className="font-mono text-xs text-blue-600">{job.retryOfJobId}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-xs text-gray-500">
              <span>Creado:</span>
              <span>{new Date(job.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border bg-gray-50/50">
            <button
              type="button"
              onClick={() => setActiveTab('attempts')}
              className={`flex-1 py-2.5 text-xs font-semibold text-center border-b-2 ${
                activeTab === 'attempts'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Intentos ({job.attempts?.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('evidence')}
              className={`flex-1 py-2.5 text-xs font-semibold text-center border-b-2 ${
                activeTab === 'evidence'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Evidencia Webhooks ({evidence.length})
            </button>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'attempts' && (
              <div className="space-y-3">
                {!job.attempts || job.attempts.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-4">No hay intentos registrados.</p>
                ) : (
                  job.attempts.map((att) => (
                    <div
                      key={att.attemptNumber}
                      className="p-3 border border-border rounded-lg text-xs space-y-1 bg-white"
                    >
                      <div className="flex justify-between font-semibold text-gray-800">
                        <span>Intento #{att.attemptNumber}</span>
                        <span className="text-gray-500">{att.completedAt ? 'Completado' : 'En proceso'}</span>
                      </div>
                      {att.failureCategory && (
                        <p className="text-rose-600 font-mono">Fallo: {att.failureCategory}</p>
                      )}
                      {att.providerStatus && (
                        <p className="text-gray-600">{att.providerStatus}</p>
                      )}
                      <p className="text-gray-400 text-[10px]">
                        Inicio: {new Date(att.startedAt).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'evidence' && (
              <PublicationWebhookEvidenceTable evidence={evidence} isLoading={isLoadingEvidence} />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
