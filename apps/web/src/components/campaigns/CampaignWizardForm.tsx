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
import { SUPPORTED_GENERATION_PLATFORMS, isSupportedGenerationPlatform } from '@bop-agency/domain';
import type { CampaignObjective } from '@bop-agency/domain';
import {
  createCampaignDraftAction,
  generateCampaignDraftWithAiAction,
} from '@/app/(protected)/campaigns/actions';
import { OBJECTIVE_LABELS } from '@/lib/campaign-labels';
import { AIProviderSelect, AI_PROVIDER_DEFAULT_OPTION } from './AIProviderSelect';

type ClientOption = { id: string; name: string };

type Mode = 'ai' | 'manual';

type CampaignWizardFormProps = {
  clients: ClientOption[];
};

export function CampaignWizardForm({ clients }: CampaignWizardFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('ai');

  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [platform, setPlatform] = useState<AdPlatform>('meta_ads');
  const [objective, setObjective] = useState<CampaignObjective>('lead_generation');
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [budget, setBudget] = useState('');
  const [currency, setCurrency] = useState('COP');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [language, setLanguage] = useState('es');
  const [market, setMarket] = useState('');
  // Phase 7D.1 — '' = usar el proveedor predeterminado del servidor. Solo se
  // envía en modo IA; en modo manual no hay generación y el campo se ignora.
  const [aiProvider, setAiProvider] = useState<string>(AI_PROVIDER_DEFAULT_OPTION);

  const platformSupportsAi = isSupportedGenerationPlatform(platform);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const budgetNumber = Number(budget);
    if (!clientId) {
      setError('Selecciona un cliente.');
      return;
    }
    // Phase 7D.1.1 — el presupuesto se exige > 0. Antes se aceptaba 0, que es
    // indistinguible de "no se ingresó nada" y fue justo el síntoma reportado
    // (campaña creada con $0). El servidor además rechaza ahora cualquier
    // budget no numérico en vez de coercionarlo a 0 (budgetAmountSchema).
    if (!budget.trim() || Number.isNaN(budgetNumber) || budgetNumber <= 0) {
      setError('Ingresa un presupuesto válido mayor a 0.');
      return;
    }
    if (mode === 'manual' && name.trim().length === 0) {
      setError('El nombre de la campaña es requerido para creación manual.');
      return;
    }
    if (mode === 'ai' && brief.trim().length === 0) {
      setError('El brief es requerido para generar con IA.');
      return;
    }
    if (mode === 'ai' && !platformSupportsAi) {
      setError(
        `La generación con IA solo está disponible para ${SUPPORTED_GENERATION_PLATFORMS.map((p) => PLATFORM_LABELS[p]).join(' y ')} por ahora. Cambia de plataforma o crea la campaña manualmente.`,
      );
      return;
    }

    startTransition(async () => {
      const result =
        mode === 'ai'
          ? await generateCampaignDraftWithAiAction({
              clientId,
              ...(name.trim() && { name: name.trim() }),
              platform,
              objective,
              brief,
              budget: budgetNumber,
              currency,
              startDate: startDate || null,
              endDate: endDate || null,
              ...(language && { language }),
              ...(market && { market }),
              ...(aiProvider && { provider: aiProvider }),
            })
          : await createCampaignDraftAction({
              clientId,
              name,
              platform,
              objective,
              brief: brief || null,
              budget: budgetNumber,
              currency,
              startDate: startDate || null,
              endDate: endDate || null,
            });

      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data?.id) {
        router.push(`/campaigns/${result.data.id}`);
      } else {
        router.push('/campaigns');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-200"
        >
          {error}
        </div>
      )}

      {/* Modo de creación */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h2 className="font-semibold text-gray-900">Modo de creación</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => setMode('ai')}
            className={`flex-1 text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
              mode === 'ai'
                ? 'border-red-500 ring-1 ring-red-500 bg-red-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span className="font-medium text-gray-900">✨ Generar con IA</span>
            <p className="text-gray-500 mt-0.5">
              A partir de un brief, genera concepto, audiencia, mensajes y creatividades sugeridas.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            className={`flex-1 text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
              mode === 'manual'
                ? 'border-red-500 ring-1 ring-red-500 bg-red-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <span className="font-medium text-gray-900">📝 Crear manualmente</span>
            <p className="text-gray-500 mt-0.5">
              Crea un borrador vacío para completar el contenido tú mismo.
            </p>
          </button>
        </div>
        <p className="text-xs text-gray-400">
          En ambos casos la campaña queda en estado borrador. Enviarla a revisión y aprobarla son pasos
          humanos posteriores y separados.
        </p>
      </div>

      {/* Datos base */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Datos base</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="clientId" className="block text-sm font-medium text-gray-700 mb-1">
              Cliente <span className="text-red-500">*</span>
            </label>
            <select
              id="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="platform" className="block text-sm font-medium text-gray-700 mb-1">
              Plataforma <span className="text-red-500">*</span>
            </label>
            <select
              id="platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as AdPlatform)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {AD_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                  {mode === 'ai' && !isSupportedGenerationPlatform(p) ? ' (sin IA todavía)' : ''}
                </option>
              ))}
            </select>
            {mode === 'ai' && !platformSupportsAi && (
              <p className="text-xs text-amber-600 mt-1">
                La generación con IA aún no está disponible para esta plataforma.
              </p>
            )}
          </div>

          {/*
            Phase 7D.1.1 — el nombre también se ofrece en modo IA, como campo
            OPCIONAL. Si el usuario lo escribe, se preserva tal cual; si lo deja
            vacío, el servidor deriva un título corto del contenido generado (ya
            no un párrafo entero del concepto).
          */}
          <div className="sm:col-span-2">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de la campaña{' '}
              {mode === 'manual' ? (
                <span className="text-red-500">*</span>
              ) : (
                <span className="text-gray-400 font-normal">(opcional)</span>
              )}
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required={mode === 'manual'}
              placeholder={
                mode === 'manual'
                  ? 'Ej: Temporada alta — Meta Ads'
                  : 'Si lo dejas vacío, la IA propone un título corto'
              }
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label htmlFor="objective" className="block text-sm font-medium text-gray-700 mb-1">
              Objetivo <span className="text-red-500">*</span>
            </label>
            <select
              id="objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value as CampaignObjective)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {CAMPAIGN_OBJECTIVES.map((o) => (
                <option key={o} value={o}>
                  {OBJECTIVE_LABELS[o]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="budget" className="block text-sm font-medium text-gray-700 mb-1">
              Presupuesto <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                id="budget"
                type="number"
                min="0"
                step="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                required
                placeholder="5000000"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
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
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de inicio
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de fin
            </label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>
      </div>

      {/* Brief / contexto para IA */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">
          Brief {mode === 'ai' && <span className="text-red-500">*</span>}
        </h2>
        <textarea
          id="brief"
          rows={6}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          required={mode === 'ai'}
          placeholder="Describe el producto/servicio, la audiencia, el tono deseado, promociones vigentes y cualquier restricción relevante..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-y"
        />

        {mode === 'ai' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <AIProviderSelect
                value={aiProvider}
                onChange={setAiProvider}
                disabled={isPending}
                defaultOptionLabel="Usar predeterminado del servidor"
              />
            </div>
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                Idioma
              </label>
              <input
                id="language"
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="es"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label htmlFor="market" className="block text-sm font-medium text-gray-700 mb-1">
                Mercado / jurisdicción
              </label>
              <input
                id="market"
                type="text"
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                placeholder="CO, MX, US..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {isPending
            ? mode === 'ai'
              ? 'Generando con IA…'
              : 'Creando…'
            : mode === 'ai'
              ? 'Generar borrador con IA'
              : 'Crear borrador'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={isPending}
          className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
