/**
 * automation.mapper.test.ts — Tests unitarios para rowToAutomation.
 *
 * Cobertura:
 * - Mapping completo con todos los campos
 * - Nullable clientId
 * - status: inactive → paused (compatibilidad transitoria)
 * - status: valores de dominio válidos (draft, active, paused, archived)
 * - status: valores inválidos (error, disabled) → throw
 * - triggerConfig: schedule, webhook, event, manual, vacío, inválido
 * - retryPolicy: válido, inválido → default
 * - metadata: objeto, null, array inválido
 * - Fechas válidas e inválidas
 * - n8nWorkflowId: null y string
 */

import { describe, it, expect } from 'vitest';
import { rowToAutomation, type AutomationRow } from '../automation.mapper';
import { DEFAULT_AUTOMATION_RETRY_POLICY } from '@bop-agency/domain';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const makeRow = (overrides: Partial<AutomationRow> = {}): AutomationRow => ({
  id: 'aut-uuid-1',
  organization_id: 'org-uuid-1',
  client_id: null,
  name: 'Reporte semanal',
  description: 'Genera reporte cada lunes',
  status: 'active',
  trigger_config: { type: 'schedule', cron: '0 6 * * 1' },
  retry_policy: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    backoffMultiplier: 2,
    maxDelayMs: 30000,
  },
  n8n_workflow_id: 'wf-123',
  metadata: { env: 'production' },
  is_manual_only: false,
  last_executed_at: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T12:00:00.000Z',
  ...overrides,
});

// ─── Mapping completo ─────────────────────────────────────────────────────────

describe('rowToAutomation — mapping completo', () => {
  it('mapea todos los campos correctamente', () => {
    const row = makeRow({ client_id: 'client-uuid-1' });
    const result = rowToAutomation(row);

    expect(result.id).toBe('aut-uuid-1');
    expect(result.organizationId).toBe('org-uuid-1');
    expect(result.clientId).toBe('client-uuid-1');
    expect(result.name).toBe('Reporte semanal');
    expect(result.description).toBe('Genera reporte cada lunes');
    expect(result.status).toBe('active');
    expect(result.n8nWorkflowId).toBe('wf-123');
    expect(result.metadata).toEqual({ env: 'production' });
    expect(result.createdAt).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    expect(result.updatedAt).toEqual(new Date('2026-08-01T12:00:00.000Z'));
  });

  it('clientId null cuando client_id es null', () => {
    const result = rowToAutomation(makeRow({ client_id: null }));
    expect(result.clientId).toBeNull();
  });

  it('n8nWorkflowId null cuando n8n_workflow_id es null', () => {
    const result = rowToAutomation(makeRow({ n8n_workflow_id: null }));
    expect(result.n8nWorkflowId).toBeNull();
  });

  it('description null se preserva', () => {
    const result = rowToAutomation(makeRow({ description: null }));
    expect(result.description).toBeNull();
  });
});

// ─── Status ───────────────────────────────────────────────────────────────────

describe('rowToAutomation — status', () => {
  it.each(['draft', 'active', 'paused', 'archived'] as const)(
    'status "%s" se mapea directamente',
    (status) => {
      const result = rowToAutomation(makeRow({ status }));
      expect(result.status).toBe(status);
    },
  );

  it('inactive → paused (compatibilidad transitoria)', () => {
    const result = rowToAutomation(makeRow({ status: 'inactive' }));
    expect(result.status).toBe('paused');
  });

  it('status "error" lanza error (sin equivalente en dominio)', () => {
    expect(() => rowToAutomation(makeRow({ status: 'error' }))).toThrow(
      /AutomationMapper.*error.*no tiene equivalente/,
    );
  });

  it('status "disabled" lanza error (sin equivalente en dominio)', () => {
    expect(() => rowToAutomation(makeRow({ status: 'disabled' }))).toThrow(
      /AutomationMapper.*disabled.*no tiene equivalente/,
    );
  });

  it('status desconocido lanza error', () => {
    expect(() => rowToAutomation(makeRow({ status: 'unknown_value' }))).toThrow(
      /AutomationMapper.*unknown_value/,
    );
  });
});

// ─── triggerConfig ────────────────────────────────────────────────────────────

