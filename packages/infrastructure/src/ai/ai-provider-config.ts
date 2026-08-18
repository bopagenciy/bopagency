/**
 * ai-provider-config — Phase 7D.1.
 *
 * Resolución SERVER-SIDE de la configuración de cada proveedor de IA
 * (API key + modelo + timeout). Es el ÚNICO archivo del proyecto que lee las
 * variables de entorno de proveedores de IA.
 *
 * REGLAS DURAS:
 * - Ninguna variable usa el prefijo `NEXT_PUBLIC_` — todas son secretos o
 *   configuración de servidor, jamás se envían al browser (§4/§19).
 * - El modelo NUNCA llega desde el browser: se resuelve aquí por proveedor
 *   (§12). El cliente solo puede elegir un `AIProviderId` de un enum cerrado.
 * - `getApiKey()` retorna el valor pero NUNCA se loguea, ni se guarda en
 *   `campaign.metadata`, ni se incluye en ningún AppError.
 * - Sin fallback automático entre proveedores (§16): si el proveedor pedido
 *   no tiene API key, se retorna `campaignGenerationUnavailable` — nunca se
 *   prueba otro proveedor en silencio.
 *
 * VARIABLES DE ENTORNO (ver apps/web/.env.example):
 *   CAMPAIGN_AI_DEFAULT_PROVIDER  (opcional) — 'openai' | 'gemini' | 'anthropic'.
 *                                  Default: DEFAULT_AI_PROVIDER_ID ('anthropic').
 *                                  Un valor inválido NO cae silenciosamente al
 *                                  default: retorna error de configuración.
 *   OPENAI_API_KEY / OPENAI_MODEL
 *   GEMINI_API_KEY / GEMINI_MODEL
 *   ANTHROPIC_API_KEY / ANTHROPIC_MODEL / ANTHROPIC_API_VERSION
 *   CAMPAIGN_AI_TIMEOUT_MS        (opcional) — timeout POR INTENTO. Default
 *                                  60000, rango 5000–120000 (7D.1.1: subido
 *                                  desde 30000 tras el timeout observado en la
 *                                  regeneración con Gemini).
 *   CAMPAIGN_AI_MAX_ATTEMPTS      (opcional) — default 3 (1 + 2 reintentos), rango 1–3.
 *   CAMPAIGN_AI_RETRY_BASE_DELAY_MS (opcional) — default 500, rango 0–10000.
 *   CAMPAIGN_AI_TOTAL_BUDGET_MS   (opcional) — cota total de la operación.
 *                                  Default: timeout×2 (acotado a 240000).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import { AI_PROVIDER_IDS, DEFAULT_AI_PROVIDER_ID, isAIProviderId } from '@bop-agency/shared';
import type { AIProviderId } from '@bop-agency/shared';
import { campaignGenerationUnavailable, aiUnsupportedProvider } from '@bop-agency/domain';

// ─── Timeout y reintentos (compartidos por los tres proveedores) ──────────────
//
// Phase 7D.1.1: el default de timeout sube de 30 000 a 60 000 ms. Motivo: el
// smoke real con Gemini generó bien la primera vez pero la REGENERACIÓN superó
// los 30 s y abortó. La generación de una campaña completa (concepto +
// audiencia + ad sets + creatividades) es una respuesta larga; 30 s era un
// presupuesto de latencia optimista para un modelo grande bajo carga.
//
// El rango de seguridad se mantiene en 5 000–120 000 ms: por debajo de 5 s
// ninguna generación real cabe, y por encima de 120 s la petición del usuario
// (Server Action) queda colgada más de lo que ningún proxy/hosting razonable
// tolera.

export const DEFAULT_CAMPAIGN_AI_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 120_000;

/** Máximo de intentos totales (1 inicial + 2 reintentos). */
export const DEFAULT_CAMPAIGN_AI_MAX_ATTEMPTS = 3;
const MIN_ATTEMPTS = 1;
const MAX_ATTEMPTS = 3;

