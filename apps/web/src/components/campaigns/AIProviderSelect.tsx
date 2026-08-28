'use client';

import { AI_PROVIDER_IDS, AI_PROVIDER_LABELS } from '@bop-agency/shared';

/**
 * Selector de proveedor de IA — Phase 7D.1 (§14).
 *
 * Las opciones se derivan de `AI_PROVIDER_IDS` (@bop-agency/shared), que
 * contiene EXCLUSIVAMENTE proveedores con implementación real en
 * `createCampaignAIProvider`. Nunca se hardcodea la lista aquí, así que la UI
 * no puede ofrecer un proveedor que el servidor no sepa construir.
 *
 * `''` = "usar el predeterminado del servidor" (CAMPAIGN_AI_DEFAULT_PROVIDER).
 * Es un valor legítimo, no un placeholder vacío: la Server Action lo interpreta
 * como "no enviar `provider`".
 *
 * NO hay selector de modelo (§14, explícito): el modelo se resuelve
 * server-side por proveedor y jamás se acepta desde el browser.
 */

export const AI_PROVIDER_DEFAULT_OPTION = '';

type AIProviderSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Etiqueta de la opción "usar predeterminado" — el detalle puede matizarla. */
  defaultOptionLabel?: string;
  helpText?: string;
};

export function AIProviderSelect({
  id = 'aiProvider',
  value,
  onChange,
  disabled = false,
  defaultOptionLabel = 'Usar predeterminado',
  helpText,
}: AIProviderSelectProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
        Proveedor de IA
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
      >
        <option value={AI_PROVIDER_DEFAULT_OPTION}>{defaultOptionLabel}</option>
        {AI_PROVIDER_IDS.map((providerId) => (
          <option key={providerId} value={providerId}>
            {AI_PROVIDER_LABELS[providerId]}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-400 mt-1">
        {helpText ??
          'El modelo concreto lo decide el servidor según el proveedor. Si el proveedor elegido no está configurado, se mostrará un error explícito (no se cambia de proveedor automáticamente).'}
      </p>
    </div>
  );
}
