/**
 * supabase-execution-log.repository.test.ts — Tests unitarios.
 *
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 *
 * Revisión de consistencia Phase 6: la columna real de
 * `public.automation_execution_logs` para el contexto/metadata del log es
 * `metadata` (ver 20260804000000_phase6b_automation_runtime.sql), no
 * `context`. El dominio (ExecutionLogRepository.CreateExecutionLogInput)
 * expone el campo como `context` — SupabaseExecutionLogRepository es el
 * único punto de traducción entre ambos nombres.
 *
 * Cobertura:
 * - log(): inserta usando la columna real "metadata" (no "context")
 * - log(): sanitiza claves prohibidas del context antes de insertar
 * - log(): error de Supabase → Result de error, no lanza
 * - findByExecution(): lee row.metadata y lo expone como .context en el dominio
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseExecutionLogRepository } from '../supabase-execution-log.repository';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OrganizationId,
  AutomationExecutionId,
} from '@bop-agency/domain';

const ORG_ID  = 'org-uuid-1' as unknown as OrganizationId;
const EXEC_ID = 'exec-uuid-1' as unknown as AutomationExecutionId;

function makeSupabaseMock(insertResult: { error: unknown } = { error: null }) {
  const insertSpy = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert: insertSpy });
  const supabase = { from } as unknown as SupabaseClient;
  return { supabase, from, insertSpy };
}

describe('SupabaseExecutionLogRepository.log', () => {
  it('inserta usando la columna real "metadata", no "context"', async () => {
    const { supabase, insertSpy } = makeSupabaseMock();
    const repo = new SupabaseExecutionLogRepository(supabase);

    const result = await repo.log({
      executionId: EXEC_ID,
      organizationId: ORG_ID,
      level: 'info',
      event: 'execution.dispatched',
      message: 'Dispatch enviado correctamente',
      context: { automationId: 'auto-uuid-1' },
    });

    expect(result.success).toBe(true);
    expect(insertSpy).toHaveBeenCalledTimes(1);
    const insertedRow = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(insertedRow).toHaveProperty('metadata');
    expect(insertedRow).not.toHaveProperty('context');
    expect(insertedRow['metadata']).toEqual({ automationId: 'auto-uuid-1' });
    expect(insertedRow['execution_id']).toBe(String(EXEC_ID));
    expect(insertedRow['organization_id']).toBe(String(ORG_ID));
    expect(insertedRow['event_type']).toBe('execution.dispatched');
  });

  it('sanitiza claves prohibidas del context antes de insertar en metadata', async () => {
    const { supabase, insertSpy } = makeSupabaseMock();
    const repo = new SupabaseExecutionLogRepository(supabase);

    await repo.log({
      executionId: EXEC_ID,
      organizationId: ORG_ID,
      level: 'info',
      event: 'execution.dispatched',
      message: 'test',
      context: {
        automationId: 'auto-uuid-1',
        apiKey: 'should-be-removed',
        authorization: 'Bearer xyz',
      },
    });

    const insertedRow = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const metadata = insertedRow['metadata'] as Record<string, unknown>;
    expect(metadata).toEqual({ automationId: 'auto-uuid-1' });
    expect(metadata).not.toHaveProperty('apiKey');
    expect(metadata).not.toHaveProperty('authorization');
  });

  it('retorna error (no lanza) cuando Supabase falla al insertar', async () => {
    const { supabase } = makeSupabaseMock({ error: { code: '23503', message: 'fk violation' } });
    const repo = new SupabaseExecutionLogRepository(supabase);

    const result = await repo.log({
      executionId: EXEC_ID,
      organizationId: ORG_ID,
      level: 'error',
      event: 'execution.dispatch_failed',
      message: 'test',
    });

    expect(result.success).toBe(false);
  });
});

describe('SupabaseExecutionLogRepository.findByExecution', () => {
  it('lee row.metadata y lo expone como .context en el dominio', async () => {
    const rangeResult = {
      data: [
        {
          id: 'log-uuid-1',
          execution_id: String(EXEC_ID),
          organization_id: String(ORG_ID),
          level: 'info',
          event_type: 'execution.dispatched',
          message: 'Dispatch enviado',
          metadata: { automationId: 'auto-uuid-1' },
          occurred_at: '2026-08-06T00:00:00.000Z',
        },
      ],
      error: null,
      count: 1,
    };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      range:  vi.fn().mockResolvedValue(rangeResult),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) } as unknown as SupabaseClient;
    const repo = new SupabaseExecutionLogRepository(supabase);

    const page = await repo.findByExecution(EXEC_ID, ORG_ID, { page: 1, pageSize: 50 });

    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.context).toEqual({ automationId: 'auto-uuid-1' });
  });
});
