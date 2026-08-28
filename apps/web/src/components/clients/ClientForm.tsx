'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientStatus, ClientIndustry } from '@/lib/supabase/types';
import { CLIENT_STATUSES, CLIENT_INDUSTRIES, CLIENT_CURRENCIES } from '@bop-agency/shared';

type ClientFormData = {
  id?: string;
  name?: string;
  legalName?: string | null;
  slug?: string;
  status?: ClientStatus;
  industry?: ClientIndustry | null;
  timezone?: string;
  currency?: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

type ClientFormProps = {
  action: (
    formData: FormData,
  ) => Promise<{ ok: false; error: string } | { ok: true; data?: { id: string } }>;
  defaultValues?: ClientFormData;
  mode: 'create' | 'edit';
};

const STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  onboarding: 'Onboarding',
  churned: 'Churn',
};

const INDUSTRY_LABELS: Record<ClientIndustry, string> = {
  hospitality: 'Hospitalidad',
  legal: 'Legal',
  ecommerce: 'E-commerce',
  retail: 'Retail',
  healthcare: 'Salud',
  technology: 'Tecnología',
  education: 'Educación',
  real_estate: 'Inmobiliaria',
  finance: 'Finanzas',
  food_beverage: 'Alimentos y Bebidas',
  other: 'Otro',
};

const TIMEZONE_OPTIONS = [
  'America/Bogota',
  'America/Mexico_City',
  'America/New_York',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/Madrid',
  'UTC',
];

export function ClientForm({ action, defaultValues, mode }: ClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (mode === 'create' && result.data?.id) {
        router.push(`/clients/${result.data.id}`);
      } else {
        router.back();
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-200"
        >
          {error}
        </div>
      )}

      {/* Basic info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Información básica</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={defaultValues?.name ?? ''}
              placeholder="Ej: Restaurante Don Julio"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="legalName" className="block text-sm font-medium text-gray-700 mb-1">
              Razón social
            </label>
            <input
              id="legalName"
              name="legalName"
              type="text"
              defaultValue={defaultValues?.legalName ?? ''}
              placeholder="Nombre legal de la empresa"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {mode === 'create' && (
            <div>
              <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
                Slug{' '}
                <span className="text-gray-400 text-xs">(opcional, se genera automáticamente)</span>
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                defaultValue={defaultValues?.slug ?? ''}
                placeholder="mi-cliente"
                pattern="[a-z0-9-]+"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select
              id="status"
              name="status"
              defaultValue={defaultValues?.status ?? 'active'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CLIENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">
              Industria
            </label>
            <select
              id="industry"
              name="industry"
              defaultValue={defaultValues?.industry ?? ''}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sin especificar</option>
              {CLIENT_INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {INDUSTRY_LABELS[i as ClientIndustry]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Contact info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Información de contacto</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ''}
              placeholder="cliente@empresa.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={defaultValues?.phone ?? ''}
              placeholder="+57 300 000 0000"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-1">
              Sitio web
            </label>
            <input
              id="website"
              name="website"
              type="url"
              defaultValue={defaultValues?.website ?? ''}
              placeholder="https://www.empresa.com"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Preferencias</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
              Zona horaria
            </label>
            <select
              id="timezone"
              name="timezone"
              defaultValue={defaultValues?.timezone ?? 'America/Bogota'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
              Moneda
            </label>
            <select
              id="currency"
              name="currency"
              defaultValue={defaultValues?.currency ?? 'COP'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {CLIENT_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Notas internas</h2>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          defaultValue={defaultValues?.notes ?? ''}
          placeholder="Notas internas sobre el cliente..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
        >
          {isPending
            ? mode === 'create'
              ? 'Creando...'
              : 'Guardando...'
            : mode === 'create'
              ? 'Crear cliente'
              : 'Guardar cambios'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isPending}
          className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
