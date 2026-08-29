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
      <h1 className="text-xl font-bold tracking-tight text-foreground mb-1">Nueva contraseña</h1>
      <p className="text-sm text-muted-foreground mb-6">Elige una nueva contraseña para tu cuenta.</p>

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

      <form action={updatePassword} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1.5">
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
            className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-foreground mb-1.5"
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
            className="w-full px-3 py-2 rounded-md bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 rounded-md bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Actualizar contraseña
        </button>
      </form>
    </>
  );
}
