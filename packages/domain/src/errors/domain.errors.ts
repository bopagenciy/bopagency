import { createError, notFound, validationError } from '@bop-agency/shared';
import type { AppError } from '@bop-agency/shared';

// Client errors
export const clientNotFound = (id: string): AppError => notFound(`Client not found: ${id}`);

export const clientSlugTaken = (slug: string): AppError =>
  createError('CONFLICT', `Client slug already in use: ${slug}`);

export const clientDeleted = (id: string): AppError =>
  createError('VALIDATION_ERROR', `Client has been deleted: ${id}`);

// Phase 7D: distinto de clientDeleted — un cliente puede existir (no
// soft-deleted) pero estar en status 'inactive'/'onboarding'/'churned', que
// no debería consumir generación de IA. Ver generateCampaignDraftWithAI.
export const clientInactive = (id: string): AppError =>
  createError('VALIDATION_ERROR', `Client is not active: ${id}`);

export const documentNotFound = (clientId: string, key: string): AppError =>
  notFound(`Document "${key}" not found for client: ${clientId}`);

export const contactNotFound = (clientId: string, contactId: string): AppError =>
  notFound(`Contact ${contactId} not found for client: ${clientId}`);

// Campaign errors
export const campaignNotFound = (id: string): AppError => notFound(`Campaign not found: ${id}`);

export const campaignInvalidStatus = (from: string, to: string): AppError =>
  validationError(`Cannot transition campaign from "${from}" to "${to}"`);

// Campaign approval errors — Phase 7C
export const rejectionNoteRequired = (): AppError =>
  createError('VALIDATION_ERROR', 'A non-empty rejection note is required to reject a campaign.');

// ─── AI Campaign Builder errors — Phase 7D ────────────────────────────────────
//
// Mapean fallos del flujo de generación (validación de input, plataforma no
// soportada, salida de IA inválida, fallo del provider, timeout, rate limit)
// a AppError tipado. El adapter de infraestructura (ClaudeAPIProvider /
// CampaignGeneratorAdapter) NUNCA propaga mensajes crudos del proveedor ni
// stack traces — solo un `safeReason` corto, ya saneado.

// ─── Modelo de error normalizado de IA — Phase 7D.1 ───────────────────────────
//
// `ErrorCode` (@bop-agency/shared) es un union cerrado usado por TODO el
// proyecto (Result<T>, mapError de las Server Actions, etc.); ampliarlo con
// códigos específicos de IA obligaría a revisar cada `switch`/`if` sobre
// `AppError.code` en Phases 1–7 y rompería el contrato ya verificado de 7C/7D/7E.
//
// En su lugar, 7D.1 normaliza el fallo de IA en una dimensión ADITIVA:
// `AppError.details.aiErrorKind`. El `code` sigue siendo el mismo que en 7D
// (EXTERNAL_SERVICE_ERROR / RATE_LIMITED / VALIDATION_ERROR), así que ningún
// consumidor existente cambia de comportamiento; quien necesite distinguir el
// tipo exacto de fallo de IA (observabilidad, futuro fallback, futuro compare
// mode) lee `aiErrorKind` con `getAiErrorKind()`.
//
// SEGURIDAD: `details` NUNCA contiene API keys, headers de autorización, el
// body crudo del proveedor ni stack traces — solo el kind normalizado y, como
// máximo, el providerId (que no es secreto).

export const AI_ERROR_KINDS = [
  'AI_PROVIDER_NOT_CONFIGURED',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'AI_EXTERNAL_SERVICE_ERROR',
  'AI_INVALID_OUTPUT',
  'AI_UNSUPPORTED_PROVIDER',
] as const;

export type AIErrorKind = (typeof AI_ERROR_KINDS)[number];

/** Lee `AppError.details.aiErrorKind` de forma segura (details es `unknown`). */
export function getAiErrorKind(error: AppError): AIErrorKind | null {
  const details = error.details;
  if (details === null || typeof details !== 'object') return null;
  const value = (details as Record<string, unknown>)['aiErrorKind'];
  return typeof value === 'string' && (AI_ERROR_KINDS as readonly string[]).includes(value)
    ? (value as AIErrorKind)
    : null;
}

