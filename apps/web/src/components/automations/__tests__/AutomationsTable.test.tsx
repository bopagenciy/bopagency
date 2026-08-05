import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/app/(protected)/automations/actions', () => ({
  activateAutomationAction: vi.fn(),
  pauseAutomationAction: vi.fn(),
  archiveAutomationAction: vi.fn(),
  startExecutionAction: vi.fn(),
  cancelExecutionAction: vi.fn(),
  retryExecutionAction: vi.fn(),
}));

import { AutomationsTable } from '../AutomationsTable';
import type { Automation } from '@bop-agency/domain';
import type { AutomationId, OrganizationId } from '@bop-agency/domain';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const makeAutomation = (overrides: Partial<Automation> = {}): Automation => ({
  id: 'auto-1' as AutomationId,
  organizationId: 'org-1' as OrganizationId,
  clientId: null,
  name: 'Test Automation',
  description: 'Descripción de prueba',
  status: 'active',
  triggerConfig: { type: 'manual' },
  retryPolicy: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
  n8nWorkflowId: null,
  metadata: {},
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-06-01'),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AutomationsTable', () => {
  it('muestra empty state cuando no hay automatizaciones', () => {
    render(<AutomationsTable automations={[]} userRole="viewer" />);
    expect(screen.getByText('Sin automatizaciones')).toBeInTheDocument();
  });

  it('renderiza el nombre de la automatización', () => {
    render(<AutomationsTable automations={[makeAutomation()]} userRole="viewer" />);
    expect(screen.getByText('Test Automation')).toBeInTheDocument();
  });

  it('muestra el badge de estado', () => {
    render(<AutomationsTable automations={[makeAutomation({ status: 'active' })]} userRole="viewer" />);
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('muestra "Pausada" para status paused', () => {
    render(<AutomationsTable automations={[makeAutomation({ status: 'paused' })]} userRole="admin" />);
    expect(screen.getByText('Pausada')).toBeInTheDocument();
  });

  it('muestra el tipo de trigger', () => {
    render(<AutomationsTable automations={[makeAutomation({ triggerConfig: { type: 'schedule', cron: '0 * * * *' } })]} userRole="viewer" />);
    expect(screen.getByText('Programada')).toBeInTheDocument();
  });

  it('incluye link al detalle de la automatización', () => {
    render(<AutomationsTable automations={[makeAutomation()]} userRole="viewer" />);
    const link = screen.getByRole('link', { name: 'Test Automation' });
    expect(link).toHaveAttribute('href', '/automations/auto-1');
  });

  it('muestra botón Ejecutar para active automation con rol operator', () => {
    render(<AutomationsTable automations={[makeAutomation({ status: 'active' })]} userRole="operator" />);
    expect(screen.getByRole('button', { name: /Ejecutar/i })).toBeInTheDocument();
  });

  it('NO muestra botón Activar para viewer', () => {
    render(<AutomationsTable automations={[makeAutomation({ status: 'draft' })]} userRole="viewer" />);
    expect(screen.queryByRole('button', { name: /Activar/i })).not.toBeInTheDocument();
  });

  it('muestra botón Activar para admin con draft automation', () => {
    render(<AutomationsTable automations={[makeAutomation({ status: 'draft' })]} userRole="admin" />);
    expect(screen.getByRole('button', { name: /Activar/i })).toBeInTheDocument();
  });

  it('NO muestra botones de acción para automatización archivada', () => {
    render(<AutomationsTable automations={[makeAutomation({ status: 'archived' })]} userRole="admin" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renderiza múltiples automatizaciones', () => {
    const automations = [
      makeAutomation({ id: 'a1' as AutomationId, name: 'Primera' }),
      makeAutomation({ id: 'a2' as AutomationId, name: 'Segunda' }),
    ];
    render(<AutomationsTable automations={automations} userRole="viewer" />);
    expect(screen.getByText('Primera')).toBeInTheDocument();
    expect(screen.getByText('Segunda')).toBeInTheDocument();
  });
});
