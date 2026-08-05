import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutionStatusBadge } from '../ExecutionStatusBadge';

describe('ExecutionStatusBadge', () => {
  it('muestra "En cola" para queued', () => {
    render(<ExecutionStatusBadge status="queued" />);
    expect(screen.getByText('En cola')).toBeInTheDocument();
  });

  it('muestra "En ejecución" para running', () => {
    render(<ExecutionStatusBadge status="running" />);
    expect(screen.getByText('En ejecución')).toBeInTheDocument();
  });

  it('muestra "Exitosa" para succeeded', () => {
    render(<ExecutionStatusBadge status="succeeded" />);
    expect(screen.getByText('Exitosa')).toBeInTheDocument();
  });

  it('muestra "Fallida" para failed', () => {
    render(<ExecutionStatusBadge status="failed" />);
    expect(screen.getByText('Fallida')).toBeInTheDocument();
  });

  it('muestra "Cancelada" para cancelled', () => {
    render(<ExecutionStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelada')).toBeInTheDocument();
  });

  it('muestra "Reintentando" para retrying', () => {
    render(<ExecutionStatusBadge status="retrying" />);
    expect(screen.getByText('Reintentando')).toBeInTheDocument();
  });

  it('incluye aria-label con el estado', () => {
    render(<ExecutionStatusBadge status="succeeded" />);
    expect(screen.getByRole('generic', { name: /Estado: Exitosa/i })).toBeInTheDocument();
  });

  it('aplica clase verde para succeeded', () => {
    const { container } = render(<ExecutionStatusBadge status="succeeded" />);
    expect(container.firstChild).toHaveClass('text-green-800');
  });

  it('aplica clase roja para failed', () => {
    const { container } = render(<ExecutionStatusBadge status="failed" />);
    expect(container.firstChild).toHaveClass('text-red-700');
  });
});
