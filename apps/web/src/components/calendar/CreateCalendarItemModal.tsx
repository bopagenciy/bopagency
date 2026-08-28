'use client';

import React, { useState } from 'react';
import type { ActivationChannel, ActivationProvider } from '@bop-agency/domain';

interface CreateCalendarItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    campaignId: string;
    channel: ActivationChannel;
    provider: ActivationProvider;
    title: string;
    contentSummary?: string | undefined;
    scheduledForISO: string;
    timezone?: string | undefined;
    notes?: string | undefined;
  }) => Promise<void>;
}

export const CreateCalendarItemModal: React.FC<CreateCalendarItemModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [campaignId, setCampaignId] = useState('');
  const [channel, setChannel] = useState<ActivationChannel>('meta_ads');
  const [provider, setProvider] = useState<ActivationProvider>('meta');
  const [title, setTitle] = useState('');
  const [contentSummary, setContentSummary] = useState('');
  const [scheduledForDate, setScheduledForDate] = useState('');
  const [scheduledForTime, setScheduledForTime] = useState('12:00');
  const [timezone, setTimezone] = useState('America/Bogota');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignId.trim() || !title.trim() || !scheduledForDate) {
      setErrorMessage('Por favor completa todos los campos requeridos.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const scheduledForISO = new Date(`${scheduledForDate}T${scheduledForTime}:00Z`).toISOString();
      await onSubmit({
        campaignId: campaignId.trim(),
        channel,
        provider,
        title: title.trim(),
        contentSummary: contentSummary.trim() ? contentSummary.trim() : undefined,
        scheduledForISO,
        timezone: timezone.trim() ? timezone.trim() : undefined,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear elemento';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900">Programar Nuevo Contenido</h3>
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

          <div>
            <label className="block font-semibold text-slate-700 mb-1">ID de Campaña *</label>
            <input
              type="text"
              required
              placeholder="UUID de la campaña"
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Título del Contenido *</label>
            <input
              type="text"
              required
              placeholder="Ej: Lanzamiento Promo Instagram Feed"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Canal *</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as ActivationChannel)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="meta_ads">Meta Ads</option>
                <option value="google_ads">Google Ads</option>
                <option value="linkedin_ads">LinkedIn Ads</option>
                <option value="instagram_organic">Instagram (Orgánico)</option>
                <option value="facebook_organic">Facebook (Orgánico)</option>
                <option value="email">Email</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Proveedor *</label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ActivationProvider)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              >
                <option value="meta">Meta</option>
                <option value="google">Google</option>
                <option value="linkedin">LinkedIn</option>
                <option value="email">Email</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="create-scheduled-date" className="block font-semibold text-slate-700 mb-1">Fecha *</label>
              <input
                id="create-scheduled-date"
                type="date"
                required
                value={scheduledForDate}
                onChange={(e) => setScheduledForDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Hora (UTC) *</label>
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
            <label className="block font-semibold text-slate-700 mb-1">Zona Horaria (IANA) *</label>
            <input
              type="text"
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Bogota"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Resumen del Contenido</label>
            <textarea
              rows={3}
              value={contentSummary}
              onChange={(e) => setContentSummary(e.target.value)}
              placeholder="Copy o especificaciones del anuncio..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Notas Internas</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones de diseño o editorial..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
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
              {isSubmitting ? 'Guardando...' : 'Guardar en Calendario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
