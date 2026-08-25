import Link from 'next/link';
import { ActivationStatusBadge } from './ActivationStatusBadge';
import type { ActivationStatus } from '@bop-agency/shared';

export type ActivationSummary = {
  id: string;
  status: ActivationStatus;
  campaignId: string;
  campaignApprovalId: string;
  campaignName: string;
  scheduledAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Resumen de la activación — campaña, referencia de aprobación, estado,
 * programación, y quién/cuándo la creó (sección A de la spec de 8A.3).
 * Server Component puramente presentacional.
 */
export function ActivationSummaryCard({ activation }: { activation: ActivationSummary }) {
  return (
    <div className="bg-white rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Activación de campaña</h1>
          <p className="text-sm text-gray-500 mt-1">
            Campaña:{' '}
            <Link href={`/campaigns/${activation.campaignId}`} className="text-indigo-600 hover:text-indigo-700">
              {activation.campaignName}
            </Link>
          </p>
        </div>
        <ActivationStatusBadge status={activation.status} />
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <dt className="text-gray-400 text-xs uppercase tracking-wide">Referencia de aprobación</dt>
          <dd className="mt-1 font-mono text-xs text-gray-700 truncate" title={activation.campaignApprovalId}>
            {activation.campaignApprovalId}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400 text-xs uppercase tracking-wide">Programada</dt>
          <dd className="mt-1 font-medium text-gray-800">{formatDate(activation.scheduledAt)}</dd>
        </div>
        <div>
          <dt className="text-gray-400 text-xs uppercase tracking-wide">Creada</dt>
          <dd className="mt-1 font-medium text-gray-800">{formatDate(activation.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-gray-400 text-xs uppercase tracking-wide">Última actualización</dt>
          <dd className="mt-1 font-medium text-gray-800">{formatDate(activation.updatedAt)}</dd>
        </div>
      </dl>

      {activation.notes && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notas</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{activation.notes}</p>
        </div>
      )}

      <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
        Esta vista opera exclusivamente sobre publicación MANUAL confirmada por un operador — no
        realiza ninguna llamada a Meta, Google, LinkedIn ni ningún proveedor de email.
      </p>
    </div>
  );
}
