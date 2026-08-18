import type { CampaignGeneratedContent } from '@bop-agency/domain';

type GeneratedContentViewProps = {
  content: Record<string, unknown> | null;
};

function isCampaignGeneratedContent(value: unknown): value is CampaignGeneratedContent {
  if (value === null || typeof value !== 'object') return false;
  const platform = (value as Record<string, unknown>)['platform'];
  return platform === 'meta_ads' || platform === 'google_ads';
}

function ListSection({ title, items }: { title: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</h4>
      <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Renderiza `Campaign.generatedContent` — contenido estructurado generado
 * por IA (Phase 7D), ya validado por Zod antes de persistirse. `schemaVersion`
 * se verifica antes de asumir la forma exacta del objeto (ver comentario en
 * `campaign-generated-content.ts`): un contenido con una forma inesperada
 * (versión futura, o dato legacy) cae al fallback de JSON crudo en vez de
 * arriesgar un render roto.
 */
export function GeneratedContentView({ content }: GeneratedContentViewProps) {
  if (!content) {
    return <p className="text-sm text-gray-400">Sin contenido generado todavía.</p>;
  }

  if (!isCampaignGeneratedContent(content)) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-amber-600">
          El contenido generado tiene un formato no reconocido por esta versión de la UI.
        </p>
        <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto">
          {JSON.stringify(content, null, 2)}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Concepto</h4>
        <p className="text-sm text-gray-800">{content.campaignConcept}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Audiencia objetivo
          </h4>
          <p className="text-sm text-gray-700">{content.targetAudience}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Propuesta de valor
          </h4>
          <p className="text-sm text-gray-700">{content.valueProposition}</p>
        </div>
      </div>

      <ListSection title="Mensajes clave" items={content.messaging} />
      <ListSection title="Llamados a la acción" items={content.callsToAction} />

      {content.platform === 'meta_ads' && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Ad sets sugeridos ({content.adSets.length})
          </h4>
          <div className="space-y-3">
            {content.adSets.map((adSet, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900">{adSet.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                    {adSet.audienceType}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{adSet.targetingSummary}</p>
                {adSet.creatives.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {adSet.creatives.map((creative, j) => (
                      <div key={j} className="text-xs bg-gray-50 rounded p-2">
                        <p className="font-medium text-gray-800">{creative.headline}</p>
                        <p className="text-gray-500">{creative.primaryText}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {content.platform === 'google_ads' && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Grupos de anuncios sugeridos ({content.adGroups.length})
          </h4>
          <div className="space-y-3">
            {content.adGroups.map((group, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-gray-900">{group.name}</p>
                <p className="text-xs text-gray-500">{group.theme}</p>
                <div className="flex flex-wrap gap-1">
                  {group.headlines.slice(0, 6).map((h, j) => (
                    <span key={j} className="text-xs bg-gray-50 border border-gray-100 rounded px-1.5 py-0.5">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <ListSection title="Palabras clave sugeridas" items={content.keywordSuggestions} />
        </div>
      )}

      <ListSection title="Recomendaciones de landing page" items={content.landingPageRecommendations} />
      <ListSection title="Notas de compliance (IA)" items={content.complianceNotes} />
      <ListSection title="Supuestos asumidos por la IA" items={content.assumptions} />
    </div>
  );
}
