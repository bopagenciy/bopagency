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
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand — Phase 8A.0 polish: logo más prominente (~80px), stack
            vertical centrado, más aire respecto a la tarjeta (mb-10 en vez
            de mb-8) sin convertirse en una landing page. */}
        <div className="flex flex-col items-center gap-3 mb-10">
          {/* Micro-polish: asset recortado (bopagency-logo-trimmed.png) +
              contenedor no-cuadrado (149x80) que respeta el aspect ratio
              real del artwork (~1.86:1) en vez de forzar un cuadrado que
              dejaba franjas vacías. */}
          <div className="shrink-0 w-[149px] h-20 rounded-2xl bg-white flex items-center justify-center overflow-hidden p-2 shadow-sm border border-border">
            <Image
              src="/brand/bopagency-logo-trimmed.png"
              alt="Bop Agency"
              width={149}
              height={80}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <div className="text-center">
            <p className="font-bold text-foreground text-lg leading-tight">BopIAgency</p>
            <p className="text-xs text-muted-foreground leading-tight">Sistema Operativo Digital</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
