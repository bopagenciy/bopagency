/**
 * provider-http — Phase 7D.1, ampliado en 7D.1.1 (retry/backoff).
 *
 * Capa HTTP compartida por los tres proveedores de IA (OpenAI / Gemini /
 * Anthropic). Garantiza que los tres tengan **exactamente el mismo**
 * comportamiento de red: mismo contrato de errores, mismo timeout por intento,
 * misma política de reintentos y el mismo presupuesto total.
 *
 * Por qué vive aquí y no en cada provider: `CampaignGeneratorAdapter` traduce
 * los errores genéricos a errores de dominio leyendo `code` y `details.reason`.
 * Si cada provider construyera esos errores (o su propio bucle de reintentos) a
 * mano, un typo haría que un timeout de Gemini se reportara como fallo genérico,
 * y la política de reintentos divergiría entre proveedores sin que ningún test
 * lo notara.
 *
 * ─── REINTENTOS (7D.1.1) ──────────────────────────────────────────────────────
 *
 * Motivo: el smoke real con Gemini falló en REGENERACIÓN con
 * "AI campaign generation request timed out." mientras la generación inicial
 * había funcionado — patrón típico de latencia transitoria del proveedor, no de
 * un defecto de la petición.
 *
 * SOLO se reintentan errores transitorios:
 *   - HTTP 429, 500, 502, 503, 504
 *   - errores de red / fetch (TypeError "fetch failed", DNS, socket)
 *   - timeout del intento (AbortError)
 *
 * NUNCA se reintenta:
 *   - HTTP 400 / 401 / 403 / 404 y, en general, cualquier 4xx que no sea 429
 *     (son errores de petición o credenciales: reintentar no cambia el
 *     resultado y multiplica el gasto)
 *   - proveedor no configurado (ni siquiera se llega a `fetch`)
 *   - salida inválida / schema (se detecta aguas arriba, en el adapter)
 *
 * ¿Es seguro reintentar un timeout? Sí en este flujo concreto: `complete()` es
 * una llamada de solo generación — no escribe en nuestra BD (la persistencia
 * ocurre en el use case, después de validar) y no dispara ninguna acción
 * externa. El único coste de un intento duplicado es que el proveedor podría
 * facturar la primera llamada abortada; se acepta a cambio de no perder la
 * generación. Documentado en PHASE_7D1_MULTI_PROVIDER_AI_REPORT.md.
 *
 * NO hay fallback automático entre proveedores (§16): los reintentos son
 * siempre contra el MISMO proveedor.
 *
 * Cota de tiempo total: además del máximo de intentos, existe un presupuesto
 * global (`CAMPAIGN_AI_TOTAL_BUDGET_MS`). Antes de programar un reintento se
 * comprueba que el backoff + otro intento completo quepan dentro del
 * presupuesto; si no caben, se devuelve el último error en vez de arrastrar la
 * petición del usuario durante minutos.
 *
 * ─── SEGURIDAD ────────────────────────────────────────────────────────────────
 * - NUNCA se incluye el body crudo de la respuesta del proveedor en el AppError:
 *   como máximo un `type`/`code` corto extraído del JSON de error.
 * - NUNCA se loguea la API key, los headers, ni el body de la request (el brief
 *   del cliente viaja ahí).
 * - Los `console.error` solo emiten metadata no sensible (proveedor, status,
 *   timeout, número de intento).
 */

import { ok, err, createError } from '@bop-agency/shared';
import type { AppError, Result } from '@bop-agency/shared';
import type { AIProviderId } from '@bop-agency/shared';
import {
  getCampaignAiMaxAttempts,
  getCampaignAiRetryBaseDelayMs,
  getCampaignAiTimeoutMs,
  getCampaignAiTotalBudgetMs,
} from './ai-provider-config';

// ─── details.reason reconocidos por CampaignGeneratorAdapter ──────────────────

export const PROVIDER_REASON_NOT_CONFIGURED = 'not_configured';
export const PROVIDER_REASON_TIMEOUT = 'timeout';

