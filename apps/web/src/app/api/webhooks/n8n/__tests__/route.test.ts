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
