import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskStatusBadge } from '../TaskStatusBadge';

describe('TaskStatusBadge', () => {
  it('muestra "Pendiente" para status pending', () => {
    render(<TaskStatusBadge status="pending" />);
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('muestra "En progreso" para status in_progress', () => {
    render(<TaskStatusBadge status="in_progress" />);
    expect(screen.getByText('En progreso')).toBeInTheDocument();
  });

  it('muestra "Completada" para status done', () => {
    render(<TaskStatusBadge status="done" />);
    expect(screen.getByText('Completada')).toBeInTheDocument();
  });

  it('muestra "Cancelada" para status cancelled', () => {
    render(<TaskStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('muestra "Bloqueada" para status blocked', () => {
    render(<TaskStatusBadge status="blocked" />);
    expect(screen.getByText('Bloqueada')).toBeInTheDocument();
  });

  it('incluye aria-label con el estado', () => {
    render(<TaskStatusBadge status="pending" />);
    expect(screen.getByRole('generic', { name: /Estado: Pendiente/i })).toBeInTheDocument();
  });

  it('aplica clase verde para done', () => {
    const { container } = render(<TaskStatusBadge status="done" />);
    expect(container.firstChild).toHaveClass('text-green-800');
  });

  it('aplica clase ámbar para blocked', () => {
    const { container } = render(<TaskStatusBadge status="blocked" />);
    expect(container.firstChild).toHaveClass('text-amber-800');
  });
});
