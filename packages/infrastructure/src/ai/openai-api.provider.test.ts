/**
 * OpenAIAPIProvider — tests unitarios (Phase 7D.1).
 *
 * Sin llamadas reales a OpenAI: `fetch` global mockeado con vitest, mismo
 * patrón que claude-api.provider.test.ts / n8n-webhook-dispatcher.test.ts.
 *
 * Cobertura (§21 "OPENAI PROVIDER"):
 *   O1.  success — mapea content/model/usage/finishReason
 *   O2.  malformed response (sin choices) → content vacío, sin lanzar
 *   O3.  401 sanitizado — sin body crudo, sin API key
 *   O4.  403 sanitizado
 *   O5.  429 → RATE_LIMITED
 *   O6.  5xx → EXTERNAL_SERVICE_ERROR saneado
 *   O7.  timeout (AbortError) → reason='timeout'
 *   O8.  error de red → EXTERNAL_SERVICE_ERROR
 *   O9.  sin OPENAI_API_KEY → reason='not_configured' SIN llamar a fetch
 *   O10. no hay filtración de secretos: Authorization se envía pero nunca se
 *        expone en el Result ni se loguea
 *   O11. usa OPENAI_MODEL y pide salida JSON estructurada
 *   O12. request.model explícito tiene prioridad sobre OPENAI_MODEL
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIRequest } from '@bop-agency/ai-engine';
import { OpenAIAPIProvider } from './openai-api.provider';

const API_KEY = 'sk-openai-test-key-1234567890';

const BASE_REQUEST: AIRequest = {
  model: '',
  messages: [
    { role: 'system', content: 'Eres un asistente de prueba. Responde en JSON.' },
    { role: 'user', content: 'Genera contenido de prueba.' },
  ],
  maxTokens: 2048,
  temperature: 0.4,
};

function openaiSuccessBody(overrides: Record<string, unknown> = {}) {
  return {
    model: 'gpt-4o-mini',
    choices: [{ message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('OPENAI_API_KEY', API_KEY);
  // 7D.1.1: backoff a 0 para que los tests de reintento no duerman.
  vi.stubEnv('CAMPAIGN_AI_RETRY_BASE_DELAY_MS', '0');
  vi.stubGlobal('fetch', vi.fn());
});

describe('OpenAIAPIProvider.complete', () => {
  it('O1: retorna ok(AIResponse) mapeado correctamente en un request exitoso', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(openaiSuccessBody()), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content).toBe('{"ok":true}');
      expect(result.value.model).toBe('gpt-4o-mini');
      expect(result.value.usage).toEqual({ inputTokens: 120, outputTokens: 80, totalTokens: 200 });
      expect(result.value.finishReason).toBe('stop');
    }
  });

  it('O2: respuesta malformada (sin choices) no lanza y retorna content vacío', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ model: 'gpt-4o-mini' }), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content).toBe('');
      expect(result.value.usage).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
      expect(result.value.finishReason).toBe('error');
    }
  });

  it('O3: 401 retorna error saneado sin body crudo ni API key', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { type: 'invalid_request_error', message: `Incorrect API key provided: ${API_KEY}` },
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message).toContain('status 401');
      expect(result.error.message).toContain('invalid_request_error');
      expect(result.error.message).not.toContain(API_KEY);
      expect(result.error.message).not.toContain('Incorrect API key');
      expect(JSON.stringify(result.error)).not.toContain(API_KEY);
    }
  });

  it('O4: 403 retorna error saneado', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: { code: 'forbidden' } }), { status: 403 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message).toContain('status 403');
    }
  });

  it('O5: 429 retorna err RATE_LIMITED', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('RATE_LIMITED');
  });

  it('O6: 5xx retorna err EXTERNAL_SERVICE_ERROR sin exponer el body crudo', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'internal detail confidencial' } }), { status: 503 }),
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('status 503');
      expect(result.error.message).not.toContain('confidencial');
    }
  });

  it('O7: timeout (AbortError) retorna err con reason=timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect((result.error.details as { reason?: string }).reason).toBe('timeout');
    }
  });

  it('O8: error de red inesperado retorna err EXTERNAL_SERVICE_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message).toBe('Unexpected error contacting AI provider.');
    }
  });

  it('O9: sin OPENAI_API_KEY retorna reason=not_configured SIN llamar a fetch', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error.details as { reason?: string }).reason).toBe('not_configured');
      expect(result.error.message).toContain('OPENAI_API_KEY');
    }
  });

  it('O10: envía Authorization: Bearer pero nunca lo expone en el resultado', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(openaiSuccessBody()), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['authorization']).toBe(`Bearer ${API_KEY}`);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('O11: usa OPENAI_MODEL y solicita salida JSON estructurada', async () => {
    vi.stubEnv('OPENAI_MODEL', 'gpt-custom-model');
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(openaiSuccessBody()), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await new OpenAIAPIProvider().complete(BASE_REQUEST);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-custom-model');
    expect(body.response_format).toEqual({ type: 'json_object' });
    // El rol 'system' viaja dentro de messages (a diferencia de Anthropic).
    expect(body.messages[0].role).toBe('system');
  });

  it('O12: request.model explícito tiene prioridad sobre OPENAI_MODEL', async () => {
    vi.stubEnv('OPENAI_MODEL', 'gpt-from-env');
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(openaiSuccessBody()), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await new OpenAIAPIProvider().complete({ ...BASE_REQUEST, model: 'gpt-explicit' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gpt-explicit');
  });
});
