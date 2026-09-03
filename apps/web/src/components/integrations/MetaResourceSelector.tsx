'use client';

import React, { useState } from 'react';
import type { MetaDiscoveredResource } from '@bop-agency/application';

export type MetaResourceSelectorProps = {
  resources: MetaDiscoveredResource[];
  onSelectResource: (resourceId: string) => Promise<void>;
};

export function MetaResourceSelector({
  resources,
  onSelectResource,
}: MetaResourceSelectorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinalize = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSelectResource(selectedId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Select Meta Account to Connect</h3>
        <p className="text-sm text-slate-500 mt-1">
          Choose the Meta Ad Account or Page you wish to connect for this client.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
          {error}
        </div>
      )}

      {resources.length === 0 ? (
        <div className="p-4 bg-amber-50 text-amber-800 text-sm rounded-md border border-amber-200">
          No Meta resources discovered. Ensure your Meta account has access to an active Ad Account or Page.
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {resources.map((res) => {
            const isSelected = selectedId === res.resourceId;

            return (
              <div
                key={res.resourceId}
                onClick={() => setSelectedId(res.resourceId)}
                className={`p-4 rounded-md border cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{res.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">
                      Account ID: {res.resourceId}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {res.currency && (
                      <span className="font-semibold text-slate-700">{res.currency}</span>
                    )}
                    {res.timezone && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-sans">
                        {res.timezone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-4 border-t border-slate-100 flex justify-end">
        <button
          onClick={handleFinalize}
          disabled={!selectedId || isSubmitting}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Connecting...' : 'Connect Account'}
        </button>
      </div>
    </div>
  );
}
