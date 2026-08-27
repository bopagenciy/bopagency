'use client';

import React, { useState, useEffect } from 'react';
import type { ContentCalendarItemProjection } from '@bop-agency/domain';
import type { ActivationChannel } from '@bop-agency/shared';
import { CalendarToolbar } from './CalendarToolbar';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarAgendaView } from './CalendarAgendaView';
import { CalendarItemDetailsDrawer } from './CalendarItemDetailsDrawer';
import { CreateCalendarItemModal } from './CreateCalendarItemModal';
import { RescheduleCalendarItemModal } from './RescheduleCalendarItemModal';
import {
  createContentCalendarItemAction,
  updateContentCalendarItemScheduleAction,
  cancelContentCalendarItemAction,
  listContentCalendarItemsAction,
} from '@/app/(protected)/calendar/calendar-actions';

interface ContentCalendarPageProps {
  userRole: 'viewer' | 'operator' | 'strategist' | 'admin' | 'owner';
  initialCampaignId?: string | undefined;
}

export const ContentCalendarPage: React.FC<ContentCalendarPageProps> = ({
  userRole,
  initialCampaignId,
}) => {
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedChannel, setSelectedChannel] = useState('');
  const [items, setItems] = useState<ContentCalendarItemProjection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [selectedItem, setSelectedItem] = useState<ContentCalendarItemProjection | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [itemToReschedule, setItemToReschedule] = useState<ContentCalendarItemProjection | null>(null);

  const fetchItems = React.useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    // Compute range start/end for month view (plus padding)
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const startAt = new Date(Date.UTC(year, month - 1, 20)).toISOString();
    const endAt = new Date(Date.UTC(year, month + 2, 10)).toISOString();

    const res = await listContentCalendarItemsAction({
      startAtISO: startAt,
      endAtISO: endAt,
      campaignId: initialCampaignId,
      channel: selectedChannel ? (selectedChannel as ActivationChannel) : undefined,
    });

    if (!res.success) {
      setErrorMessage(res.error);
    } else {
      setItems((res.data as ContentCalendarItemProjection[]) || []);
    }
    setIsLoading(false);
  }, [currentDate, selectedChannel, initialCampaignId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleNavigateDate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
    } else if (direction === 'prev') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    }
  };

  const handleCreateSubmit = async (data: Parameters<typeof createContentCalendarItemAction>[0]) => {
    const res = await createContentCalendarItemAction(data);
    if (!res.success) {
      throw new Error(res.error);
    }
    await fetchItems();
  };

  const handleRescheduleSubmit = async (data: Parameters<typeof updateContentCalendarItemScheduleAction>[0]) => {
    const res = await updateContentCalendarItemScheduleAction(data);
    if (!res.success) {
      throw new Error(res.error);
    }
    await fetchItems();
    setSelectedItem(null);
  };

  const handleCancelItem = async (item: ContentCalendarItemProjection) => {
    const reason = prompt('Motivo de cancelación del elemento de calendario:');
    if (!reason || !reason.trim()) return;

    const res = await cancelContentCalendarItemAction({
      calendarItemId: item.id,
      reason: reason.trim(),
    });

    if (!res.success) {
      alert(`Error al cancelar: ${res.error}`);
    } else {
      await fetchItems();
      setSelectedItem(null);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4 md:p-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Calendario de Contenidos</h1>
          <p className="text-xs text-slate-500">
            Planificación editorial y monitoreo de publicaciones entre campañas.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <CalendarToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentDate={currentDate}
        onNavigateDate={handleNavigateDate}
        selectedChannel={selectedChannel}
        onChannelChange={setSelectedChannel}
        userRole={userRole}
        onCreateClick={() => setIsCreateModalOpen(true)}
      />

      {/* Error / Loading */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-lg">
          ⚠️ {errorMessage}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400 text-xs animate-pulse">
          Cargando calendario de contenidos...
        </div>
      ) : viewMode === 'month' ? (
        <CalendarMonthView
          currentDate={currentDate}
          items={items}
          onSelectItem={(item) => setSelectedItem(item)}
        />
      ) : (
        <CalendarAgendaView
          items={items}
          onSelectItem={(item) => setSelectedItem(item)}
        />
      )}

      {/* Item Details Slide-Over Drawer */}
      <CalendarItemDetailsDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        userRole={userRole}
        onRescheduleClick={(item) => setItemToReschedule(item)}
        onCancelClick={handleCancelItem}
      />

      {/* Create Modal */}
      <CreateCalendarItemModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateSubmit}
      />

      {/* Reschedule Modal */}
      <RescheduleCalendarItemModal
        item={itemToReschedule}
        isOpen={!!itemToReschedule}
        onClose={() => setItemToReschedule(null)}
        onSubmit={handleRescheduleSubmit}
      />
    </div>
  );
};
