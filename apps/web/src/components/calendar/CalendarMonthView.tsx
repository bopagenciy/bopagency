'use client';

import React from 'react';
import type { ContentCalendarItemProjection } from '@bop-agency/domain';
import { CalendarItemCard } from './CalendarItemCard';

interface CalendarMonthViewProps {
  currentDate: Date;
  items: ContentCalendarItemProjection[];
  onSelectItem: (item: ContentCalendarItemProjection) => void;
}

export const CalendarMonthView: React.FC<CalendarMonthViewProps> = ({
  currentDate,
  items,
  onSelectItem,
}) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const startingDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: (Date | null)[] = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }

  const daysOfWeek = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const getItemsForDay = (date: Date) => {
    return items.filter((item) => {
      const d = new Date(item.scheduledFor);
      return (
        d.getFullYear() === date.getFullYear() &&
        d.getMonth() === date.getMonth() &&
        d.getDate() === date.getDate()
      );
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Days of week header */}
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center">
        {daysOfWeek.map((day) => (
          <div key={day} className="py-2 text-xs font-bold text-slate-600">
            {day}
          </div>
        ))}
      </div>

      {/* Grid cells */}
      <div className="grid grid-cols-7 auto-rows-fr bg-slate-200 gap-[1px]">
        {days.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className="bg-slate-50 min-h-[110px]" />;
          }

          const dayItems = getItemsForDay(date);
          const todayStyle = isToday(date) ? 'bg-indigo-50/50' : 'bg-white';

          return (
            <div
              key={date.toISOString()}
              className={`${todayStyle} min-h-[120px] p-1.5 flex flex-col justify-start space-y-1`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday(date) ? 'bg-indigo-600 text-white' : 'text-slate-700'
                  }`}
                >
                  {date.getDate()}
                </span>
                {dayItems.length > 0 && (
                  <span className="text-[10px] font-semibold text-slate-500">
                    {dayItems.length} {dayItems.length === 1 ? 'ítem' : 'ítems'}
                  </span>
                )}
              </div>

              <div className="space-y-1 overflow-y-auto max-h-[140px] pr-0.5">
                {dayItems.map((item) => (
                  <CalendarItemCard key={item.id} item={item} onSelect={onSelectItem} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
