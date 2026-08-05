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

  it('B11: metadata — claves prohibidas eliminadas (H4: patrones delimitados)', async () => {
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
          // ── Claves que DEBEN eliminarse ────────────────────────────────────
          secret:           'top-secret',          // palabra exacta
          token:            'bearer-abc',           // palabra exacta
          apiKey:           'key-value',            // compuesto exacto (snake: api_key)
          api_key:          'key-value2',           // compuesto exacto
          access_token:     'tok-123',              // compuesto exacto
          accessToken:      'tok-456',              // compuesto (camelCase → access_token)
          refresh_token:    'ref-789',              // compuesto exacto
          password:         'hunter2',             // palabra exacta
          authorization:    'Bearer xyz',           // palabra exacta
          credential:       'cred-val',             // palabra exacta
          credentials:      'creds-val',            // palabra exacta
          private_key:      'pk-rsa',              // compuesto exacto
          privateKey:       'pk-ec',               // compuesto (camelCase → private_key)
          bearer:           'Bearer token',         // palabra exacta
          oauth:            'oauth-code',           // palabra exacta
          email:            'user@test.com',        // palabra exacta
          phone:            '+1234567890',          // palabra exacta
          ssn:              '123-45-6789',          // palabra exacta
          userToken:        'usr-tok',              // contiene 'token' como palabra
          authSecret:       'secret-val',           // contiene 'secret' como palabra
          // ── Claves que DEBEN conservarse (H4: sin falsos positivos) ───────
          safeValue:        'ok',                   // no coincide con nada
          campaignId:       'cmp-1',               // 'campaign' ≠ ningún patrón
          keyboardLayout:   'qwerty',               // 'keyboard','layout' ≠ ningún patrón
          primaryKeyName:   'id',                   // 'primary','key','name' ≠ ningún patrón
          tokenCount:       42,                     // contiene 'token' → FILTRADO (diseño intencional)
          attemptNumber:    3,                      // no coincide
          reportId:         'rpt-9',               // no coincide
        },
      },
    };

    const dispatcher = new N8nWebhookDispatcher();
    await dispatcher.dispatch(AUTO_ID, options);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    // Prohibidas — deben estar ausentes
    expect(body.metadata.secret).toBeUndefined();
    expect(body.metadata.token).toBeUndefined();
    expect(body.metadata.apiKey).toBeUndefined();
    expect(body.metadata.api_key).toBeUndefined();
    expect(body.metadata.access_token).toBeUndefined();
    expect(body.metadata.accessToken).toBeUndefined();
    expect(body.metadata.refresh_token).toBeUndefined();
    expect(body.metadata.password).toBeUndefined();
    expect(body.metadata.authorization).toBeUndefined();
    expect(body.metadata.credential).toBeUndefined();
    expect(body.metadata.credentials).toBeUndefined();
    expect(body.metadata.private_key).toBeUndefined();
    expect(body.metadata.privateKey).toBeUndefined();
    expect(body.metadata.bearer).toBeUndefined();
    expect(body.metadata.oauth).toBeUndefined();
    expect(body.metadata.email).toBeUndefined();
    expect(body.metadata.phone).toBeUndefined();
    expect(body.metadata.ssn).toBeUndefined();
    expect(body.metadata.userToken).toBeUndefined();
    expect(body.metadata.authSecret).toBeUndefined();

    // Legítimas — deben conservarse (H4: no falsos positivos)
    expect(body.metadata.safeValue).toBe('ok');
    expect(body.metadata.campaignId).toBe('cmp-1');
    expect(body.metadata.keyboardLayout).toBe('qwerty');
    expect(body.metadata.primaryKeyName).toBe('id');
    expect(body.metadata.attemptNumber).toBe(3);
    expect(body.metadata.reportId).toBe('rpt-9');
  });

  it('B11b: sanitización es recursiva — metadata anidada también es filtrada (H4)', async () => {
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
          nested: {
            secret:     'inner-secret',   // debe eliminarse
            safeField:  'safe-value',     // debe conservarse
          },
          topLevel: 'ok',
        },
      },
    };

    const dispatcher = new N8nWebhookDispatcher();
    await dispatcher.dispatch(AUTO_ID, options);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    // Nested secret must be removed
    expect(body.metadata.nested?.secret).toBeUndefined();
    expect(body.metadata.nested?.safeField).toBe('safe-value');
    expect(body.metadata.topLevel).toBe('ok');
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
