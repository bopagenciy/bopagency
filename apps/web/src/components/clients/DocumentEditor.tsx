'use client';

import { useTransition, useState } from 'react';
import type { DocumentStatus } from '@/lib/supabase/types';

type DocumentEditorProps = {
  clientId: string;
  documentKey: string;
  defaultTitle: string;
  defaultContent: string;
  defaultStatus: DocumentStatus;
  defaultCategory: string;
  version: number;
  action: (clientId: string, formData: FormData) => Promise<{ ok: boolean; error?: string }>;
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Borrador',
  published: 'Publicado',
  archived: 'Archivado',
};

export function DocumentEditor({
  clientId,
  documentKey,
  defaultTitle,
  defaultContent,
  defaultStatus,
  defaultCategory,
  version,
  action,
}: DocumentEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [content, setContent] = useState(defaultContent);

  function handleSubmit(formData: FormData) {
    setError(null);
    setSaved(false);
    formData.set('content', content);
    formData.set('documentKey', documentKey);

    startTransition(async () => {
      const result = await action(clientId, formData);
      if (!result.ok) {
        setError(result.error ?? 'Error al guardar');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {/* Control de concurrencia optimista: versión actual del documento */}
      <input type="hidden" name="expectedVersion" value={version} />
      {error && (
        <div
          role="alert"
          className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-200"
        >
          {error}
        </div>
      )}
      {saved && (
        <div
          role="status"
          className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm border border-green-200"
        >
          ✓ Guardado correctamente — versión {version + 1}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Título del documento
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={defaultTitle}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
            Estado
          </label>
          <select
            id="status"
            name="status"
            defaultValue={defaultStatus}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            {(['draft', 'published', 'archived'] as DocumentStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Categoría
          </label>
          <input
            id="category"
            name="category"
            type="text"
            defaultValue={defaultCategory}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
          Contenido
          <span className="text-xs text-gray-400 ml-2 font-normal">Versión actual: {version}</span>
        </label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          placeholder="Escribe el contenido del documento aquí..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Guardando...' : 'Guardar documento'}
        </button>
        <span className="text-xs text-gray-400">Los cambios se guardan como nueva versión</span>
      </div>
    </form>
  );
}
