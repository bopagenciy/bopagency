import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrganizationSwitcher } from '../components/layout/OrganizationSwitcher';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

const mockSwitchOrg = vi.fn();

vi.mock('@/app/(protected)/settings/actions', () => ({
  switchActiveOrganizationAction: (...args: unknown[]) => mockSwitchOrg(...args),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const orgs = [
  { id: 'org-1', name: 'Acme Corp', slug: 'acme-corp' },
  { id: 'org-2', name: 'Globex Inc', slug: 'globex-inc' },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OrganizationSwitcher', () => {
  beforeEach(() => {
    mockRefresh.mockClear();
    mockSwitchOrg.mockClear();
  });

  it('muestra el nombre de la organización activa', () => {
    render(<OrganizationSwitcher organizations={orgs} activeOrganizationId="org-1" />);
    expect(screen.getByText('Acme Corp')).toBeTruthy();
  });

  it('abre el menú dropdown al hacer clic en el botón', () => {
    render(<OrganizationSwitcher organizations={orgs} activeOrganizationId="org-1" />);
    const trigger = screen.getByRole('button', { name: /seleccionar organización/i });

    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('muestra las organizaciones recibidas por props', () => {
    render(<OrganizationSwitcher organizations={orgs} activeOrganizationId="org-1" />);
    fireEvent.click(screen.getByRole('button', { name: /seleccionar organización/i }));

    // Acme Corp aparece dos veces: en el botón trigger y en la opción del listbox
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Globex Inc')).toBeTruthy();
  });

  it('marca la organización activa con aria-selected=true', () => {
    render(<OrganizationSwitcher organizations={orgs} activeOrganizationId="org-1" />);
    fireEvent.click(screen.getByRole('button', { name: /seleccionar organización/i }));

    const options = screen.getAllByRole('option');
    const activeOption = options.find((o) => o.getAttribute('aria-selected') === 'true');
    expect(activeOption).toBeTruthy();
    expect(activeOption?.textContent).toContain('Acme Corp');
  });

  it('ejecuta switchActiveOrganizationAction al seleccionar otra organización', async () => {
    mockSwitchOrg.mockResolvedValueOnce({ success: true });

    render(<OrganizationSwitcher organizations={orgs} activeOrganizationId="org-1" />);
    fireEvent.click(screen.getByRole('button', { name: /seleccionar organización/i }));

    const globexOption = screen.getByRole('option', { name: /globex inc/i });
    fireEvent.click(globexOption);

    await waitFor(() => {
      expect(mockSwitchOrg).toHaveBeenCalledWith('org-2');
    });
  });

  it('llama router.refresh() después de cambiar la organización con éxito', async () => {
    mockSwitchOrg.mockResolvedValueOnce({ success: true });

    render(<OrganizationSwitcher organizations={orgs} activeOrganizationId="org-1" />);
    fireEvent.click(screen.getByRole('button', { name: /seleccionar organización/i }));
    fireEvent.click(screen.getByRole('option', { name: /globex inc/i }));

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it('cierra el dropdown al presionar Escape', () => {
    render(<OrganizationSwitcher organizations={orgs} activeOrganizationId="org-1" />);
    fireEvent.click(screen.getByRole('button', { name: /seleccionar organización/i }));
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('muestra estado vacío cuando no hay organizaciones', () => {
    render(<OrganizationSwitcher organizations={[]} activeOrganizationId={null} />);
    fireEvent.click(screen.getByRole('button', { name: /seleccionar organización/i }));

    expect(screen.getByText(/sin organizaciones activas/i)).toBeTruthy();
  });

  it('el botón trigger tiene aria-expanded y aria-haspopup', () => {
    render(<OrganizationSwitcher organizations={orgs} activeOrganizationId="org-1" />);
    const trigger = screen.getByRole('button', { name: /seleccionar organización/i });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});