/** Backoff exponencial: base, base×2, base×4… */
export const DEFAULT_CAMPAIGN_AI_RETRY_BASE_DELAY_MS = 500;
const MIN_RETRY_BASE_DELAY_MS = 0;
const MAX_RETRY_BASE_DELAY_MS = 10_000;

/**
 * Cota dura de tiempo total (todos los intentos + backoff). Sin esto, 3
 * intentos de 60 s podrían mantener una Server Action viva ~3 minutos.
 * Default: el doble del timeout por intento, acotado a [timeout, 240 000].
 */
const MIN_TOTAL_BUDGET_MS = 5_000;
const MAX_TOTAL_BUDGET_MS = 240_000;

/**
 * Lee un entero de entorno dentro de un rango. Un valor fuera de rango o no
 * numérico cae al default de forma deliberada: es configuración operativa, no
 * un secreto ni una decisión de negocio — no vale la pena bloquear la feature
 * por un typo aquí (a diferencia de CAMPAIGN_AI_DEFAULT_PROVIDER, donde un
 * typo SÍ falla explícitamente porque cambiaría qué IA genera el contenido).
 */
function readIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

/** Timeout de CADA intento (no del conjunto). */
export function getCampaignAiTimeoutMs(): number {
  return readIntEnv(
    'CAMPAIGN_AI_TIMEOUT_MS',
    DEFAULT_CAMPAIGN_AI_TIMEOUT_MS,
    MIN_TIMEOUT_MS,
    MAX_TIMEOUT_MS,
  );
}

export function getCampaignAiMaxAttempts(): number {
  return readIntEnv(
    'CAMPAIGN_AI_MAX_ATTEMPTS',
    DEFAULT_CAMPAIGN_AI_MAX_ATTEMPTS,
    MIN_ATTEMPTS,
    MAX_ATTEMPTS,
  );
}

export function getCampaignAiRetryBaseDelayMs(): number {
  return readIntEnv(
    'CAMPAIGN_AI_RETRY_BASE_DELAY_MS',
    DEFAULT_CAMPAIGN_AI_RETRY_BASE_DELAY_MS,
    MIN_RETRY_BASE_DELAY_MS,
    MAX_RETRY_BASE_DELAY_MS,
  );
}

/**
 * Presupuesto total de la operación. Si no se configura, se deriva del timeout
 * por intento (×2), de modo que subir `CAMPAIGN_AI_TIMEOUT_MS` no descontrole
 * el tiempo total sin que nadie lo note.
 */
export function getCampaignAiTotalBudgetMs(): number {
  const perAttempt = getCampaignAiTimeoutMs();
  const derived = Math.min(Math.max(perAttempt * 2, perAttempt), MAX_TOTAL_BUDGET_MS);
  return readIntEnv(
    'CAMPAIGN_AI_TOTAL_BUDGET_MS',
    derived,
    MIN_TOTAL_BUDGET_MS,
    MAX_TOTAL_BUDGET_MS,
  );
}

// ─── Modelos por defecto ──────────────────────────────────────────────────────

/**
 * Modelo por defecto de cada proveedor cuando su variable `*_MODEL` no está
 * definida. Se mantienen como constantes explícitas (no un único modelo
 * hardcodeado global, §4) para que cambiar de modelo sea una variable de
 * entorno, no un deploy de código.
 */
export const DEFAULT_MODELS: Record<AIProviderId, string> = {
  openai: 'gpt-4o-mini',
  /**
   * Phase 7D.1.1 — antes `gemini-1.5-flash`, ya obsoleto. Se fija
   * `gemini-3.6-flash`, que es el identificador **verificado en el smoke real**
   * de este proyecto (es el valor de `GEMINI_MODEL` con el que la generación
   * inicial funcionó end-to-end) y un modelo vigente de la Generative Language
   * API. No se eligió por inferencia: es exactamente el que ya está probado
   * aquí. Existen modelos más nuevos (p. ej. la familia 3.7); cambiar a uno de
   * ellos exige repetir el smoke, no editar esta constante a ciegas.
   */
  gemini: 'gemini-3.6-flash',
  /**
   * ⚠️ NO verificado en smoke. Este valor viene de Phase 7D y probablemente
   * también esté obsoleto, pero cambiarlo sin una ejecución real sería
   * exactamente el "guess blindly" que la revisión de 7D.1.1 prohíbe. Ver
   * R-TECH-13 en PHASE_7_RISK_REGISTER.md: antes de usar el proveedor
   * `anthropic` en serio, fijar `ANTHROPIC_MODEL` en el entorno y verificar.
   */
  anthropic: 'claude-3-5-sonnet-20241022',
};

