/**
 * campaign-activation (dominio) — tests unitarios de la state machine
 * (Phase 8A.1). Cubre: canTransitionActivation (válidas/inválidas/
 * terminal), deriveActivationStatus (todas las ramas del audit §6.A),
 * isValidCancellationReason.
 */
import { describe, it, expect } from 'vitest';
import {
  canTransitionActivation,
  getActivationNextStates,
  isActivationStatusTerminal,
  canCancelActivation,
  deriveActivationStatus,
  isValidCancellationReason,
} from '../entities/campaign-activation';
import type { ActivationStatus, ActivationTargetStatus } from '@bop-agency/shared';
import { ACTIVATION_STATUSES } from '@bop-agency/shared';

// ─── canTransitionActivation — transiciones válidas ────────────────────────────

describe('canTransitionActivation — valid transitions', () => {
  const validCases: Array<[ActivationStatus, ActivationStatus]> = [
    ['pending', 'preparing'],
    ['pending', 'cancelled'],
    ['preparing', 'ready'],
    ['preparing', 'cancelled'],
    ['ready', 'scheduled'],
    ['ready', 'executing'],
    ['ready', 'cancelled'],
    ['scheduled', 'executing'],
    ['scheduled', 'cancelled'],
    ['executing', 'completed'],
    ['executing', 'partially_completed'],
    ['executing', 'failed'],
  ];

  it.each(validCases)('%s → %s es válida', (from, to) => {
    expect(canTransitionActivation(from, to)).toBe(true);
  });
});

describe('canTransitionActivation — invalid transitions', () => {
  const invalidCases: Array<[ActivationStatus, ActivationStatus]> = [
    ['pending', 'ready'],
    ['pending', 'executing'],
    ['pending', 'completed'],
    ['preparing', 'executing'],
    ['preparing', 'scheduled'],
    ['ready', 'preparing'],
    ['ready', 'completed'],
    ['scheduled', 'preparing'],
    ['scheduled', 'ready'],
    ['executing', 'cancelled'], // no se puede cancelar mientras ejecuta — audit §6.A
    ['executing', 'pending'],
    ['completed', 'ready'],
    ['cancelled', 'pending'],
    ['failed', 'executing'],
  ];

  it.each(invalidCases)('%s → %s es inválida', (from, to) => {
    expect(canTransitionActivation(from, to)).toBe(false);
  });
});

describe('canTransitionActivation — terminal behavior', () => {
  const terminalStates: ActivationStatus[] = ['completed', 'partially_completed', 'failed', 'cancelled'];

  it.each(terminalStates)('%s no tiene transiciones salientes', (status) => {
    expect(getActivationNextStates(status)).toEqual([]);
    expect(isActivationStatusTerminal(status)).toBe(true);
  });

  it('los estados no terminales no se marcan terminales', () => {
    const nonTerminal: ActivationStatus[] = ['pending', 'preparing', 'ready', 'scheduled', 'executing'];
    for (const s of nonTerminal) {
      expect(isActivationStatusTerminal(s)).toBe(false);
    }
  });

  it('ACTIVATION_STATUSES cubre exactamente los 9 estados esperados', () => {
    expect([...ACTIVATION_STATUSES].sort()).toEqual(
      [
        'cancelled',
        'completed',
        'executing',
        'failed',
        'partially_completed',
        'pending',
        'preparing',
        'ready',
        'scheduled',
      ].sort(),
    );
  });
});

describe('canCancelActivation', () => {
  it('permite cancelar desde pending/preparing/ready/scheduled', () => {
    expect(canCancelActivation('pending')).toBe(true);
    expect(canCancelActivation('preparing')).toBe(true);
    expect(canCancelActivation('ready')).toBe(true);
    expect(canCancelActivation('scheduled')).toBe(true);
  });

  it('no permite cancelar desde executing ni estados terminales', () => {
    expect(canCancelActivation('executing')).toBe(false);
    expect(canCancelActivation('completed')).toBe(false);
    expect(canCancelActivation('partially_completed')).toBe(false);
    expect(canCancelActivation('failed')).toBe(false);
    expect(canCancelActivation('cancelled')).toBe(false);
  });
});

// ─── deriveActivationStatus — audit §6.A ───────────────────────────────────────

describe('deriveActivationStatus', () => {
  it('sin targets → pending', () => {
    expect(deriveActivationStatus([])).toBe('pending');
  });

  it('todos pending → pending', () => {
    expect(deriveActivationStatus(['pending', 'pending'])).toBe('pending');
  });

  it('mezcla pending/preparing → preparing', () => {
    expect(deriveActivationStatus(['pending', 'preparing'])).toBe('preparing');
  });

  it('todos los no-terminales en ready → ready', () => {
    expect(deriveActivationStatus(['ready', 'ready'])).toBe('ready');
  });

  it('ready + terminal (published) → ready (el terminal no baja el nivel)', () => {
    expect(deriveActivationStatus(['ready', 'published'])).toBe('ready');
  });

  it('algún target scheduled (sin publishing) → scheduled', () => {
    expect(deriveActivationStatus(['ready', 'scheduled'])).toBe('scheduled');
  });

  it('algún target publishing → executing (prioridad sobre scheduled)', () => {
    expect(deriveActivationStatus(['scheduled', 'publishing'])).toBe('executing');
  });

  it('todos terminales, al menos un published y ningún failed → completed', () => {
    expect(deriveActivationStatus(['published', 'published'])).toBe('completed');
    expect(deriveActivationStatus(['published', 'cancelled'])).toBe('completed');
  });

  it('todos terminales, published + failed → partially_completed', () => {
    expect(deriveActivationStatus(['published', 'failed'])).toBe('partially_completed');
  });

  it('todos terminales, solo failed (sin published) → failed', () => {
    expect(deriveActivationStatus(['failed', 'failed'])).toBe('failed');
    expect(deriveActivationStatus(['failed', 'cancelled'])).toBe('failed');
  });

  it('todos terminales, todos cancelled → cancelled', () => {
    expect(deriveActivationStatus(['cancelled', 'cancelled'])).toBe('cancelled');
  });

  it('un solo target en cada estado no-terminal — casos base', () => {
    const cases: Array<[ActivationTargetStatus[], ActivationStatus]> = [
      [['pending'], 'pending'],
      [['preparing'], 'preparing'],
      [['ready'], 'ready'],
      [['scheduled'], 'scheduled'],
      [['publishing'], 'executing'],
      [['published'], 'completed'],
      [['failed'], 'failed'],
      [['cancelled'], 'cancelled'],
    ];
    for (const [targets, expected] of cases) {
      expect(deriveActivationStatus(targets)).toBe(expected);
    }
  });

  it('nunca oculta un fallo parcial como éxito (principio central del audit §2)', () => {
    const result = deriveActivationStatus(['published', 'published', 'failed']);
    expect(result).not.toBe('completed');
    expect(result).toBe('partially_completed');
  });
});

// ─── isValidCancellationReason ──────────────────────────────────────────────────

describe('isValidCancellationReason', () => {
  it('rechaza null/undefined/vacío/solo-espacios', () => {
    expect(isValidCancellationReason(null)).toBe(false);
    expect(isValidCancellationReason(undefined)).toBe(false);
    expect(isValidCancellationReason('')).toBe(false);
    expect(isValidCancellationReason('   ')).toBe(false);
  });

  it('acepta una razón no vacía', () => {
    expect(isValidCancellationReason('El cliente pausó el presupuesto')).toBe(true);
  });
});
