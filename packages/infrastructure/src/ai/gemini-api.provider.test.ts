/**
 * GeminiAPIProvider — tests unitarios (Phase 7D.1).
 *
 * Sin llamadas reales a Google: `fetch` global mockeado. Mismos casos que
 * OpenAIAPIProvider (§21 "GEMINI PROVIDER: mismos casos"), más los específicos
 * de la forma de la API de Gemini (systemInstruction, roles user/model, modelo
 * en la URL, API key en header y NUNCA en query string).
 *
 * Cobertura:
 *   E1.  success — mapea content/model/usage/finishReason
 *   E2.  malformed response (sin candidates) → content vacío, sin lanzar
 *   E3.  401 sanitizado — sin body crudo, sin API key
 *   E4.  403 sanitizado
 *   E5.  429 → RATE_LIMITED
 *   E6.  5xx → EXTERNAL_SERVICE_ERROR saneado
 *   E7.  timeout (AbortError) → reason='timeout'
 *   E8.  error de red → EXTERNAL_SERVICE_ERROR
 *   E9.  sin GEMINI_API_KEY → reason='not_configured' SIN llamar a fetch
 *   E10. la API key va en el header x-goog-api-key y NUNCA en la URL
 *   E11. traduce el prompt al formato Gemini (systemInstruction + role 'user')
 *        y pide responseMimeType JSON, sin prompt builder propio
 *   E12. usa GEMINI_MODEL en la URL; request.model explícito tiene prioridad
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIRequest } from '@bop-agency/ai-engine';
import { GeminiAPIProvider } from './gemini-api.provider';

const API_KEY = 'AIza-gemini-test-key-1234567890';

const BASE_REQUEST: AIRequest = {
  model: '',
  messages: [
    { role: 'system', content: 'Eres un asistente de prueba. Responde en JSON.' },
    { role: 'user', content: 'Genera contenido de prueba.' },
  ],
  maxTokens: 2048,
  temperature: 0.4,
};

function geminiSuccessBody(overrides: Record<string, unknown> = {}) {
  return {
    modelVersion: 'gemini-1.5-flash',
    candidates: [
      { content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' },
    ],
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80, totalTokenCount: 200 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('GEMINI_API_KEY', API_KEY);
  // 7D.1.1: backoff a 0 para que los tests de reintento no duerman.
  vi.stubEnv('CAMPAIGN_AI_RETRY_BASE_DELAY_MS', '0');
  vi.stubGlobal('fetch', vi.fn());
});

describe('GeminiAPIProvider.complete', () => {
  it('E1: retorna ok(AIResponse) mapeado correctamente en un request exitoso', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(geminiSuccessBody()), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content).toBe('{"ok":true}');
      expect(result.value.model).toBe('gemini-1.5-flash');
      expect(result.value.usage).toEqual({ inputTokens: 120, outputTokens: 80, totalTokens: 200 });
      expect(result.value.finishReason).toBe('stop');
    }
  });

  it('E2: respuesta malformada (sin candidates) no lanza y retorna content vacío', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.content).toBe('');
      expect(result.value.finishReason).toBe('error');
    }
  });

  it('E3: 401 retorna error saneado sin body crudo ni API key', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { status: 'UNAUTHENTICATED', message: `API key not valid: ${API_KEY}` },
        }),
        { status: 401 },
      ),
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message).toContain('status 401');
      expect(result.error.message).toContain('UNAUTHENTICATED');
      expect(result.error.message).not.toContain(API_KEY);
      expect(JSON.stringify(result.error)).not.toContain(API_KEY);
    }
  });

  it('E4: 403 retorna error saneado', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }), { status: 403 }),
      );
    vi.stubGlobal('fetch', mockFetch);

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toContain('status 403');
  });

  it('E5: 429 retorna err RATE_LIMITED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('RATE_LIMITED');
  });

  it('E6: 5xx retorna err EXTERNAL_SERVICE_ERROR sin exponer el body crudo', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'detalle confidencial' } }), { status: 500 }),
        ),
    );

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('status 500');
      expect(result.error.message).not.toContain('confidencial');
    }
  });

  it('E7: timeout (AbortError) retorna err con reason=timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error.details as { reason?: string }).reason).toBe('timeout');
    }
  });

  it('E8: error de red inesperado retorna err EXTERNAL_SERVICE_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Unexpected error contacting AI provider.');
    }
  });

  it('E9: sin GEMINI_API_KEY retorna reason=not_configured SIN llamar a fetch', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error.details as { reason?: string }).reason).toBe('not_configured');
      expect(result.error.message).toContain('GEMINI_API_KEY');
    }
  });

  it('E10: la API key va en el header x-goog-api-key y NUNCA en la URL', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(geminiSuccessBody()), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new GeminiAPIProvider().complete(BASE_REQUEST);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).not.toContain(API_KEY);
    expect(url).not.toContain('key=');
    expect(headers['x-goog-api-key']).toBe(API_KEY);
    expect(JSON.stringify(result)).not.toContain(API_KEY);
  });

  it('E11: traduce el prompt común al formato Gemini y pide salida JSON', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(geminiSuccessBody()), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await new GeminiAPIProvider().complete(BASE_REQUEST);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toContain('Eres un asistente de prueba');
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].role).toBe('user');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
  });

  it('E12: usa GEMINI_MODEL en la URL y request.model explícito tiene prioridad', async () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-from-env');
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(geminiSuccessBody()), { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    await new GeminiAPIProvider().complete(BASE_REQUEST);
    const [urlFromEnv] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(urlFromEnv).toContain('/gemini-from-env:generateContent');

    await new GeminiAPIProvider().complete({ ...BASE_REQUEST, model: 'gemini-explicit' });
    const [urlExplicit] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(urlExplicit).toContain('/gemini-explicit:generateContent');
  });
});
