import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PublicationJobStatusBadge } from '../PublicationJobStatusBadge';

describe('PublicationJobStatusBadge Component (Phase 8B.4)', () => {
  it('renders queued status with text label and icon dot', () => {
    render(<PublicationJobStatusBadge status="queued" />);
    expect(screen.getByText('Encolado')).toBeInTheDocument();
  });

  it('renders in_progress status with text label', () => {
    render(<PublicationJobStatusBadge status="in_progress" />);
    expect(screen.getByText('En progreso')).toBeInTheDocument();
  });

  it('renders succeeded status with text label', () => {
    render(<PublicationJobStatusBadge status="succeeded" />);
    expect(screen.getByText('Exitoso')).toBeInTheDocument();
  });

  it('renders failed status with text label', () => {
    render(<PublicationJobStatusBadge status="failed" />);
    expect(screen.getByText('Fallido')).toBeInTheDocument();
  });

  it('renders cancelled status with text label', () => {
    render(<PublicationJobStatusBadge status="cancelled" />);
    expect(screen.getByText('Cancelado')).toBeInTheDocument();
  });

  it('renders unknown_outcome as "Resultado indeterminado" with warning icon', () => {
    render(<PublicationJobStatusBadge status="unknown_outcome" />);
    expect(screen.getByText('Resultado indeterminado')).toBeInTheDocument();
    expect(screen.getByText('⚠️')).toBeInTheDocument();
  });
});
