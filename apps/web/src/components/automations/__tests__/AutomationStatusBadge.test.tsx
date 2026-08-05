import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutomationStatusBadge } from '../AutomationStatusBadge';

describe('AutomationStatusBadge', () => {
  it('muestra "Borrador" para status draft', () => {
    render(<AutomationStatusBadge status="draft" />);
    expect(screen.getByText('Borrador')).toBeInTheDocument();
  });

  it('muestra "Activa" para status active', () => {
    render(<AutomationStatusBadge status="active" />);
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('muestra "Pausada" para status paused', () => {
    render(<AutomationStatusBadge status="paused" />);
    expect(screen.getByText('Pausada')).toBeInTheDocument();
  });

  it('muestra "Archivada" para status archived', () => {
    render(<AutomationStatusBadge status="archived" />);
    expect(screen.getByText('Archivada')).toBeInTheDocument();
  });

  it('incluye aria-label con el estado', () => {
    render(<AutomationStatusBadge status="active" />);
    expect(screen.getByRole('generic', { name: /Estado: Activa/i })).toBeInTheDocument();
  });

  it('aplica clase verde para active', () => {
    const { container } = render(<AutomationStatusBadge status="active" />);
    expect(container.firstChild).toHaveClass('text-green-800');
  });

  it('aplica clase ámbar para paused', () => {
    const { container } = render(<AutomationStatusBadge status="paused" />);
    expect(container.firstChild).toHaveClass('text-amber-800');
  });
});
