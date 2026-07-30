import type { Metadata } from 'next';
import Link from 'next/link';
import { signIn } from '@/lib/auth/actions';

export const metadata: Metadata = {
  title: 'Iniciar sesión',
};

type LoginPageProps = {
  searchParams: Promise<{ redirectTo?: string; error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <>
      <h1 className="text-xl font-bold text-white mb-1">Iniciar sesión</h1>
      <p className="text-sm text-gray-400 mb-6">Accede a tu cuenta de BopIAgency</p>

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

      <form action={signIn} className="space-y-4">
        {params.redirectTo && <input type="hidden" name="redirectTo" value={params.redirectTo} />}

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

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
              Contraseña
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900"
        >
          Iniciar sesión
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-400">
        ¿No tienes cuenta?{' '}
        <Link
          href="/signup"
          className="text-red-400 hover:text-red-300 transition-colors font-medium"
        >
          Regístrate
        </Link>
      </p>
    </>
  );
}
