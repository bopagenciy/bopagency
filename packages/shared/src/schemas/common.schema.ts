import { z } from 'zod';

export const IdSchema = z.string().min(1).max(255);

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const DateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const SlugSchema = z.string().regex(/^[a-z0-9-]+$/, {
  message: 'Solo se permiten letras minúsculas, números y guiones',
});
