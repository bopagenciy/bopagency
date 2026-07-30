'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfileAction, updatePreferencesAction } from './actions';

type Organization = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: string;
};

type SettingsClientProps = {
  userId: string;
  userEmail: string;
  profile: {
    fullName: string | null;
    avatarUrl: string | null;
    activeOrganizationId: string | null;
  };
  preferences: {
    language: string;
    timezone: string;
    emailNotifications: boolean;
  };
  organizations: Organization[];
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Gratuito',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  strategist: 'Estratega',
  operator: 'Operador',
  viewer: 'Observador',
};

export function SettingsClient({
  userId: _userId,
  userEmail,
  profile,
  preferences,
  organizations,
}: SettingsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Profile state
  const [fullName, setFullName] = useState(profile.fullName ?? '');
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Preferences state
  const [language, setLanguage] = useState(preferences.language);
  const [timezone, setTimezone] = useState(preferences.timezone);
  const [emailNotifications, setEmailNotifications] = useState(preferences.emailNotifications);
  const [prefSaved, setPrefSaved] = useState(false);
  const [prefError, setPrefError] = useState<string | null>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaved(false);
    setProfileError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set('fullName', fullName.trim());

      const result = await updateProfileAction(formData);
      if (!result.success) {
        setProfileError(result.error);
      } else {
        setProfileSaved(true);
        router.refresh();
        setTimeout(() => setProfileSaved(false), 3000);
      }
    });
  }

  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault();
    setPrefSaved(false);
    setPrefError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set('language', language);
      formData.set('timezone', timezone);
      formData.set('emailNotifications', String(emailNotifications));

      const result = await updatePreferencesAction(formData);
      if (!result.success) {
        setPrefError(result.error);
      } else {
        setPrefSaved(true);
        setTimeout(() => setPrefSaved(false), 3000);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* ── Profile ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Perfil</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <form onSubmit={handleSaveProfile} className="space-y-4">
            {profileError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{profileError}</p>
            )}
            {profileSaved && (
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                Perfil guardado.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre completo
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={userEmail}
                  disabled
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-gray-400">El correo no se puede cambiar aquí.</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-gray-300 text-white text-sm font-medium transition-colors"
              >
                {isPending ? 'Guardando…' : 'Guardar perfil'}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* ── Organizations ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Organizaciones</h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {organizations.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">
              No perteneces a ninguna organización.{' '}
              <a href="/onboarding" className="text-red-600 hover:underline">
                Crear una →
              </a>
            </div>
          ) : (
            organizations.map((org) => (
              <div key={org.id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{org.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {org.slug} · {PLAN_LABELS[org.plan] ?? org.plan}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    org.id === profile.activeOrganizationId
                      ? 'bg-red-50 text-red-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {ROLE_LABELS[org.role] ?? org.role}
                  {org.id === profile.activeOrganizationId && ' · Activa'}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="mt-3">
          <a href="/onboarding" className="text-sm text-red-600 hover:text-red-500 font-medium">
            + Crear nueva organización
          </a>
        </div>
      </section>

      {/* ── Preferences ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Preferencias</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <form onSubmit={handleSavePreferences} className="space-y-4">
            {prefError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{prefError}</p>
            )}
            {prefSaved && (
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                Preferencias guardadas.
              </p>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                  Idioma
                </label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                >
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 mb-1">
                  Zona horaria
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                >
                  <option value="America/Bogota">América/Bogotá (UTC-5)</option>
                  <option value="America/New_York">América/Nueva York (UTC-5/-4)</option>
                  <option value="America/Mexico_City">América/Ciudad de México (UTC-6/-5)</option>
                  <option value="America/Argentina/Buenos_Aires">
                    América/Buenos Aires (UTC-3)
                  </option>
                  <option value="Europe/Madrid">Europa/Madrid (UTC+1/+2)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={emailNotifications}
                onClick={() => setEmailNotifications((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 ${
                  emailNotifications ? 'bg-red-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    emailNotifications ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700">Notificaciones por correo</span>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-gray-300 text-white text-sm font-medium transition-colors"
              >
                {isPending ? 'Guardando…' : 'Guardar preferencias'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
