'use client';

import React, { useState } from 'react';

interface CancelTargetModalProps {
  isOpen: boolean;
  targetId: string;
  channelName: string;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}

export const CancelTargetModal: React.FC<CancelTargetModalProps> = ({
  isOpen,
  channelName,
  onClose,
  onSubmit,
}) => {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const reasonClean = reason.trim();
    if (!reasonClean) {
      setErrorMessage('La razón de cancelación es requerida.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit(reasonClean);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cancelar el canal de activación';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-target-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b pb-3 dark:border-slate-700">
          <div className="flex items-center space-x-2 text-amber-600 dark:text-amber-400">
            <svg className="h-5 w-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h3 id="cancel-target-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Cancelar Canal de Activación
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            aria-label="Cerrar modal"
          >
            <svg className="h-5 w-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            ¿Está seguro de que desea cancelar el canal{' '}
            <strong className="text-slate-900 dark:text-white">{channelName}</strong>? Esta acción es{' '}
            <strong className="text-amber-600 dark:text-amber-400">irreversible</strong> y cancelará cualquier job
            de publicación en cola.
          </p>

          {errorMessage && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {errorMessage}
            </div>
          )}

          <div>
            <label htmlFor="cancel-reason-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Razón de cancelación (requerida)
            </label>
            <textarea
              id="cancel-reason-input"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Escriba el motivo por el cual se cancela el canal..."
              disabled={isSubmitting}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Cancelando...' : 'Confirmar cancelación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
