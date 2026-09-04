'use client';

import { useState, useTransition } from 'react';
import { testMetaConnectionAction } from '@/app/(protected)/clients/[clientId]/integrations/meta/actions';
import type { TestMetaConnectionResult } from '@bop-agency/application';

type Props = {
  organizationId: string;
  clientId: string;
  clientIntegrationId: string;
};

export function TestMetaConnectionButton({
  organizationId,
  clientId,
  clientIntegrationId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<TestMetaConnectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleTest = () => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await testMetaConnectionAction(
        organizationId,
        clientId,
        clientIntegrationId,
        true,
      );
      if (!res.success) {
        setError(res.error || 'Error desconocido al probar la conexión.');
        setOpen(true);
      } else if (res.value) {
        setResult(res.value);
        setOpen(true);
      }
    });
  };

  return (
    <div className="inline-block text-left">
      <button
        type="button"
        onClick={handleTest}
        disabled={isPending}
        className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline disabled:opacity-50 ml-2"
        aria-label="Probar conexión con Meta"
      >
        {isPending ? 'Probando...' : 'Probar conexión'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-lg shadow-lg max-w-lg w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto text-foreground">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-semibold">
                {error ? 'Fallo en la prueba de conexión' : 'Conexión con Meta verificada'}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 border border-border rounded"
              >
                Cerrar
              </button>
            </div>

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded p-3 text-xs text-destructive">
                <p className="font-medium mb-1">Error al verificar la integración:</p>
                <p>{error}</p>
              </div>
            )}

            {result && (
              <div className="space-y-3 text-xs">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-3 space-y-1">
                  <p>
                    <span className="font-medium text-muted-foreground">Cuenta:</span>{' '}
                    <span className="font-semibold">{result.account.name}</span>{' '}
                    <span className="font-mono text-muted-foreground">({result.account.id})</span>
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">Moneda / Zona horaria:</span>{' '}
                    <span>
                      {result.account.currency || 'N/A'} / {result.account.timezone_name || 'N/A'}
                    </span>
                  </p>
                  <p>
                    <span className="font-medium text-muted-foreground">Campañas accesibles:</span>{' '}
                    <span className="font-semibold">{result.campaignsCount}</span>
                  </p>
                </div>

                {result.campaigns && result.campaigns.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-foreground mb-2">
                      Campañas descubiertas (hasta 10):
                    </h4>
                    <div className="border border-border rounded divide-y divide-border overflow-hidden">
                      {result.campaigns.slice(0, 10).map((c) => (
                        <div key={c.id} className="p-2 flex items-center justify-between text-[11px]">
                          <div className="min-w-0 pr-2">
                            <p className="font-medium truncate">{c.name}</p>
                            <p className="text-muted-foreground font-mono text-[10px]">ID: {c.id}</p>
                          </div>
                          <span
                            className={'px-1.5 py-0.5 rounded font-medium text-[10px] shrink-0 ' + (c.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-700' : 'bg-muted text-muted-foreground')}
                          >
                            {c.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.sampleMetrics && result.sampleMetrics.length > 0 && (
                  <div className="bg-muted/40 border border-border rounded p-3 space-y-1">
                    <h4 className="font-semibold text-foreground mb-1">
                      Muestra de métricas de lectura (Campaña: {result.candidateCampaignId || 'N/A'}):
                    </h4>
                    {result.sampleMetrics.slice(0, 1).map((m, idx) => (
                      <div key={idx} className="grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                        <p>Impresiones: <span className="font-semibold text-foreground">{m.impressions ?? 'N/A'}</span></p>
                        <p>Clics: <span className="font-semibold text-foreground">{m.clicks ?? 'N/A'}</span></p>
                        <p>Alcance: <span className="font-semibold text-foreground">{m.reach ?? 'N/A'}</span></p>
                        <p>Gasto: <span className="font-semibold text-foreground">{m.spend ?? 'N/A'} {m.account_currency || ''}</span></p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
