export function AutomationsTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white animate-pulse">
      <table className="w-full text-sm" aria-label="Cargando automatizaciones…" aria-busy="true">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {['Nombre', 'Tipo', 'Estado', 'Actualizada', 'Acciones'].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-3">
                <div className="h-4 w-40 bg-gray-200 rounded" />
                <div className="h-3 w-24 bg-gray-100 rounded mt-1" />
              </td>
              <td className="px-4 py-3 hidden sm:table-cell">
                <div className="h-4 w-20 bg-gray-200 rounded" />
              </td>
              <td className="px-4 py-3">
                <div className="h-5 w-16 bg-gray-200 rounded" />
              </td>
              <td className="px-4 py-3 hidden md:table-cell">
                <div className="h-4 w-24 bg-gray-200 rounded" />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="h-6 w-16 bg-gray-200 rounded ml-auto" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
