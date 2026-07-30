'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createOrganizationAction } from './actions';

// userId ya no se usa en el componente (la acción lo obtiene del servidor)
// pero se mantiene en props por compatibilidad con onboarding/page.tsx
type OnboardingFormProps = {
  userId: string;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function OnboardingForm({ userId: _userId }: OnboardingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlug(slugify(value));
    setSlugEdited(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !slug.trim()) {
      setError('El nombre y el identificador son requeridos.');
      return;
    }

    startTransition(async () => {
      // Construir FormData para la Server Action
      const formData = new FormData();
      formData.set('name', name.trim());
      formData.set('slug', slug.trim());

      const result = await createOrganizationAction(formData);

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1.5">
          Nombre de la organización
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Bop Agency"
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-300 mb-1.5">
          Identificador URL
        </label>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-sm shrink-0">bopagency.co/</span>
          <input
            id="slug"
            type="text"
            required
            value={slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="bop-agency"
            pattern="[a-z0-9-]+"
            title="Solo letras minúsculas, números y guiones"
            className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">Solo letras minúsculas, números y guiones.</p>
      </div>

      <button
        type="submit"
        disabled={isPending || !name.trim() || !slug.trim()}
        className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {isPending ? 'Creando organización…' : 'Crear organización y continuar →'}
      </button>
    </form>
  );
}
