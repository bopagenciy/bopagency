import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoBanner } from '../components/common/DemoBanner';

describe('DemoBanner', () => {
  it('renders the demo warning message', () => {
    render(<DemoBanner />);
    expect(screen.getByText(/modo demo/i)).toBeTruthy();
  });
});
