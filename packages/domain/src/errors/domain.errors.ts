import { createError, notFound, validationError } from '@bop-agency/shared';
import type { AppError } from '@bop-agency/shared';

// Client errors
export const clientNotFound = (id: string): AppError => notFound(`Client not found: ${id}`);

export const clientSlugTaken = (slug: string): AppError =>
  createError('CONFLICT', `Client slug already in use: ${slug}`);

export const clientDeleted = (id: string): AppError =>
  createError('VALIDATION_ERROR', `Client has been deleted: ${id}`);

export const documentNotFound = (clientId: string, key: string): AppError =>
  notFound(`Document "${key}" not found for client: ${clientId}`);

export const contactNotFound = (clientId: string, contactId: string): AppError =>
  notFound(`Contact ${contactId} not found for client: ${clientId}`);

// Campaign errors
export const campaignNotFound = (id: string): AppError => notFound(`Campaign not found: ${id}`);

export const campaignInvalidStatus = (from: string, to: string): AppError =>
  validationError(`Cannot transition campaign from "${from}" to "${to}"`);

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
