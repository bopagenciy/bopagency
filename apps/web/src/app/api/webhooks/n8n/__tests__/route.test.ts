/**
 * Tests de seguridad y contrato para POST /api/webhooks/n8n
 *
 * Estrategia: todos los módulos server-only y Supabase mockeados.
 * No se hacen llamadas reales a Supabase ni a n8n.
 *
 * Cobertura (C):
 *   C1.  Falta X-Bop-Signature → 401
 *   C2.  Falta X-Bop-Event-Id → 401
 *   C3.  Firma inválida → 403
 *   C4.  Timestamp vencido → 403
 *   C5.  Payload JSON inválido → 400
 *   C6.  Payload Zod inválido → 400
 *   C7.  Evento duplicado (unique violation 23505) → 200 {duplicate: true}
 *   C8.  execution.started válido → 200 y actualiza a running
 *   C9.  execution.succeeded válido → 200 y actualiza a succeeded
 *   C10. execution.failed válido y sanitizado → 200
 *   C11. Transición inválida (succeeded → running) → 409
 *   C12. organizationId mismatch → 403
 *   C13. Ejecución no encontrada → 400
 *   C14. Race condition unique violation manejada → 200 {duplicate: true}
 *   C15. service_role NO se crea antes de verificar HMAC (orden estricto)
 *   C17. Tabla exacta usada para deduplicación de webhooks (automation_webhook_events,
 *        nunca webhook_events), y manejo seguro de errores de inserción (ej. 42P01)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks hoistados ─────────────────────────────────────────────────────────
// vi.hoisted garantiza que estos mocks estén disponibles antes de vi.mock()

const {
  mockVerifyIncomingWebhook,
  mockCreateAdminClient,
  mockAdminFrom,
} = vi.hoisted(() => {
  const mockAdminFrom = vi.fn();
  return {
    mockVerifyIncomingWebhook: vi.fn(),
    mockCreateAdminClient:     vi.fn(() => ({ from: mockAdminFrom })),
    mockAdminFrom,
  };
});

vi.mock('server-only', () => ({}));

vi.mock('@/lib/webhooks/hmac', () => ({
  BOP_TIMESTAMP_HEADER:    'x-bop-timestamp',
  BOP_SIGNATURE_HEADER:    'x-bop-signature',
  BOP_EVENT_ID_HEADER:     'x-bop-event-id',
  verifyIncomingWebhook:   mockVerifyIncomingWebhook,
  HmacError:               class HmacError extends Error {
    constructor(public code: string, message: string) { super(message); }
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('@bop-agency/domain', () => ({
  canTransitionExecution: vi.fn((from: string, to: string) => {
    const transitions: Record<string, string[]> = {
      queued:    ['running', 'cancelled'],
      running:   ['succeeded', 'failed', 'cancelled'],
      failed:    ['retrying'],
      retrying:  ['queued'],
      succeeded: [],
      cancelled: [],
    };
    return (transitions[from] ?? []).includes(to);
  }),
}));

// ─── Importar handler DESPUÉS de los mocks ────────────────────────────────────

import { POST } from '../route';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EXEC_UUID  = '11111111-1111-1111-1111-111111111111';
const ORG_UUID   = '22222222-2222-2222-2222-222222222222';
const AUTO_UUID  = '33333333-3333-3333-3333-333333333333';
const EVENT_UUID = '44444444-4444-4444-4444-444444444444';

const VALID_PAYLOAD = {
  eventId:        EVENT_UUID,
  eventType:      'execution.started',
  timestamp:      new Date().toISOString(),
  organizationId: ORG_UUID,
  executionId:    EXEC_UUID,
  automationId:   AUTO_UUID,
  attempt:        1,
};

const VALID_HEADERS = {
  'x-bop-timestamp': Math.floor(Date.now() / 1000).toString(),
  'x-bop-signature': 'a'.repeat(64),
  'x-bop-event-id':  EVENT_UUID,
};

function makeRequest(
  body: unknown,
  headers: Record<string, string> = VALID_HEADERS,
): Request {
  return new Request('http://localhost/api/webhooks/n8n', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** Supabase chain mock que simula insert exitoso y retorna webhookEventId */
