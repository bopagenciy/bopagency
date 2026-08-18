/**
 * ClaudeAPIProvider — tests unitarios (Phase 7D).
 *
 * Sin llamadas reales a Anthropic. `fetch` global mockeado con vitest —
 * mismo patrón que n8n-webhook-dispatcher.test.ts.
 *
 * Cobertura:
 *   A1. request exitoso — mapea content/model/usage/finishReason correctamente
 *   A2. envía system separado de messages (Anthropic Messages API)
 *   A3. usa ANTHROPIC_API_KEY / ANTHROPIC_MODEL / ANTHROPIC_API_VERSION del entorno
 *   A4. NUNCA loguea ni expone la API key
 *   A5. sin ANTHROPIC_API_KEY → err EXTERNAL_SERVICE_ERROR con reason='not_configured', SIN llamar a fetch
 *   A6. 429 → err RATE_LIMITED
 *   A7. 5xx → err EXTERNAL_SERVICE_ERROR (mensaje saneado, sin body crudo)
 *   A8. timeout (AbortError) → err EXTERNAL_SERVICE_ERROR con reason='timeout'
 *   A9. error de red inesperado → err EXTERNAL_SERVICE_ERROR
 *   A10. finishReason: end_turn/stop_sequence → 'stop', max_tokens → 'max_tokens', otro → 'error'
 *   A11. request.model explícito tiene prioridad sobre ANTHROPIC_MODEL
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIRequest } from '@bop-agency/ai-engine';
import { ClaudeAPIProvider } from './claude-api.provider';

const API_KEY = 'sk-ant-test-key-1234567890';

const BASE_REQUEST: AIRequest = {
  model: '',
  messages: [
    { role: 'system', content: 'Eres un asistente de prueba.' },
    { role: 'user', content: 'Genera contenido de prueba.' },
  ],
  maxTokens: 2048,
  temperature: 0.4,
};

function anthropicSuccessBody(overrides: Record<string, unknown> = {}) {
  return {
    content: [{ type: 'text', text: '{"ok":true}' }],
    model: 'claude-3-5-sonnet-20241022',
    stop_reason: 'end_turn',
    usage: { input_tokens: 120, output_tokens: 80 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('ANTHROPIC_API_KEY', API_KEY);
  // 7D.1.1: backoff a 0 para que los tests de reintento no duerman.
  vi.stubEnv('CAMPAIGN_AI_RETRY_BASE_DELAY_MS', '0');
  vi.stubGlobal('fetch', vi.fn());
});

describe('ClaudeAPIProvider.complete', () => {
  it('A1: retorna ok(AIResponse) mapeado correctamente en un request exitoso', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(anthropicSuccessBody()), { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    const result = await provider.complete(BASE_REQUEST);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content).toBe('{"ok":true}');
      expect(result.value.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.value.usage).toEqual({ inputTokens: 120, outputTokens: 80, totalTokens: 200 });
      expect(result.value.finishReason).toBe('stop');
    }
  });

  it('A2: envía el mensaje system separado de messages (Anthropic Messages API)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(anthropicSuccessBody()), { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    await provider.complete(BASE_REQUEST);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe('Eres un asistente de prueba.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Genera contenido de prueba.' }]);
  });

  it('A3: usa ANTHROPIC_API_KEY/ANTHROPIC_MODEL/ANTHROPIC_API_VERSION del entorno', async () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-custom-model');
    vi.stubEnv('ANTHROPIC_API_VERSION', '2024-01-01');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(anthropicSuccessBody()), { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    await provider.complete(BASE_REQUEST);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(API_KEY);
    expect(headers['anthropic-version']).toBe('2024-01-01');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-custom-model');
  });

  it('A4: NUNCA expone la API key en el resultado ni en errores', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('server error', { status: 500 }));
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    const result = await provider.complete(BASE_REQUEST);

    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('A5: sin ANTHROPIC_API_KEY retorna err EXTERNAL_SERVICE_ERROR (not_configured) sin llamar a fetch', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    const result = await provider.complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect((result.error.details as { reason?: string } | undefined)?.reason).toBe('not_configured');
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('A6: 429 retorna err RATE_LIMITED', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    const result = await provider.complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('RATE_LIMITED');
  });

  it('A7: 5xx retorna err EXTERNAL_SERVICE_ERROR sin exponer el body crudo del proveedor', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { type: 'api_error', message: 'detalle interno sensible' } }), {
        status: 500,
      }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    const result = await provider.complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message).not.toContain('detalle interno sensible');
    }
  });

  it('A8: timeout (AbortError) retorna err EXTERNAL_SERVICE_ERROR con reason=timeout', async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    const result = await provider.complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect((result.error.details as { reason?: string } | undefined)?.reason).toBe('timeout');
    }
  });

  it('A9: error de red inesperado retorna err EXTERNAL_SERVICE_ERROR', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    const result = await provider.complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
  });

  it('A10: mapea finishReason max_tokens y desconocido → error', async () => {
    const mockFetchMaxTokens = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(anthropicSuccessBody({ stop_reason: 'max_tokens' })), { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetchMaxTokens);
    const provider = new ClaudeAPIProvider();
    const result1 = await provider.complete(BASE_REQUEST);
    expect(result1.success && result1.value.finishReason).toBe('max_tokens');

    const mockFetchUnknown = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(anthropicSuccessBody({ stop_reason: 'tool_use' })), { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetchUnknown);
    const result2 = await provider.complete(BASE_REQUEST);
    expect(result2.success && result2.value.finishReason).toBe('error');
  });

  it('A11: request.model explícito tiene prioridad sobre ANTHROPIC_MODEL', async () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-env-default');
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(anthropicSuccessBody()), { status: 200 }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const provider = new ClaudeAPIProvider();
    await provider.complete({ ...BASE_REQUEST, model: 'claude-explicit-model' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-explicit-model');
  });
});
