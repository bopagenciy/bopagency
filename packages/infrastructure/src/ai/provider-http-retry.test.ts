/**
 * provider-http — política de reintentos (Phase 7D.1.1).
 *
 * Origen: el smoke real con Gemini generó bien la primera vez, pero la
 * REGENERACIÓN falló con "AI campaign generation request timed out.". Estos
 * tests fijan la política de reintentos que se introdujo a raíz de eso.
 *
 * Se ejercita a través de `OpenAIAPIProvider` (cualquiera de los tres serviría:
 * los tres delegan en el mismo `fetchProviderJson`) más llamadas directas a
 * `fetchProviderJson` para los casos de presupuesto/configuración.
 *
 * Cobertura:
 *   R1.  429 se reintenta hasta agotar intentos (3 llamadas a fetch)
 *   R2.  500 / 502 / 503 / 504 se reintentan
 *   R3.  400 NO se reintenta (1 sola llamada)
 *   R4.  401 NO se reintenta
 *   R5.  403 NO se reintenta
 *   R6.  404 NO se reintenta
 *   R7.  timeout (AbortError) se reintenta
 *   R8.  error de red se reintenta
 *   R9.  éxito en el 2.º intento tras un 503 → resultado ok, sin error
 *   R10. agotamiento de reintentos preserva el error del ÚLTIMO intento
 *   R11. `details.attempts` refleja el número real de intentos
 *   R12. cada intento usa su PROPIO AbortController (signals distintos)
 *   R13. CAMPAIGN_AI_MAX_ATTEMPTS=1 desactiva los reintentos
 *   R14. el presupuesto total corta los reintentos antes de agotarlos
 *   R15. body 200 no-JSON NO se reintenta (no es transitorio)
 *   R16. los reintentos son SIEMPRE contra el mismo proveedor/URL (sin fallback)
 *   R17. ningún mensaje de error expone la API key ni el body crudo
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AIRequest } from '@bop-agency/ai-engine';
import { OpenAIAPIProvider } from './openai-api.provider';
import { fetchProviderJson, isRetryableHttpStatus, RETRYABLE_HTTP_STATUSES } from './provider-http';

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

function successBody() {
  return {
    model: 'gpt-4o-mini',
    choices: [{ message: { role: 'assistant', content: '{"ok":true}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

/** Devuelve una Response NUEVA en cada intento (una Response solo se lee una vez). */
function respond(status: number, body: unknown = {}): () => Promise<Response> {
  return async () => new Response(JSON.stringify(body), { status });
}

function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('OPENAI_API_KEY', API_KEY);
  // Sin backoff real: la política se verifica por número de intentos, no por reloj.
  vi.stubEnv('CAMPAIGN_AI_RETRY_BASE_DELAY_MS', '0');
  vi.stubGlobal('fetch', vi.fn());
});

describe('provider-http — clasificación de statuses', () => {
  it('R2a: la lista de statuses reintentables es exactamente 429/500/502/503/504', () => {
    expect([...RETRYABLE_HTTP_STATUSES].sort((a, b) => a - b)).toEqual([429, 500, 502, 503, 504]);
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isRetryableHttpStatus(status)).toBe(true);
    }
    for (const status of [400, 401, 403, 404, 409, 422]) {
      expect(isRetryableHttpStatus(status)).toBe(false);
    }
  });
});

describe('provider-http — reintentos ante errores transitorios', () => {
  it('R1: 429 se reintenta hasta agotar los 3 intentos', async () => {
    const mockFetch = vi.fn().mockImplementation(respond(429));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('RATE_LIMITED');
  });

  it('R2: 500/502/503/504 se reintentan', async () => {
    for (const status of [500, 502, 503, 504]) {
      const mockFetch = vi.fn().mockImplementation(respond(status));
      vi.stubGlobal('fetch', mockFetch);

      const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

      expect(mockFetch, `status ${status}`).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(false);
    }
  });

  it('R7: un timeout (AbortError) se reintenta', async () => {
    const mockFetch = vi.fn().mockRejectedValue(abortError());
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect((result.error.details as { reason?: string }).reason).toBe('timeout');
    }
  });

  it('R8: un error de red se reintenta', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.success).toBe(false);
  });

  it('R9: un 503 seguido de éxito devuelve ok sin exponer el fallo transitorio', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementationOnce(respond(503))
      .mockImplementationOnce(respond(200, successBody()));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.content).toBe('{"ok":true}');
  });
});