export const unsupportedCampaignPlatform = (platform: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `AI campaign generation is not supported for platform "${platform}" yet.`,
  );

/**
 * Phase 7D.1 — el providerId solicitado no corresponde a ningún proveedor
 * implementado. `providerId` se incluye en el mensaje solo tras haber sido
 * verificado como string corto por el caller; nunca es un secreto.
 */
export const aiUnsupportedProvider = (providerId: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `AI provider "${providerId}" is not supported.`,
    { aiErrorKind: 'AI_UNSUPPORTED_PROVIDER' satisfies AIErrorKind },
  );

export const campaignGenerationUnavailable = (safeReason: string): AppError =>
  createError(
    'EXTERNAL_SERVICE_ERROR',
    `AI campaign generation is currently unavailable: ${safeReason}`,
    { aiErrorKind: 'AI_PROVIDER_NOT_CONFIGURED' satisfies AIErrorKind },
  );

export const invalidAiOutput = (safeReason: string): AppError =>
  createError(
    'EXTERNAL_SERVICE_ERROR',
    `AI provider returned output that could not be validated: ${safeReason}`,
    { aiErrorKind: 'AI_INVALID_OUTPUT' satisfies AIErrorKind },
  );

export const aiProviderFailure = (safeReason: string): AppError =>
  createError('EXTERNAL_SERVICE_ERROR', `AI provider request failed: ${safeReason}`, {
    aiErrorKind: 'AI_EXTERNAL_SERVICE_ERROR' satisfies AIErrorKind,
  });

export const aiGenerationTimeout = (): AppError =>
  createError('EXTERNAL_SERVICE_ERROR', 'AI campaign generation request timed out.', {
    aiErrorKind: 'AI_TIMEOUT' satisfies AIErrorKind,
  });

export const aiRateLimited = (): AppError =>
  createError('RATE_LIMITED', 'AI provider rate limit exceeded. Try again shortly.', {
    aiErrorKind: 'AI_RATE_LIMITED' satisfies AIErrorKind,
  });

// regenerateCampaignContent (§13) solo opera sobre campañas en 'draft'. No es
// una transición de status (no hay "to" — la campaña permanece en 'draft'),
// por eso NO reutiliza campaignInvalidStatus(from,to), que asume un grafo de
// transición de dos estados.
export const campaignRegenerationNotAllowed = (status: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `Cannot regenerate AI content for a campaign in status "${status}". Only campaigns in "draft" can be regenerated.`,
  );

// Defensa adicional para regenerateCampaignContent: una campaña 'draft'
// creada manualmente (createCampaignDraft, Phase 7B) puede no tener brief
// (campo nullable en el dominio). generateCampaignDraftWithAI SIEMPRE
// requiere un brief no vacío (Zod), así que cualquier campaña generada por
// IA ya lo tiene garantizado — este error solo puede dispararse sobre una
// campaña 'draft' creada sin IA.
// editCampaignDraft (auditoría de completitud Phase 7E) solo opera sobre
// campañas en 'draft'. Igual que `campaignRegenerationNotAllowed`, no es una
// transición de status (no hay "to" — la campaña permanece en 'draft'), por
// eso no reutiliza `campaignInvalidStatus(from,to)`.
export const campaignEditNotAllowed = (status: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `Cannot edit campaign in status "${status}". Only campaigns in "draft" can be edited.`,
  );

export const campaignBriefRequired = (id: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `Campaign ${id} has no brief — a brief is required to generate or regenerate AI content.`,
  );

// Alert errors
export const alertNotFound = (id: string): AppError => notFound(`Alert not found: ${id}`);

export const alertInvalidTransition = (from: string, to: string): AppError =>
  createError('VALIDATION_ERROR', `No se puede transicionar alerta de "${from}" a "${to}"`);

export const alertAlreadyResolved = (id: string): AppError =>
  createError('VALIDATION_ERROR', `La alerta ${id} ya está resuelta`);

// Metric errors
export const metricNotFound = (id: string): AppError => notFound(`Metric not found: ${id}`);

// Report errors
export const reportNotFound = (id: string): AppError => notFound(`Report not found: ${id}`);

