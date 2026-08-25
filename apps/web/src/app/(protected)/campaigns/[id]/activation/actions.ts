'use server';

/**
 * Campaign Activation Server Actions — Phase 8A.3.
 *
 * Mutaciones y lecturas seguras para el flujo de activación manual, expuesto
 * en `/campaigns/[id]/activation`. Envuelve los use cases de Phase 8A.2
 * (packages/application/src/use-cases/activations) — mismo patrón que
 * apps/web/src/app/(protected)/campaigns/actions.ts (Phase 7E).
 *
 * ALCANCE 8A.3 (léase junto con
 * docs/implementation/phase-8/PHASE_8A3_WEB_MANUAL_OPERATIONS_REPORT.md):
 * - "Marcar publicado" (markActivationTargetPublishedAction) es una
 *   confirmación MANUAL de que el contenido se publicó FUERA de la
 *   plataforma (Meta/Google/LinkedIn/email real) — NUNCA dispara ninguna
 *   llamada a un API de proveedor. Ningún Server Action de este archivo
 *   contacta un proveedor externo.
 * - Este archivo NO auto-crea activaciones al aprobar una campaña ni
 *   cambia `campaign.status` — esa regla vive en el use case
 *   (createCampaignActivation, ver su doc) y aquí solo se re-expone.
 *
 * Rol mínimo por acción (matriz Phase 8A.2 — re-verificada también dentro
 * de cada use case vía `organizationRepository.findMember` +
 * `hasMinimumRole`, exactamente igual que en campaigns/actions.ts §doc):
 *   - createCampaignActivationAction:      strategist+
 *   - addCampaignActivationTargetAction:   strategist+
 *   - cancelActivationTargetAction:        strategist+
 *   - cancelCampaignActivationAction:      strategist+
 *   - prepareActivationTargetAction:       operator+
 *   - markActivationTargetReadyAction:     operator+
 *   - markActivationTargetPublishedAction: operator+
 *   - lecturas (get/list*):                viewer+ (cualquier miembro activo)
 *
 * Seguridad (mismo criterio que campaigns/actions.ts):
 * - organizationId SIEMPRE se obtiene de la sesión del servidor.
 * - actorUserId NUNCA se acepta del cliente — se resuelve de la sesión.
 * - Doble capa de autorización: `getOrgContext(requiredRole)` (este
 *   archivo) verifica el rol mínimo primero (fail-fast); los use cases de
 *   8A.2 vuelven a verificarlo internamente — ninguna acción confía
 *   únicamente en esta capa.
 * - revalidatePath solo en éxito.
 * - Errores técnicos (Postgres, RLS, etc.) nunca se exponen al cliente —
 *   solo mensajes ya saneados por `mapError`.
 * - NO se usa service_role en ningún punto.
 */

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireOrganizationRole, requireOrganization } from '@/lib/auth/server';
import type { OrganizationContext } from '@/lib/auth/server';
import { createActivationComposition } from '@/lib/composition/activation.composition';
import type {
  OrganizationId,
  CampaignId,
  CampaignActivationId,
  CampaignActivationTargetId,
  ClientId,
} from '@bop-agency/domain';
import type { AppError } from '@bop-agency/shared';

// ─── Result type ──────────────────────────────────────────────────────────────

type ActionSuccess<T = undefined> = { ok: true; data?: T };
type ActionFailure = { ok: false; error: string; code: string };
export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resuelve el contexto de organización exigiendo un rol mínimo, sin
 * redirigir — mismo helper/criterio que `getOrgContext` en
 * campaigns/actions.ts (las Server Actions de este archivo también se
 * invocan desde componentes cliente vía `useTransition`).
 */
async function getOrgContext(
  requiredRole: Parameters<typeof requireOrganizationRole>[0],
): Promise<{ ok: true; context: OrganizationContext } | ActionFailure> {
  try {
    const context = await requireOrganizationRole(requiredRole);
    return { ok: true, context };
  } catch {
    return { ok: false, error: 'Sin permisos para esta acción', code: 'FORBIDDEN' };
  }
}

/**
 * Contexto de organización SIN rol mínimo — para lecturas, cualquier
 * miembro activo (viewer+) puede consultar. El use case vuelve a verificar
 * membresía vía `organizationRepository.findMember`.
 */
async function getReadOrgContext(): Promise<
  { ok: true; context: OrganizationContext } | ActionFailure
