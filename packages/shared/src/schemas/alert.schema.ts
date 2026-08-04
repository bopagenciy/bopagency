/**
 * Alert schemas — Zod validation for alert Server Actions.
 *
 * Schemas are intentionally minimal: only the fields the Server Action
 * receives from the browser. organizationId is NEVER accepted from the client
 * — it is always resolved server-side from the user's session.
 */

import { z } from 'zod';

export const acknowledgeAlertSchema = z.object({
  alertId: z.string().uuid('El ID de la alerta debe ser un UUID válido'),
});

export const resolveAlertSchema = z.object({
  alertId: z.string().uuid('El ID de la alerta debe ser un UUID válido'),
});

export type AcknowledgeAlertFormValues = z.infer<typeof acknowledgeAlertSchema>;
export type ResolveAlertFormValues = z.infer<typeof resolveAlertSchema>;
