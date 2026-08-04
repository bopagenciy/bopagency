import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlertSeverityBadge } from '../AlertSeverityBadge';

describe('AlertSeverityBadge', () => {
  it('muestra etiqueta "Crítica" para severity critical', () => {
    render(<AlertSeverityBadge severity="critical" />);
    expect(screen.getByText('Crítica')).toBeInTheDocument();
  });

  it('muestra etiqueta "Advertencia" para severity warning', () => {
    render(<AlertSeverityBadge severity="warning" />);
    expect(screen.getByText('Advertencia')).toBeInTheDocument();
  });

  it('muestra etiqueta "Info" para severity info', () => {
    render(<AlertSeverityBadge severity="info" />);
    expect(screen.getByText('Info')).toBeInTheDocument();
  });

  it('incluye aria-label con el nombre de severidad', () => {
    render(<AlertSeverityBadge severity="critical" />);
    expect(screen.getByRole('generic', { name: /Severidad: Crítica/i })).toBeInTheDocument();
  });

  it('aplica clase de color rojo para critical', () => {
    const { container } = render(<AlertSeverityBadge severity="critical" />);
    expect(container.firstChild).toHaveClass('text-red-800');
  });

  it('aplica clase de color ámbar para warning', () => {
    const { container } = render(<AlertSeverityBadge severity="warning" />);
    expect(container.firstChild).toHaveClass('text-amber-800');
  });

  it('aplica clase className adicional', () => {
    const { container } = render(<AlertSeverityBadge severity="info" className="extra-class" />);
    expect(container.firstChild).toHaveClass('extra-class');
  });
});
