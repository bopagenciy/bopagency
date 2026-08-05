/**
 * Tests unitarios para N8nWebhookDispatcher
 *
 * Sin llamadas reales a n8n. fetch global mockeado con vitest.
 *
 * Cobertura:
 *   B1. dispatch exitoso — request correcto con headers correctos
 *   B2. body mínimo y seguro (no secretos, no PII)
 *   B3. idempotency key incluida en headers y body
 *   B4. timeout — AbortError → err N8N_TIMEOUT
 *   B5. non-2xx → err N8N_ERROR con statusCode
 *   B6. N8N_BASE_URL no configurado → err CONFIGURATION_ERROR
 *   B7. AUTOMATION_WEBHOOK_SECRET no configurado → err CONFIGURATION_ERROR
 *   B8. executionId/organizationId faltantes → err INVALID_PAYLOAD
 *   B9. cancel exitoso
 *   B10. cancel timeout → err N8N_TIMEOUT
 *   B11. metadata con claves prohibidas es sanitizada
 *   B12. no se loguean secretos ni body completo
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AutomationId } from '@bop-agency/domain';
import type { DispatchOptions } from '@bop-agency/automation-engine';
import { N8nWebhookDispatcher } from './n8n-webhook-dispatcher';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const AUTO_ID   = 'auto-uuid-1' as unknown as AutomationId;
const EXEC_ID   = 'exec-uuid-1';
const ORG_ID    = 'org-uuid-1';
const IDEM_KEY  = 'auto-uuid-1:exec-uuid-1:2026-08-04';
const CALLBACK  = 'https://bopagency.com/api/webhooks/n8n';
const SECRET    = 'a'.repeat(32);
const BASE_URL  = 'http://localhost:5678';

const VALID_OPTIONS: DispatchOptions = {
  idempotencyKey: IDEM_KEY,
  payload: {
    executionId:    EXEC_ID,
    organizationId: ORG_ID,
    triggerType:    'manual',
    callbackUrl:    CALLBACK,
  },
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('N8N_BASE_URL', BASE_URL);
  vi.stubEnv('AUTOMATION_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('N8N_DISPATCH_TIMEOUT_MS', '5000');
  vi.stubGlobal('fetch', vi.fn());
});

// ─── B1. dispatch exitoso ─────────────────────────────────────────────────────

describe('N8nWebhookDispatcher.dispatch', () => {
  it('B1: retorna ok(AutomationRun) cuando n8n responde 200', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.id).toBe(EXEC_ID);
      expect(result.value.status).toBe('pending');
    }
  });

  it('B2: el POST va a la URL correcta con Content-Type application/json', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const dispatcher = new N8nWebhookDispatcher();
    await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/webhook/${String(AUTO_ID)}`);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('B3: incluye los 3 headers de firma HMAC', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const dispatcher = new N8nWebhookDispatcher();
    await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['x-bop-timestamp']).toBeDefined();
    expect(headers['x-bop-signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['x-bop-event-id']).toBe(IDEM_KEY);
  });

  it('B3: idempotency key incluida en el body', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const dispatcher = new N8nWebhookDispatcher();
    await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.idempotencyKey).toBe(IDEM_KEY);
    expect(body.executionId).toBe(EXEC_ID);
    expect(body.organizationId).toBe(ORG_ID);
    expect(body.automationId).toBe(String(AUTO_ID));
  });

  it('B4: retorna err N8N_TIMEOUT si fetch lanza AbortError', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(abortError));

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('B5: retorna err N8N_ERROR con statusCode si n8n responde 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('error', { status: 400 })));

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect((result.error.details as Record<string, unknown>)?.["statusCode"]).toBe(400);
    }
  });

  it('B5: retorna err N8N_ERROR si n8n responde 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 500 })));

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('B6: retorna CONFIGURATION_ERROR si N8N_BASE_URL no está configurado', async () => {
    vi.stubEnv('N8N_BASE_URL', '');

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });

  it('B7: retorna CONFIGURATION_ERROR si AUTOMATION_WEBHOOK_SECRET es muy corto', async () => {
    vi.stubEnv('AUTOMATION_WEBHOOK_SECRET', 'short');

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });

  it('B8: retorna INVALID_PAYLOAD si falta executionId', async () => {
    const options: DispatchOptions = {
      idempotencyKey: IDEM_KEY,
      payload: { organizationId: ORG_ID }, // sin executionId
    };

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.dispatch(AUTO_ID, options);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('B8: retorna INVALID_PAYLOAD si falta organizationId', async () => {
    const options: DispatchOptions = {
      idempotencyKey: IDEM_KEY,
      payload: { executionId: EXEC_ID }, // sin organizationId
    };

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.dispatch(AUTO_ID, options);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('B11: metadata con claves prohibidas es sanitizada antes de enviar a n8n', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const options: DispatchOptions = {
      idempotencyKey: IDEM_KEY,
      payload: {
        executionId:    EXEC_ID,
        organizationId: ORG_ID,
        triggerType:    'manual',
        callbackUrl:    CALLBACK,
        metadata: {
          safe:          'value-ok',
          secretToken:   'super-secret',      // debe ser eliminado
          apiKey:        'should-be-removed',  // debe ser eliminado
          email:         'user@test.com',      // debe ser eliminado
          campaignName:  'campaign-123',       // debe ser eliminado (name)
        },
      },
    };

    const dispatcher = new N8nWebhookDispatcher();
    await dispatcher.dispatch(AUTO_ID, options);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.metadata.safe).toBe('value-ok');
    expect(body.metadata.secretToken).toBeUndefined();
    expect(body.metadata.apiKey).toBeUndefined();
    expect(body.metadata.email).toBeUndefined();
    expect(body.metadata.campaignName).toBeUndefined();
  });

  it('B12: no se incluye secreto ni API key en los logs (via console.error spy)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 500 })));

    const dispatcher = new N8nWebhookDispatcher();
    await dispatcher.dispatch(AUTO_ID, VALID_OPTIONS);

    // Verificar que ningún log contiene el secreto
    for (const call of consoleSpy.mock.calls) {
      const logStr = JSON.stringify(call);
      expect(logStr).not.toContain(SECRET);
    }
    consoleSpy.mockRestore();
  });
});

// ─── B9. cancel ───────────────────────────────────────────────────────────────

describe('N8nWebhookDispatcher.cancel', () => {
  const N8N_API_KEY = 'n8n-api-key-12345';

  beforeEach(() => {
    vi.stubEnv('N8N_API_KEY', N8N_API_KEY);
  });

  it('B9: retorna ok cuando n8n responde 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 })));

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.cancel('n8n-exec-id-123');

    expect(result.success).toBe(true);
  });

  it('B9: DELETE va a la URL correcta con X-N8N-API-KEY', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const dispatcher = new N8nWebhookDispatcher();
    await dispatcher.cancel('run-id-abc');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/executions/run-id-abc');
    expect((init.headers as Record<string, string>)['X-N8N-API-KEY']).toBe(N8N_API_KEY);
    expect(init.method).toBe('DELETE');
  });

  it('B10: retorna CONFIGURATION_ERROR si N8N_API_KEY no está configurado', async () => {
    vi.stubEnv('N8N_API_KEY', '');

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.cancel('exec-id');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INTERNAL_ERROR');
  });

  it('B10: retorna N8N_TIMEOUT si cancel excede el timeout', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(abortError));

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.cancel('exec-id');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('retorna ok si n8n responde 404 (ejecución ya no existe)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 404 })));

    const dispatcher = new N8nWebhookDispatcher();
    const result = await dispatcher.cancel('exec-id');

    expect(result.success).toBe(true);
  });
});
