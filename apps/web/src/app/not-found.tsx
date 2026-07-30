import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="text-8xl font-bold text-gray-200 mb-4">404</div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">Página no encontrada</h1>
      <p className="text-gray-500 mb-8 max-w-md">La página que buscas no existe o fue movida.</p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
      >
        ← Volver al Dashboard
      </Link>
    </div>
  );
}
