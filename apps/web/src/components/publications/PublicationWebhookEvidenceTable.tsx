import React from 'react';
import type { PublicationWebhookEvidenceItem } from '@bop-agency/application';

type Props = {
  readonly evidence: readonly PublicationWebhookEvidenceItem[];
  readonly isLoading?: boolean;
};

export function PublicationWebhookEvidenceTable({ evidence, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 animate-pulse">
        Cargando evidencia de webhooks...
      </div>
    );
  }

  if (evidence.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 border border-dashed rounded-lg bg-gray-50">
        No se ha registrado evidencia de webhook para este trabajo.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-border rounded-lg">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-gray-50 text-gray-700 text-xs font-semibold uppercase tracking-wider border-b border-border">
          <tr>
            <th className="px-3 py-2">ID Evento</th>
            <th className="px-3 py-2">Proveedor</th>
            <th className="px-3 py-2">Estado Recibo</th>
            <th className="px-3 py-2">Payload Hash</th>
            <th className="px-3 py-2">Código Error</th>
            <th className="px-3 py-2">Recibido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {evidence.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50/50">
              <td className="px-3 py-2 font-mono text-xs text-gray-900">{item.externalEventId}</td>
              <td className="px-3 py-2 capitalize text-gray-700">{item.provider}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                  {item.status}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-gray-500" title={item.payloadHash}>
                {item.payloadHash.substring(0, 12)}...
              </td>
              <td className="px-3 py-2 text-xs text-gray-500">{item.errorCode ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-gray-500">
                {new Date(item.receivedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
