'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelCampaignActivationAction } from '@/app/(protected)/campaigns/[id]/activation/actions';

const STRATEGIST_ROLES = new Set(['strategist', 'admin', 'owner']);

type CancelActivationPanelProps = {
  campaignId: string;
  activationId: string;
  userRole: string;
  /** true si el status actual de la activación permite cancelarla (canCancelActivation, domain). */
  canCancel: boolean;
};

/**
 * Cancelación de la activación completa — requiere razón obligatoria y
 * confirmación explícita. Rol mínimo: strategist (operator NUNCA puede
 * cancelar una activación completa, §5 del kickoff de 8A.3).
 */
export function CancelActivationPanel({
  campaignId,
  activationId,
  userRole,
  canCancel,
}: CancelActivationPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState('');

  const canAct = STRATEGIST_ROLES.has(userRole);

  if (!canAct || !canCancel) return null;

  function handleConfirmCancel() {
    setError(null);
    if (reason.trim().length === 0) {
      setError('La razón de cancelación es requerida.');
      return;
    }
    startTransition(async () => {
      const result = await cancelCampaignActivationAction({
        campaignId,
        activationId,
        reason: reason.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setShowForm(false);
      setShowConfirm(false);
      setReason('');
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-red-100 p-6 space-y-3">
      <h2 className="font-semibold text-gray-900">Cancelar activación</h2>
      <p className="text-sm text-gray-500">
        Cancela toda la activación y sus canales pendientes. Esta acción no se puede deshacer.
      </p>

      {error && (
        <div role="alert" className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="px-4 py-2 border border-red-300 text-red-700 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
        >
          Cancelar activación…
        </button>
      )}

      {showForm && (
        <div className="space-y-2">
          <label htmlFor="cancel-activation-reason" className="block text-sm font-medium text-gray-700">
            Razón de cancelación <span className="text-red-500">*</span>
          </label>
          <textarea
            id="cancel-activation-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="Explica por qué se cancela esta activación..."
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          />

          {!showConfirm ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (reason.trim().length === 0) {
                    setError('La razón de cancelación es requerida.');
                    return;
                  }
                  setError(null);
                  setShowConfirm(true);
                }}
                disabled={isPending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setReason('');
                  setError(null);
                }}
                disabled={isPending}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
              <p className="text-sm text-red-800 font-medium">
                ¿Confirmas la cancelación de esta activación? Esta acción no se puede deshacer.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={isPending}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Cancelando…' : 'Sí, cancelar activación'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
