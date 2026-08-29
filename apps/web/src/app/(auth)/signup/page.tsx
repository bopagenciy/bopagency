import type { Metadata } from 'next';
import Link from 'next/link';
import { signUp } from '@/lib/auth/actions';

export const metadata: Metadata = {
  title: 'Crear cuenta',
};

type SignUpPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;

  return (
    <>
      <h1 className="text-xl font-bold tracking-tight text-foreground mb-1">Crear cuenta</h1>
      <p className="text-sm text-muted-foreground mb-6">Únete a BopAgency</p>

      {params.error && (
        <div className="mb-4 p-3 rounded-md bg-red-50/80 border border-red-200 text-red-900 text-sm">
          {params.error}
        </div>
      )}

      {params.message && (
        <div className="mb-4 p-3 rounded-md bg-blue-50/80 border border-blue-200 text-blue-900 text-sm">
          {params.message}
        </div>
      )}

      <form action={signUp} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-foreground mb-1.5">
            Nombre completo
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            placeholder="Francisco López"
            className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>

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
          <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            minLength={8}
            className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Crear cuenta
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link
          href="/login"
          className="text-foreground font-semibold hover:underline transition-colors"
        >
          Inicia sesión
        </Link>
      </p>
    </>
  );
}
