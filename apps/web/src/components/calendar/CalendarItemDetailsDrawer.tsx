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
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-card text-card-foreground h-full shadow-2xl flex flex-col border-l border-border animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-muted/50">
          <div>
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Detalle de Contenido
            </span>
            <h2 className="text-base font-semibold text-foreground line-clamp-1">{item.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5 text-sm">
          {/* Status Badge Banner */}
          <div className="p-3 rounded-md border border-border bg-muted/30 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Estado de Operación:</span>
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100/80 text-amber-900 border border-amber-200">
              {derivedLabel}
            </span>
          </div>

          {/* Blocked Reason Warning */}
          {isBlocked && blockedReason && (
            <div className="p-3 rounded-md border border-amber-200 bg-amber-50/80 text-amber-900 text-xs space-y-1">
              <span className="font-bold flex items-center gap-1">⚠️ Bloqueo Detectado:</span>
              <p>Motivo: {blockedReason}</p>
            </div>
          )}

          {/* Campaign & Client Link */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaña</h4>
            <div className="p-3 rounded-md border border-border bg-muted/20 space-y-1">
              <p className="font-semibold text-foreground">{item.campaignName}</p>
              <p className="text-xs text-muted-foreground">Cliente: {item.clientName}</p>
              <div className="pt-2">
                <Link
                  href={`/campaigns/${item.campaignId}/activation`}
                  className="text-xs font-semibold text-foreground hover:underline flex items-center gap-1"
                >
                  Ver Activación y Publicación →
                </Link>
              </div>
            </div>
          </div>

          {/* Schedule & Timezone */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Programación Editorial</h4>
            <div className="p-3 rounded-md border border-border space-y-1 bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Fecha y Hora (UTC):</span>
                <span className="font-semibold text-foreground">
                  {new Date(item.scheduledFor).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Zona Horaria:</span>
                <span className="font-mono text-xs font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded-sm">
                  {item.timezone}
                </span>
              </div>
            </div>
          </div>

          {/* Content Summary */}
          {item.contentSummary && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resumen / Copy</h4>
              <p className="p-3 rounded-md border border-border bg-muted/20 text-foreground text-xs leading-relaxed">
                {item.contentSummary}
              </p>
            </div>
          )}

          {/* Reschedule Reason / Audit Notes */}
          {item.rescheduleReason && (
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Historial de Reprogramación</h4>
              <p className="p-3 rounded-md border border-amber-200 bg-amber-50/80 text-amber-900 text-xs">
                {item.rescheduleReason}
              </p>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="p-4 border-t border-border bg-muted/50 flex items-center justify-end gap-2">
          {isOperatorOrHigher && (
            <button
              disabled={isRescheduleLocked}
              onClick={() => onRescheduleClick(item)}
              className="px-3.5 py-1.5 text-xs font-semibold text-foreground bg-card border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition"
            >
              Reprogramar
            </button>
          )}

          {isStrategistOrHigher && item.calendarStatus !== 'cancelled' && (
            <button
              onClick={() => onCancelClick(item)}
              className="px-3.5 py-1.5 text-xs font-semibold text-red-900 bg-red-50/80 border border-red-200 hover:bg-red-50 rounded-md transition"
            >
              Cancelar Ítem
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