// Task errors
export const taskNotFound = (id: string): AppError => notFound(`Task not found: ${id}`);

export const taskInvalidTransition = (from: string, to: string): AppError =>
  createError('VALIDATION_ERROR', `No se puede transicionar tarea de "${from}" a "${to}"`);

export const taskDeleted = (id: string): AppError =>
  createError('VALIDATION_ERROR', `La tarea ${id} fue eliminada`);

// Agent/Skill/Template
export const agentNotFound = (id: string): AppError => notFound(`Agent not found: ${id}`);

export const skillNotFound = (id: string): AppError => notFound(`Skill not found: ${id}`);

export const templateNotFound = (id: string): AppError => notFound(`Template not found: ${id}`);

export const automationNotFound = (id: string): AppError => notFound(`Automation not found: ${id}`);

// Metrics
export const metricsNotFound = (clientId: string, periodId: string): AppError =>
  notFound(`Metrics not found for client ${clientId} in period ${periodId}`);

// Organization errors
export const organizationNotFound = (id: string): AppError =>
  notFound(`Organization not found: ${id}`);

export const organizationSlugTaken = (slug: string): AppError =>
  createError('CONFLICT', `Organization slug already in use: ${slug}`);

export const memberNotFound = (orgId: string, userId: string): AppError =>
  notFound(`Member not found in organization ${orgId}: ${userId}`);

export const notOrganizationMember = (): AppError =>
  createError('FORBIDDEN', 'User is not a member of this organization');

export const insufficientRole = (required: string, current: string): AppError =>
  createError('FORBIDDEN', `Required role "${required}", current role is "${current}"`);

export const invitationNotFound = (token: string): AppError =>
  notFound(`Invitation not found: ${token}`);

export const invitationExpired = (): AppError =>
  createError('VALIDATION_ERROR', 'Invitation has expired');

export const invitationAlreadyAccepted = (): AppError =>
  createError('CONFLICT', 'Invitation has already been accepted');

// Profile errors
export const profileNotFound = (userId: string): AppError =>
  notFound(`Profile not found: ${userId}`);

// ─── Automation status-transition errors (Phase 6E) ───────────────────────────

export const automationInvalidTransition = (from: string, to: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `Cannot transition automation from "${from}" to "${to}". Transition not permitted.`,
  );

// ─── AutomationExecution errors (Phase 6D) ────────────────────────────────────

export const executionNotFound = (id: string): AppError =>
  notFound(`Execution not found: ${id}`);

export const automationNotActive = (id: string, status: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `Automation ${id} is not active (current status: ${status}). Only active automations can be executed.`,
  );

export const invalidExecutionTransition = (from: string, to: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `Cannot transition execution from "${from}" to "${to}". Transition not permitted.`,
  );

export const idempotencyConflict = (key: string): AppError =>
  createError(
    'CONFLICT',
    `An execution with idempotency key "${key}" already exists in this organization.`,
  );

export const dispatchFailed = (safeReason: string): AppError =>
  createError(
    'EXTERNAL_SERVICE_ERROR',
    `Execution dispatch failed: ${safeReason}`,
  );

export const maxAttemptsReached = (attempt: number, max: number): AppError =>
  createError(
    'VALIDATION_ERROR',
    `Maximum retry attempts reached (attempt ${attempt} of ${max}). No further retries are allowed.`,
  );

export const retryNotAllowed = (status: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `Cannot retry an execution in status "${status}". Only failed executions can be retried.`,
  );

export const cancelNotAllowed = (status: string): AppError =>
  createError(
    'VALIDATION_ERROR',
    `Cannot cancel an execution in status "${status}". Only queued or running executions can be cancelled.`,
  );

export const cancelNotSupported = (): AppError =>
  createError(
    'CANCEL_NOT_SUPPORTED',
    'Cannot cancel a running execution: no cancellation gateway is available. ' +
    'Configure a dispatcher that supports remote cancellation to cancel running executions.',
  );

export const cancelRemoteFailed = (safeDetail: string): AppError =>
  createError(
    'EXTERNAL_SERVICE_ERROR',
    `Remote cancellation failed — execution remains running. Safe detail: ${safeDetail}`,
  );
