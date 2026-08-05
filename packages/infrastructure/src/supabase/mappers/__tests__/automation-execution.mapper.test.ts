/**
 * automation-execution.mapper.test.ts — Tests unitarios para rowToAutomationExecution.
 *
 * Cobertura:
 * - Mapping completo
 * - Nullable clientId
 * - status: todos los valores válidos
 * - status: valor inválido → throw
 * - trigger_type: todos los valores válidos
 * - trigger_type: inválido → throw
 * - attempt: válido, < 1 → throw, no entero → throw
 * - idempotency_key: válido, vacío → throw
 * - inputMetadata: null → {}
 * - outputMetadata: null → null, objeto → objeto
 * - errorCode y errorMessage: null y con valores
 * - errorMessage sanitización (tokens redactados)
 * - Fechas: todas las combinaciones de null/no-null
 * - Fechas inválidas → throw
 */

import { describe, it, expect } from 'vitest';
import {
  rowToAutomationExecution,
  _sanitizeErrorMessageForTest,
  type AutomationExecutionRow,
} from '../automation-execution.mapper';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const makeRow = (overrides: Partial<AutomationExecutionRow> = {}): AutomationExecutionRow => ({
  id: 'exec-uuid-1',
  organization_id: 'org-uuid-1',
  automation_id: 'aut-uuid-1',
  client_id: null,
  status: 'queued',
  attempt: 1,
  idempotency_key: 'aut-uuid-1:schedule:2026-08-01:1',
  triggered_by: 'schedule-service',
  trigger_type: 'schedule',
  input_metadata: null,
  output_metadata: null,
  error_code: null,
  error_message: null,
  queued_at: '2026-08-01T06:00:00.000Z',
  started_at: null,
  completed_at: null,
  created_at: '2026-08-01T06:00:00.000Z',
  updated_at: '2026-08-01T06:00:00.000Z',
  ...overrides,
});

// ─── Mapping completo ─────────────────────────────────────────────────────────

describe('rowToAutomationExecution — mapping completo', () => {
  it('mapea todos los campos en estado running', () => {
    const row = makeRow({
      status: 'running',
      attempt: 2,
      client_id: 'client-uuid-1',
      triggered_by: 'user-uuid-abc',
      trigger_type: 'manual',
      input_metadata: { source: 'dashboard' },
      started_at: '2026-08-01T06:00:05.000Z',
      error_code: null,
      error_message: null,
    });

    const result = rowToAutomationExecution(row);

    expect(result.id).toBe('exec-uuid-1');
    expect(result.organizationId).toBe('org-uuid-1');
    expect(result.automationId).toBe('aut-uuid-1');
    expect(result.clientId).toBe('client-uuid-1');
    expect(result.status).toBe('running');
    expect(result.attempt).toBe(2);
    expect(result.idempotencyKey).toBe('aut-uuid-1:schedule:2026-08-01:1');
    expect(result.triggeredBy).toBe('user-uuid-abc');
    expect(result.triggerType).toBe('manual');
    expect(result.inputMetadata).toEqual({ source: 'dashboard' });
    expect(result.outputMetadata).toBeNull();
    expect(result.startedAt).toBeInstanceOf(Date);
  });

  it('clientId null cuando client_id es null', () => {
    const result = rowToAutomationExecution(makeRow({ client_id: null }));
    expect(result.clientId).toBeNull();
  });

  it('clientId mapeado cuando client_id tiene valor', () => {
    const result = rowToAutomationExecution(makeRow({ client_id: 'client-uuid-2' }));
    expect(result.clientId).toBe('client-uuid-2');
  });
});

// ─── Status ───────────────────────────────────────────────────────────────────

describe('rowToAutomationExecution — status', () => {
  const validStatuses = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'retrying'];

  it.each(validStatuses)('status "%s" se acepta', (status) => {
    const result = rowToAutomationExecution(makeRow({ status }));
    expect(result.status).toBe(status);
  });

  it('status inválido lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ status: 'unknown' }))).toThrow(
      /AutomationExecutionMapper.*status.*unknown/,
    );
  });

  it('status vacío lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ status: '' }))).toThrow(
      /AutomationExecutionMapper.*status/,
    );
  });
});

// ─── trigger_type ─────────────────────────────────────────────────────────────

describe('rowToAutomationExecution — trigger_type', () => {
  const validTypes = ['schedule', 'webhook', 'event', 'manual'];

  it.each(validTypes)('trigger_type "%s" se acepta', (type) => {
    const result = rowToAutomationExecution(makeRow({ trigger_type: type }));
    expect(result.triggerType).toBe(type);
  });

  it('trigger_type inválido lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ trigger_type: 'cron' }))).toThrow(
      /AutomationExecutionMapper.*trigger_type.*cron/,
    );
  });
});

// ─── attempt ─────────────────────────────────────────────────────────────────

describe('rowToAutomationExecution — attempt', () => {
  it('attempt 1 válido', () => {
    const result = rowToAutomationExecution(makeRow({ attempt: 1 }));
    expect(result.attempt).toBe(1);
  });

  it('attempt 5 válido', () => {
    const result = rowToAutomationExecution(makeRow({ attempt: 5 }));
    expect(result.attempt).toBe(5);
  });

  it('attempt 0 lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ attempt: 0 }))).toThrow(
      /AutomationExecutionMapper.*attempt.*>= 1/,
    );
  });

  it('attempt negativo lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ attempt: -1 }))).toThrow(
      /AutomationExecutionMapper.*attempt/,
    );
  });

  it('attempt no entero lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ attempt: 1.5 }))).toThrow(
      /AutomationExecutionMapper.*attempt/,
    );
  });
});

// ─── idempotency_key ─────────────────────────────────────────────────────────

