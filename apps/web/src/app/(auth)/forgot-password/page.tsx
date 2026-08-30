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
      <h1 className="text-xl font-bold tracking-tight text-foreground mb-1">Recuperar contraseña</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.
      </p>

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

      <form action={requestPasswordReset} className="space-y-4">
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

        <button
          type="submit"
          className="w-full py-2.5 px-4 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Enviar enlace de recuperación
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-foreground font-medium hover:underline transition-colors">
          ← Volver al inicio de sesión
        </Link>
      </p>
    </>
  );
}
