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
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-card border border-border rounded-lg shadow-sm">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigateDate('today')}
          className="px-3 py-1.5 text-xs font-semibold text-foreground bg-muted hover:bg-muted/80 rounded-md transition"
        >
          Hoy
        </button>

        <div className="flex items-center rounded-md border border-border bg-card">
          <button
            onClick={() => onNavigateDate('prev')}
            aria-label="Mes anterior"
            className="p-1.5 text-muted-foreground hover:bg-muted border-r border-border rounded-l-md"
          >
            ←
          </button>
          <button
            onClick={() => onNavigateDate('next')}
            aria-label="Mes siguiente"
            className="p-1.5 text-muted-foreground hover:bg-muted rounded-r-md"
          >
            →
          </button>
        </div>

        <h2 className="text-lg font-bold text-foreground capitalize pl-2">{monthYearLabel}</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Channel Filter */}
        <select
          value={selectedChannel}
          onChange={(e) => onChannelChange(e.target.value)}
          className="px-3 py-1.5 text-xs font-medium text-foreground bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
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
        <div className="inline-flex p-0.5 border border-border bg-muted rounded-md">
          <button
            onClick={() => onViewModeChange('month')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              viewMode === 'month' ? 'bg-card text-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Mes
          </button>
          <button
            onClick={() => onViewModeChange('agenda')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              viewMode === 'agenda' ? 'bg-card text-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Agenda
          </button>
        </div>

        {/* Create Button for Operator+ */}
        {isOperatorOrHigher && (
          <button
            onClick={onCreateClick}
            className="px-3.5 py-1.5 text-xs font-medium text-primary-foreground bg-primary hover:bg-primary-hover rounded-md shadow-sm transition"
          >
            + Programar Contenido
          </button>
        )}
      </div>
    </div>
  );
};
