/**
 * Automation schemas — Zod validation for automation Server Actions.
 *
 * Schemas son intencionalmente mínimos: solo los campos que el Server Action
 * recibe del navegador. organizationId NUNCA se acepta del cliente.
 */

import { z } from 'zod';

// ─── Automation ID ────────────────────────────────────────────────────────────

export const automationIdSchema = z.string().min(1, 'El ID de automatización es requerido').max(255);
export const executionIdSchema = z.string().min(1, 'El ID de ejecución es requerido').max(255);

// ─── Automation status transitions ────────────────────────────────────────────

export const activateAutomationSchema = z.object({
  automationId: automationIdSchema,
});

export const pauseAutomationSchema = z.object({
  automationId: automationIdSchema,
});

export const archiveAutomationSchema = z.object({
  automationId: automationIdSchema,
});

// ─── Execution actions ────────────────────────────────────────────────────────

export const startExecutionSchema = z.object({
  automationId: automationIdSchema,
  /**
   * Metadatos opcionales para la ejecución.
   * El servidor los sanitizará antes de persistir.
   */
  metadata: z.record(z.unknown()).optional(),
});

export const cancelExecutionSchema = z.object({
  executionId: executionIdSchema,
});

export const retryExecutionSchema = z.object({
  executionId: executionIdSchema,
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type ActivateAutomationFormValues = z.infer<typeof activateAutomationSchema>;
export type PauseAutomationFormValues = z.infer<typeof pauseAutomationSchema>;
export type ArchiveAutomationFormValues = z.infer<typeof archiveAutomationSchema>;
export type StartExecutionFormValues = z.infer<typeof startExecutionSchema>;
export type CancelExecutionFormValues = z.infer<typeof cancelExecutionSchema>;
export type RetryExecutionFormValues = z.infer<typeof retryExecutionSchema>;
