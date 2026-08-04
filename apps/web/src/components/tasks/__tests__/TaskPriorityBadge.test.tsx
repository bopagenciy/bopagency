import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskPriorityBadge } from '../TaskPriorityBadge';

describe('TaskPriorityBadge', () => {
  it('muestra "Baja" para priority low', () => {
    render(<TaskPriorityBadge priority="low" />);
    expect(screen.getByText('Baja')).toBeInTheDocument();
  });

  it('muestra "Media" para priority medium', () => {
    render(<TaskPriorityBadge priority="medium" />);
    expect(screen.getByText('Media')).toBeInTheDocument();
  });

  it('muestra "Alta" para priority high', () => {
    render(<TaskPriorityBadge priority="high" />);
    expect(screen.getByText('Alta')).toBeInTheDocument();
  });

  it('muestra "Urgente" para priority urgent', () => {
    render(<TaskPriorityBadge priority="urgent" />);
    expect(screen.getByText('Urgente')).toBeInTheDocument();
  });

  it('incluye aria-label con la prioridad', () => {
    render(<TaskPriorityBadge priority="urgent" />);
    expect(screen.getByRole('generic', { name: /Prioridad: Urgente/i })).toBeInTheDocument();
  });

  it('aplica clase roja para urgent', () => {
    const { container } = render(<TaskPriorityBadge priority="urgent" />);
    expect(container.firstChild).toHaveClass('text-red-700');
  });
});
