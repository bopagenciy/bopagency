import type { Metadata } from 'next';

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
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center text-white font-bold text-lg">
            B
          </div>
          <div>
            <p className="font-bold text-white text-lg leading-tight">BopIAgency</p>
            <p className="text-xs text-gray-400 leading-tight">Sistema Operativo Digital</p>
          </div>
        </div>

        {/* Content */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">{children}</div>
      </div>
    </div>
  );
}
