'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AD_PLATFORMS,
  PLATFORM_LABELS,
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_CURRENCIES,
} from '@bop-agency/shared';
import type { AdPlatform } from '@bop-agency/shared';
import type { Campaign, CampaignObjective } from '@bop-agency/domain';
import { editCampaignDraftAction } from '@/app/(protected)/campaigns/actions';
import { OBJECTIVE_LABELS } from '@/lib/campaign-labels';

const OPERATOR_ROLES = new Set(['operator', 'strategist', 'admin', 'owner']);

function toDateInputValue(value: Date | string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

type EditCampaignModalProps = {
  campaign: Campaign;
  userRole: string;
};

/**
 * Botón "Editar" + modal para campañas en 'draft' (auditoría de completitud
 * Phase 7E — draft edit flow, antes inexistente pese a que
 * `updateCampaignDraftSchema`/`CampaignRepository.update` ya lo soportaban).
 *
 * Reutiliza el mismo shape de campos que `CampaignWizardForm` (creación
 * manual) para que la experiencia sea consistente, pero:
 * - clientId NO es editable aquí (fuera de alcance — ver docstring del use
 *   case `editCampaignDraft`).
 * - No hay selector de modo IA/manual: solo edita los campos del draft.
 * - Al guardar, la campaña sigue en 'draft', conserva generatedContent y
 *   metadata.ai, y no se envía a revisión.
 */
export function EditCampaignModal({ campaign, userRole }: EditCampaignModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(campaign.name);
  const [platform, setPlatform] = useState<AdPlatform>(campaign.platform);
  const [objective, setObjective] = useState<CampaignObjective>(campaign.objective);
  const [brief, setBrief] = useState(campaign.brief ?? '');
  const [budget, setBudget] = useState(String(campaign.budget));
  const [currency, setCurrency] = useState(campaign.currency);
  const [startDate, setStartDate] = useState(toDateInputValue(campaign.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(campaign.endDate));

  if (campaign.status !== 'draft' || !OPERATOR_ROLES.has(userRole)) return null;

  function resetToOriginal() {
    setName(campaign.name);
    setPlatform(campaign.platform);
    setObjective(campaign.objective);
    setBrief(campaign.brief ?? '');
    setBudget(String(campaign.budget));
    setCurrency(campaign.currency);
    setStartDate(toDateInputValue(campaign.startDate));
    setEndDate(toDateInputValue(campaign.endDate));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const budgetNumber = Number(budget);
    if (name.trim().length === 0) {
      setError('El nombre de la campaña es requerido.');
      return;
    }
    if (!budget.trim() || Number.isNaN(budgetNumber) || budgetNumber <= 0) {
      setError('Ingresa un presupuesto válido mayor a 0.');
      return;
    }

    startTransition(async () => {
      const result = await editCampaignDraftAction({
        campaignId: campaign.id,
        name: name.trim(),
        platform,
        objective,
        brief: brief.trim() || null,
        budget: budgetNumber,
        currency,
        startDate: startDate || null,
        endDate: endDate || null,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
      >
        Editar
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Editar campaña"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Editar campaña</h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetToOriginal();
                }}
                disabled={isPending}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500">
              La campaña sigue en borrador después de guardar. No se envía a revisión ni se
              regenera el contenido de IA.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm border border-red-200"
                >
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de la campaña <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="edit-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="edit-platform" className="block text-sm font-medium text-gray-700 mb-1">
                    Plataforma
                  </label>
                  <select
                    id="edit-platform"
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as AdPlatform)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {AD_PLATFORMS.map((p) => (
                      <option key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-objective" className="block text-sm font-medium text-gray-700 mb-1">
                    Objetivo
                  </label>
                  <select
                    id="edit-objective"
                    value={objective}
                    onChange={(e) => setObjective(e.target.value as CampaignObjective)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {CAMPAIGN_OBJECTIVES.map((o) => (
                      <option key={o} value={o}>
                        {OBJECTIVE_LABELS[o]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-budget" className="block text-sm font-medium text-gray-700 mb-1">
                    Presupuesto <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="edit-budget"
                      type="number"
                      min="0"
                      step="1"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      aria-label="Moneda"
                    >
                      {CAMPAIGN_CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="edit-startDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de inicio
                  </label>
                  <input
                    id="edit-startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label htmlFor="edit-endDate" className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de fin
                  </label>
                  <input
                    id="edit-endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="edit-brief" className="block text-sm font-medium text-gray-700 mb-1">
                    Brief
                  </label>
                  <textarea
                    id="edit-brief"
                    rows={5}
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  {isPending ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    resetToOriginal();
                  }}
                  disabled={isPending}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
