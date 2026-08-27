'use client';

import React from 'react';

interface CalendarToolbarProps {
  viewMode: 'month' | 'agenda';
  onViewModeChange: (mode: 'month' | 'agenda') => void;
  currentDate: Date;
  onNavigateDate: (direction: 'prev' | 'next' | 'today') => void;
  selectedChannel: string;
  onChannelChange: (channel: string) => void;
  userRole: 'viewer' | 'operator' | 'strategist' | 'admin' | 'owner';
  onCreateClick: () => void;
}

export const CalendarToolbar: React.FC<CalendarToolbarProps> = ({
  viewMode,
  onViewModeChange,
  currentDate,
  onNavigateDate,
  selectedChannel,
  onChannelChange,
  userRole,
  onCreateClick,
}) => {
  const monthYearLabel = currentDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const isOperatorOrHigher = userRole !== 'viewer';

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigateDate('today')}
          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
        >
          Hoy
        </button>

        <div className="flex items-center rounded-lg border border-slate-200 bg-white">
          <button
            onClick={() => onNavigateDate('prev')}
            aria-label="Mes anterior"
            className="p-1.5 text-slate-600 hover:bg-slate-50 border-r border-slate-200 rounded-l-lg"
          >
            ←
          </button>
          <button
            onClick={() => onNavigateDate('next')}
            aria-label="Mes siguiente"
            className="p-1.5 text-slate-600 hover:bg-slate-50 rounded-r-lg"
          >
            →
          </button>
        </div>

        <h2 className="text-lg font-bold text-slate-900 capitalize pl-2">{monthYearLabel}</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Channel Filter */}
        <select
          value={selectedChannel}
          onChange={(e) => onChannelChange(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Todos los canales</option>
          <option value="meta_ads">Meta Ads</option>
          <option value="google_ads">Google Ads</option>
          <option value="linkedin_ads">LinkedIn Ads</option>
          <option value="instagram_organic">Instagram (Orgánico)</option>
          <option value="facebook_organic">Facebook (Orgánico)</option>
          <option value="email">Email</option>
          <option value="manual">Manual</option>
        </select>

        {/* View Mode Toggle */}
        <div className="inline-flex p-0.5 border border-slate-200 bg-slate-100 rounded-lg">
          <button
            onClick={() => onViewModeChange('month')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              viewMode === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mes
          </button>
          <button
            onClick={() => onViewModeChange('agenda')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              viewMode === 'agenda' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Agenda
          </button>
        </div>

        {/* Create Button for Operator+ */}
        {isOperatorOrHigher && (
          <button
            onClick={onCreateClick}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition"
          >
            + Programar Contenido
          </button>
        )}
      </div>
    </div>
  );
};
