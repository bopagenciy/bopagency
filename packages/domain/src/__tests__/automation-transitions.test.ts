/**
 * Tests de dominio para Automation (Phase 6A):
 * - Estado y transiciones de AutomationStatus
 * - Helpers de transición
 * - Estado terminal
 * - Validaciones
 */

import { describe, it, expect } from 'vitest';
import {
  canTransitionAutomation,
  getAutomationNextStates,
  canActivateAutomation,
  canPauseAutomation,
  canArchiveAutomation,
  isAutomationTerminal,
  isValidAutomationName,
  automationId,
  DEFAULT_AUTOMATION_RETRY_POLICY,
} from '../entities/automation';
import type { AutomationStatus } from '../entities/automation';

// ─── canTransitionAutomation ──────────────────────────────────────────────────

describe('canTransitionAutomation', () => {
  // Transiciones válidas
  it('draft → active: válido', () => {
    expect(canTransitionAutomation('draft', 'active')).toBe(true);
  });

  it('draft → archived: válido (descartar borrador)', () => {
    expect(canTransitionAutomation('draft', 'archived')).toBe(true);
  });

  it('active → paused: válido', () => {
    expect(canTransitionAutomation('active', 'paused')).toBe(true);
  });

  it('active → archived: válido', () => {
    expect(canTransitionAutomation('active', 'archived')).toBe(true);
  });

  it('paused → active: válido (reactivar)', () => {
    expect(canTransitionAutomation('paused', 'active')).toBe(true);
  });

  it('paused → archived: válido', () => {
    expect(canTransitionAutomation('paused', 'archived')).toBe(true);
  });

  // Transiciones inválidas
  it('archived → active: inválido (requiere restauración explícita)', () => {
    expect(canTransitionAutomation('archived', 'active')).toBe(false);
  });

  it('archived → draft: inválido', () => {
    expect(canTransitionAutomation('archived', 'draft')).toBe(false);
  });

  it('archived → paused: inválido', () => {
    expect(canTransitionAutomation('archived', 'paused')).toBe(false);
  });

  it('draft → paused: inválido (nunca fue activo)', () => {
    expect(canTransitionAutomation('draft', 'paused')).toBe(false);
  });

  it('active → draft: inválido', () => {
    expect(canTransitionAutomation('active', 'draft')).toBe(false);
  });

  it('paused → draft: inválido', () => {
    expect(canTransitionAutomation('paused', 'draft')).toBe(false);
  });
});

// ─── getAutomationNextStates ──────────────────────────────────────────────────

describe('getAutomationNextStates', () => {
  it('draft → [active, archived]', () => {
    const next = getAutomationNextStates('draft');
    expect(next).toContain('active');
    expect(next).toContain('archived');
    expect(next).toHaveLength(2);
  });

  it('active → [paused, archived]', () => {
    const next = getAutomationNextStates('active');
    expect(next).toContain('paused');
    expect(next).toContain('archived');
    expect(next).toHaveLength(2);
  });

  it('paused → [active, archived]', () => {
    const next = getAutomationNextStates('paused');
    expect(next).toContain('active');
    expect(next).toContain('archived');
    expect(next).toHaveLength(2);
  });

  it('archived → [] (estado terminal)', () => {
    expect(getAutomationNextStates('archived')).toEqual([]);
  });

  it('retorna copia del array, no referencia interna', () => {
    const next = getAutomationNextStates('active');
    next.push('archived' as AutomationStatus);
    // No debe afectar la lógica interna
    expect(getAutomationNextStates('active')).toHaveLength(2);
  });
});

// ─── canActivateAutomation ────────────────────────────────────────────────────

describe('canActivateAutomation', () => {
  it('draft puede activarse', () => {
    expect(canActivateAutomation('draft')).toBe(true);
  });

  it('paused puede activarse', () => {
    expect(canActivateAutomation('paused')).toBe(true);
  });

  it('active NO puede activarse (ya activo)', () => {
    expect(canActivateAutomation('active')).toBe(false);
  });

  it('archived NO puede activarse (requiere restauración)', () => {
    expect(canActivateAutomation('archived')).toBe(false);
  });
});

