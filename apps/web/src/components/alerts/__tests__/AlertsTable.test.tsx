import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useTransition: vi.fn(() => [false, (fn: () => void) => fn()]),
}));

vi.mock('@/app/(protected)/alerts/actions', () => ({
  acknowledgeAlertAction: vi.fn(),
  resolveAlertAction: vi.fn(),
}));

import { AlertsTable } from '../AlertsTable';
import type { Alert } from '@bop-agency/domain';
import type { AlertId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { ClientId } from '@bop-agency/domain';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
  id: 'alert-uuid-1' as AlertId,
  organizationId: 'org-1' as OrganizationId,
  clientId: null as unknown as ClientId,
  alertKey: 'test-key',
  alertType: 'ctr_drop',
  platform: 'meta',
  accountId: null,
  severity: 'warning',
  status: 'active',
  title: 'CTR bajo en Meta',
  description: 'El CTR bajó un 30%',
  metadata: {},
  detectedAt: new Date('2026-07-01'),
  acknowledgedAt: null,
  acknowledgedBy: null,
  snoozedUntil: null,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AlertsTable', () => {
  it('muestra empty state cuando no hay alertas', () => {
    render(<AlertsTable alerts={[]} userRole="viewer" />);
    expect(screen.getByText('Sin alertas')).toBeInTheDocument();
  });

  it('renderiza el título de la alerta', () => {
    render(<AlertsTable alerts={[makeAlert()]} userRole="viewer" />);
    expect(screen.getByText('CTR bajo en Meta')).toBeInTheDocument();
  });

  it('muestra el badge de severidad', () => {
    render(<AlertsTable alerts={[makeAlert({ severity: 'critical' })]} userRole="viewer" />);
    expect(screen.getByText('Crítica')).toBeInTheDocument();
  });

  it('muestra el badge de status', () => {
    render(<AlertsTable alerts={[makeAlert({ status: 'acknowledged' })]} userRole="viewer" />);
    expect(screen.getByText('Reconocida')).toBeInTheDocument();
  });

  it('muestra botón Reconocer para alerta activa con viewer', () => {
    render(<AlertsTable alerts={[makeAlert({ status: 'active' })]} userRole="viewer" />);
    expect(screen.getByRole('button', { name: /Reconocer/i })).toBeInTheDocument();
  });

  it('NO muestra botón Resolver para viewer (rol insuficiente)', () => {
    render(<AlertsTable alerts={[makeAlert({ status: 'active' })]} userRole="viewer" />);
    expect(screen.queryByRole('button', { name: /Resolver/i })).not.toBeInTheDocument();
  });

  it('muestra botón Resolver para operator con alerta activa', () => {
    render(<AlertsTable alerts={[makeAlert({ status: 'active' })]} userRole="operator" />);
    expect(screen.getByRole('button', { name: /Resolver/i })).toBeInTheDocument();
  });

  it('NO muestra acciones para alerta resuelta (estado final)', () => {
    render(<AlertsTable alerts={[makeAlert({ status: 'resolved' })]} userRole="operator" />);
    expect(screen.queryByRole('button', { name: /Reconocer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resolver/i })).not.toBeInTheDocument();
  });

  it('muestra múltiples alertas', () => {
    const alerts = [
      makeAlert({ id: 'a1' as AlertId, title: 'Alerta 1' }),
      makeAlert({ id: 'a2' as AlertId, title: 'Alerta 2' }),
      makeAlert({ id: 'a3' as AlertId, title: 'Alerta 3' }),
    ];
    render(<AlertsTable alerts={alerts} userRole="viewer" />);
    expect(screen.getByText('Alerta 1')).toBeInTheDocument();
    expect(screen.getByText('Alerta 2')).toBeInTheDocument();
    expect(screen.getByText('Alerta 3')).toBeInTheDocument();
  });

  it('usa alertType como fallback si title es null', () => {
    render(<AlertsTable alerts={[makeAlert({ title: null })]} userRole="viewer" />);
    expect(screen.getByText('ctr_drop')).toBeInTheDocument();
  });

  it('tabla tiene aria-label accesible', () => {
    render(<AlertsTable alerts={[makeAlert()]} userRole="viewer" />);
    expect(screen.getByRole('table', { name: /Lista de alertas/i })).toBeInTheDocument();
  });
});
