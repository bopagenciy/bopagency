import type { Metadata } from 'next';
import { updatePassword } from '@/lib/auth/actions';

export const metadata: Metadata = {
  title: 'Nueva contraseña',
};

type ResetPasswordPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;

  return (
    <>
      <h1 className="text-xl font-bold text-white mb-1">Nueva contraseña</h1>
      <p className="text-sm text-gray-400 mb-6">Elige una nueva contraseña para tu cuenta.</p>

      {params.error && (
        <div className="mb-4 p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          {params.error}
        </div>
      )}

      {params.message && (
        <div className="mb-4 p-3 rounded-lg bg-green-950 border border-green-800 text-green-300 text-sm">
          {params.message}
        </div>
      )}

      <form action={updatePassword} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1.5">
            Nueva contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            minLength={8}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-300 mb-1.5"
          >
            Confirmar contraseña
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Repite la contraseña"
            minLength={8}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
        >
          Actualizar contraseña
        </button>
      </form>
    </>
  );
}
