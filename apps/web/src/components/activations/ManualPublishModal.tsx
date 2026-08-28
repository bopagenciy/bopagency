'use client';

import React, { useState } from 'react';

interface ManualPublishModalProps {
  isOpen: boolean;
  targetId: string;
  channelName: string;
  onClose: () => void;
  onSubmit: (data: { externalReference?: string; note?: string }) => Promise<void>;
}

export const ManualPublishModal: React.FC<ManualPublishModalProps> = ({
  isOpen,
  channelName,
  onClose,
  onSubmit,
}) => {
  const [externalReference, setExternalReference] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const refClean = externalReference.trim();
    const noteClean = note.trim();

    if (!refClean && !noteClean) {
      setErrorMessage('Se requiere al menos un campo de evidencia (referencia externa o nota).');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: { externalReference?: string; note?: string } = {};
      if (refClean) payload.externalReference = refClean;
      if (noteClean) payload.note = noteClean;
      await onSubmit(payload);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al confirmar la publicación manual';
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
      aria-labelledby="manual-publish-title"
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b pb-3 dark:border-slate-700">
          <div className="flex items-center space-x-2 text-emerald-600 dark:text-emerald-400">
            <svg className="h-5 w-5 fill-none stroke-current stroke-2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h3 id="manual-publish-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Confirmar Publicación Manual
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
            Esta es una <strong>atestación humana explícita</strong> de que el contenido para el canal{' '}
            <strong className="text-slate-900 dark:text-white">{channelName}</strong> ya fue publicado fuera del sistema.
          </p>

          {errorMessage && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Referencia / URL externa (opcional si hay nota)
            </label>
            <input
              type="text"
              value={externalReference}
              onChange={(e) => setExternalReference(e.target.value)}
              placeholder="Referencia externa (ej. https://instagram.com/p/...)"
              disabled={isSubmitting}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Nota / Evidencia explicativa (opcional si hay URL)
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Publicado manualmente por el operador..."
              disabled={isSubmitting}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Confirmando...' : 'Confirmar publicación manual'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
