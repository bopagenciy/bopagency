'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ACTIVATION_CHANNEL_LABELS } from '@bop-agency/shared';
import type { ActivationChannel, ActivationTargetStatus } from '@bop-agency/shared';
import { ActivationTargetStatusBadge } from './ActivationTargetStatusBadge';
import {
  addCampaignActivationTargetAction,
  prepareActivationTargetAction,
  markActivationTargetReadyAction,
  markActivationTargetPublishedAction,
  cancelActivationTargetAction,
} from '@/app/(protected)/campaigns/[id]/activation/actions';

const OPERATOR_ROLES = new Set(['operator', 'strategist', 'admin', 'owner']);
const STRATEGIST_ROLES = new Set(['strategist', 'admin', 'owner']);

export type ActivationTargetRow = {
  id: string;
  channel: string;
  provider: string;
  placement: string | null;
  status: ActivationTargetStatus;
  clientIntegrationId: string | null;
  externalReference: string | null;
  publishedAt: string | null;
  createdAt: string;
};

type ActivationTargetsPanelProps = {
  campaignId: string;
  activationId: string;
  activationTerminal: boolean;
  targets: ActivationTargetRow[];
  userRole: string;
};

function canPrepare(status: ActivationTargetStatus) {
  return status === 'pending';
}
function canMarkReady(status: ActivationTargetStatus) {
  return status === 'preparing';
}
function canMarkPublished(status: ActivationTargetStatus) {
  return status === 'ready' || status === 'scheduled';
}
function canCancel(status: ActivationTargetStatus) {
  return status === 'pending' || status === 'preparing' || status === 'ready' || status === 'scheduled';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Panel operativo de targets (canales) de una activación — Phase 8A.3.
 *
 * "Marcar publicado" es SIEMPRE una confirmación manual de que el
 * contenido se publicó fuera de la plataforma; este componente nunca llama
 * a un API de Meta/Google/LinkedIn/email — solo invoca los Server Actions
 * que registran la confirmación humana.
 */
export function ActivationTargetsPanel({
  campaignId,
  activationId,
  activationTerminal,
  targets,
  userRole,
}: ActivationTargetsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [publishFormFor, setPublishFormFor] = useState<string | null>(null);
  const [cancelFormFor, setCancelFormFor] = useState<string | null>(null);
  const [publishRef, setPublishRef] = useState('');
  const [publishNote, setPublishNote] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addPlacement, setAddPlacement] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const canOperate = OPERATOR_ROLES.has(userRole);
  const canConfigure = STRATEGIST_ROLES.has(userRole);

  function setErrorFor(id: string, message: string | null) {
    setRowError((prev) => {
      const next = { ...prev };
      if (message === null) delete next[id];
      else next[id] = message;
      return next;
    });
  }

  function handlePrepare(targetId: string) {
    setErrorFor(targetId, null);
    startTransition(async () => {
      const result = await prepareActivationTargetAction({ campaignId, targetId });
      if (!result.ok) {
        setErrorFor(targetId, result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleMarkReady(targetId: string) {
    setErrorFor(targetId, null);
    startTransition(async () => {
      const result = await markActivationTargetReadyAction({ campaignId, targetId });
      if (!result.ok) {
        setErrorFor(targetId, result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleMarkPublished(targetId: string) {
    setErrorFor(targetId, null);
    startTransition(async () => {
      const result = await markActivationTargetPublishedAction({
        campaignId,
        targetId,
        externalReference: publishRef.trim().length > 0 ? publishRef.trim() : null,
        note: publishNote.trim().length > 0 ? publishNote.trim() : null,
      });
      if (!result.ok) {
        setErrorFor(targetId, result.error);
        return;
      }
      setPublishFormFor(null);
      setPublishRef('');
      setPublishNote('');
      router.refresh();
    });
  }

  function handleCancelTarget(targetId: string) {
    setErrorFor(targetId, null);
    if (cancelReason.trim().length === 0) {
      setErrorFor(targetId, 'La razón de cancelación es requerida.');
      return;
    }
    startTransition(async () => {
      const result = await cancelActivationTargetAction({
        campaignId,
        targetId,
        reason: cancelReason.trim(),
      });
      if (!result.ok) {
        setErrorFor(targetId, result.error);
        return;
      }
      setCancelFormFor(null);
      setCancelReason('');
      router.refresh();
    });
  }

  function handleAddManualTarget() {
    setAddError(null);
    startTransition(async () => {
      const result = await addCampaignActivationTargetAction({
        campaignId,
        activationId,
        channel: 'manual',
        provider: 'manual',
        placement: addPlacement.trim().length > 0 ? addPlacement.trim() : null,
      });
      if (!result.ok) {
        setAddError(result.error);
        return;
      }
      setShowAddForm(false);
      setAddPlacement('');
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Canales de distribución</h2>
        {canConfigure && !activationTerminal && (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            disabled={isPending}
            className="px-3 py-1.5 text-xs font-medium rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
          >
            {showAddForm ? 'Cancelar' : '+ Agregar canal manual'}
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">
        &ldquo;Publicado&rdquo; en esta fase significa que un operador confirmó manualmente que el
        contenido se publicó fuera de la plataforma — ninguna acción aquí llama a Meta, Google,
        LinkedIn ni ningún proveedor de email.
      </p>

      {showAddForm && canConfigure && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
          <p className="text-sm text-gray-600">
            Agrega un canal manual (channel/provider = &ldquo;manual&rdquo;). Los canales con
            integración externa real (Meta Ads, Google Ads, LinkedIn Ads, Email) se habilitan en
            una fase posterior.
          </p>
          <label htmlFor="add-target-placement" className="block text-xs font-medium text-gray-600">
            Placement (opcional, snake_case, ej. &ldquo;instagram_feed&rdquo;)
          </label>
          <input
            id="add-target-placement"
            type="text"
            value={addPlacement}
            onChange={(e) => setAddPlacement(e.target.value)}
            placeholder="instagram_feed"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {addError && (
            <p className="text-xs text-red-600" role="alert">
              {addError}
            </p>
          )}
          <button
            type="button"
            onClick={handleAddManualTarget}
            disabled={isPending}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Agregando…' : 'Agregar canal'}
          </button>
        </div>
      )}

      {targets.length === 0 ? (
        <div className="py-10 text-center" data-testid="targets-empty-state">
          <p className="text-sm text-gray-500">
            Todavía no hay canales configurados para esta activación.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 pr-4">Canal</th>
                <th className="py-2 pr-4">Proveedor</th>
                <th className="py-2 pr-4">Placement</th>
                <th className="py-2 pr-4">Estado</th>
                <th className="py-2 pr-4">Referencia externa</th>
                <th className="py-2 pr-4">Actualizado</th>
                <th className="py-2 pr-4">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target) => (
                <tr key={target.id} className="border-b border-gray-50 align-top">
                  <td className="py-2 pr-4 font-medium text-gray-800">
                    {ACTIVATION_CHANNEL_LABELS[target.channel as ActivationChannel] ?? target.channel}
                  </td>
                  <td className="py-2 pr-4 text-gray-600">{target.provider}</td>
                  <td className="py-2 pr-4 text-gray-600">{target.placement ?? '—'}</td>
                  <td className="py-2 pr-4">
                    <ActivationTargetStatusBadge status={target.status} />
                  </td>
                  <td className="py-2 pr-4 text-gray-600">{target.externalReference ?? '—'}</td>
                  <td className="py-2 pr-4 text-gray-500">
                    {formatDate(target.publishedAt ?? target.createdAt)}
                  </td>
                  <td className="py-2 pr-4 space-y-2">
                    {rowError[target.id] && (
                      <p role="alert" className="text-xs text-red-600">
                        {rowError[target.id]}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {canOperate && canPrepare(target.status) && (
                        <button
                          type="button"
                          onClick={() => handlePrepare(target.id)}
                          disabled={isPending}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        >
                          Preparar
                        </button>
                      )}
                      {canOperate && canMarkReady(target.status) && (
                        <button
                          type="button"
                          onClick={() => handleMarkReady(target.id)}
                          disabled={isPending}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          Marcar listo
                        </button>
                      )}
                      {canOperate && canMarkPublished(target.status) && (
                        <button
                          type="button"
                          onClick={() =>
                            setPublishFormFor(publishFormFor === target.id ? null : target.id)
                          }
                          disabled={isPending}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
                        >
                          Marcar publicado
                        </button>
                      )}
                      {canConfigure && canCancel(target.status) && (
                        <button
                          type="button"
                          onClick={() =>
                            setCancelFormFor(cancelFormFor === target.id ? null : target.id)
                          }
                          disabled={isPending}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>

                    {publishFormFor === target.id && (
                      <div className="rounded border border-gray-100 bg-gray-50 p-2 space-y-1.5 max-w-xs">
                        <p className="text-xs text-gray-500">
                          Confirma que el contenido se publicó manualmente fuera de la plataforma.
                        </p>
                        <input
                          type="text"
                          placeholder="Referencia externa (opcional, ej. ID de post)"
                          value={publishRef}
                          onChange={(e) => setPublishRef(e.target.value)}
                          className="w-full px-2 py-1 border border-border rounded text-xs"
                        />
                        <input
                          type="text"
                          placeholder="Nota (opcional)"
                          value={publishNote}
                          onChange={(e) => setPublishNote(e.target.value)}
                          className="w-full px-2 py-1 border border-border rounded text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleMarkPublished(target.id)}
                          disabled={isPending}
                          className="px-2.5 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {isPending ? 'Confirmando…' : 'Confirmar publicación manual'}
                        </button>
                      </div>
                    )}

                    {cancelFormFor === target.id && (
                      <div className="rounded border border-gray-100 bg-gray-50 p-2 space-y-1.5 max-w-xs">
                        <label
                          htmlFor={`cancel-reason-${target.id}`}
                          className="block text-xs font-medium text-gray-600"
                        >
                          Razón de cancelación (requerida)
                        </label>
                        <textarea
                          id={`cancel-reason-${target.id}`}
                          rows={2}
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          className="w-full px-2 py-1 border border-border rounded text-xs resize-y"
                        />
                        <button
                          type="button"
                          onClick={() => handleCancelTarget(target.id)}
                          disabled={isPending}
                          className="px-2.5 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {isPending ? 'Cancelando…' : 'Confirmar cancelación'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
