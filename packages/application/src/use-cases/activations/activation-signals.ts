/**
 * activation-signals.ts — Phase 8A.2.
 *
 * Señal best-effort, post-commit, para el ciclo de vida de
 * CampaignActivation — mismo criterio exacto que
 * `campaign-automation-dispatch.ts`/`evaluate-campaign-automation.use-case.ts`
 * (Phase 7F) y `evalIncidentSilently` (Phase 6F): un fallo de este helper
 * NUNCA revierte ni afecta el resultado de la operación principal, que ya
 * fue confirmada por el repositorio/RPC ANTES de invocarlo.
 *
 * DECISIÓN DE ALCANCE (§3 del kickoff de 8A.2 — "no inventar side effects
 * solo para usar la capa de señales"):
 *
 * - `createCampaignActivation` SÍ crea una tarea operativa best-effort:
 *   "Configurar y publicar canales de activación: <campaign name>". Esto
 *   NO es redundante con la tarea "Preparar activación de campaña" que ya
 *   crea `campaign_approved` (Phase 7F) — esa tarea le decía al operador
 *   "ve a crear la activation"; esta le dice "la activation ya existe,
 *   ahora configura y publica sus canales" — es el siguiente paso real del
 *   mismo flujo, con información nueva (el activationId), no una
 *   repetición. Dedupe determinístico por activationId (una activation
 *   nunca genera dos tareas).
 * - `cancelCampaignActivation`/`cancelActivationTarget` NO generan ninguna
 *   alerta ni tarea nueva: son acciones INTENCIONALES y ya atribuidas
 *   (actor + razón obligatoria + timestamp), auditadas automáticamente por
 *   el trigger de eventos de la migración (`campaign_activation_events`).
 *   Tratarlas como "incidentes" que ameritan una alerta sería inventar una
 *   señal que el producto no pidió — una cancelación deliberada no es una
 *   anomalía.
 * - Ningún use case de 8A.2 transiciona un target a `failed`: esa
 *   transición solo puede originarse desde un adapter de canal automático
 *   real (8E/8F) reportando un fallo del proveedor — no existe todavía
 *   ningún caller que la dispare. Por eso NO se agrega ninguna alerta de
 *   "target failure" en esta ronda: sería código muerto sin ningún caller,
 *   exactamente el tipo de side effect inventado que el kickoff pide
 *   evitar. Cuando 8E/8F introduzcan ese caller, ahí es donde corresponde
 *   añadir la alerta (mismo patrón que `campaignAiProviderFailureKey`).
 * - Los use cases de solo lectura (getCampaignActivation,
 *   listCampaignActivationsBy*, getActivationWithTargetsAndEvents) NUNCA
 *   invocan este módulo — ver la nota explícita en cada uno.
 */

import type {
  AlertRepository,
  TaskRepository,
  OrganizationId,
  CampaignId,
  ClientId,
  CampaignActivationId,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';

const PREFIX = 'activation';
const MAX_KEY_LENGTH = 255;

function buildKey(...parts: string[]): string {
  return [PREFIX, ...parts].join(':').slice(0, MAX_KEY_LENGTH);
}

/** Firma de deduplicación para la tarea "configurar y publicar canales" — una por activation. */
export function activationTargetsSetupSignatureTag(
  organizationId: OrganizationId,
  activationId: CampaignActivationId,
): string {
  return `sig:${buildKey(String(organizationId), String(activationId), 'targets-setup')}`;
}

function buildActivationTaskTags(
  organizationId: OrganizationId,
  campaignId: CampaignId,
  activationId: CampaignActivationId,
): string[] {
  return [
    'activation',
    `org:${String(organizationId)}`,
    `campaign-id:${String(campaignId)}`,
    `activation-id:${String(activationId)}`,
    'event:activation_created',
  ];
}

export type ActivationCreatedSignalInput = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId: CampaignId;
  readonly campaignName: string;
  readonly activationId: CampaignActivationId;
  /** UUID real del actor autenticado que creó la activation — server-side, nunca inventado. */
  readonly actorUserId: string;
};

export type ActivationSignalDeps = {
  alertRepository?: AlertRepository;
  taskRepository?: TaskRepository;
  logger: LoggerPort;
};

/**
 * Best-effort, post-commit: crea (con dedupe) la tarea de siguiente-paso
 * tras `createCampaignActivation`. Nunca lanza — cualquier error se loguea
 * como warning y se ignora. Ver decisión de alcance en el header del
 * archivo para por qué NO existe un equivalente para cancelación/fallo.
 */
export async function evalActivationCreatedSignalSilently(
  input: ActivationCreatedSignalInput,
  deps: ActivationSignalDeps,
): Promise<void> {
  const { taskRepository, logger } = deps;

  if (!taskRepository) {
    logger.warn('evalActivationCreatedSignalSilently: skipped — taskRepository not wired', {
      organizationId: input.organizationId,
      activationId: String(input.activationId),
    });
    return;
  }

  try {
    const signatureTag = activationTargetsSetupSignatureTag(input.organizationId, input.activationId);

    const existingResult = await taskRepository.findActiveBySignatureTag(signatureTag, input.organizationId);
    if (existingResult.success && existingResult.value.length > 0) {
      logger.info('activation.task.skipped_duplicate', {
        organizationId: input.organizationId,
        activationId: String(input.activationId),
        signatureTag,
      });
      return;
    }

    const tags = buildActivationTaskTags(input.organizationId, input.campaignId, input.activationId);
    tags.push(signatureTag);

    const link = `/campaigns/${String(input.campaignId)}/activation/${String(input.activationId)}`;
    const createResult = await taskRepository.create({
      organizationId: input.organizationId,
      clientId: String(input.clientId),
      title: `Configurar y publicar canales de activación: ${input.campaignName}`,
      description:
        `La activation de la campaña "${input.campaignName}" fue creada y está en estado "pending". ` +
        `Agrega sus canales de distribución y avanza cada uno por el flujo manual ` +
        `(preparar → listo → publicado). Esta tarea NO implica publicación automática en ningún ` +
        `proveedor externo. Ver: ${link}`,
      priority: 'medium',
      tags,
      createdBy: input.actorUserId,
    });

    if (createResult.success) {
      logger.info('activation.task.created', {
        organizationId: input.organizationId,
        activationId: String(input.activationId),
        taskId: String(createResult.value.id),
      });
    } else {
      logger.warn('evalActivationCreatedSignalSilently: task creation failed (best-effort)', {
        organizationId: input.organizationId,
        activationId: String(input.activationId),
        error: createResult.error.code,
      });
    }
  } catch (e) {
    logger.warn('evalActivationCreatedSignalSilently: threw unexpectedly (best-effort)', {
      organizationId: input.organizationId,
      activationId: String(input.activationId),
      error: String(e),
    });
  }
}