const API_KEY_ENV_VARS: Record<AIProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

const MODEL_ENV_VARS: Record<AIProviderId, string> = {
  openai: 'OPENAI_MODEL',
  gemini: 'GEMINI_MODEL',
  anthropic: 'ANTHROPIC_MODEL',
};

// ─── Lectura de env ───────────────────────────────────────────────────────────

function readTrimmedEnv(name: string): string | null {
  const raw = process.env[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** NUNCA loguear ni persistir el valor retornado. */
export function getProviderApiKey(providerId: AIProviderId): string | null {
  return readTrimmedEnv(API_KEY_ENV_VARS[providerId]);
}

export function getProviderModel(providerId: AIProviderId): string {
  return readTrimmedEnv(MODEL_ENV_VARS[providerId]) ?? DEFAULT_MODELS[providerId];
}

/** Solo aplica a Anthropic (header `anthropic-version` de la Messages API). */
export const DEFAULT_ANTHROPIC_API_VERSION = '2023-06-01';

export function getAnthropicApiVersion(): string {
  return readTrimmedEnv('ANTHROPIC_API_VERSION') ?? DEFAULT_ANTHROPIC_API_VERSION;
}

// ─── Configuración resuelta ───────────────────────────────────────────────────

export type AIProviderConfig = {
  readonly provider: AIProviderId;
  readonly model: string;
};

/**
 * Resuelve el proveedor por defecto desde `CAMPAIGN_AI_DEFAULT_PROVIDER`.
 *
 * Si la variable está definida pero con un valor no reconocido, se retorna un
 * ERROR explícito en vez de caer al default: un typo en configuración debe ser
 * visible, no silencioso (§15 — "NO fallar silenciosamente a otro provider").
 * Si la variable NO está definida, sí se usa `DEFAULT_AI_PROVIDER_ID`, que es
 * el comportamiento documentado, no un fallback accidental.
 */
export function resolveDefaultProviderId(): Result<AIProviderId> {
  const raw = readTrimmedEnv('CAMPAIGN_AI_DEFAULT_PROVIDER');
  if (raw === null) return ok(DEFAULT_AI_PROVIDER_ID);
  if (!isAIProviderId(raw)) {
    return err(
      campaignGenerationUnavailable(
        `CAMPAIGN_AI_DEFAULT_PROVIDER has an unsupported value. Expected one of: ${AI_PROVIDER_IDS.join(', ')}.`,
      ),
    );
  }
  return ok(raw);
}

/**
 * Resuelve la configuración completa de un proveedor concreto, verificando que
 * su API key exista. NO devuelve la API key: el provider la lee por sí mismo en
 * el momento de la llamada (mismo patrón que `N8nWebhookDispatcher`), de modo
 * que la key nunca viaja por el grafo de objetos ni puede acabar en un log de
 * composición.
 */
export function resolveAIProviderConfig(providerId: unknown): Result<AIProviderConfig> {
  if (!isAIProviderId(providerId)) {
    return err(aiUnsupportedProvider(typeof providerId === 'string' ? providerId : 'unknown'));
  }
  if (getProviderApiKey(providerId) === null) {
    return err(
      campaignGenerationUnavailable(
        `provider "${providerId}" is not configured (missing ${API_KEY_ENV_VARS[providerId]}).`,
      ),
    );
  }
  return ok({ provider: providerId, model: getProviderModel(providerId) });
}
