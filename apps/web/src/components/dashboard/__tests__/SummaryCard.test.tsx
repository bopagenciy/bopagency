import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryCard, SummaryCardSkeleton } from '../SummaryCard';

describe('SummaryCard', () => {
  it('muestra el label', () => {
    render(<SummaryCard label="Clientes activos" value={5} icon="👥" />);
    expect(screen.getByText('Clientes activos')).toBeInTheDocument();
  });

  it('muestra el valor numérico', () => {
    render(<SummaryCard label="Alertas" value={12} icon="🔔" />);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('muestra el valor string', () => {
    render(<SummaryCard label="Gasto" value="$3.5M" icon="💰" />);
    expect(screen.getByText('$3.5M')).toBeInTheDocument();
  });

  it('muestra el sub-texto si se provee', () => {
    render(<SummaryCard label="Alertas" value={3} icon="🔔" sub="2 críticas" />);
    expect(screen.getByText('2 críticas')).toBeInTheDocument();
  });

  it('no muestra sub-texto si no se provee', () => {
    render(<SummaryCard label="Alertas" value={0} icon="🔔" />);
    expect(screen.queryByText('2 críticas')).not.toBeInTheDocument();
  });

  it('aplica el ícono con aria-hidden', () => {
    render(<SummaryCard label="Test" value={1} icon="🎯" />);
    const icon = screen.getByText('🎯');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('aplica accent rojo cuando accent="red"', () => {
    const { container } = render(<SummaryCard label="Test" value={1} icon="🔴" accent="red" />);
    expect(container.firstChild).toHaveClass('border-l-red-500');
  });

  it('aplica accent gris por defecto', () => {
    const { container } = render(<SummaryCard label="Test" value={1} icon="⚪" />);
    expect(container.firstChild).toHaveClass('border-l-gray-300');
  });
});

describe('SummaryCardSkeleton', () => {
  it('renderiza el skeleton con animate-pulse', () => {
    const { container } = render(<SummaryCardSkeleton />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });
});
