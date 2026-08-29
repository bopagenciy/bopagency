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
      <h1 className="text-xl font-bold tracking-tight text-foreground mb-1">Iniciar sesión</h1>
      <p className="text-sm text-muted-foreground mb-6">Accede a tu cuenta de BopAgency</p>

      {params.error && (
        <div className="mb-4 p-3 rounded-md bg-red-50/80 border border-red-200 text-red-900 text-sm">
          {params.error}
        </div>
      )}

      {params.message && (
        <div className="mb-4 p-3 rounded-md bg-emerald-50/80 border border-emerald-200 text-emerald-900 text-sm">
          {params.message}
        </div>
      )}

      <form action={signIn} className="space-y-4">
        {params.redirectTo && <input type="hidden" name="redirectTo" value={params.redirectTo} />}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1.5">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="francisco@bopagency.co"
            className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium text-foreground">
              Contraseña
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
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
            className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Iniciar sesión
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿No tienes cuenta?{' '}
        <Link
          href="/signup"
          className="text-foreground font-semibold hover:underline transition-colors"
        >
          Regístrate
        </Link>
      </p>
    </>
  );
}
