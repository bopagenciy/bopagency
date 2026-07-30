import type { ClientStatus } from '@/lib/supabase/types';

const STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  onboarding: 'Onboarding',
  churned: 'Churn',
};

const STATUS_COLORS: Record<ClientStatus, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-600',
  onboarding: 'bg-blue-100 text-blue-700',
  churned: 'bg-red-100 text-red-700',
};

type Props = { status: ClientStatus; className?: string };

export function ClientStatusBadge({ status, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status]} ${className}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