function makeInsertOkChain(webhookEventId = 'wh-event-uuid-1') {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: webhookEventId }, error: null }),
  };
  return chain;
}

/** Supabase chain que simula unique violation en insert */
function makeInsertDuplicateChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data:  null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }),
  };
  return chain;
}

/** Simula el flujo completo de from() para tablas distintas */
function setupAdminFromMock(overrides: {
  webhookInsert?: Record<string, unknown>;
  executionSelect?: Record<string, unknown> | null;
  updateResult?: { error: null | Record<string, unknown> };
  logInsert?: { error: null };
}) {
  let callCount = 0;
  mockAdminFrom.mockImplementation((table: string) => {
    callCount++;
    if (table === 'automation_webhook_events') {
      // Primera llamada: insert del webhook event
      if (callCount === 1) {
        return overrides.webhookInsert ?? makeInsertOkChain();
      }
      // Llamadas posteriores: update del webhook event (processed/failed)
      return {
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockResolvedValue({ error: null }),
      };
    }
    if (table === 'automation_executions') {
      const execution = overrides.executionSelect !== undefined
        ? overrides.executionSelect
        : {
            id:              EXEC_UUID,
            organization_id: ORG_UUID,
            automation_id:   AUTO_UUID,
            status:          'queued',
            attempt:         1,
          };
      // select chain or update chain
      return {
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: execution, error: null }),
      };
    }
    if (table === 'automation_execution_logs') {
      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Por defecto: HMAC válido
  mockVerifyIncomingWebhook.mockReturnValue({
    ok:          true,
    eventId:     EVENT_UUID,
    timestamp:   Math.floor(Date.now() / 1000).toString(),
    payloadHash: 'a'.repeat(64),
  });
});

// ─── C1. Falta firma ──────────────────────────────────────────────────────────

describe('C1: falta X-Bop-Signature', () => {
  it('retorna 401', async () => {
    mockVerifyIncomingWebhook.mockReturnValueOnce({
      ok:    false,
      error: { code: 'MISSING_SIGNATURE', message: 'Missing headers' },
    });

    const req = makeRequest(VALID_PAYLOAD, { 'x-bop-event-id': EVENT_UUID });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });
});

// ─── C2. Falta event-id ───────────────────────────────────────────────────────

