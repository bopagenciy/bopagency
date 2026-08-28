'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PublicationJobsTable, type JobListItem } from './PublicationJobsTable';
import { PublicationReconciliationModal } from './PublicationReconciliationModal';
import { PublicationJobDetailsDrawer } from './PublicationJobDetailsDrawer';
import {
  cancelPublicationJobAction,
  retryPublicationAction,
  reconcilePublicationOutcomeAction,
  getPublicationWebhookEvidenceAction,
} from '@/app/(protected)/campaigns/[id]/activation/publication-actions';
import type { PublicationWebhookEvidenceItem } from '@bop-agency/application';

type Props = {
  readonly campaignId: string;
  readonly activationId: string;
  readonly userRole: string;
  readonly jobs: readonly JobListItem[];
};

export function PublicationOperationsPanel({
  campaignId,
  userRole,
  jobs,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals / Drawer state
  const [reconcileJobId, setReconcileJobId] = useState<string | null>(null);
  const [detailsJob, setDetailsJob] = useState<JobListItem | null>(null);

  const unknownJobs = jobs.filter((j) => j.status === 'unknown_outcome');
  const queuedCount = jobs.filter((j) => j.status === 'queued').length;
  const inProgressCount = jobs.filter((j) => j.status === 'in_progress').length;
  const succeededCount = jobs.filter((j) => j.status === 'succeeded').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  const handleRefresh = () => {
    setActionError(null);
    startTransition(() => {
      router.refresh();
    });
  };

  const handleCancel = async (jobId: string) => {
    if (!confirm('¿Está seguro de cancelar este trabajo de publicación?')) return;
    setActionError(null);
    const res = await cancelPublicationJobAction({ jobId, campaignId });
    if (!res.success) {
      setActionError(res.error);
    } else {
      router.refresh();
    }
  };

  const handleRetry = async (jobId: string) => {
    if (!confirm('¿Desea reintentar la publicación de este trabajo fallido? Se creará un nuevo trabajo encadenado.')) return;
    setActionError(null);
    const res = await retryPublicationAction({ jobId, campaignId });
    if (!res.success) {
      setActionError(res.error);
    } else {
      router.refresh();
    }
  };

  const handleReconcileSubmit = async (data: {
    outcome: 'published' | 'not_published';
    note: string;
    externalId?: string;
    externalUrl?: string;
  }) => {
    if (!reconcileJobId) return;
    setActionError(null);
    const res = await reconcilePublicationOutcomeAction({
      jobId: reconcileJobId,
      campaignId,
      outcome: data.outcome,
      note: data.note,
      ...(data.externalId ? { externalId: data.externalId } : {}),
      ...(data.externalUrl ? { externalUrl: data.externalUrl } : {}),
    });
    if (!res.success) {
      setActionError(res.error);
    } else {
      router.refresh();
    }
  };

  const fetchEvidence = async (jobId: string): Promise<PublicationWebhookEvidenceItem[]> => {
    const res = await getPublicationWebhookEvidenceAction({ jobId });
    if (res.success) return res.data;
    return [];
  };

  return (
    <div className="bg-white rounded-xl border border-border p-6 space-y-6 shadow-sm">
      {/* Header & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            📡 Operaciones de Publicación
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Monitoreo y control operativo de envíos a canales externos (Meta, Google, etc.)
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 disabled:opacity-50"
        >
          <span>🔄</span>
          {isPending ? 'Actualizando...' : 'Actualizar estado'}
        </button>
      </div>

      {/* Summary Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-center">
          <p className="text-xs text-blue-600 font-medium">Encolados</p>
          <p className="text-lg font-bold text-blue-900 mt-0.5">{queuedCount}</p>
        </div>
        <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-lg text-center">
          <p className="text-xs text-amber-600 font-medium">En progreso</p>
          <p className="text-lg font-bold text-amber-900 mt-0.5">{inProgressCount}</p>
        </div>
        <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg text-center">
          <p className="text-xs text-emerald-600 font-medium">Exitosos</p>
          <p className="text-lg font-bold text-emerald-900 mt-0.5">{succeededCount}</p>
        </div>
        <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-lg text-center">
          <p className="text-xs text-rose-600 font-medium">Fallidos</p>
          <p className="text-lg font-bold text-rose-900 mt-0.5">{failedCount}</p>
        </div>
        <div className="p-3 bg-amber-100/50 border border-amber-200 rounded-lg text-center">
          <p className="text-xs text-amber-800 font-medium">Indeterminados</p>
          <p className="text-lg font-bold text-amber-950 mt-0.5">{unknownJobs.length}</p>
        </div>
      </div>

      {/* Error Notice */}
      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex justify-between items-center">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Unknown outcome warning banner */}
      {unknownJobs.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-xs text-amber-900">
          <p className="font-semibold text-sm flex items-center gap-1.5">
            ⚠️ Resultado Indeterminado ({unknownJobs.length} trabajo{unknownJobs.length > 1 ? 's' : ''})
          </p>
          <p>
            El estado de la publicación no pudo ser verificado automáticamente (timeout o error del proveedor). Es posible que la publicación haya sido procesada en la plataforma externa. <strong>No intente reintentar a ciegas.</strong> Un estratega debe revisar la evidencia y reconciliar el estado manualmente.
          </p>
        </div>
      )}

      {/* Jobs Table */}
      <PublicationJobsTable
        jobs={jobs}
        userRole={userRole}
        onCancel={handleCancel}
        onRetry={handleRetry}
        onOpenReconcile={(jobId) => setReconcileJobId(jobId)}
        onOpenDetails={(job) => setDetailsJob(job)}
      />

      {/* Reconciliation Modal */}
      {reconcileJobId && (
        <PublicationReconciliationModal
          isOpen={!!reconcileJobId}
          jobId={reconcileJobId}
          campaignId={campaignId}
          onClose={() => setReconcileJobId(null)}
          onReconcile={handleReconcileSubmit}
        />
      )}

      {/* Job Details Drawer */}
      {detailsJob && (
        <PublicationJobDetailsDrawer
          isOpen={!!detailsJob}
          job={detailsJob}
          onClose={() => setDetailsJob(null)}
          fetchEvidence={fetchEvidence}
        />
      )}
    </div>
  );
}