> {
  try {
    const context = await requireOrganization();
    return { ok: true, context };
  } catch {
    return { ok: false, error: 'Sin permisos para esta acción', code: 'FORBIDDEN' };
  }
}

/**
 * Traduce un `AppError` a un mensaje seguro para el usuario final.
 * Nunca reenvía `error.message` crudo salvo para los códigos cuyo mensaje
 * ya está garantizado como texto de negocio saneado (VALIDATION_ERROR,
 * CONFLICT) por los use cases de 8A.2 — mismo criterio que
 * campaigns/actions.ts `mapError`.
 */
function mapError(error: AppError): ActionFailure {
  const { code, message } = error;

  if (code === 'NOT_FOUND') {
    return { ok: false, error: 'Activación o target no encontrado', code };
  }
  if (code === 'VALIDATION_ERROR') return { ok: false, error: message, code };
  if (code === 'FORBIDDEN') return { ok: false, error: 'Sin permisos para esta acción', code };
  if (code === 'CONFLICT') return { ok: false, error: message, code };
  return { ok: false, error: 'Error interno. Intenta de nuevo.', code: 'INTERNAL_ERROR' };
}

function revalidateActivation(campaignId: string, activationId?: string) {
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/activation`);
  if (activationId) {
    // Reservado por si en el futuro la activación tiene su propia URL
    // independiente de la campaña (no existe en 8A.3, solo defensivo).
    void activationId;
  }
}

// ─── createCampaignActivationAction ────────────────────────────────────────────

/**
 * Crea una CampaignActivation a partir de una campaña `approved` — SIEMPRE
 * una acción explícita del usuario (NUNCA disparada por
 * `approveCampaignAction`). Rol mínimo: strategist.
 */
export async function createCampaignActivationAction(payload: {
  campaignId: string;
  notes?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await getOrgContext('strategist');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.createCampaignActivation({
    campaignId: payload.campaignId,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
    notes: payload.notes ?? null,
  });

  if (!result.success) return mapError(result.error);

  revalidateActivation(payload.campaignId, result.value.id);
  return { ok: true, data: { id: result.value.id } };
}

// ─── addCampaignActivationTargetAction ─────────────────────────────────────────

/**
 * Agrega un target manual a una activación. En 8A.3 la UI solo ofrece
 * `channel: 'manual'` / `provider: 'manual'` (los canales con proveedor
 * real — meta_ads, google_ads, linkedin_ads, email — requieren
 * `client_integration` e integraciones externas fuera de alcance de esta
 * fase; el dominio/use case ya los soporta para 8B+). Rol mínimo: strategist.
 */
export async function addCampaignActivationTargetAction(payload: {
  campaignId: string;
  activationId: string;
  channel: string;
  provider: string;
  placement?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await getOrgContext('strategist');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.addCampaignActivationTarget({
    activationId: payload.activationId,
    channel: payload.channel,
    provider: payload.provider,
    placement: payload.placement ?? null,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidateActivation(payload.campaignId, payload.activationId);
  return { ok: true, data: { id: result.value.id } };
}

// ─── prepareActivationTargetAction ─────────────────────────────────────────────

/**
 * pending → preparing. Rol mínimo: operator (operación manual de canal).
 */
export async function prepareActivationTargetAction(payload: {
  campaignId: string;
  targetId: string;
}): Promise<ActionResult> {
  const ctx = await getOrgContext('operator');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.prepareActivationTarget({
    targetId: payload.targetId,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidateActivation(payload.campaignId);
  return { ok: true };
}

// ─── markActivationTargetReadyAction ───────────────────────────────────────────

/**
 * preparing → ready. Rol mínimo: operator.
 */
export async function markActivationTargetReadyAction(payload: {
  campaignId: string;
  targetId: string;
}): Promise<ActionResult> {
  const ctx = await getOrgContext('operator');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.markActivationTargetReady({
    targetId: payload.targetId,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidateActivation(payload.campaignId);
  return { ok: true };
}

// ─── markActivationTargetPublishedAction ───────────────────────────────────────

/**
 * ready|scheduled → published. Confirma MANUALMENTE que el contenido se
 * publicó fuera de la plataforma (Meta/Google/LinkedIn/email reales, o
 * cualquier medio manual) — esta acción NUNCA llama a un API de proveedor
 * externo, solo registra la confirmación humana. Rol mínimo: operator.
 */
export async function markActivationTargetPublishedAction(payload: {
  campaignId: string;
  targetId: string;
  externalReference?: string | null;
  note?: string | null;
}): Promise<ActionResult> {
  const ctx = await getOrgContext('operator');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.markActivationTargetPublished({
    targetId: payload.targetId,
    externalReference: payload.externalReference ?? null,
    note: payload.note ?? null,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidateActivation(payload.campaignId);
  return { ok: true };
}

// ─── cancelActivationTargetAction ──────────────────────────────────────────────

/**
 * Cancela un target individual (razón obligatoria). Rol mínimo: strategist.
 */
export async function cancelActivationTargetAction(payload: {
  campaignId: string;
  targetId: string;
  reason: string;
}): Promise<ActionResult> {
  const ctx = await getOrgContext('strategist');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.cancelActivationTarget({
    targetId: payload.targetId,
    reason: payload.reason,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidateActivation(payload.campaignId);
  return { ok: true };
}

// ─── cancelCampaignActivationAction ────────────────────────────────────────────

/**
 * Cancela la activación completa (razón obligatoria) — solo permitido antes
 * de `executing` (ver `canCancelActivation`, domain). Rol mínimo: strategist
 * — operator NUNCA puede cancelar una activación completa (§5 del kickoff:
 * "operator: manual target operations only ... no activation cancellation").
 */
export async function cancelCampaignActivationAction(payload: {
  campaignId: string;
  activationId: string;
  reason: string;
}): Promise<ActionResult> {
  const ctx = await getOrgContext('strategist');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.cancelCampaignActivation({
    activationId: payload.activationId,
    reason: payload.reason,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidateActivation(payload.campaignId, payload.activationId);
  return { ok: true };
}

// ─── Lecturas ───────────────────────────────────────────────────────────────────
//
// Expuestas como Server Actions (además de invocarse directamente desde el
// Server Component de la página) para permitir refetch desde componentes
// cliente (ej. tras un `router.refresh()` fallido, o polling futuro) sin
// duplicar lógica de composición. Rol mínimo: cualquier miembro activo
// (viewer+) — una lectura pura NUNCA crea tasks/alerts ni efectos
// secundarios (ver use cases 8A.2, ninguno de los *read* llama a
// `evalActivationCreatedSignalSilently` ni equivalente).


/**
 * Construye `PaginationParams` solo con las claves realmente provistas —
 * requerido por `exactOptionalPropertyTypes: true` (un `{ page: undefined }`
 * explícito no es asignable a `page?: number`).
 */
function buildPagination(page?: number, pageSize?: number) {
  return {
    ...(page !== undefined && { page }),
    ...(pageSize !== undefined && { pageSize }),
  };
}

export async function getCampaignActivationAction(payload: {
  activationId: string;
}): Promise<ActionResult<unknown>> {
  const ctx = await getReadOrgContext();
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.getCampaignActivation({
    activationId: payload.activationId as CampaignActivationId,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);
  return { ok: true, data: result.value };
}

export async function listCampaignActivationsByCampaignAction(payload: {
  campaignId: string;
  page?: number;
  pageSize?: number;
}): Promise<ActionResult<unknown>> {
  const ctx = await getReadOrgContext();
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.listCampaignActivationsByCampaign({
    campaignId: payload.campaignId as CampaignId,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
    pagination: buildPagination(payload.page, payload.pageSize),
  });

  if (!result.success) return mapError(result.error);
  return { ok: true, data: result.value };
}

export async function listCampaignActivationsByClientAction(payload: {
  clientId: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<ActionResult<unknown>> {
  const ctx = await getReadOrgContext();
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.listCampaignActivationsByClient({
    clientId: payload.clientId as ClientId,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
    ...(payload.status !== undefined && { status: payload.status as never }),
    pagination: buildPagination(payload.page, payload.pageSize),
  });

  if (!result.success) return mapError(result.error);
  return { ok: true, data: result.value };
}

export async function getActivationWithTargetsAndEventsAction(payload: {
  activationId: string;
  eventsPage?: number;
  eventsPageSize?: number;
}): Promise<ActionResult<unknown>> {
  const ctx = await getReadOrgContext();
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createActivationComposition(supabase);

  const result = await useCases.getActivationWithTargetsAndEvents({
    activationId: payload.activationId as CampaignActivationId,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
    eventsPagination: buildPagination(payload.eventsPage, payload.eventsPageSize),
  });

  if (!result.success) return mapError(result.error);
  return { ok: true, data: result.value };
}

// Re-exported for components that need to reference branded ID/type helpers
// without importing @bop-agency/domain directly in client components.
export type { CampaignActivationId, CampaignActivationTargetId };
