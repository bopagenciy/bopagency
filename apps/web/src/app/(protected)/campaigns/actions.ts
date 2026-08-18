'use server';

/**
 * Campaign Studio Server Actions — Phase 7E
 *
 * Mutaciones seguras para Campaign Studio:
 *
 * Creación (rol mínimo operator):
 *   createCampaignDraftAction        — creación manual (sin IA), Phase 7B.
 *   generateCampaignDraftWithAiAction — creación vía IA, Phase 7D.
 *   regenerateCampaignContentAction   — reemplaza generated_content de un draft, Phase 7D.
 *   editCampaignDraftAction           — edita campos de un draft (nunca status/IA), Phase 7E cierre.
 *
 * Workflow de aprobación (Phase 7C):
 *   submitCampaignForReviewAction — rol mínimo operator.
 *   approveCampaignAction         — rol mínimo admin.
 *   rejectCampaignAction          — rol mínimo admin.
 *
 * Seguridad (mismo patrón que apps/web/src/app/(protected)/automations/actions.ts):
 * - organizationId SIEMPRE se obtiene de la sesión del servidor.
 * - actorUserId/createdBy se obtienen de la sesión (nunca del cliente).
 * - Validación Zod ocurre dentro de cada use case (defensa adicional aquí no
 *   es necesaria — mismo criterio que automations/actions.ts, que delega en
 *   el use case).
 * - Doble capa de autorización: `getOrgContext(requiredRole)` (este archivo)
 *   verifica el rol mínimo primero (fail-fast, sin redirect); los use cases
 *   de 7C/7D (organizationRepository.findMember + hasMinimumRole) vuelven a
 *   verificarlo — ninguna acción confía únicamente en una capa.
 * - revalidatePath solo en éxito.
 * - Errores técnicos no se exponen al cliente — solo mensajes ya saneados
 *   por los use cases (AppError.message nunca contiene texto crudo de IA o
 *   de Postgres, ver domain.errors.ts).
 * - NO se usa service_role en ningún punto.
 *
 * Phase 7D.1 — selección de proveedor de IA:
 * - El `provider` SÍ puede venir del formulario, pero se valida contra el enum
 *   cerrado `AIProviderId` (`isAIProviderId`) ANTES de llegar al use case, que
 *   vuelve a validarlo con Zod (`z.enum(AI_PROVIDER_IDS)`) — dos capas.
 * - NUNCA se acepta desde el browser: la API key, el modelo, ni una URL de API.
 *   El modelo se resuelve server-side por proveedor
 *   (`ai-provider-config.ts`), y las keys las lee cada provider de
 *   `process.env` en el momento de la llamada.
 */

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireOrganizationRole } from '@/lib/auth/server';
import type { OrganizationContext } from '@/lib/auth/server';
import { createCampaignComposition } from '@/lib/composition/campaign.composition';
import type { CampaignId, OrganizationId, ClientId, CampaignObjective } from '@bop-agency/domain';
import { getAiErrorKind } from '@bop-agency/domain';
import type { AppError, AdPlatform, AIProviderId } from '@bop-agency/shared';
import { isAIProviderId } from '@bop-agency/shared';

// ─── Result type ──────────────────────────────────────────────────────────────

type ActionSuccess<T = undefined> = { ok: true; data?: T };
type ActionFailure = { ok: false; error: string; code: string };
export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resuelve el contexto de organización exigiendo un rol mínimo, sin
 * redirigir (a diferencia de `requireOrganizationRole` crudo) — las Server
 * Actions de este archivo se invocan desde componentes cliente vía
 * `useTransition`, así que un rechazo de permisos debe volver como
 * `ActionResult` renderizable, no como una navegación forzada.
 *
 * El rol exigido aquí es una primera capa (fail-fast, mensaje amigable); los
 * use cases de 7C (submit/approve/reject) y 7D (generate/regenerate) vuelven
 * a verificar el mismo mínimo internamente vía `organizationRepository
 * .findMember` + `hasMinimumRole` — ninguna acción confía únicamente en esta
 * capa (mismo criterio de defensa en profundidad que el resto del proyecto).
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
 * Normaliza el `provider` recibido del formulario. `undefined`/'' significan
 * "usar el predeterminado del servidor" (opción explícita del selector de UI).
 * Cualquier otro valor no reconocido es un intento de inyectar un proveedor
 * arbitrario y se rechaza como error de validación — nunca se ignora en
 * silencio ni se cae al default (§15/§19).
 */
