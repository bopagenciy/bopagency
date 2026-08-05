/**
 * Payload Schema — Callback de n8n hacia BopIAgency
 *
 * Validación estricta con Zod del payload que n8n envía a
 * /api/webhooks/n8n cuando una ejecución cambia de estado.
 *
 * SEGURIDAD:
 * - eventType tiene whitelist explícita — no se aceptan valores arbitrarios.
 * - errorMessage y outputMetadata son opcionales y se sanitizan antes de persistir.
 * - El schema no acepta campos extra de forma implícita (strict en Zod).
 */
import { z } from 'zod';

// ─── Event types ───────────────────────────────────────────────────────────────

export const N8N_EVENT_TYPES = [
  'execution.started',
  'execution.succeeded',
  'execution.failed',
  'execution.cancelled',
  'execution.retrying',
] as const;

export type N8nEventType = (typeof N8N_EVENT_TYPES)[number];

// ─── Mapping: event type → execution status ───────────────────────────────────

export const EVENT_TYPE_TO_STATUS = {
  'execution.started':   'running',
  'execution.succeeded': 'succeeded',
  'execution.failed':    'failed',
  'execution.cancelled': 'cancelled',
  'execution.retrying':  'retrying',
} as const satisfies Record<N8nEventType, string>;

// ─── Schema ────────────────────────────────────────────────────────────────────

export const N8nCallbackPayloadSchema = z.object({
  /** ID único del evento — mismo que X-Bop-Event-Id (idempotencia) */
  eventId: z.string().min(1).max(255),

  /** Tipo de evento — whitelist explícita */
  eventType: z.enum(N8N_EVENT_TYPES),

  /** ISO 8601 timestamp de cuando ocurrió el evento en n8n */
  timestamp: z.string().datetime({ offset: true }),

  /** ID de la organización en BopIAgency */
  organizationId: z.string().uuid(),

  /** ID de la ejecución en BopIAgency (automation_executions.id) */
  executionId: z.string().uuid(),

  /** ID de la automatización en BopIAgency */
  automationId: z.string().uuid(),

  /** Número del intento (1-based). Debe coincidir o superar el almacenado. */
  attempt: z.number().int().min(1).max(100),

  /**
   * Metadatos de salida sanitizados.
   * n8n incluye aquí solo metadata de ejecución, nunca datos de negocio/PII.
   */
  outputMetadata: z.record(z.unknown()).nullable().optional(),

  /** Código de error estructurado (solo en failed/cancelled) */
  errorCode: z.string().max(100).nullable().optional(),

  /**
   * Mensaje de error para diagnóstico.
   * Se trunca a 500 chars antes de persistir.
   * No debe contener secretos ni PII.
   */
  errorMessage: z.string().max(2_000).nullable().optional(),
});

export type N8nCallbackPayload = z.infer<typeof N8nCallbackPayloadSchema>;

// ─── Validation helper ────────────────────────────────────────────────────────

export type ParsePayloadResult =
  | { ok: true; data: N8nCallbackPayload }
  | { ok: false; issues: string[] };

export function parseCallbackPayload(raw: unknown): ParsePayloadResult {
  const result = N8nCallbackPayloadSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  return { ok: true, data: result.data };
}
