type StatCardProps = {
  label: string;
  value: string | number;
  change?: number;
  icon?: string;
};

export function StatCard({ label, value, change, icon }: StatCardProps) {
  return (
    <div className="bg-card rounded-lg border border-border p-5 shadow-sm transition-colors hover:border-border/80">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
      {change !== undefined && change !== 0 && (
        <p className={`text-xs font-medium mt-1.5 ${change > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {change > 0 ? '▲' : '▼'} {Math.abs(change)}%
        </p>
      )}
    </div>
  );
}