describe('C2: falta X-Bop-Event-Id', () => {
  it('retorna 401', async () => {
    mockVerifyIncomingWebhook.mockReturnValueOnce({
      ok:    false,
      error: { code: 'MISSING_EVENT_ID', message: 'Missing event-id' },
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });
});

// ─── C3. Firma inválida ───────────────────────────────────────────────────────

describe('C3: firma inválida', () => {
  it('retorna 403', async () => {
    mockVerifyIncomingWebhook.mockReturnValueOnce({
      ok:    false,
      error: { code: 'INVALID_SIGNATURE', message: 'Signature failed' },
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(403);
  });

  it('la respuesta 403 no revela la firma esperada ni el secreto', async () => {
    mockVerifyIncomingWebhook.mockReturnValueOnce({
      ok:    false,
      error: { code: 'INVALID_SIGNATURE', message: 'Signature failed' },
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    const res = await POST(req as never);
    const body = await res.json() as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('expected');
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});

// ─── C4. Timestamp vencido ────────────────────────────────────────────────────

describe('C4: timestamp vencido', () => {
  it('retorna 403', async () => {
    mockVerifyIncomingWebhook.mockReturnValueOnce({
      ok:    false,
      error: { code: 'STALE_TIMESTAMP', message: 'Stale' },
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(403);
  });
});

// ─── C5. Payload JSON inválido ────────────────────────────────────────────────

describe('C5: payload JSON inválido', () => {
  it('retorna 400 si el body no es JSON válido', async () => {
    // Preparar webhook event insert exitoso
    setupAdminFromMock({});

    const req = makeRequest('not-valid-json{{{', VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});

// ─── C6. Payload Zod inválido ─────────────────────────────────────────────────

describe('C6: payload Zod inválido', () => {
  it('retorna 400 si faltan campos requeridos', async () => {
    setupAdminFromMock({});

    const badPayload = { eventId: EVENT_UUID }; // faltan muchos campos
    const req = makeRequest(badPayload, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('retorna 400 si eventType no está en la whitelist', async () => {
    setupAdminFromMock({});

    const badPayload = { ...VALID_PAYLOAD, eventType: 'execution.arbitrary' };
    const req = makeRequest(badPayload, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});

// ─── C7. Evento duplicado ─────────────────────────────────────────────────────

describe('C7: evento duplicado', () => {
  it('retorna 200 {ok: true, duplicate: true} sin reprocesar', async () => {
    // Primera llamada a automation_webhook_events retorna unique violation
    let firstCall = true;
    mockAdminFrom.mockImplementation(() => {
      if (firstCall) {
        firstCall = false;
        return makeInsertDuplicateChain();
      }
      return makeInsertOkChain();
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.duplicate).toBe(true);
  });

  it('C15: service_role NO se crea antes del HMAC fallido', async () => {
    // HMAC falla → createAdminClient NO debe ser llamado
    mockVerifyIncomingWebhook.mockReturnValueOnce({
      ok:    false,
      error: { code: 'INVALID_SIGNATURE', message: 'bad sig' },
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    await POST(req as never);

    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });
});

// ─── C8. execution.started válido ────────────────────────────────────────────

describe('C8: execution.started válido', () => {
  it('retorna 200 y actualiza status a running', async () => {
    setupAdminFromMock({});

    const req = makeRequest({ ...VALID_PAYLOAD, eventType: 'execution.started' }, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBeUndefined();
  });
});

// ─── C9. execution.succeeded válido ──────────────────────────────────────────

describe('C9: execution.succeeded válido', () => {
  it('retorna 200 cuando la ejecución transiciona a succeeded', async () => {
    // execution está en running (puede transicionar a succeeded)
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id:              EXEC_UUID,
              organization_id: ORG_UUID,
              automation_id:   AUTO_UUID,
              status:          'running', // puede → succeeded
              attempt:         1,
            },
            error: null,
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest(
      { ...VALID_PAYLOAD, eventType: 'execution.succeeded' },
      VALID_HEADERS,
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });

  it('retorna 200 aunque la recuperación de alertas (Phase 6F, best-effort) falle en la tabla "alerts"', async () => {
    // Reproduce el escenario del bug "recovery resolve failed (best-effort)":
    // el UPDATE sobre `alerts` en resolveActiveByAlertKeyPrefixes falla,
    // pero el callback principal ya actualizó automation_executions con éxito
    // y por lo tanto debe seguir respondiendo 200.
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id:              EXEC_UUID,
              organization_id: ORG_UUID,
              automation_id:   AUTO_UUID,
              status:          'running',
              attempt:         1,
            },
            error: null,
          }),
        };
      }
      if (table === 'automation_execution_logs') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'alerts') {
        // Simula el UPDATE fallando (p.ej. 22P02 invalid input syntax for uuid,
        // o cualquier otro error transitorio) — best-effort, no debe propagar.
        return {
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          or:     vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({
            data:  null,
            error: { code: '22P02', message: 'invalid input syntax for type uuid' },
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest(
      { ...VALID_PAYLOAD, eventType: 'execution.succeeded' },
      VALID_HEADERS,
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);
  });
});

// ─── C10. execution.failed válido ────────────────────────────────────────────

describe('C10: execution.failed — errorMessage sanitizado', () => {
  it('retorna 200 y no expone stack trace en respuesta', async () => {
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: EXEC_UUID, organization_id: ORG_UUID, automation_id: AUTO_UUID, status: 'running', attempt: 1 },
            error: null,
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const failedPayload = {
      ...VALID_PAYLOAD,
      eventType:    'execution.failed',
      errorCode:    'WORKFLOW_ERROR',
      errorMessage: 'Bearer sk-abc123 caused failure\n' + 'at stack line 1\nat stack line 2',
    };

    const req = makeRequest(failedPayload, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    // La respuesta no debe contener el mensaje de error crudo
    const body = await res.json() as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('Bearer');
    expect(JSON.stringify(body)).not.toContain('sk-abc123');
  });
});

// ─── C18 (HALLAZGO 4 — Phase 6 cierre). execution.cancelled: completed_at condicional ──
// n8n puede notificar execution.cancelled tanto para una ejecución que ya
// estaba 'running' como para una que seguía 'queued' (canTransitionExecution
// permite queued → cancelled). Si started_at nunca se seteó (queued), el
// UPDATE NO debe incluir completed_at, o se violaría
// ck_exec_completed_requires_started (completed_at IS NULL OR started_at IS NOT NULL).

describe('C18: execution.cancelled — completed_at condicional (HALLAZGO 4)', () => {
  it('queued → cancelled: el UPDATE NO incluye completed_at', async () => {
    let callCount = 0;
    const updateMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: updateMock,
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: EXEC_UUID, organization_id: ORG_UUID, automation_id: AUTO_UUID, status: 'queued', attempt: 1 },
            error: null,
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest({ ...VALID_PAYLOAD, eventType: 'execution.cancelled' }, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    expect(updateMock).toHaveBeenCalledTimes(1);
    const patch = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch['status']).toBe('cancelled');
    expect('completed_at' in patch).toBe(false);
    expect('started_at' in patch).toBe(false);
  });

  it('running → cancelled: el UPDATE SÍ incluye completed_at (started_at ya estaba seteado)', async () => {
    let callCount = 0;
    const updateMock = vi.fn().mockReturnThis();
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: updateMock,
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: EXEC_UUID, organization_id: ORG_UUID, automation_id: AUTO_UUID, status: 'running', attempt: 1 },
            error: null,
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest({ ...VALID_PAYLOAD, eventType: 'execution.cancelled' }, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const patch = updateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch['status']).toBe('cancelled');
    expect(typeof patch['completed_at']).toBe('string');
  });
});

// ─── C11. Transición inválida ────────────────────────────────────────────────

describe('C11: transición inválida', () => {
  it('retorna 409 si succeeded → running', async () => {
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: EXEC_UUID, organization_id: ORG_UUID, automation_id: AUTO_UUID, status: 'succeeded', attempt: 1 },
            error: null,
          }),
        };
      }
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    // 'execution.started' mapea a 'running' — inválido desde 'succeeded'
    const req = makeRequest({ ...VALID_PAYLOAD, eventType: 'execution.started' }, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(409);
  });

  it('retorna 409 si cancelled → running', async () => {
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: EXEC_UUID, organization_id: ORG_UUID, automation_id: AUTO_UUID, status: 'cancelled', attempt: 1 },
            error: null,
          }),
        };
      }
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest({ ...VALID_PAYLOAD, eventType: 'execution.started' }, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(409);
  });
});

// ─── C12. organizationId mismatch ────────────────────────────────────────────

describe('C12: organizationId mismatch', () => {
  it('retorna 403 y no revela la org real', async () => {
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id:              EXEC_UUID,
              organization_id: 'DIFFERENT-ORG-UUID', // distinta org
              automation_id:   AUTO_UUID,
              status:          'queued',
              attempt:         1,
            },
            error: null,
          }),
        };
      }
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(403);

    // No revelar la org real en el body
    const body = await res.json() as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('DIFFERENT-ORG-UUID');
  });
});

// ─── C13. Ejecución no encontrada ────────────────────────────────────────────

describe('C13: ejecución no encontrada', () => {
  it('retorna 400 sin revelar si existe en otra org', async () => {
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        };
      }
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(400);

    // No revelar existencia en otra org
    const body = await res.json() as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('organization');
    expect(JSON.stringify(body)).not.toContain('SQL');
  });
});

// ─── C14. Race condition (unique violation concurrente) ───────────────────────

describe('C14: unique violation race condition', () => {
  it('retorna 200 {duplicate: true} cuando hay race en insert del webhook_event', async () => {
    // El insert devuelve 23505 (otro worker lo insertó primero)
    mockAdminFrom.mockImplementationOnce(() => makeInsertDuplicateChain());

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.duplicate).toBe(true);
    expect(body.ok).toBe(true);
  });
});

// ─── C15. Orden de seguridad — service_role solo después de HMAC ─────────────

describe('C15: orden de seguridad', () => {
  it('NO llama createAdminClient si HMAC es inválido', async () => {
    mockVerifyIncomingWebhook.mockReturnValueOnce({
      ok:    false,
      error: { code: 'INVALID_SIGNATURE', message: 'bad' },
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    await POST(req as never);

    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('NO llama createAdminClient si timestamp está vencido', async () => {
    mockVerifyIncomingWebhook.mockReturnValueOnce({
      ok:    false,
      error: { code: 'STALE_TIMESTAMP', message: 'stale' },
    });

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    await POST(req as never);

    expect(mockCreateAdminClient).not.toHaveBeenCalled();
  });

  it('SOLO llama createAdminClient después de HMAC verificado exitosamente', async () => {
    setupAdminFromMock({});

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    await POST(req as never);

    // verifyIncomingWebhook debe ser llamado ANTES que createAdminClient
    const verifyCallOrder = mockVerifyIncomingWebhook.mock.invocationCallOrder[0];
    const adminCallOrder  = mockCreateAdminClient.mock.invocationCallOrder[0];
    expect(verifyCallOrder).toBeDefined();
    expect(adminCallOrder).toBeDefined();
    expect(verifyCallOrder ?? 0).toBeLessThan(adminCallOrder ?? Infinity);
  });
});

// ─── C16. Log de ejecución usa la columna real (metadata, no context) ─────────
// Revisión de consistencia Phase 6: apps/web/src/app/api/webhooks/n8n/route.ts
// insertaba en `automation_execution_logs` usando una clave `context`, pero
// la columna real definida en 20260804000000_phase6b_automation_runtime.sql
// es `metadata` (y además faltaba `event_type`). Este test falla si el bug
// reaparece.

describe('C16: insert en automation_execution_logs usa las columnas reales', () => {
  it('usa "metadata" (no "context") y setea "event_type" al procesar execution.started', async () => {
    const logInsertSpy = vi.fn().mockResolvedValue({ error: null });

    let webhookEventsCall = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        webhookEventsCall++;
        if (webhookEventsCall === 1) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id:              EXEC_UUID,
              organization_id: ORG_UUID,
              automation_id:   AUTO_UUID,
              status:          'queued',
              attempt:         1,
            },
            error: null,
          }),
        };
      }
      if (table === 'automation_execution_logs') {
        return { insert: logInsertSpy };
      }
      return {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const req = makeRequest({ ...VALID_PAYLOAD, eventType: 'execution.started' }, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    expect(logInsertSpy).toHaveBeenCalledTimes(1);
    const insertedRow = logInsertSpy.mock.calls[0]?.[0] as Record<string, unknown>;

    // La columna real es "metadata" — nunca debe insertarse bajo "context".
    expect(insertedRow).toHaveProperty('metadata');
    expect(insertedRow).not.toHaveProperty('context');

    // event_type debe reflejar el eventType del callback.
    expect(insertedRow['event_type']).toBe('execution.started');

    // Campos base de la fila siguen presentes.
    expect(insertedRow['execution_id']).toBe(EXEC_UUID);
    expect(insertedRow['organization_id']).toBe(ORG_UUID);
    expect(insertedRow['level']).toBe('info');
  });

  it('usa level "error" y event_type "execution.failed" cuando la ejecución falla', async () => {
    const logInsertSpy = vi.fn().mockResolvedValue({ error: null });

    let webhookEventsCall = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        webhookEventsCall++;
        if (webhookEventsCall === 1) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id:              EXEC_UUID,
              organization_id: ORG_UUID,
              automation_id:   AUTO_UUID,
              status:          'running',
              attempt:         1,
            },
            error: null,
          }),
        };
      }
      if (table === 'automation_execution_logs') {
        return { insert: logInsertSpy };
      }
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest(
      { ...VALID_PAYLOAD, eventType: 'execution.failed', errorCode: 'WORKFLOW_TEST_FAILURE' },
      VALID_HEADERS,
    );
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const insertedRow = logInsertSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insertedRow).toHaveProperty('metadata');
    expect(insertedRow).not.toHaveProperty('context');
    expect(insertedRow['event_type']).toBe('execution.failed');
    expect(insertedRow['level']).toBe('error');
  });
});

