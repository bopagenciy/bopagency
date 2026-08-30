import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = {
  title: {
    default: 'Acceso',
    template: '%s | BopIAgency',
  },
};

type AuthLayoutProps = {
  children: React.ReactNode;
};

/**
 * Layout para rutas de autenticación.
 * No incluye AppShell (sidebar, header) — solo un contenedor centrado.
 *
 * Phase 8A.0: fondo cálido suave (--muted / #FFF7F2) en vez de dark theme,
 * con el logo oficial y CTA en color de marca — ver principio de diseño §10
 * del mandato ("background white or soft warm neutral", "NO hacer una
 * pantalla totalmente naranja").
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-2 mb-8 text-center">
          <Image
            src="/brand/bopagency-logo.png"
            alt="BopAgency"
            width={160}
            height={42}
            priority
            className="h-10 w-auto object-contain"
          />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-1">
            Sistema Operativo de Marketing
          </p>
        </div>

        {/* Auth Content Card */}
        <div className="bg-card text-card-foreground rounded-lg border border-border p-6 sm:p-8 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
