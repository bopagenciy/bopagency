import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserMenu } from '../components/layout/UserMenu';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockSignOut = vi.fn();

vi.mock('@/lib/auth/actions', () => ({
  signOut: () => mockSignOut(),
}));

// next/image → img simple para jsdom
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

// next/link → <a> con preventDefault para evitar "Not implemented: navigation" en jsdom.
// Preserva href y el onClick original del componente.
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
    [key: string]: unknown;
  }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const user = {
  id: 'user-1',
  email: 'francisco@bopagency.com',
  fullName: 'Francisco García',
  avatarUrl: null,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserMenu', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
  });

  it('muestra las iniciales del usuario en el avatar', () => {
    render(<UserMenu user={user} />);
    expect(screen.getByText('F')).toBeTruthy();
  });

  it('abre el menú al hacer clic en el avatar', () => {
    render(<UserMenu user={user} />);
    const trigger = screen.getByRole('button', { name: /menú de/i });

    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('muestra nombre y correo del usuario en el menú', () => {
    render(<UserMenu user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /menú de/i }));

    expect(screen.getByText('Francisco García')).toBeTruthy();
    expect(screen.getByText('francisco@bopagency.com')).toBeTruthy();
  });

  it('el enlace Configuración apunta a /settings', () => {
    render(<UserMenu user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /menú de/i }));

    const settingsLink = screen.getByRole('menuitem', { name: /configuración/i });
    expect(settingsLink.getAttribute('href')).toBe('/settings');
  });

  it('ejecuta signOut al hacer clic en Cerrar sesión', async () => {
    mockSignOut.mockResolvedValueOnce(undefined);

    render(<UserMenu user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /menú de/i }));

    const signOutBtn = screen.getByRole('menuitem', { name: /cerrar sesión/i });
    fireEvent.click(signOutBtn);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  it('cierra el menú al presionar Escape', () => {
    render(<UserMenu user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /menú de/i }));
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('cierra el menú al hacer clic en Configuración', () => {
    render(<UserMenu user={user} />);
    fireEvent.click(screen.getByRole('button', { name: /menú de/i }));
    expect(screen.getByRole('menu')).toBeTruthy();

    fireEvent.click(screen.getByRole('menuitem', { name: /configuración/i }));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('el botón del avatar tiene aria-expanded y aria-haspopup="menu"', () => {
    render(<UserMenu user={user} />);
    const trigger = screen.getByRole('button', { name: /menú de/i });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('muestra "Usuario" como fallback cuando user es null', () => {
    render(<UserMenu user={null} />);
    // El botón debe mostrar la inicial "U" (de "Usuario")
    expect(screen.getByText('U')).toBeTruthy();
  });
});
