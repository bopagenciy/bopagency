'use client';

import React, { useState } from 'react';
import type { ContentCalendarItemProjection } from '@bop-agency/domain';

interface RescheduleCalendarItemModalProps {
  item: ContentCalendarItemProjection | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    calendarItemId: string;
    scheduledForISO: string;
    timezone?: string | undefined;
    rescheduleReason: string;
  }) => Promise<void>;
}

export const RescheduleCalendarItemModal: React.FC<RescheduleCalendarItemModalProps> = ({
  item,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [scheduledForDate, setScheduledForDate] = useState('');
  const [scheduledForTime, setScheduledForTime] = useState('12:00');
  const [timezone, setTimezone] = useState(item?.timezone || 'America/Bogota');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledForDate || !rescheduleReason.trim()) {
      setErrorMessage('Por favor especifica la nueva fecha y el motivo de reprogramación.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const scheduledForISO = new Date(`${scheduledForDate}T${scheduledForTime}:00Z`).toISOString();
      await onSubmit({
        calendarItemId: item.id,
        scheduledForISO,
        timezone: timezone.trim() || undefined,
        rescheduleReason: rescheduleReason.trim(),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al reprogramar';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-900">Reprogramar Contenido</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="py-4 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
              {errorMessage}
            </div>
          )}

          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <p className="font-bold text-slate-900">{item.title}</p>
            <p className="text-[11px] text-slate-500">{item.campaignName}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="reschedule-date" className="block font-semibold text-slate-700 mb-1">Nueva Fecha *</label>
              <input
                id="reschedule-date"
                type="date"
                required
                value={scheduledForDate}
                onChange={(e) => setScheduledForDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nueva Hora (UTC) *</label>
              <input
                type="time"
                required
                value={scheduledForTime}
                onChange={(e) => setScheduledForTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Zona Horaria (IANA)</label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Bogota"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Motivo de Reprogramación *</label>
            <textarea
              rows={3}
              required
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              placeholder="Explica por qué se reprograma la fecha..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : 'Confirmar Reprogramación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
