import type { Metadata } from 'next';
import Link from 'next/link';
import { requestPasswordReset } from '@/lib/auth/actions';

export const metadata: Metadata = {
  title: 'Recuperar contraseña',
};

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;

  return (
    <>
      <h1 className="text-xl font-bold text-white mb-1">Recuperar contraseña</h1>
      <p className="text-sm text-gray-400 mb-6">
        Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
      </p>

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

      <form action={requestPasswordReset} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="francisco@bopagency.co"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
        >
          Enviar enlace de recuperación
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-400">
        <Link href="/login" className="text-red-400 hover:text-red-300 transition-colors">
          ← Volver al inicio de sesión
        </Link>
      </p>
    </>
  );
}
