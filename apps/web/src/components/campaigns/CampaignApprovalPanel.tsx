'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Campaign } from '@bop-agency/domain';
import {
  submitCampaignForReviewAction,
  approveCampaignAction,
  rejectCampaignAction,
} from '@/app/(protected)/campaigns/actions';

const OPERATOR_ROLES = new Set(['operator', 'strategist', 'admin', 'owner']);
const ADMIN_ROLES = new Set(['admin', 'owner']);

type CampaignApprovalPanelProps = {
  campaign: Campaign;
  /** Rol del usuario autenticado en la organización activa. */
  userRole: string;
};

/**
 * Panel de acciones del ciclo de vida de aprobación de una campaña
 * (draft → review → approved/rejected). NO decide publicación — "approved"
 * significa lista para publicación humana en una fase posterior, nunca
 * publicada automáticamente (ver PHASE_7_RISK_REGISTER.md R-PROD-01).
 */
export function CampaignApprovalPanel({ campaign, userRole }: CampaignApprovalPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [note, setNote] = useState('');

  const isOperator = OPERATOR_ROLES.has(userRole);
  const isAdmin = ADMIN_ROLES.has(userRole);

  const canSubmit = isOperator && campaign.status === 'draft';
  const canDecide = isAdmin && campaign.status === 'review';

  if (!canSubmit && !canDecide) return null;

  function handleSubmitForReview() {
    setError(null);
    startTransition(async () => {
      const result = await submitCampaignForReviewAction({ campaignId: campaign.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveCampaignAction({ campaignId: campaign.id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleReject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (note.trim().length === 0) {
      setError('La nota de rechazo es requerida.');
      return;
    }
    startTransition(async () => {
      const result = await rejectCampaignAction({ campaignId: campaign.id, note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowRejectForm(false);
      setNote('');
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <h2 className="font-semibold text-gray-900">Flujo de aprobación</h2>

      {error && (
        <div role="alert" className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      {canSubmit && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            Esta campaña está en borrador. Envíala a revisión cuando el contenido esté listo.
          </p>
          <button
            onClick={handleSubmitForReview}
            disabled={isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Enviando…' : 'Enviar a revisión'}
          </button>
        </div>
      )}

      {canDecide && !showRejectForm && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
            Esta campaña está en revisión. Apruébala o recházala con una nota explicando el motivo.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleApprove}
              disabled={isPending}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Procesando…' : 'Aprobar'}
            </button>
            <button
              onClick={() => setShowRejectForm(true)}
              disabled={isPending}
              className="px-4 py-2 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              Rechazar
            </button>
          </div>
          <p className="text-xs text-gray-400">
            &ldquo;Aprobada&rdquo; significa lista para publicación humana en una fase posterior — esta
            acción no publica nada en Meta/Google/YouTube.
          </p>
        </div>
      )}

      {canDecide && showRejectForm && (
        <form onSubmit={handleReject} className="space-y-2">
          <label htmlFor="reject-note" className="block text-sm font-medium text-gray-700">
            Nota de rechazo <span className="text-red-500">*</span>
          </label>
          <textarea
            id="reject-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required
            placeholder="Explica por qué se rechaza esta campaña..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Rechazando…' : 'Confirmar rechazo'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRejectForm(false);
                setNote('');
                setError(null);
              }}
              disabled={isPending}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