describe('rowToAutomation — triggerConfig', () => {
  it('schedule con cron', () => {
    const result = rowToAutomation(makeRow({
      trigger_config: { type: 'schedule', cron: '0 9 * * 1-5' },
    }));
    expect(result.triggerConfig).toEqual({ type: 'schedule', cron: '0 9 * * 1-5' });
  });

  it('webhook con path', () => {
    const result = rowToAutomation(makeRow({
      trigger_config: { type: 'webhook', path: '/hook/123' },
    }));
    expect(result.triggerConfig).toEqual({ type: 'webhook', path: '/hook/123' });
  });

  it('event con eventType', () => {
    const result = rowToAutomation(makeRow({
      trigger_config: { type: 'event', eventType: 'client.created' },
    }));
    expect(result.triggerConfig).toEqual({ type: 'event', eventType: 'client.created' });
  });

  it('manual', () => {
    const result = rowToAutomation(makeRow({
      trigger_config: { type: 'manual' },
    }));
    expect(result.triggerConfig).toEqual({ type: 'manual' });
  });

  it('trigger_config vacío {} → default manual', () => {
    const result = rowToAutomation(makeRow({ trigger_config: {} }));
    expect(result.triggerConfig.type).toBe('manual');
  });

  it('trigger_config null → default manual', () => {
    const result = rowToAutomation(makeRow({ trigger_config: null }));
    expect(result.triggerConfig.type).toBe('manual');
  });

  it('trigger_config con type desconocido → default manual', () => {
    const result = rowToAutomation(makeRow({ trigger_config: { type: 'cron_legacy' } }));
    expect(result.triggerConfig.type).toBe('manual');
  });
});

// ─── retryPolicy ─────────────────────────────────────────────────────────────

describe('rowToAutomation — retryPolicy', () => {
  it('retryPolicy válido se parsea correctamente', () => {
    const policy = { maxAttempts: 5, initialDelayMs: 500, backoffMultiplier: 1.5, maxDelayMs: 60000 };
    const result = rowToAutomation(makeRow({ retry_policy: policy }));
    expect(result.retryPolicy).toEqual(policy);
  });

  it('retry_policy null → default', () => {
    const result = rowToAutomation(makeRow({ retry_policy: null }));
    expect(result.retryPolicy).toEqual(DEFAULT_AUTOMATION_RETRY_POLICY);
  });

  it('retry_policy {} (vacío) → default', () => {
    const result = rowToAutomation(makeRow({ retry_policy: {} }));
    expect(result.retryPolicy).toEqual(DEFAULT_AUTOMATION_RETRY_POLICY);
  });

  it('maxAttempts < 1 → default', () => {
    const result = rowToAutomation(makeRow({
      retry_policy: { maxAttempts: 0, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
    }));
    expect(result.retryPolicy).toEqual(DEFAULT_AUTOMATION_RETRY_POLICY);
  });

  it('backoffMultiplier < 1 → default', () => {
    const result = rowToAutomation(makeRow({
      retry_policy: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 0.5, maxDelayMs: 30000 },
    }));
    expect(result.retryPolicy).toEqual(DEFAULT_AUTOMATION_RETRY_POLICY);
  });
});

// ─── metadata ─────────────────────────────────────────────────────────────────

describe('rowToAutomation — metadata', () => {
  it('metadata objeto se parsea', () => {
    const result = rowToAutomation(makeRow({ metadata: { key: 'value', num: 42 } }));
    expect(result.metadata).toEqual({ key: 'value', num: 42 });
  });

  it('metadata null → objeto vacío', () => {
    const result = rowToAutomation(makeRow({ metadata: null }));
    expect(result.metadata).toEqual({});
  });

  it('metadata {} → objeto vacío', () => {
    const result = rowToAutomation(makeRow({ metadata: {} }));
    expect(result.metadata).toEqual({});
  });

  it('metadata array → lanza error', () => {
    expect(() => rowToAutomation(makeRow({ metadata: [1, 2, 3] }))).toThrow(
      /AutomationMapper.*metadata.*objeto/,
    );
  });
});

// ─── Fechas ───────────────────────────────────────────────────────────────────

describe('rowToAutomation — fechas', () => {
  it('created_at y updated_at se parsean como Date', () => {
    const result = rowToAutomation(makeRow({
      created_at: '2026-01-15T10:00:00.000Z',
      updated_at: '2026-06-30T23:59:59.999Z',
    }));
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
    expect(result.createdAt.getFullYear()).toBe(2026);
  });

  it('created_at inválido lanza error', () => {
    expect(() => rowToAutomation(makeRow({ created_at: 'not-a-date' }))).toThrow(
      /AutomationMapper.*created_at.*fecha/,
    );
  });

  it('updated_at inválido lanza error', () => {
    expect(() => rowToAutomation(makeRow({ updated_at: '' }))).toThrow(
      /AutomationMapper.*updated_at.*fecha/,
    );
  });
});
