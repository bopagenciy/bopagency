type RepositoryErrorStateProps = {
  message?: string;
};

/**
 * Estado de error genérico para cuando un repositorio falla.
 * No expone detalles técnicos — solo un mensaje amigable.
 */
export function RepositoryErrorState({
  message = 'No se pudieron cargar los datos. Intenta recargar la página.',
}: RepositoryErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-center px-4"
      role="alert"
      aria-live="polite"
    >
      <div className="text-5xl mb-4" aria-hidden="true">
        ⚠️
      </div>
      <p className="text-base font-semibold text-gray-900 mb-1">Error al cargar</p>
      <p className="text-sm text-gray-500 max-w-sm">{message}</p>
    </div>
  );
}
