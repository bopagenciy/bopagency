/**
 * Publication Webhook Callback Payload Schema — Phase 8B.3.
 */

import { z } from 'zod';
import { ACTIVATION_PROVIDERS } from '@bop-agency/shared';

export const publicationWebhookCallbackPayloadSchema = z.object({
  jobId: z.string().uuid(),
  organizationId: z.string().uuid(),
  provider: z.enum(ACTIVATION_PROVIDERS),
  externalEventId: z.string().min(1),
  outcome: z.enum(['succeeded', 'failed', 'unknown_outcome']).nullable().optional(),
  externalId: z.string().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  failureCategory: z.string().nullable().optional(),
  providerErrorCode: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export type PublicationWebhookCallbackPayload = z.infer<typeof publicationWebhookCallbackPayloadSchema>;

export function parsePublicationWebhookCallbackPayload(
  data: unknown,
): { ok: true; data: PublicationWebhookCallbackPayload } | { ok: false; error: string } {
  const result = publicationWebhookCallbackPayloadSchema.safeParse(data);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, data: result.data };
}