// ─── canPauseAutomation ───────────────────────────────────────────────────────

describe('canPauseAutomation', () => {
  it('active puede pausarse', () => {
    expect(canPauseAutomation('active')).toBe(true);
  });

  it('draft NO puede pausarse', () => {
    expect(canPauseAutomation('draft')).toBe(false);
  });

  it('paused NO puede pausarse (ya pausado)', () => {
    expect(canPauseAutomation('paused')).toBe(false);
  });

  it('archived NO puede pausarse', () => {
    expect(canPauseAutomation('archived')).toBe(false);
  });
});

// ─── canArchiveAutomation ─────────────────────────────────────────────────────

describe('canArchiveAutomation', () => {
  it('draft puede archivarse', () => {
    expect(canArchiveAutomation('draft')).toBe(true);
  });

  it('active puede archivarse', () => {
    expect(canArchiveAutomation('active')).toBe(true);
  });

  it('paused puede archivarse', () => {
    expect(canArchiveAutomation('paused')).toBe(true);
  });

  it('archived NO puede archivarse (ya archivado)', () => {
    expect(canArchiveAutomation('archived')).toBe(false);
  });
});

// ─── isAutomationTerminal ─────────────────────────────────────────────────────

describe('isAutomationTerminal', () => {
  it('archived es terminal', () => {
    expect(isAutomationTerminal('archived')).toBe(true);
  });

  it('draft no es terminal', () => {
    expect(isAutomationTerminal('draft')).toBe(false);
  });

  it('active no es terminal', () => {
    expect(isAutomationTerminal('active')).toBe(false);
  });

  it('paused no es terminal', () => {
    expect(isAutomationTerminal('paused')).toBe(false);
  });
});

// ─── isValidAutomationName ────────────────────────────────────────────────────

describe('isValidAutomationName', () => {
  it('nombre válido', () => {
    expect(isValidAutomationName('Sincronizar Métricas Meta')).toBe(true);
  });

  it('string vacío: inválido', () => {
    expect(isValidAutomationName('')).toBe(false);
  });

  it('solo espacios: inválido', () => {
    expect(isValidAutomationName('   ')).toBe(false);
  });

  it('nombre de 255 caracteres: válido', () => {
    expect(isValidAutomationName('A'.repeat(255))).toBe(true);
  });

  it('nombre de 256 caracteres: inválido', () => {
    expect(isValidAutomationName('A'.repeat(256))).toBe(false);
  });
});

// ─── automationId factory ─────────────────────────────────────────────────────

describe('automationId', () => {
  it('crea un AutomationId desde string válido', () => {
    const id = automationId('abc-123');
    expect(id).toBe('abc-123');
  });

  it('lanza error si el string está vacío', () => {
    expect(() => automationId('')).toThrow();
  });

  it('lanza error si el string es solo espacios', () => {
    expect(() => automationId('   ')).toThrow();
  });
});

// ─── DEFAULT_AUTOMATION_RETRY_POLICY ─────────────────────────────────────────

describe('DEFAULT_AUTOMATION_RETRY_POLICY', () => {
  it('maxAttempts es 3', () => {
    expect(DEFAULT_AUTOMATION_RETRY_POLICY.maxAttempts).toBe(3);
  });

  it('initialDelayMs es 1000', () => {
    expect(DEFAULT_AUTOMATION_RETRY_POLICY.initialDelayMs).toBe(1_000);
  });

  it('backoffMultiplier es 2', () => {
    expect(DEFAULT_AUTOMATION_RETRY_POLICY.backoffMultiplier).toBe(2);
  });

  it('maxDelayMs es 30000', () => {
    expect(DEFAULT_AUTOMATION_RETRY_POLICY.maxDelayMs).toBe(30_000);
  });
});
