/**
 * Banner que identifica claramente los datos como DEMO.
 *
 * Todos los registros en placeholder-data.ts llevan `_demo: true`.
 * Este componente es el indicador visual correspondiente en la UI.
 */
export function DemoBanner() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
      <span className="text-amber-500 text-lg">⚠️</span>
      <div>
        <p className="text-sm font-medium text-amber-800">Modo Demo — Datos de ejemplo</p>
        <p className="text-xs text-amber-700 mt-0.5">
          Todos los datos mostrados son ficticios (
          <code className="bg-amber-100 px-0.5 rounded">_demo: true</code>). No representan
          clientes, campañas ni métricas reales. Los datos reales estarán disponibles en la Fase 4.
        </p>
      </div>
    </div>
  );
}
