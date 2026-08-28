import React, { useState } from 'react';

type Props = {
  readonly isOpen: boolean;
  readonly jobId: string;
  readonly campaignId: string;
  readonly onClose: () => void;
  readonly onReconcile: (data: {
    outcome: 'published' | 'not_published';
    note: string;
    externalId?: string;
    externalUrl?: string;
  }) => Promise<void>;
};

export function PublicationReconciliationModal({
  isOpen,
  jobId: _jobId,
  onClose,
  onReconcile,
}: Props) {
  const [outcome, setOutcome] = useState<'published' | 'not_published'>('published');
  const [note, setNote] = useState('');
  const [externalId, setExternalId] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) {
      setValidationError('La nota de reconciliación es requerida.');
      return;
    }
    setValidationError(null);
    setIsSubmitting(true);
    try {
      await onReconcile({
        outcome,
        note: note.trim(),
        ...(externalId.trim() ? { externalId: externalId.trim() } : {}),
        ...(externalUrl.trim() ? { externalUrl: externalUrl.trim() } : {}),
      });
      onClose();
    } catch {
      setValidationError('Ocurrió un error al reconciliar el resultado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="bg-white rounded-xl shadow-xl border border-border max-w-lg w-full p-6 space-y-4"
        role="dialog"
        aria-labelledby="reconcile-modal-title"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 id="reconcile-modal-title" className="text-lg font-semibold text-gray-900">
            Reconciliación Manual de Publicación
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-sm font-bold p-1"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
          <p className="font-semibold">⚠️ Advertencia de Seguridad & Auditoría</p>
          <p>
            Esta acción establece el resultado definitivo de una publicación ambigua en la base de datos de auditoría. La operación es irreversible y queda registrada con su usuario.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Resultado de la Publicación <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="outcome"
                  value="published"
                  checked={outcome === 'published'}
                  onChange={() => setOutcome('published')}
                  className="text-emerald-600 focus:ring-emerald-500"
                />
                Se publicó (Éxito)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                <input
                  type="radio"
                  name="outcome"
                  value="not_published"
                  checked={outcome === 'not_published'}
                  onChange={() => setOutcome('not_published')}
                  className="text-rose-600 focus:ring-rose-500"
                />
                No se publicó (Fallo)
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nota de Reconciliación <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explique la evidencia verificada (ej. verificado manualmente en dashboard externo)..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {outcome === 'published' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID Externo del Proveedor (Opcional)
                </label>
                <input
                  type="text"
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                  placeholder="ej. meta-ad-123456"
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL Externa del Proveedor (Opcional)
                </label>
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                  placeholder="https://facebook.com/ads/..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
            </>
          )}

          {validationError && (
            <p className="text-xs text-rose-600 font-medium">{validationError}</p>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !note.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Confirmando...' : 'Confirmar Reconciliación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
