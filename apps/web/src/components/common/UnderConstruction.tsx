type UnderConstructionProps = {
  module: string;
  description?: string;
  availableIn?: string;
};

export function UnderConstruction({
  module,
  description,
  availableIn = 'próximas fases',
}: UnderConstructionProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center px-4">
      <div className="text-6xl mb-4">🚧</div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">{module}</h2>
      <p className="text-gray-500 max-w-md mb-4">
        {description ?? `Este módulo estará disponible en las ${availableIn} del proyecto.`}
      </p>
      <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
        Módulo en construcción
      </span>
    </div>
  );
}
