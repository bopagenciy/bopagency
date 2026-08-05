'use client';

import { useTransition, useState } from 'react';
import type { AutomationExecution } from '@bop-agency/domain';
import { canCancelExecution, canRetryExecution } from '@bop-agency/domain';
import {
  cancelExecutionAction,
  retryExecutionAction,
} from '@/app/(protected)/automations/actions';

type ExecutionActionsProps = {
  execution: AutomationExecution;
  maxAttempts: number;
  userRole: string;
};

const OPERATOR_ROLES = new Set(['operator', 'strategist', 'admin', 'owner']);

export function ExecutionActions({ execution, maxAttempts, userRole }: ExecutionActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const isOperator = OPERATOR_ROLES.has(userRole);
  const canCancel = isOperator && canCancelExecution(execution.status);
  const canRetry = isOperator && canRetryExecution(execution, maxAttempts);

  if (!canCancel && !canRetry) return null;

  function handleCancel() {
    setMessage(null);
    startTransition(async () => {
      const result = await cancelExecutionAction({ executionId: execution.id });
      if (!result.ok) {
        setMessage({ type: 'error', text: 'error' in result ? result.error : 'Error al cancelar' });
      }
    });
  }

  function handleRetry() {
    setMessage(null);
    startTransition(async () => {
      const result = await retryExecutionAction({ executionId: execution.id });
      if (!result.ok) {
        setMessage({ type: 'error', text: 'error' in result ? result.error : 'Error al reintentar' });
      } else if (result.ok && result.data?.retryDeferred) {
        setMessage({ type: 'info', text: 'Reintento programado — el backoff está activo.' });
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2" aria-label="Acciones de ejecución">
        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-busy={isPending}
          >
            {isPending ? 'Procesando…' : 'Cancelar'}
          </button>
        )}
        {canRetry && (
          <button
            onClick={handleRetry}
            disabled={isPending}
            className="px-2.5 py-1 text-xs font-medium rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-busy={isPending}
          >
            {isPending ? 'Procesando…' : 'Reintentar'}
          </button>
        )}
      </div>
      {message && (
        <p
          className={`text-xs mt-1 ${message.type === 'error' ? 'text-red-600' : 'text-blue-600'}`}
          role="alert"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
