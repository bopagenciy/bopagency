/**
 * campaign-activation-target (dominio) — tests unitarios (Phase 8A.1).
 * Cubre: canTransitionActivationTarget (válidas/inválidas/terminal),
 * compatibilidad del camino manual, validateCreateActivationTargetInput.
 */
import { describe, it, expect } from 'vitest';
import {
  canTransitionActivationTarget,
  getActivationTargetNextStates,
  isActivationTargetStatusTerminal,
  canMarkActivationTargetPublished,
  canCancelActivationTarget,
  validateCreateActivationTargetInput,
} from '../entities/campaign-activation-target';
import type { ActivationTargetStatus } from '@bop-agency/shared';
import { ACTIVATION_TARGET_STATUSES } from '@bop-agency/shared';

describe('canTransitionActivationTarget — valid transitions', () => {
  const validCases: Array<[ActivationTargetStatus, ActivationTargetStatus]> = [
    ['pending', 'preparing'],
    ['pending', 'cancelled'],
    ['preparing', 'ready'],
    ['preparing', 'cancelled'],
    ['ready', 'scheduled'],
    ['ready', 'publishing'],
    ['ready', 'published'], // camino manual: directo, sin pasar por scheduled/publishing
    ['ready', 'cancelled'],
    ['scheduled', 'publishing'],
    ['scheduled', 'published'],
    ['scheduled', 'cancelled'],
    ['publishing', 'published'],
    ['publishing', 'failed'],
  ];

  it.each(validCases)('%s → %s es válida', (from, to) => {
    expect(canTransitionActivationTarget(from, to)).toBe(true);
  });
});

describe('canTransitionActivationTarget — invalid transitions', () => {
  const invalidCases: Array<[ActivationTargetStatus, ActivationTargetStatus]> = [
    ['pending', 'published'], // regla explícita del audit §6.B: nunca directo
    ['pending', 'ready'],
    ['pending', 'publishing'],
    ['preparing', 'published'],
    ['preparing', 'publishing'],
    ['ready', 'preparing'],
    ['scheduled', 'preparing'],
    ['scheduled', 'ready'],
    ['publishing', 'cancelled'], // sin cancelación mientras publica
    ['publishing', 'ready'],
    ['published', 'ready'],
    ['cancelled', 'pending'],
    ['failed', 'published'],
  ];

  it.each(invalidCases)('%s → %s es inválida', (from, to) => {
    expect(canTransitionActivationTarget(from, to)).toBe(false);
  });
});

describe('canTransitionActivationTarget — terminal behavior', () => {
  const terminal: ActivationTargetStatus[] = ['published', 'failed', 'cancelled'];

  it.each(terminal)('%s no tiene transiciones salientes', (status) => {
    expect(getActivationTargetNextStates(status)).toEqual([]);
    expect(isActivationTargetStatusTerminal(status)).toBe(true);
  });

  it('los estados no terminales no se marcan terminales', () => {
    const nonTerminal: ActivationTargetStatus[] = ['pending', 'preparing', 'ready', 'scheduled', 'publishing'];
    for (const s of nonTerminal) {
      expect(isActivationTargetStatusTerminal(s)).toBe(false);
    }
  });

  it('ACTIVATION_TARGET_STATUSES cubre exactamente los 8 estados esperados', () => {
    expect([...ACTIVATION_TARGET_STATUSES].sort()).toEqual(
      ['cancelled', 'failed', 'pending', 'preparing', 'publishing', 'published', 'ready', 'scheduled'].sort(),
    );
  });
});

describe('canMarkActivationTargetPublished — compatibilidad camino manual', () => {
  it('permite ready → published (manual, sin pasos intermedios)', () => {
    expect(canMarkActivationTargetPublished('ready')).toBe(true);
  });

  it('permite scheduled → published y publishing → published (automatizado futuro)', () => {
    expect(canMarkActivationTargetPublished('scheduled')).toBe(true);
    expect(canMarkActivationTargetPublished('publishing')).toBe(true);
  });

  it('rechaza pending/preparing → published', () => {
    expect(canMarkActivationTargetPublished('pending')).toBe(false);
    expect(canMarkActivationTargetPublished('preparing')).toBe(false);
  });
});

describe('canCancelActivationTarget', () => {
  it('permite cancelar desde pending/preparing/ready/scheduled', () => {
    expect(canCancelActivationTarget('pending')).toBe(true);
    expect(canCancelActivationTarget('preparing')).toBe(true);
    expect(canCancelActivationTarget('ready')).toBe(true);
    expect(canCancelActivationTarget('scheduled')).toBe(true);
  });

  it('no permite cancelar mientras publishing ni desde terminales', () => {
    expect(canCancelActivationTarget('publishing')).toBe(false);
    expect(canCancelActivationTarget('published')).toBe(false);
    expect(canCancelActivationTarget('failed')).toBe(false);
    expect(canCancelActivationTarget('cancelled')).toBe(false);
  });
});

// ─── validateCreateActivationTargetInput ───────────────────────────────────────

describe('validateCreateActivationTargetInput', () => {
  it('acepta un target manual sin clientIntegrationId', () => {
    const error = validateCreateActivationTargetInput({
      channel: 'manual',
      provider: 'manual',
      clientIntegrationId: null,
    });
    expect(error).toBeNull();
  });

  it('acepta meta_ads + provider meta + clientIntegrationId', () => {
    const error = validateCreateActivationTargetInput({
      channel: 'meta_ads',
      provider: 'meta',
      clientIntegrationId: 'integration-1' as never,
    });
    expect(error).toBeNull();
  });

  it('rechaza channel/provider no correspondientes', () => {
    const error = validateCreateActivationTargetInput({
      channel: 'meta_ads',
      provider: 'google',
      clientIntegrationId: 'integration-1' as never,
    });
    expect(error).not.toBeNull();
  });

  it('rechaza manual con clientIntegrationId', () => {
    const error = validateCreateActivationTargetInput({
      channel: 'manual',
      provider: 'manual',
      clientIntegrationId: 'integration-1' as never,
    });
    expect(error).toContain('manual');
  });

  it('rechaza canal no-manual sin clientIntegrationId', () => {
    const error = validateCreateActivationTargetInput({
      channel: 'google_ads',
      provider: 'google',
      clientIntegrationId: null,
    });
    expect(error).toContain('client_integration');
  });
});
