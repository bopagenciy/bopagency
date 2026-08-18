/**
 * campaign-ai-provider.factory — Phase 7D.1.
 *
 * ÚNICO punto del proyecto donde existe un switch por proveedor de IA (§5:
 * "No meter if/else de providers dentro de use cases. La decisión debe quedar
 * confinada a composition/infrastructure").
 *
 * Los use cases (`generateCampaignDraftWithAI`, `regenerateCampaignContent`)
 * solo propagan un `AIProviderId` opcional dentro de `GenerateCampaignInput`;
 * `CampaignGeneratorAdapter` llama a esta factoría y no sabe cómo se construye
 * cada proveedor.
 *
 * SIN FALLBACK AUTOMÁTICO (§16): si el proveedor solicitado (o el default) no
 * tiene API key, se retorna un error de configuración explícito. NUNCA se
 * intenta otro proveedor en silencio — la observabilidad y la predictibilidad
 * priman sobre la disponibilidad hasta que se decida lo contrario.
 *
 * EXTENSIBLE A "COMPARE MODE" (§17, diferido): como la factoría devuelve una
 * instancia por `AIProviderId` y el adapter resuelve el proveedor POR LLAMADA
 * (no en el constructor), ejecutar el mismo brief en los tres proveedores en
 * paralelo no requeriría reescribir nada de esta capa — solo un caso de uso
 * nuevo que invoque `generate()` N veces con distinto `provider`.
 */

import { ok, isOk } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { AIProvider } from '@bop-agency/ai-engine';
import type { AIProviderId } from '@bop-agency/shared';
import { resolveAIProviderConfig, resolveDefaultProviderId } from './ai-provider-config';
import { ClaudeAPIProvider } from './claude-api.provider';
import { OpenAIAPIProvider } from './openai-api.provider';
import { GeminiAPIProvider } from './gemini-api.provider';

/**
 * Proveedor listo para usar + la configuración con la que fue resuelto. El
 * `model` viaja aquí (no dentro del provider) para que el adapter pueda
 * inyectarlo en el `AIRequest` y persistirlo en `campaign.metadata.ai.model`
 * sin volver a leer env.
 *
 * NUNCA incluye la API key: cada provider la lee de `process.env` en el
 * momento exacto de la llamada (mismo patrón que N8nWebhookDispatcher), así
 * que la key no viaja por el grafo de objetos ni puede acabar en un log.
 */
export type ResolvedCampaignAIProvider = {
  readonly providerId: AIProviderId;
  readonly model: string;
  readonly provider: AIProvider;
};

const PROVIDER_CONSTRUCTORS: Record<AIProviderId, () => AIProvider> = {
  openai: () => new OpenAIAPIProvider(),
  gemini: () => new GeminiAPIProvider(),
  anthropic: () => new ClaudeAPIProvider(),
};

/**
 * Resuelve el proveedor a usar para una generación concreta.
 *
 * @param providerId Proveedor solicitado explícitamente (ya validado como enum
 *   aguas arriba por Zod/Server Action). Si es `undefined`, se usa
 *   `CAMPAIGN_AI_DEFAULT_PROVIDER` (o el default documentado si no está
 *   definida). Si es un string no reconocido, se retorna
 *   `aiUnsupportedProvider` — nunca se cae al default.
 */
export function createCampaignAIProvider(
  providerId?: AIProviderId,
): Result<ResolvedCampaignAIProvider> {
  let requested: AIProviderId;

  if (providerId === undefined) {
    const defaultResult = resolveDefaultProviderId();
    if (!isOk(defaultResult)) return defaultResult;
    requested = defaultResult.value;
  } else {
    requested = providerId;
  }

  const configResult = resolveAIProviderConfig(requested);
  if (!isOk(configResult)) return configResult;

  const { provider: resolvedId, model } = configResult.value;

  return ok({
    providerId: resolvedId,
    model,
    provider: PROVIDER_CONSTRUCTORS[resolvedId](),
  });
}

export type CampaignAIProviderFactory = typeof createCampaignAIProvider;
