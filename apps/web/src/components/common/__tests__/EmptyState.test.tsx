import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('muestra el título', () => {
    render(<EmptyState title="Sin datos" />);
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
  });

  it('muestra la descripción si se provee', () => {
    render(<EmptyState title="Sin datos" description="No hay resultados para este filtro." />);
    expect(screen.getByText('No hay resultados para este filtro.')).toBeInTheDocument();
  });

  it('no muestra descripción si no se provee', () => {
    render(<EmptyState title="Sin datos" />);
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  it('muestra el ícono por defecto (📭)', () => {
    render(<EmptyState title="Vacío" />);
    expect(screen.getByText('📭')).toBeInTheDocument();
  });

  it('muestra ícono personalizado', () => {
    render(<EmptyState title="Sin alertas" icon="🔕" />);
    expect(screen.getByText('🔕')).toBeInTheDocument();
  });

  it('muestra el slot de acción si se provee', () => {
    render(<EmptyState title="Vacío" action={<button>Crear primero</button>} />);
    expect(screen.getByRole('button', { name: 'Crear primero' })).toBeInTheDocument();
  });

  it('el ícono tiene aria-hidden="true"', () => {
    render(<EmptyState title="Test" icon="📋" />);
    expect(screen.getByText('📋')).toHaveAttribute('aria-hidden', 'true');
  });
});
