import Link from 'next/link';
import { ActivationStatusBadge } from './ActivationStatusBadge';
import { CreateActivationPanel } from './CreateActivationPanel';
import type { ActivationStatus } from '@bop-agency/shared';

type LatestActivationSummary = {
  id: string;
  status: ActivationStatus;
} | null;

type CampaignActivationEntryCardProps = {
  campaignId: string;
  campaignStatus: string;
  userRole: string;
  /** Activación NO-terminal más reciente para esta campaña, o null si no hay ninguna. */
  activeActivation: LatestActivationSummary;
  /** true si existe al menos una activación (terminal o no) — habilita el link de historial. */
  hasAnyActivation: boolean;
};

/**
 * Integración en el detalle de campaña (Phase 8A.3, sección 6):
 * - Muestra el estado de la activación si ya existe una.
 * - Expone "Preparar activación" a strategist+ SOLO cuando la campaña está
 *   aprobada y no hay ya una activación no-terminal (nunca auto-crea, nunca
 *   cambia campaign.status).
 * - Si existe una activación no-terminal, no ofrece un segundo path de
 *   creación — solo enlaza al detalle operativo.
 */
export function CampaignActivationEntryCard({
  campaignId,
  campaignStatus,
  userRole,
  activeActivation,
  hasAnyActivation,
}: CampaignActivationEntryCardProps) {
  if (campaignStatus !== 'approved' && !hasAnyActivation) return null;

  return (
    <div className="bg-card text-card-foreground rounded-lg border border-border p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Activación</h2>
        {activeActivation && <ActivationStatusBadge status={activeActivation.status} />}
      </div>

      {activeActivation ? (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Esta campaña tiene una activación en curso. Gestiona sus canales de distribución y
            publicaciones manuales desde la vista de activación.
          </p>
          <Link
            href={`/campaigns/${campaignId}/activation`}
            className="shrink-0 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary-hover transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Ver activación →
          </Link>
        </div>
      ) : (
        <>
          <CreateActivationPanel
            campaignId={campaignId}
            campaignStatus={campaignStatus}
            userRole={userRole}
            hasNonTerminalActivation={false}
          />
          {hasAnyActivation && (
            <Link
              href={`/campaigns/${campaignId}/activation`}
              className="inline-block text-sm font-medium text-foreground hover:underline"
            >
              Ver historial de activaciones →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