function normalizeProvider(
  raw: string | undefined,
): { ok: true; provider?: AIProviderId } | ActionFailure {
  if (raw === undefined || raw === '') return { ok: true };
  if (!isAIProviderId(raw)) {
    return { ok: false, error: 'Proveedor de IA no válido.', code: 'VALIDATION_ERROR' };
  }
  return { ok: true, provider: raw };
}

/**
 * Traduce un `AppError` a un mensaje que el usuario final pueda entender y
 * accionar.
 *
 * Phase 7D.1.1 — antes, los errores de IA se propagaban con `AppError.message`
 * tal cual: cadenas técnicas en inglés como "AI campaign generation request
 * timed out." o "AI provider request failed: status 503 (UNAVAILABLE)". Estaban
 * saneadas (sin keys ni body crudo), pero no le dicen nada útil a quien está
 * usando el Campaign Studio.
 *
 * Ahora se mapea por `aiErrorKind` (la dimensión normalizada que 7D.1 añadió a
 * `details`), no por el texto del mensaje — así el copy no depende de cómo
 * redacte el error una capa interna.
 *
 * Los `details` internos (provider, statusCode, attempts, aiErrorKind) NO se
 * envían al cliente: siguen disponibles en los logs del servidor y en los tests.
 * Y nunca contienen API keys, headers ni el body del proveedor.
 */
const AI_ERROR_MESSAGES: Record<string, string> = {
  AI_TIMEOUT: 'La generación con IA tardó más de lo esperado. Intenta nuevamente.',
  AI_RATE_LIMITED:
    'El proveedor de IA está temporalmente limitado. Intenta nuevamente en unos momentos.',
  AI_EXTERNAL_SERVICE_ERROR:
    'El proveedor de IA no está disponible temporalmente. Intenta nuevamente.',
  AI_PROVIDER_NOT_CONFIGURED:
    'El proveedor de IA seleccionado no está configurado en el servidor. Elige otro proveedor o avisa a un administrador.',
  AI_INVALID_OUTPUT:
    'La IA devolvió un resultado que no pudimos interpretar. Intenta nuevamente o ajusta el brief.',
  AI_UNSUPPORTED_PROVIDER: 'El proveedor de IA seleccionado no está disponible.',
};

function mapError(error: AppError): ActionFailure {
  const { code, message } = error;

  // 1. Errores de IA — copy amigable por tipo normalizado, nunca el texto técnico.
  const aiErrorKind = getAiErrorKind(error);
  if (aiErrorKind !== null) {
    const friendly = AI_ERROR_MESSAGES[aiErrorKind];
    if (friendly !== undefined) {
      return { ok: false, error: friendly, code };
    }
  }

  if (code === 'NOT_FOUND') return { ok: false, error: 'Campaña o cliente no encontrado', code };
  if (code === 'VALIDATION_ERROR') return { ok: false, error: message, code };
  if (code === 'FORBIDDEN') return { ok: false, error: 'Sin permisos para esta acción', code };
  if (code === 'CONFLICT') return { ok: false, error: message, code };
  if (code === 'RATE_LIMITED') {
    return {
      ok: false,
      error: AI_ERROR_MESSAGES['AI_RATE_LIMITED'] as string,
      code,
    };
  }
  if (code === 'EXTERNAL_SERVICE_ERROR') {
    // Servicio externo sin `aiErrorKind` (p. ej. n8n en otro flujo): mensaje
    // genérico, nunca el texto interno.
    return {
      ok: false,
      error: AI_ERROR_MESSAGES['AI_EXTERNAL_SERVICE_ERROR'] as string,
      code,
    };
  }
  return { ok: false, error: 'Error interno. Intenta de nuevo.', code: 'INTERNAL_ERROR' };
}

