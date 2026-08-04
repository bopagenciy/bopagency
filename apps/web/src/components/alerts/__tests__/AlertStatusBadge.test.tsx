import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertStatusBadge } from '../AlertStatusBadge';

describe('AlertStatusBadge', () => {
  it('muestra "Activa" para status active', () => {
    render(<AlertStatusBadge status="active" />);
    expect(screen.getByText('Activa')).toBeInTheDocument();
  });

  it('muestra "Reconocida" para status acknowledged', () => {
    render(<AlertStatusBadge status="acknowledged" />);
    expect(screen.getByText('Reconocida')).toBeInTheDocument();
  });

  it('muestra "Silenciada" para status snoozed', () => {
    render(<AlertStatusBadge status="snoozed" />);
    expect(screen.getByText('Silenciada')).toBeInTheDocument();
  });

  it('muestra "Resuelta" para status resolved', () => {
    render(<AlertStatusBadge status="resolved" />);
    expect(screen.getByText('Resuelta')).toBeInTheDocument();
  });

  it('incluye aria-label con el estado', () => {
    render(<AlertStatusBadge status="resolved" />);
    expect(screen.getByRole('generic', { name: /Estado: Resuelta/i })).toBeInTheDocument();
  });

  it('aplica clase verde para resolved', () => {
    const { container } = render(<AlertStatusBadge status="resolved" />);
    expect(container.firstChild).toHaveClass('text-green-700');
  });

  it('aplica clase roja para active', () => {
    const { container } = render(<AlertStatusBadge status="active" />);
    expect(container.firstChild).toHaveClass('text-red-700');
  });
});
