/**
 * Tests — AutomationSignalsWidget — Phase 6F
 *
 * Cubre: renderizado de señales operativas, estados de color,
 *        estado vacío, accesibilidad, enlaces correctos.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutomationSignalsWidget } from '../AutomationSignalsWidget';
import type { AutomationSignalData } from '../AutomationSignalsWidget';

// ─── Factories ─────────────────────────────────────────────────────────────────

function makeData(overrides: Partial<AutomationSignalData> = {}): AutomationSignalData {
  return {
    activeAutomations: 0,
    recentFailedExecutions: 0,
    runningExecutions: 0,
    activeAutomationAlerts: 0,
    pendingAutomationTasks: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutomationSignalsWidget', () => {

  describe('A. renderizado básico', () => {
    it('renderiza el título Automatizaciones', () => {
      render(<AutomationSignalsWidget data={makeData()} />);
      expect(screen.getByText('Automatizaciones')).toBeInTheDocument();
    });

    it('renderiza enlace a /automations', () => {
      render(<AutomationSignalsWidget data={makeData()} />);
      const links = screen.getAllByRole('link');
      const autoLinks = links.filter((l) => l.getAttribute('href')?.includes('/automations'));
      expect(autoLinks.length).toBeGreaterThan(0);
    });

    it('las señales tienen role=list y role=listitem para accesibilidad', () => {
      render(<AutomationSignalsWidget data={makeData({ activeAutomations: 2 })} />);
      expect(screen.getByRole('list', { name: /Señales operativas/i })).toBeInTheDocument();
      const items = screen.getAllByRole('listitem');
      expect(items.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('B. estado sin automatizaciones', () => {
    it('muestra mensaje sin automatizaciones configuradas cuando activeAutomations=0 y sin incidentes', () => {
      render(<AutomationSignalsWidget data={makeData()} />);
      expect(screen.getByText(/Sin automatizaciones configuradas/i)).toBeInTheDocument();
    });

    it('no muestra mensaje de incidentes activos cuando hay incidentes', () => {
      render(<AutomationSignalsWidget data={makeData({ recentFailedExecutions: 1 })} />);
      expect(screen.queryByText(/Sin incidentes activos/i)).not.toBeInTheDocument();
    });
  });

  describe('C. estado sin incidentes', () => {
    it('muestra mensaje sin incidentes cuando hay automations pero ningún problema', () => {
      render(<AutomationSignalsWidget data={makeData({ activeAutomations: 3 })} />);
      expect(screen.getByText(/Sin incidentes activos/i)).toBeInTheDocument();
    });
  });

  describe('D. señales de datos', () => {
    it('muestra el número de automations activas', () => {
      render(<AutomationSignalsWidget data={makeData({ activeAutomations: 5 })} />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('muestra el número de ejecuciones fallidas recientes', () => {
      render(<AutomationSignalsWidget data={makeData({ recentFailedExecutions: 3 })} />);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('muestra el número de ejecuciones en running', () => {
      render(<AutomationSignalsWidget data={makeData({ runningExecutions: 2 })} />);
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('muestra el número de alertas activas de automatización', () => {
      render(<AutomationSignalsWidget data={makeData({ activeAutomationAlerts: 4 })} />);
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  describe('E. tareas pendientes', () => {
    it('muestra enlace a /tasks cuando hay tareas pendientes', () => {
      render(<AutomationSignalsWidget data={makeData({ pendingAutomationTasks: 2 })} />);
      const taskLink = screen.getByRole('link', { name: /tareas operativas/i });
      expect(taskLink.getAttribute('href')).toBe('/tasks');
    });

    it('muestra conteo de tarea en singular cuando es 1', () => {
      render(<AutomationSignalsWidget data={makeData({ pendingAutomationTasks: 1 })} />);
      expect(screen.getByText(/1 tarea operativa pendiente/i)).toBeInTheDocument();
    });

    it('muestra conteo de tareas en plural cuando es >1', () => {
      render(<AutomationSignalsWidget data={makeData({ pendingAutomationTasks: 3 })} />);
      expect(screen.getByText(/3 tareas operativas pendientes/i)).toBeInTheDocument();
    });

    it('no muestra el bloque de tareas cuando pendingAutomationTasks=0', () => {
      render(<AutomationSignalsWidget data={makeData({ pendingAutomationTasks: 0 })} />);
      expect(screen.queryByRole('link', { name: /tareas operativas/i })).not.toBeInTheDocument();
    });
  });

  describe('F. accesibilidad', () => {
    it('las señales tienen aria-label descriptivos', () => {
      render(<AutomationSignalsWidget data={makeData({ recentFailedExecutions: 2 })} />);
      // La SignalCard con "Fallidas recientes" tiene aria-label explícito
      expect(screen.getByLabelText(/ejecuciones fallidas recientes/i)).toBeInTheDocument();
    });

    it('el link "Ver todas" tiene aria-label para lectores de pantalla', () => {
      render(<AutomationSignalsWidget data={makeData()} />);
      expect(screen.getByRole('link', { name: /Ver todas las automatizaciones/i })).toBeInTheDocument();
    });
  });
});
