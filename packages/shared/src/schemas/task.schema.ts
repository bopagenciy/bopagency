/**
 * Task schemas — Zod validation for task Server Actions.
 *
 * Schemas are intentionally minimal: only the fields the Server Action
 * receives from the browser. organizationId is NEVER accepted from the client
 * — it is always resolved server-side from the user's session.
 */

import { z } from 'zod';
import { TASK_STATUSES } from '../constants/status';

/** Enum Zod construido desde la fuente de verdad en constants/status.ts. */
export const taskStatusSchema = z.enum(TASK_STATUSES, {
  errorMap: () => ({ message: 'Estado de tarea inválido' }),
});

export const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid('El ID de la tarea debe ser un UUID válido'),
  status: taskStatusSchema,
});

export type UpdateTaskStatusFormValues = z.infer<typeof updateTaskStatusSchema>;
