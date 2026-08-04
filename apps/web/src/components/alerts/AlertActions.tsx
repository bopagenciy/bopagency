'use client';

import { useTransition } from 'react';
import type { Alert } from '@bop-agency/domain';
import { acknowledgeAlertAction, resolveAlertAction } from '@/app/(protected)/alerts/actions';
import { getAlertNextStates } from '@bop-agency/domain';

type AlertActionsProps = {
  alert: Alert;
  /** Rol del usuario. Resolver requiere 'operator'+. */
  userRole: string;
};

/** Roles con permiso operator o superior. */
const OPERATOR_ROLES = new Set(['operator', 'strategist', 'admin', 'owner']);

export function AlertActions({ alert, userRole }: AlertActionsProps) {
  const [isPending, startTransition] = useTransition();
  const nextStates = getAlertNextStates(alert.status);

  const canAcknowledge = nextStates.includes('acknowledged');
  const canResolve = nextStates.includes('resolved') && OPERATOR_ROLES.has(userRole);

  if (!canAcknowledge && !canResolve) {
    return null;
  }

  function handleAcknowledge() {
    startTransition(async () => {
      await acknowledgeAlertAction({ alertId: alert.id });
    });
  }

  function handleResolve() {
    startTransition(async () => {
      await resolveAlertAction({ alertId: alert.id });
    });
  }

  return (
    <div
      className="flex items-center gap-2"
      aria-label={`Acciones para alerta ${alert.title ?? alert.alertType}`}
    >
      {canAcknowledge && (
        <button
          onClick={handleAcknowledge}
          disabled={isPending}
          className="px-2.5 py-1 text-xs font-medium rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
          aria-busy={isPending}
        >
          {isPending ? 'Procesando…' : 'Reconocer'}
        </button>
      )}
      {canResolve && (
        <button
          onClick={handleResolve}
          disabled={isPending}
          className="px-2.5 py-1 text-xs font-medium rounded border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
          aria-busy={isPending}
        >
          {isPending ? 'Procesando…' : 'Resolver'}
        </button>
      )}
    </div>
  );
}
