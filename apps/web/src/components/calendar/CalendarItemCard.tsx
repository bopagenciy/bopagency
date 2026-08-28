'use client';

import React from 'react';
import {
  computeCalendarDerivedState,
  type ContentCalendarItemProjection,
} from '@bop-agency/domain';

interface CalendarItemCardProps {
  item: ContentCalendarItemProjection;
  onSelect: (item: ContentCalendarItemProjection) => void;
}

export const CalendarItemCard: React.FC<CalendarItemCardProps> = ({ item, onSelect }) => {
  const { derivedLabel } = computeCalendarDerivedState(item);

  // Status color styles for visual distinction, but always pairing with text label and icon
  const getBadgeStyle = () => {
    switch (derivedLabel) {
      case 'Cancelado':
        return 'bg-gray-100 text-gray-700 border-gray-300';
      case 'Publicado':
        return 'bg-emerald-50 text-emerald-700 border-emerald-300';
      case 'En publicación':
      case 'Preparando publicación':
        return 'bg-blue-50 text-blue-700 border-blue-300';
      case 'Encolado':
      case 'Programado':
        return 'bg-indigo-50 text-indigo-700 border-indigo-300';
      case 'Resultado indeterminado':
        return 'bg-amber-50 text-amber-800 border-amber-400 font-semibold';
      case 'Fallido':
        return 'bg-rose-50 text-rose-700 border-rose-300 font-semibold';
      case 'Vencido':
        return 'bg-amber-100 text-amber-900 border-amber-400 font-bold';
      case 'Bloqueado':
        return 'bg-orange-50 text-orange-800 border-orange-300';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-300';
    }
  };

  const formattedTime = new Date(item.scheduledFor).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      onClick={() => onSelect(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect(item)}
      className="group p-2 rounded-lg border bg-white hover:shadow-md transition-all cursor-pointer space-y-1 text-left"
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs font-semibold text-slate-600 truncate">{formattedTime}</span>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${getBadgeStyle()}`}
        >
          {derivedLabel}
        </span>
      </div>

      <p className="text-xs font-medium text-slate-900 line-clamp-1 group-hover:text-indigo-600">
        {item.title}
      </p>

      <div className="flex items-center justify-between text-[11px] text-slate-500 truncate pt-0.5 border-t border-slate-100">
        <span className="truncate max-w-[120px]">{item.campaignName}</span>
        <span className="uppercase text-[9px] font-bold px-1 bg-slate-100 text-slate-600 rounded">
          {item.provider}
        </span>
      </div>
    </div>
  );
};
