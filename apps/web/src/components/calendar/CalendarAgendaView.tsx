'use client';

import React from 'react';
import type { ContentCalendarItemProjection } from '@bop-agency/domain';
import { CalendarItemCard } from './CalendarItemCard';

interface CalendarAgendaViewProps {
  items: ContentCalendarItemProjection[];
  onSelectItem: (item: ContentCalendarItemProjection) => void;
}

export const CalendarAgendaView: React.FC<CalendarAgendaViewProps> = ({ items, onSelectItem }) => {
  if (items.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
        <p className="text-sm font-medium">No hay elementos de calendario programados en este rango.</p>
      </div>
    );
  }

  // Group items by date YYYY-MM-DD
  const grouped = items.reduce((acc, item) => {
    const iso = new Date(item.scheduledFor).toISOString();
    const parts = iso.split('T');
    const key = parts[0] || '1970-01-01';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<string, ContentCalendarItemProjection[]>);

  const sortedDates = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      {sortedDates.map((dateStr) => {
        const dateObj = new Date(dateStr + 'T00:00:00Z');
        const formattedDate = dateObj.toLocaleDateString([], {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });

        const dayItems = grouped[dateStr] || [];

        return (
          <div key={dateStr} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 capitalize">{formattedDate}</h3>
              <span className="text-xs font-semibold text-slate-500">
                {dayItems.length} {dayItems.length === 1 ? 'publicación' : 'publicaciones'}
              </span>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {dayItems.map((item) => (
                <CalendarItemCard key={item.id} item={item} onSelect={onSelectItem} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
