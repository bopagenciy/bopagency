import { ACTIVATION_TERMINAL_STATUSES } from '@bop-agency/shared';

/**
 * Separa una lista de `CampaignActivation` (más reciente primero, mismo
 * orden que `listCampaignActivationsByCampaign`) en la activación
 * NO-terminal activa (si hay alguna — nunca debería haber más de una, el
 * INSERT lo impide) y el historial de activaciones terminales. Función
 * pura, sin I/O — extraída de `page.tsx` para poder testearla
 * directamente (Phase 8A.3 §9: empty state / historial terminal / nueva
 * activación tras historial terminal).
 */
export function selectActiveActivation<T extends { status: string }>(
  activations: readonly T[],
): { nonTerminal: T | undefined; terminalHistory: T[] } {
  const nonTerminal = activations.find((a) => !ACTIVATION_TERMINAL_STATUSES.includes(a.status as never));
  const terminalHistory = activations.filter((a) => ACTIVATION_TERMINAL_STATUSES.includes(a.status as never));
  return { nonTerminal, terminalHistory };
}