// ─── createCampaignDraftAction ────────────────────────────────────────────────

export type CreateCampaignDraftPayload = {
  clientId: string;
  name: string;
  platform: string;
  objective: string;
  brief?: string | null;
  budget: number;
  currency?: string;
  startDate?: string | null;
  endDate?: string | null;
};

/**
 * Crea una campaña manualmente (sin IA), en status 'draft'.
 * Rol mínimo: operator.
 */
export async function createCampaignDraftAction(
  payload: CreateCampaignDraftPayload,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await getOrgContext('operator');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createCampaignComposition(supabase);

  const result = await useCases.createCampaignDraft({
    organizationId: organization.id as OrganizationId,
    clientId: payload.clientId,
    name: payload.name,
    platform: payload.platform,
    objective: payload.objective,
    brief: payload.brief ?? null,
    budget: payload.budget,
    ...(payload.currency !== undefined && { currency: payload.currency }),
    startDate: payload.startDate ? new Date(payload.startDate) : null,
    endDate: payload.endDate ? new Date(payload.endDate) : null,
    createdBy: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidatePath('/campaigns');
  return { ok: true, data: { id: result.value.id } };
}

// ─── generateCampaignDraftWithAiAction ────────────────────────────────────────

export type GenerateCampaignDraftWithAiPayload = {
  clientId: string;
  /** Phase 7D.1.1 — opcional; si viene, es la fuente de verdad del nombre. */
  name?: string;
  platform: string;
  objective: string;
  brief: string;
  budget: number;
  currency?: string;
  startDate?: string | null;
  endDate?: string | null;
  language?: string;
  market?: string;
  /** Phase 7D.1 — 'openai' | 'gemini' | 'anthropic'. Omitir/'' = predeterminado del servidor. */
  provider?: string;
};

/**
 * Genera una propuesta de campaña vía IA y la persiste en status 'draft'.
 * NUNCA aprueba ni envía a revisión automáticamente. Rol mínimo: operator.
 */
export async function generateCampaignDraftWithAiAction(
  payload: GenerateCampaignDraftWithAiPayload,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await getOrgContext('operator');
  if (!ctx.ok) return ctx;
  const providerResult = normalizeProvider(payload.provider);
  if (!providerResult.ok) return providerResult;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createCampaignComposition(supabase);

  const result = await useCases.generateCampaignDraftWithAI({
    clientId: payload.clientId,
    ...(payload.name !== undefined && payload.name.trim().length > 0 && { name: payload.name }),
    platform: payload.platform,
    objective: payload.objective,
    brief: payload.brief,
    budget: payload.budget,
    ...(payload.currency !== undefined && { currency: payload.currency }),
    startDate: payload.startDate ? new Date(payload.startDate) : null,
    endDate: payload.endDate ? new Date(payload.endDate) : null,
    ...(payload.language !== undefined && { language: payload.language }),
    ...(payload.market !== undefined && { market: payload.market }),
    ...(providerResult.provider !== undefined && { provider: providerResult.provider }),
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidatePath('/campaigns');
  return { ok: true, data: { id: result.value.id } };
}

// ─── regenerateCampaignContentAction ──────────────────────────────────────────

export type RegenerateCampaignContentPayload = {
  campaignId: string;
  language?: string;
  market?: string;
  /**
   * Phase 7D.1 — omitir/'' reutiliza el proveedor con el que se generó la
   * campaña originalmente (`metadata.ai.provider`), resuelto en el use case.
   */
  provider?: string;
};

/**
 * Reemplaza el contenido generado de una campaña que sigue en 'draft'.
 * Rol mínimo: operator.
 */
export async function regenerateCampaignContentAction(
  payload: RegenerateCampaignContentPayload,
): Promise<ActionResult> {
  const ctx = await getOrgContext('operator');
  if (!ctx.ok) return ctx;
  const providerResult = normalizeProvider(payload.provider);
  if (!providerResult.ok) return providerResult;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createCampaignComposition(supabase);

  const result = await useCases.regenerateCampaignContent({
    campaignId: payload.campaignId,
    ...(payload.language !== undefined && { language: payload.language }),
    ...(payload.market !== undefined && { market: payload.market }),
    ...(providerResult.provider !== undefined && { provider: providerResult.provider }),
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidatePath(`/campaigns/${payload.campaignId}`);
  return { ok: true };
}

// ─── editCampaignDraftAction ───────────────────────────────────────────────────

export type EditCampaignDraftPayload = {
  campaignId: string;
  name?: string;
  platform?: string;
  objective?: string;
  brief?: string | null;
  budget?: number;
  currency?: string;
  startDate?: string | null;
  endDate?: string | null;
};

/**
 * Edita los campos editables de una campaña en 'draft' (auditoría de
 * completitud Phase 7E — draft edit flow). NUNCA cambia status,
 * generatedContent, ni metadata.ai; no toca approval history; no envía a
 * revisión ni regenera IA. Rol mínimo: operator.
 */
export async function editCampaignDraftAction(
  payload: EditCampaignDraftPayload,
): Promise<ActionResult> {
  const ctx = await getOrgContext('operator');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createCampaignComposition(supabase);

  const result = await useCases.editCampaignDraft({
    campaignId: payload.campaignId,
    ...(payload.name !== undefined && { name: payload.name }),
    ...(payload.platform !== undefined && { platform: payload.platform }),
    ...(payload.objective !== undefined && { objective: payload.objective }),
    ...(payload.brief !== undefined && { brief: payload.brief }),
    ...(payload.budget !== undefined && { budget: payload.budget }),
    ...(payload.currency !== undefined && { currency: payload.currency }),
    ...(payload.startDate !== undefined && {
      startDate: payload.startDate ? new Date(payload.startDate) : null,
    }),
    ...(payload.endDate !== undefined && {
      endDate: payload.endDate ? new Date(payload.endDate) : null,
    }),
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${payload.campaignId}`);
  return { ok: true };
}

// ─── submitCampaignForReviewAction ────────────────────────────────────────────

/**
 * Envía una campaña draft a revisión (draft → review).
 * Rol mínimo: operator.
 */
export async function submitCampaignForReviewAction(payload: {
  campaignId: string;
}): Promise<ActionResult> {
  const ctx = await getOrgContext('operator');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createCampaignComposition(supabase);

  const result = await useCases.submitCampaignForReview({
    campaignId: payload.campaignId,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${payload.campaignId}`);
  return { ok: true };
}

// ─── approveCampaignAction ─────────────────────────────────────────────────────

/**
 * Aprueba una campaña en revisión (review → approved).
 * Rol mínimo: admin. La autoridad final es la RPC `approve_campaign` (RLS/SECURITY DEFINER).
 */
export async function approveCampaignAction(payload: {
  campaignId: string;
}): Promise<ActionResult> {
  const ctx = await getOrgContext('admin');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createCampaignComposition(supabase);

  const result = await useCases.approveCampaign({
    campaignId: payload.campaignId,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${payload.campaignId}`);
  return { ok: true };
}

// ─── rejectCampaignAction ───────────────────────────────────────────────────────

/**
 * Rechaza una campaña en revisión (review → rejected). Nota obligatoria.
 * Rol mínimo: admin. La autoridad final es la RPC `reject_campaign` (RLS/SECURITY DEFINER).
 */
export async function rejectCampaignAction(payload: {
  campaignId: string;
  note: string;
}): Promise<ActionResult> {
  const ctx = await getOrgContext('admin');
  if (!ctx.ok) return ctx;
  const { user, organization } = ctx.context;
  const supabase = await createServerSupabaseClient();
  const { useCases } = createCampaignComposition(supabase);

  const result = await useCases.rejectCampaign({
    campaignId: payload.campaignId,
    note: payload.note,
    organizationId: organization.id as OrganizationId,
    actorUserId: user.id,
  });

  if (!result.success) return mapError(result.error);

  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${payload.campaignId}`);
  return { ok: true };
}

// Re-exported for components that need to reference branded ID/type helpers
// without importing @bop-agency/domain directly in client components.
export type { CampaignId, ClientId, AdPlatform, CampaignObjective, AIProviderId };