describe('rowToAutomationExecution — idempotency_key', () => {
  it('idempotency_key válido se parsea', () => {
    const key = 'aut-1:schedule:2026-08-01:001';
    const result = rowToAutomationExecution(makeRow({ idempotency_key: key }));
    expect(result.idempotencyKey).toBe(key);
  });

  it('idempotency_key vacío lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ idempotency_key: '' }))).toThrow(
      /idempotency_key.*vacío|IdempotencyKey cannot be empty/,
    );
  });

  it('idempotency_key solo espacios lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ idempotency_key: '   ' }))).toThrow(
      /idempotency_key.*vacío|IdempotencyKey cannot be empty/,
    );
  });
});

// ─── metadata ─────────────────────────────────────────────────────────────────

describe('rowToAutomationExecution — metadata', () => {
  it('input_metadata null → objeto vacío', () => {
    const result = rowToAutomationExecution(makeRow({ input_metadata: null }));
    expect(result.inputMetadata).toEqual({});
  });

  it('input_metadata objeto se mapea', () => {
    const result = rowToAutomationExecution(makeRow({ input_metadata: { clientId: 'c1' } }));
    expect(result.inputMetadata).toEqual({ clientId: 'c1' });
  });

  it('input_metadata array → objeto vacío (tipo inválido, no lanza)', () => {
    const result = rowToAutomationExecution(makeRow({ input_metadata: [1, 2] }));
    expect(result.inputMetadata).toEqual({});
  });

  it('output_metadata null → null', () => {
    const result = rowToAutomationExecution(makeRow({ output_metadata: null }));
    expect(result.outputMetadata).toBeNull();
  });

  it('output_metadata objeto se mapea', () => {
    const result = rowToAutomationExecution(makeRow({
      output_metadata: { report_url: 'https://example.com/report.pdf' },
    }));
    expect(result.outputMetadata).toEqual({ report_url: 'https://example.com/report.pdf' });
  });
});

// ─── errorCode y errorMessage ─────────────────────────────────────────────────

describe('rowToAutomationExecution — errorCode / errorMessage', () => {
  it('errorCode y errorMessage null se preservan', () => {
    const result = rowToAutomationExecution(makeRow({ status: 'failed', error_code: null, error_message: null }));
    expect(result.errorCode).toBeNull();
    expect(result.errorMessage).toBeNull();
  });

  it('errorCode con valor se preserva', () => {
    const result = rowToAutomationExecution(makeRow({
      status: 'failed',
      error_code: 'TIMEOUT',
      error_message: 'n8n execution timed out after 30s',
    }));
    expect(result.errorCode).toBe('TIMEOUT');
    expect(result.errorMessage).toBe('n8n execution timed out after 30s');
  });
});

// ─── Sanitización de errorMessage ────────────────────────────────────────────

describe('_sanitizeErrorMessageForTest', () => {
  it('null → null', () => {
    expect(_sanitizeErrorMessageForTest(null)).toBeNull();
  });

  it('mensaje normal no se altera', () => {
    const msg = 'Connection refused to n8n host';
    expect(_sanitizeErrorMessageForTest(msg)).toBe(msg);
  });

  it('Bearer token se redacta', () => {
    const msg = 'Error: Authorization failed (Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def)';
    const result = _sanitizeErrorMessageForTest(msg);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('sk- key se redacta', () => {
    const msg = 'API error with key sk-abcdefghij1234567890';
    const result = _sanitizeErrorMessageForTest(msg);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('sk-abcdefghij1234567890');
  });

  it('trunca a 500 caracteres', () => {
    const long = 'x'.repeat(600);
    const result = _sanitizeErrorMessageForTest(long);
    expect(result?.length).toBe(500);
  });

  it('mensaje exactamente 500 chars no se trunca', () => {
    const exact = 'a'.repeat(500);
    expect(_sanitizeErrorMessageForTest(exact)?.length).toBe(500);
  });
});

// ─── Fechas ───────────────────────────────────────────────────────────────────

describe('rowToAutomationExecution — fechas', () => {
  it('queued_at se parsea como Date', () => {
    const result = rowToAutomationExecution(makeRow({ queued_at: '2026-08-01T06:00:00.000Z' }));
    expect(result.queuedAt).toBeInstanceOf(Date);
    expect(result.queuedAt.toISOString()).toBe('2026-08-01T06:00:00.000Z');
  });

  it('started_at null → null', () => {
    const result = rowToAutomationExecution(makeRow({ started_at: null }));
    expect(result.startedAt).toBeNull();
  });

  it('started_at con valor → Date', () => {
    const result = rowToAutomationExecution(makeRow({ started_at: '2026-08-01T06:00:05.000Z' }));
    expect(result.startedAt).toBeInstanceOf(Date);
  });

  it('completed_at null → null', () => {
    const result = rowToAutomationExecution(makeRow({ completed_at: null }));
    expect(result.completedAt).toBeNull();
  });

  it('queued_at inválido lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ queued_at: 'not-a-date' }))).toThrow(
      /AutomationExecutionMapper.*queued_at.*fecha/,
    );
  });

  it('started_at inválido lanza error', () => {
    expect(() => rowToAutomationExecution(makeRow({ started_at: 'bad' }))).toThrow(
      /AutomationExecutionMapper.*started_at.*fecha/,
    );
  });

  it('ejecución completa con todos los timestamps', () => {
    const result = rowToAutomationExecution(makeRow({
      status: 'succeeded',
      started_at: '2026-08-01T06:00:05.000Z',
      completed_at: '2026-08-01T06:00:35.000Z',
      output_metadata: { records: 42 },
    }));
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(result.outputMetadata).toEqual({ records: 42 });
  });
});
