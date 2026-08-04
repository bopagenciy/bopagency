type SummaryCardProps = {
  label: string;
  value: string | number;
  /** Ícono o emoji descriptivo. */
  icon: string;
  /** Contexto opcional debajo del valor (ej. "3 críticas"). */
  sub?: string | undefined;
  /** Color del indicador lateral. */
  accent?: 'red' | 'amber' | 'green' | 'blue' | 'gray' | undefined;
};

const ACCENT_CLASSES: Record<NonNullable<SummaryCardProps['accent']>, string> = {
  red: 'border-l-red-500',
  amber: 'border-l-amber-400',
  green: 'border-l-green-500',
  blue: 'border-l-blue-500',
  gray: 'border-l-gray-300',
};

export function SummaryCard({ label, value, icon, sub, accent = 'gray' }: SummaryCardProps) {
  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 border-l-4 ${ACCENT_CLASSES[accent]} p-5`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1 truncate">{sub}</p>}
        </div>
        <span className="text-2xl ml-3 flex-shrink-0" aria-hidden="true">
          {icon}
        </span>
      </div>
    </div>
  );
}

/** Skeleton mientras carga. */
export function SummaryCardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-gray-200 p-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
          <div className="h-7 bg-gray-200 rounded w-16 mb-1" />
          <div className="h-3 bg-gray-100 rounded w-20" />
        </div>
        <div className="h-8 w-8 bg-gray-100 rounded ml-3" />
      </div>
    </div>
  );
}
