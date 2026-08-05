'use client';

import { useTransition, useState } from 'react';
import type { Automation } from '@bop-agency/domain';
import { canActivateAutomation, canPauseAutomation, canArchiveAutomation } from '@bop-agency/domain';
import {
  activateAutomationAction,
  pauseAutomationAction,
  archiveAutomationAction,
  startExecutionAction,
} from '@/app/(protected)/automations/actions';

type AutomationActionsProps = {
  automation: Automation;
  /** Rol del usuario autenticado */
  userRole: string;
  /** Vista compacta (tabla) vs. completa (detalle) */
  compact?: boolean;
};

const ADMIN_ROLES = new Set(['admin', 'owner']);
const OPERATOR_ROLES = new Set(['operator', 'strategist', 'admin', 'owner']);

export function AutomationActions({ automation, userRole, compact = false }: AutomationActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isAdmin = ADMIN_ROLES.has(userRole);
  const isOperator = OPERATOR_ROLES.has(userRole);

  const canActivate = isAdmin && canActivateAutomation(automation.status);
  const canPause = isOperator && canPauseAutomation(automation.status);
  const canArchive = isAdmin && canArchiveAutomation(automation.status);
  const canStart = isOperator && automation.status === 'active';

  if (!canActivate && !canPause && !canArchive && !canStart) return null;

  async function handle(action: () => Promise<{ ok: boolean; error?: string }>) {
    setErrorMsg(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok && 'error' in result) {
        setErrorMsg(result.error ?? 'Error desconocido');
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex items-center gap-2 ${compact ? '' : 'flex-wrap'}`}
        aria-label={`Acciones para automatización ${automation.name}`}
      >
        {canStart && (
          <button
            onClick={() => handle(() => startExecutionAction({ automationId: automation.id }))}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400"
            aria-busy={isPending}
          >
            {isPending ? 'Procesando…' : '▶ Ejecutar'}
          </button>
        )}

        {canActivate && (
          <button
            onClick={() => handle(() => activateAutomationAction({ automationId: automation.id }))}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium rounded border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
            aria-busy={isPending}
          >
            {isPending ? 'Procesando…' : 'Activar'}
          </button>
        )}

        {canPause && (
          <button
            onClick={() => handle(() => pauseAutomationAction({ automationId: automation.id }))}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-busy={isPending}
          >
            {isPending ? 'Procesando…' : 'Pausar'}
          </button>
        )}

        {canArchive && (
          <button
            onClick={() => handle(() => archiveAutomationAction({ automationId: automation.id }))}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-busy={isPending}
          >
            {isPending ? 'Procesando…' : 'Archivar'}
          </button>
        )}
      </div>

      {errorMsg && !compact && (
        <p className="text-xs text-red-600 mt-1" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
