'use client';

import React from 'react';
import Link from 'next/link';
import {
  computeCalendarDerivedState,
  type ContentCalendarItemProjection,
} from '@bop-agency/domain';

interface CalendarItemDetailsDrawerProps {
  item: ContentCalendarItemProjection | null;
  onClose: () => void;
  userRole: 'viewer' | 'operator' | 'strategist' | 'admin' | 'owner';
  onRescheduleClick: (item: ContentCalendarItemProjection) => void;
  onCancelClick: (item: ContentCalendarItemProjection) => void;
}

export const CalendarItemDetailsDrawer: React.FC<CalendarItemDetailsDrawerProps> = ({
  item,
  onClose,
  userRole,
  onRescheduleClick,
  onCancelClick,
}) => {
  if (!item) return null;

  const { isBlocked, blockedReason, derivedLabel } = computeCalendarDerivedState(item);

  const isOperatorOrHigher = userRole !== 'viewer';
  const isStrategistOrHigher = ['strategist', 'admin', 'owner'].includes(userRole);

  const isRescheduleLocked =
    item.calendarStatus === 'cancelled' ||
    ['queued', 'claimed', 'in_progress', 'succeeded', 'unknown_outcome'].includes(
      item.publicationJobStatus || '',
    );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Detalle de Contenido
            </span>
            <h2 className="text-base font-bold text-slate-900 line-clamp-1">{item.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5 text-sm">
          {/* Status Badge Banner */}
          <div className="p-3 rounded-lg border bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Estado de Operación:</span>
            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
              {derivedLabel}
            </span>
          </div>

          {/* Blocked Reason Warning */}
          {isBlocked && blockedReason && (
            <div className="p-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs space-y-1">
              <span className="font-bold flex items-center gap-1">⚠️ Bloqueo Detectado:</span>
              <p>Motivo: {blockedReason}</p>
            </div>
          )}

          {/* Campaign & Client Link */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase">Campaña</h4>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/50 space-y-1">
              <p className="font-bold text-slate-900">{item.campaignName}</p>
              <p className="text-xs text-slate-600">Cliente: {item.clientName}</p>
              <div className="pt-2">
                <Link
                  href={`/campaigns/${item.campaignId}/activation`}
                  className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                >
                  Ver Activación y Publicación →
                </Link>
              </div>
            </div>
          </div>

          {/* Schedule & Timezone */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase">Programación Editorial</h4>
            <div className="p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Fecha y Hora (UTC):</span>
                <span className="font-semibold text-slate-900">
                  {new Date(item.scheduledFor).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Zona Horaria:</span>
                <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                  {item.timezone}
                </span>
              </div>
            </div>
          </div>

          {/* Content Summary */}
          {item.contentSummary && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-500 uppercase">Resumen / Copy</h4>
              <p className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs leading-relaxed">
                {item.contentSummary}
              </p>
            </div>
          )}

          {/* Reschedule Reason / Audit Notes */}
          {item.rescheduleReason && (
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-500 uppercase">Historial de Reprogramación</h4>
              <p className="p-3 rounded-lg border border-amber-200 bg-amber-50/50 text-amber-900 text-xs">
                {item.rescheduleReason}
              </p>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          {isOperatorOrHigher && (
            <button
              disabled={isRescheduleLocked}
              onClick={() => onRescheduleClick(item)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition"
            >
              Reprogramar
            </button>
          )}

          {isStrategistOrHigher && item.calendarStatus !== 'cancelled' && (
            <button
              onClick={() => onCancelClick(item)}
              className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition"
            >
              Cancelar Ítem
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
