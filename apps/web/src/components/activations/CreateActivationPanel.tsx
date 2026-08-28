'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaignActivationAction } from '@/app/(protected)/campaigns/[id]/activation/actions';

const STRATEGIST_ROLES = new Set(['strategist', 'admin', 'owner']);

type CreateActivationPanelProps = {
  campaignId: string;
  campaignStatus: string;
  userRole: string;
  /** true si ya existe una activación NO terminal para esta campaña. */
  hasNonTerminalActivation: boolean;
};

/**
 * Punto de entrada para crear una CampaignActivation manualmente —
 * SIEMPRE una acción explícita (nunca automática al aprobar la campaña,
 * ver PHASE_8A3_WEB_MANUAL_OPERATIONS_REPORT.md §6). Rol mínimo:
 * strategist. Solo visible cuando la campaña está `approved` y no existe
 * ya una activación no-terminal (evita duplicar el path de creación — el
 * backend igual re-verifica y devuelve CONFLICT si dos requests concurrentes
 * llegan a la vez).
 */
export function CreateActivationPanel({
  campaignId,
  campaignStatus,
  userRole,
  hasNonTerminalActivation,
}: CreateActivationPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const canCreate = STRATEGIST_ROLES.has(userRole);

  if (!canCreate) {
    if (campaignStatus !== 'approved' || hasNonTerminalActivation) return null;
    return (
      <div className="bg-white rounded-xl border border-border p-6 space-y-2" data-testid="activation-permission-disabled">
        <h2 className="font-semibold text-gray-900">Activación</h2>
        <p className="text-sm text-gray-500">
          Esta campaña está aprobada y lista para activarse. Solo un estratega o administrador
          puede iniciar la activación.
        </p>
      </div>
    );
  }

  if (campaignStatus !== 'approved') {
    return (
      <div className="bg-white rounded-xl border border-border p-6 space-y-2">
        <h2 className="font-semibold text-gray-900">Activación</h2>
        <p className="text-sm text-gray-500">
          Solo se puede crear una activación para una campaña en estado &ldquo;Aprobada&rdquo;.
        </p>
      </div>
    );
  }

  if (hasNonTerminalActivation) return null;

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const result = await createCampaignActivationAction({
        campaignId,
        notes: notes.trim().length > 0 ? notes.trim() : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6 space-y-3">
      <h2 className="font-semibold text-gray-900">Preparar activación</h2>
      <p className="text-sm text-gray-500">
        Crea la activación de esta campaña aprobada. Esto NO publica nada — solo abre el flujo
        operativo para agregar canales y confirmar publicaciones manuales.
      </p>

      {error && (
        <div role="alert" className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm border border-red-200">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="activation-notes" className="block text-sm font-medium text-gray-700">
          Notas (opcional)
        </label>
        <textarea
          id="activation-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Contexto operativo para esta activación..."
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
        />
      </div>

      <button
        onClick={handleCreate}
        disabled={isPending}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        aria-busy={isPending}
      >
        {isPending ? 'Creando…' : 'Crear activación'}
      </button>
    </div>
  );
}
