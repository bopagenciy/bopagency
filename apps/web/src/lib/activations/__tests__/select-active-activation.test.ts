import { describe, it, expect } from 'vitest';
import { selectActiveActivation } from '../select-active-activation';

type Fake = { id: string; status: string };

describe('selectActiveActivation (Phase 8A.3 §9)', () => {
  it('T1: lista vacía → sin activación activa, sin historial (empty state)', () => {
    const { nonTerminal, terminalHistory } = selectActiveActivation<Fake>([]);
    expect(nonTerminal).toBeUndefined();
    expect(terminalHistory).toEqual([]);
  });

  it('T2: solo activaciones terminales → todas van al historial, ninguna activa (permite crear una nueva)', () => {
    const activations: Fake[] = [
      { id: 'a1', status: 'cancelled' },
      { id: 'a2', status: 'completed' },
      { id: 'a3', status: 'failed' },
    ];
    const { nonTerminal, terminalHistory } = selectActiveActivation(activations);
    expect(nonTerminal).toBeUndefined();
    expect(terminalHistory.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('T3: una activación no-terminal entre terminales → se identifica como la activa, el resto va al historial', () => {
    const activations: Fake[] = [
      { id: 'a1', status: 'preparing' },
      { id: 'a2', status: 'cancelled' },
    ];
    const { nonTerminal, terminalHistory } = selectActiveActivation(activations);
    expect(nonTerminal?.id).toBe('a1');
    expect(terminalHistory.map((a) => a.id)).toEqual(['a2']);
  });

  it('T4: reconoce todos los status terminales (completed, partially_completed, failed, cancelled)', () => {
    const activations: Fake[] = [
      { id: 'a1', status: 'completed' },
      { id: 'a2', status: 'partially_completed' },
      { id: 'a3', status: 'failed' },
      { id: 'a4', status: 'cancelled' },
    ];
    const { nonTerminal, terminalHistory } = selectActiveActivation(activations);
    expect(nonTerminal).toBeUndefined();
    expect(terminalHistory).toHaveLength(4);
  });

  it('T5: reconoce todos los status no-terminales como activos (pending, preparing, ready, scheduled, executing)', () => {
    for (const status of ['pending', 'preparing', 'ready', 'scheduled', 'executing']) {
      const { nonTerminal } = selectActiveActivation<Fake>([{ id: 'x', status }]);
      expect(nonTerminal?.status).toBe(status);
    }
  });
});
