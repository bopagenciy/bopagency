import { describe, it, expect } from 'vitest';
import { canTransitionAlert, getAlertNextStates } from '../entities/alert';

describe('canTransitionAlert', () => {
  // Transiciones válidas
  it('active → acknowledged: válido', () => {
    expect(canTransitionAlert('active', 'acknowledged')).toBe(true);
  });

  it('active → resolved: válido', () => {
    expect(canTransitionAlert('active', 'resolved')).toBe(true);
  });

  it('acknowledged → resolved: válido', () => {
    expect(canTransitionAlert('acknowledged', 'resolved')).toBe(true);
  });

  it('acknowledged → snoozed: válido', () => {
    expect(canTransitionAlert('acknowledged', 'snoozed')).toBe(true);
  });

  it('snoozed → active: válido (reactivar tras snooze)', () => {
    expect(canTransitionAlert('snoozed', 'active')).toBe(true);
  });

  it('snoozed → resolved: válido', () => {
    expect(canTransitionAlert('snoozed', 'resolved')).toBe(true);
  });

  // Transiciones inválidas
  it('resolved → active: inválido (estado final)', () => {
    expect(canTransitionAlert('resolved', 'active')).toBe(false);
  });

  it('resolved → acknowledged: inválido (estado final)', () => {
    expect(canTransitionAlert('resolved', 'acknowledged')).toBe(false);
  });

  it('resolved → snoozed: inválido (estado final)', () => {
    expect(canTransitionAlert('resolved', 'snoozed')).toBe(false);
  });

  it('active → active: inválido (mismo estado)', () => {
    expect(canTransitionAlert('active', 'active')).toBe(false);
  });

  it('acknowledged → active: inválido (no hay retroceso a activo desde acknowledged)', () => {
    expect(canTransitionAlert('acknowledged', 'active')).toBe(false);
  });
});

describe('getAlertNextStates', () => {
  it('active → [acknowledged, resolved]', () => {
    const next = getAlertNextStates('active');
    expect(next).toContain('acknowledged');
    expect(next).toContain('resolved');
    expect(next).toHaveLength(2);
  });

  it('resolved → [] (estado final)', () => {
    expect(getAlertNextStates('resolved')).toEqual([]);
  });

  it('acknowledged → [resolved, snoozed]', () => {
    const next = getAlertNextStates('acknowledged');
    expect(next).toContain('resolved');
    expect(next).toContain('snoozed');
    expect(next).toHaveLength(2);
  });

  it('snoozed → [active, resolved]', () => {
    const next = getAlertNextStates('snoozed');
    expect(next).toContain('active');
    expect(next).toContain('resolved');
    expect(next).toHaveLength(2);
  });
});
