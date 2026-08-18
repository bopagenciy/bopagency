'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AI_PROVIDER_LABELS } from '@bop-agency/shared';
import type { AIProviderId } from '@bop-agency/shared';
import { regenerateCampaignContentAction } from '@/app/(protected)/campaigns/actions';
import { AIProviderSelect, AI_PROVIDER_DEFAULT_OPTION } from './AIProviderSelect';

const OPERATOR_ROLES = new Set(['operator', 'strategist', 'admin', 'owner']);

type RegenerateContentButtonProps = {
  campaignId: string;
  status: string;
  userRole: string;
  /**
   * Phase 7D.1 — proveedor con el que se generó el contenido actual
   * (`metadata.ai.provider`), si existe. Se usa solo para etiquetar la opción
   * por defecto; la reutilización real la decide el servidor (el use case lee
   * la misma metadata), no este componente.
   */
  currentProvider?: AIProviderId | null;
};

/**
 * Botón para reemplazar el `generated_content` de una campaña que sigue en
 * 'draft' (Phase 7D §13). Cada regeneración sobrescribe la anterior sin
 * dejar historial (limitación documentada — R-TECH-07).
 *
 * Phase 7D.1: permite regenerar con otro proveedor de IA. Por defecto NO se
 * envía `provider`, lo que hace que el servidor reutilice el proveedor
 * original de la campaña — cambiar de proveedor es siempre una acción
 * deliberada del usuario. El selector solo aparece al desplegarlo, para no
 * añadir ruido al caso común de "regenerar igual".
 */
export function RegenerateContentButton({
  campaignId,
  status,
  userRole,
  currentProvider = null,
}: RegenerateContentButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [provider, setProvider] = useState<string>(AI_PROVIDER_DEFAULT_OPTION);

  if (status !== 'draft' || !OPERATOR_ROLES.has(userRole)) return null;

  const defaultOptionLabel = currentProvider
    ? `Mismo proveedor (${AI_PROVIDER_LABELS[currentProvider]})`
    : 'Usar predeterminado del servidor';

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await regenerateCampaignContentAction({
        campaignId,
        ...(provider && { provider }),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          disabled={isPending}
          className="px-3 py-1.5 text-xs font-medium rounded border border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50 transition-colors"
          aria-busy={isPending}
        >
          {isPending ? 'Regenerando…' : '✨ Regenerar con IA'}
        </button>
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          disabled={isPending}
          aria-expanded={showOptions}
          className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50 transition-colors"
        >
          {showOptions ? 'Ocultar opciones' : 'Opciones'}
        </button>
      </div>

      {showOptions && (
        <div className="w-64">
          <AIProviderSelect
            id="regenerateAiProvider"
            value={provider}
            onChange={setProvider}
            disabled={isPending}
            defaultOptionLabel={defaultOptionLabel}
            helpText="Cambiar de proveedor reemplaza el contenido actual; no se conserva historial de la generación anterior."
          />
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