/** Statuses HTTP que se consideran transitorios y por tanto reintentables. */
export const RETRYABLE_HTTP_STATUSES: readonly number[] = [429, 500, 502, 503, 504];

export function isRetryableHttpStatus(status: number): boolean {
  return RETRYABLE_HTTP_STATUSES.includes(status);
}

// ─── Factorías de error ───────────────────────────────────────────────────────

export function providerNotConfiguredError(
  providerId: AIProviderId,
  envVarName: string,
): AppError {
  return createError(
    'EXTERNAL_SERVICE_ERROR',
    `AI provider is not configured (missing ${envVarName}).`,
    { reason: PROVIDER_REASON_NOT_CONFIGURED, provider: providerId },
  );
}

export function providerRateLimitedError(
  providerId: AIProviderId,
  statusCode: number,
  attempts: number,
): AppError {
  return createError('RATE_LIMITED', 'AI provider rate limit exceeded.', {
    statusCode,
    provider: providerId,
    attempts,
  });
}

export function providerHttpError(
  providerId: AIProviderId,
  statusCode: number,
  attempts: number,
  safeType?: string,
): AppError {
  const safeDetail = safeType ? `status ${statusCode} (${safeType})` : `status ${statusCode}`;
  return createError('EXTERNAL_SERVICE_ERROR', `AI provider request failed: ${safeDetail}`, {
    statusCode,
    provider: providerId,
    attempts,
  });
}

export function providerTimeoutError(providerId: AIProviderId, attempts: number): AppError {
  return createError('EXTERNAL_SERVICE_ERROR', 'AI provider request timed out.', {
    reason: PROVIDER_REASON_TIMEOUT,
    provider: providerId,
    attempts,
  });
}

export function providerUnexpectedError(providerId: AIProviderId, attempts: number): AppError {
  return createError('EXTERNAL_SERVICE_ERROR', 'Unexpected error contacting AI provider.', {
    provider: providerId,
    attempts,
  });
}

export function providerInvalidJsonError(providerId: AIProviderId, attempts: number): AppError {
  return createError('EXTERNAL_SERVICE_ERROR', 'AI provider returned a malformed response body.', {
    provider: providerId,
    attempts,
  });
}

/**
 * Extrae un identificador corto y seguro del body de error de un proveedor
 * (`error.type` en Anthropic, `error.code`/`error.type` en OpenAI,
 * `error.status` en Gemini). NUNCA retorna `error.message`, que puede contener
 * eco del prompt (y con él, el brief del cliente).
 */
export async function readSafeErrorType(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as {
      error?: { type?: unknown; code?: unknown; status?: unknown };
    };
    const candidate = body.error?.type ?? body.error?.code ?? body.error?.status;
    if (typeof candidate === 'string' && candidate.length > 0 && candidate.length <= 64) {
      return candidate;
    }
  } catch {
    // Body no parseable como JSON — se ignora deliberadamente; nunca se expone
    // el texto crudo.
  }
  return undefined;
}

export function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === 'AbortError';
}

// ─── Motor de request con timeout + retry ─────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms));

export type ProviderRequestParams = {
  readonly providerId: AIProviderId;
  readonly url: string;
  readonly headers: Record<string, string>;
  /** Objeto ya listo para `JSON.stringify` — nunca se loguea. */
  readonly body: unknown;
};

/**
 * Ejecuta la petición al proveedor con `AbortController` **por intento**,
 * reintentos con backoff exponencial ante errores transitorios, y un
 * presupuesto de tiempo total.
 *
 * Retorna el body JSON ya parseado (tipado por el caller) o un `AppError`
 * genérico y saneado. El caller (cada provider) solo mapea ese body a
 * `AIResponse`.
 */
