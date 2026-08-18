/**
 * AI providers — Phase 7D.1 (multi-provider AI foundation).
 *
 * FUENTE ÚNICA de los identificadores de proveedor de IA usados por Campaign
 * Studio. Ningún otro archivo del proyecto debe declarar strings sueltos
 * ('openai' / 'gemini' / 'anthropic') — siempre importar desde aquí (§3 de la
 * especificación de 7D.1). Vive en `shared` (no en `domain` ni en
 * `infrastructure`) por la misma razón que `AD_PLATFORMS`/`PLATFORM_LABELS`:
 * lo consumen simultáneamente domain (AIGenerationMetadata), application
 * (validación Zod del input de los use cases), infrastructure (factory de
 * providers) y apps/web (selector de UI).
 *
 * IMPORTANTE — "Anthropic Claude" es el proveedor de RUNTIME (Messages API de
 * Anthropic, `ClaudeAPIProvider`). NO es "Claude Code", que es tooling de
 * desarrollo y no interviene en ningún flujo de runtime de este proyecto.
 *
 * Esta lista contiene EXCLUSIVAMENTE proveedores con implementación real
 * (`createCampaignAIProvider` en infrastructure sabe construir los tres). Si
 * en el futuro se agrega un proveedor, debe agregarse aquí Y en la factory —
 * la UI se deriva de esta constante, así que nunca ofrece un proveedor sin
 * implementación.
 */

export const AI_PROVIDER_IDS = ['openai', 'gemini', 'anthropic'] as const;

export type AIProviderId = (typeof AI_PROVIDER_IDS)[number];

/** Etiquetas de UI — mismo patrón que PLATFORM_LABELS. */
export const AI_PROVIDER_LABELS: Record<AIProviderId, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
};

/**
 * Type guard — la ÚNICA forma válida de convertir un string arbitrario
 * (payload de Server Action, valor de env var) en un AIProviderId.
 * Nunca hacer `as AIProviderId` sobre input no verificado.
 */
export function isAIProviderId(value: unknown): value is AIProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Proveedor por defecto cuando `CAMPAIGN_AI_DEFAULT_PROVIDER` no está definida
 * (§15). Se elige `anthropic` porque es el único proveedor que ya estaba
 * implementado y verificado en Phase 7D — así, un entorno existente que solo
 * tiene ANTHROPIC_API_KEY sigue funcionando exactamente igual tras 7D.1.
 *
 * NO existe fallback automático entre proveedores (§16): si el proveedor
 * resuelto no tiene API key configurada, se retorna un error de configuración
 * explícito, NUNCA se prueba otro proveedor en silencio.
 */
export const DEFAULT_AI_PROVIDER_ID: AIProviderId = 'anthropic';
