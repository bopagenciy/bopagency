type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

type BadgeProps = {
  variant?: BadgeVariant;
  children: React.ReactNode;
};

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-800 border border-slate-200/80',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
  warning: 'bg-amber-50 text-amber-800 border border-amber-200/80',
  danger: 'bg-red-50 text-red-700 border border-red-200/80',
  info: 'bg-blue-50 text-blue-700 border border-blue-200/80',
  muted: 'bg-gray-100 text-gray-600 border border-gray-200/60',
};

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantClasses[variant]}`}
    >
      {children}
    </span>
  );
}