// ─── C17. Tabla exacta usada por el cliente Supabase para dedup de webhooks ──
// SQLSTATE 42P01 ("undefined_table") observado en el flujo local al procesar
// callbacks de n8n. Auditoría: route.ts SIEMPRE llama a
// adminClient.from('automation_webhook_events') (nombre real definido en
// supabase/migrations/20260804000000_phase6b_automation_runtime.sql, Sección
// E) — nunca 'webhook_events' ni ninguna otra variante. Estos tests capturan
// el nombre EXACTO pasado a .from() para que un regreso a un nombre
// incorrecto haga fallar el test (los tests anteriores usaban un mock con
// fallback genérico que no distinguía el nombre de tabla).

describe('C17: tabla exacta usada para deduplicación de webhooks', () => {
  it('callback running (execution.started) inserta en "automation_webhook_events"', async () => {
    setupAdminFromMock({});

    const req = makeRequest({ ...VALID_PAYLOAD, eventType: 'execution.started' }, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const tablesQueried = mockAdminFrom.mock.calls.map((call) => call[0]);
    expect(tablesQueried).toContain('automation_webhook_events');
    expect(tablesQueried).not.toContain('webhook_events');
  });

  it('callback succeeded (execution.succeeded) inserta en "automation_webhook_events"', async () => {
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) return makeInsertOkChain();
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id:              EXEC_UUID,
              organization_id: ORG_UUID,
              automation_id:   AUTO_UUID,
              status:          'running',
              attempt:         1,
            },
            error: null,
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest({ ...VALID_PAYLOAD, eventType: 'execution.succeeded' }, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const tablesQueried = mockAdminFrom.mock.calls.map((call) => call[0]);
    expect(tablesQueried).toContain('automation_webhook_events');
    expect(tablesQueried).not.toContain('webhook_events');
  });

  it('el insert de deduplicación usa únicamente columnas reales de la migración (source, external_event_id, event_type, payload_hash, status)', async () => {
    const insertSpy = vi.fn().mockReturnThis();
    let callCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'automation_webhook_events') {
        if (callCount++ === 0) {
          return {
            insert: insertSpy,
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'wh-1' }, error: null }),
          };
        }
        return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'automation_executions') {
        return {
          select: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: EXEC_UUID, organization_id: ORG_UUID, automation_id: AUTO_UUID, status: 'queued', attempt: 1 },
            error: null,
          }),
        };
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) };
    });

    const req = makeRequest({ ...VALID_PAYLOAD, eventType: 'execution.started' }, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const insertedRow = insertSpy.mock.calls[0]?.[0] as Record<string, unknown>;

    const REAL_COLUMNS = new Set([
      'id', 'organization_id', 'execution_id', 'external_event_id', 'source',
      'event_type', 'payload_hash', 'received_at', 'processed_at', 'status',
      'error_code', 'created_at',
    ]);
    for (const key of Object.keys(insertedRow)) {
      expect(REAL_COLUMNS.has(key), `columna inesperada en insert: ${key}`).toBe(true);
    }
    // No se persiste el body/payload crudo ni la firma HMAC en esta fila.
    expect(insertedRow).not.toHaveProperty('raw_body');
    expect(insertedRow).not.toHaveProperty('payload');
    expect(insertedRow).not.toHaveProperty('signature');
    expect(insertedRow).not.toHaveProperty('headers');
  });

  it('un error de inserción tipo SQLSTATE 42P01 (relation does not exist) se maneja de forma segura: 500 sin detalles SQL', async () => {
    mockAdminFrom.mockImplementationOnce(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data:  null,
        error: { code: '42P01', message: 'relation "public.automation_webhook_events" does not exist' },
      }),
    }));

    const req = makeRequest(VALID_PAYLOAD, VALID_HEADERS);
    const res = await POST(req as never);
    expect(res.status).toBe(500);

    const body = await res.json() as Record<string, unknown>;
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('42P01');
    expect(bodyStr).not.toContain('relation');
    expect(bodyStr).not.toContain('does not exist');
    expect(bodyStr).not.toContain('automation_webhook_events');
  });
});