describe('provider-http — errores NO reintentables', () => {
  it.each([400, 401, 403, 404])('R3–R6: %i no se reintenta', async (status) => {
    const mockFetch = vi.fn().mockImplementation(respond(status, { error: { code: 'bad' } }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message).toContain(`status ${status}`);
    }
  });

  it('R15: un 200 con body no-JSON no se reintenta', async () => {
    const mockFetch = vi
      .fn()
      .mockImplementation(async () => new Response('no soy json', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });
});

describe('provider-http — agotamiento, presupuesto y aislamiento', () => {
  it('R10/R11: al agotar reintentos se preserva el último error y attempts refleja los intentos reales', async () => {
    const mockFetch = vi.fn().mockImplementation(respond(503, { error: { status: 'UNAVAILABLE' } }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('status 503');
      expect((result.error.details as { attempts?: number }).attempts).toBe(3);
      expect((result.error.details as { provider?: string }).provider).toBe('openai');
    }
  });

  it('R12: cada intento usa su propio AbortController', async () => {
    const signals: AbortSignal[] = [];
    const mockFetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      signals.push(init.signal as AbortSignal);
      return new Response('{}', { status: 503 });
    });
    vi.stubGlobal('fetch', mockFetch);

    await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(signals).toHaveLength(3);
    expect(new Set(signals).size).toBe(3);
  });

  it('R13: CAMPAIGN_AI_MAX_ATTEMPTS=1 desactiva los reintentos', async () => {
    vi.stubEnv('CAMPAIGN_AI_MAX_ATTEMPTS', '1');
    const mockFetch = vi.fn().mockImplementation(respond(503));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });

  it('R14: el presupuesto total corta los reintentos cuando los intentos son lentos', async () => {
    // El guard es de TIEMPO, no de conteo: un 503 que falla en 5 ms deja
    // presupuesto de sobra y SÍ debe reintentarse. Aquí se simula que el primer
    // intento consumió casi todo el presupuesto (como haría un timeout real de
    // 60 s) avanzando el reloj, y se comprueba que entonces se abandona.
    vi.stubEnv('CAMPAIGN_AI_TIMEOUT_MS', '5000');
    vi.stubEnv('CAMPAIGN_AI_TOTAL_BUDGET_MS', '10000');

    const realNow = Date.now();
    let call = 0;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      call += 1;
      // 1.ª lectura = inicio; a partir de la 2.ª, el reloj ya avanzó 9 s.
      return call === 1 ? realNow : realNow + 9_000;
    });

    const mockFetch = vi.fn().mockImplementation(respond(503));
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    nowSpy.mockRestore();
    // 9 000 (transcurrido) + 0 (backoff) + 5 000 (otro intento) > 10 000 ⇒ se abandona.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
  });

  it('R16: los reintentos van siempre al mismo proveedor y URL (sin fallback automático)', async () => {
    const urls: string[] = [];
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      urls.push(url);
      return new Response('{}', { status: 502 });
    });
    vi.stubGlobal('fetch', mockFetch);

    await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(urls).toHaveLength(3);
    expect(new Set(urls)).toEqual(new Set(['https://api.openai.com/v1/chat/completions']));
  });

  it('R17: ningún error expone la API key ni el body crudo del proveedor', async () => {
    const mockFetch = vi.fn().mockImplementation(
      respond(503, { error: { status: 'UNAVAILABLE', message: `key ${API_KEY} texto confidencial` } }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const result = await new OpenAIAPIProvider().complete(BASE_REQUEST);

    expect(result.success).toBe(false);
    if (!result.success) {
      const serialized = JSON.stringify(result.error);
      expect(serialized).not.toContain(API_KEY);
      expect(serialized).not.toContain('confidencial');
    }
  });

  it('R18: fetchProviderJson devuelve el body tipado en el camino feliz', async () => {
    const mockFetch = vi.fn().mockImplementation(respond(200, { hello: 'world' }));
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchProviderJson<{ hello: string }>({
      providerId: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      headers: { 'content-type': 'application/json' },
      body: { any: 'payload' },
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.hello).toBe('world');
  });
});