export async function fetchProviderJson<TBody>(
  params: ProviderRequestParams,
): Promise<Result<TBody>> {
  const { providerId, url, headers, body } = params;

  const perAttemptTimeoutMs = getCampaignAiTimeoutMs();
  const maxAttempts = getCampaignAiMaxAttempts();
  const baseDelayMs = getCampaignAiRetryBaseDelayMs();
  const totalBudgetMs = getCampaignAiTotalBudgetMs();
  const startedAt = Date.now();

  const serializedBody = JSON.stringify(body);
  let lastError: AppError = providerUnexpectedError(providerId, 0);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const outcome = await attemptOnce<TBody>({
      providerId,
      url,
      headers,
      serializedBody,
      timeoutMs: perAttemptTimeoutMs,
      attempt,
    });

    if (outcome.kind === 'ok') return ok(outcome.value);

    lastError = outcome.error;

    if (!outcome.retryable || attempt === maxAttempts) break;

    // Backoff exponencial determinístico (sin jitter, para que los tests sean
    // reproducibles): base, base*2, base*4…
    const delayMs = baseDelayMs * 2 ** (attempt - 1);
    const elapsedMs = Date.now() - startedAt;

    // Cota de tiempo total: si el backoff + otro intento completo no caben en
    // el presupuesto, se abandona con el último error en vez de dejar al
    // usuario esperando indefinidamente.
    if (elapsedMs + delayMs + perAttemptTimeoutMs > totalBudgetMs) {
      console.error('[ai-provider] Retry budget exhausted, giving up', {
        provider: providerId,
        attempt,
        elapsedMs,
        totalBudgetMs,
      });
      break;
    }

    console.error('[ai-provider] Transient failure, retrying', {
      provider: providerId,
      attempt,
      nextAttempt: attempt + 1,
      delayMs,
    });
    await sleep(delayMs);
  }

  return err(lastError);
}

type AttemptOutcome<TBody> =
  | { kind: 'ok'; value: TBody }
  | { kind: 'error'; error: AppError; retryable: boolean };

async function attemptOnce<TBody>(params: {
  providerId: AIProviderId;
  url: string;
  headers: Record<string, string>;
  serializedBody: string;
  timeoutMs: number;
  attempt: number;
}): Promise<AttemptOutcome<TBody>> {
  const { providerId, url, headers, serializedBody, timeoutMs, attempt } = params;

  // AbortController NUEVO por intento — un controller reutilizado quedaría
  // abortado para siempre tras el primer timeout.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: serializedBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === 429) {
      console.error('[ai-provider] Rate limited by provider', {
        provider: providerId,
        statusCode: response.status,
        attempt,
      });
      return {
        kind: 'error',
        error: providerRateLimitedError(providerId, response.status, attempt),
        retryable: true,
      };
    }

    if (!response.ok) {
      const safeType = await readSafeErrorType(response);
      const retryable = isRetryableHttpStatus(response.status);
      console.error('[ai-provider] Provider returned an error', {
        provider: providerId,
        statusCode: response.status,
        attempt,
        retryable,
      });
      return {
        kind: 'error',
        error: providerHttpError(providerId, response.status, attempt, safeType),
        retryable,
      };
    }

    try {
      const payload = (await response.json()) as TBody;
      return { kind: 'ok', value: payload };
    } catch {
      // 200 con body no-JSON: no es transitorio, reintentar no ayuda.
      console.error('[ai-provider] Provider returned a non-JSON body', {
        provider: providerId,
        attempt,
      });
      return {
        kind: 'error',
        error: providerInvalidJsonError(providerId, attempt),
        retryable: false,
      };
    }
  } catch (fetchErr) {
    clearTimeout(timeoutId);

    if (isAbortError(fetchErr)) {
      console.error('[ai-provider] Timeout contacting provider', {
        provider: providerId,
        timeoutMs,
        attempt,
      });
      return {
        kind: 'error',
        error: providerTimeoutError(providerId, attempt),
        retryable: true,
      };
    }

    // Error de red / DNS / socket — transitorio por naturaleza.
    console.error('[ai-provider] Unexpected error contacting provider', {
      provider: providerId,
      errorName: fetchErr instanceof Error ? fetchErr.name : 'unknown',
      attempt,
    });
    return {
      kind: 'error',
      error: providerUnexpectedError(providerId, attempt),
      retryable: true,
    };
  }
}
