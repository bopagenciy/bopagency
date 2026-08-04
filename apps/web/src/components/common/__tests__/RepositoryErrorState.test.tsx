import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RepositoryErrorState } from '../RepositoryErrorState';

describe('RepositoryErrorState', () => {
  it('muestra el título "Error al cargar"', () => {
    render(<RepositoryErrorState />);
    expect(screen.getByText('Error al cargar')).toBeInTheDocument();
  });

  it('muestra el mensaje por defecto si no se provee uno', () => {
    render(<RepositoryErrorState />);
    expect(screen.getByText(/No se pudieron cargar los datos/)).toBeInTheDocument();
  });

  it('muestra el mensaje personalizado', () => {
    render(<RepositoryErrorState message="Error al cargar alertas." />);
    expect(screen.getByText('Error al cargar alertas.')).toBeInTheDocument();
  });

  it('tiene role="alert" para accesibilidad', () => {
    render(<RepositoryErrorState />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('tiene aria-live="polite"', () => {
    render(<RepositoryErrorState />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
  });
});
