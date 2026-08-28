'use client';

import React, { useState } from 'react';
import type { GoogleAdsDiscoveredCustomer } from '@bop-agency/shared';

export type GoogleCustomerSelectorProps = {
  customers: GoogleAdsDiscoveredCustomer[];
  onSelectCustomer: (resourceId: string) => Promise<void>;
};

export function GoogleCustomerSelector({
  customers,
  onSelectCustomer,
}: GoogleCustomerSelectorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinalize = async () => {
    if (!selectedId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSelectCustomer(selectedId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const operatingCustomers = customers.filter(c => !c.isManager);

  return (
    <div className="space-y-6 bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-slate-900">Select Google Ads Operating Account</h3>
        <p className="text-sm text-slate-500 mt-1">
          Choose the exact operating account and manager path you wish to connect for this client.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200">
          {error}
        </div>
      )}

      {operatingCustomers.length === 0 ? (
        <div className="p-4 bg-amber-50 text-amber-800 text-sm rounded-md border border-amber-200">
          No operating customer accounts were discovered. Ensure your Google account has access to an active Google Ads account.
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {operatingCustomers.map(cust => {
            const resourceId = cust.id || cust.customerId;
            const formattedId = `${cust.customerId.slice(0, 3)}-${cust.customerId.slice(3, 6)}-${cust.customerId.slice(6, 10)}`;
            const isSelected = selectedId === resourceId;

            return (
              <div
                key={resourceId}
                onClick={() => setSelectedId(resourceId)}
                className={`p-4 rounded-md border cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-600'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{cust.customerName}</div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">ID: {formattedId}</div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {cust.managerCustomerId ? (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-sans">
                        via Manager {cust.managerCustomerId}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded font-sans">
                        Direct Access
                      </span>
                    )}
                    {cust.currencyCode && (
                      <span className="font-semibold text-slate-700">{cust.currencyCode}</span>
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
          className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {isSubmitting ? 'Finalizing...' : 'Connect Selected Account'}
        </button>
      </div>
    </div>
  );
}
