/**
 * campaign-automation-signatures.ts — Phase 7F.
 *
 * Firmas (alert_key / task signature tag) determinísticas de deduplicación
 * para los side effects internos de Campaign Studio. Espejo directo de
 * `automation-incident-signatures.ts` (Phase 6F) — mismas reglas:
 *
 * - Determinísticas: misma entrada → misma firma siempre.
 * - Sin PII, sin secretos, sin timestamps aleatorios como única key.
 * - Longitud ≤ 255 chars (límite del campo alert_key en DB).
 * - Prefijo 'campaign:' para identificar la fuente frente a
 *   'automation:' (Phase 6F).
 *
 * IDEMPOTENCY (§4 de la especificación): la clave incluye la transición de
 * estado consumida (p. ej. 'submitted-for-review'), NO un status "review"
 * genérico — así un evento repetido para la MISMA transición dedupe, pero
 * una campaña que vuelve a pasar por el mismo estado en un ciclo de vida
 * distinto (si el dominio alguna vez lo permitiera) generaría una nueva
 * firma. Hoy el grafo de `canTransitionCampaign` no permite reentrar a
 * review/approved/rejected más de una vez por campaña, así que en la
 * práctica la clave es estable de por vida para esa campaña+evento.
 *
 * Firmas canónicas:
 *   campaign:{orgId}:{campaignId}:submitted-for-review
 *   campaign:{orgId}:{campaignId}:rejected
 *   campaign:{orgId}:{campaignId}:approved
 *   campaign:{orgId}:{campaignId}:ai-provider-failure:{aiErrorKind}
 */

import type { OrganizationId } from '@bop-agency/domain';
import type { CampaignId } from '@bop-agency/domain';
import type { CampaignAutomationType } from './campaign-automation-types';

const PREFIX = 'campaign';
const MAX_KEY_LENGTH = 255;

function buildKey(...parts: string[]): string {
  const key = [PREFIX, ...parts].join(':');
  return key.slice(0, MAX_KEY_LENGTH);
}

/** Firma para "campaña enviada a revisión" — una por campaña. */
export function campaignReviewRequestedKey(
  organizationId: OrganizationId,
  campaignId: CampaignId,
): string {
  return buildKey(String(organizationId), String(campaignId), 'submitted-for-review');
}

/** Firma para "campaña rechazada" — una por campaña (rejected es terminal). */
export function campaignRejectedKey(
  organizationId: OrganizationId,
  campaignId: CampaignId,
): string {
  return buildKey(String(organizationId), String(campaignId), 'rejected');
}

/** Firma para "campaña aprobada" — una por campaña. */
export function campaignApprovedKey(
  organizationId: OrganizationId,
  campaignId: CampaignId,
): string {
  return buildKey(String(organizationId), String(campaignId), 'approved');
}

/**
 * Firma para "fallo de proveedor de IA" al generar/regenerar contenido.
 * Incluye el `aiErrorKind` normalizado para que distintos tipos de fallo
 * (rate limit vs timeout vs external error) no se pisen entre sí, pero
 * reintentos del MISMO tipo de fallo sobre la MISMA campaña actualizan la
 * misma alerta en vez de crear una nueva (evita spam — la alerta se
 * actualiza vía upsertByAlertKey, no se duplica).
 *
 * `scopeId` es un identificador determinístico del "ámbito" del fallo:
 * - `String(campaignId)` cuando la campaña YA existe (regenerateCampaignContent
 *   opera siempre sobre una campaña persistida en 'draft').
 * - `client:{clientId}` cuando el fallo ocurre en `generateCampaignDraftWithAI`
 *   (creación nueva): si la generación falla, NUNCA se persiste una campaña
 *   (ver Campaign.create() — solo se llama tras generación exitosa), así que
 *   no existe un CampaignId todavía y la alerta se agrupa por cliente.
 * - `'unscoped'` como último recurso si tampoco hay clientId disponible.
 */
export function campaignAiProviderFailureKey(
  organizationId: OrganizationId,
  scopeId: string,
  aiErrorKind: string,
): string {
  const safeKind = aiErrorKind.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 50);
  return buildKey(String(organizationId), scopeId, 'ai-provider-failure', safeKind);
}

/**
 * Tags de tarea para deduplicación (mismo patrón que
 * `buildTaskTags`/`buildTaskSignatureTag` de Phase 6F, pero con prefijo
 * `campaign` en vez de `automation`).
 */
export function buildCampaignTaskTags(
  organizationId: OrganizationId,
  campaignId: CampaignId,
  automationType: CampaignAutomationType,
): string[] {
  return [
    'campaign',
    `org:${String(organizationId)}`,
    `campaign-id:${String(campaignId)}`,
    `event:${automationType}`,
  ];
}

/**
 * Tag de firma única para deduplicación de tareas — se busca vía
 * `TaskRepository.findActiveBySignatureTag` antes de crear.
 */
export function buildCampaignTaskSignatureTag(
  organizationId: OrganizationId,
  campaignId: CampaignId,
  automationType: CampaignAutomationType,
): string {
  const normalized = automationType.replace(/[^a-z0-9_-]/g, '-').slice(0, 50);
  return `sig:${String(organizationId)}:${String(campaignId)}:${normalized}`;
}
