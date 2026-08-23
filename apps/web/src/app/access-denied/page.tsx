import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Acceso denegado',
};

export default function AccessDeniedPage() {
  return (
    <div className="min-h-screen bg-muted flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-red-100 border border-red-200 flex items-center justify-center mx-auto mb-6">
          <span className="text-2xl">🔒</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Acceso denegado</h1>
        <p className="text-muted-foreground mb-6">
          No tienes los permisos necesarios para acceder a esta sección. Contacta al administrador
          de tu organización si crees que esto es un error.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        >
          Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
