type StatCardProps = {
  label: string;
  value: string | number;
  change?: number;
  icon?: string;
};

export function StatCard({ label, value, change, icon }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-500">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {change !== undefined && change !== 0 && (
        <p className={`text-xs mt-1 ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change > 0 ? '▲' : '▼'} {Math.abs(change)}%
        </p>
      )}
    </div>
  );
}
