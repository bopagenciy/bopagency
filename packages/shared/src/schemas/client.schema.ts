import { z } from 'zod';
import { SlugSchema, PaginationSchema } from './common.schema';

// ─── Constants ────────────────────────────────────────────────────────────────

export const CLIENT_STATUSES = ['active', 'inactive', 'onboarding', 'churned'] as const;

export const CLIENT_INDUSTRIES = [
  'hospitality',
  'legal',
  'ecommerce',
  'retail',
  'healthcare',
  'technology',
  'education',
  'real_estate',
  'finance',
  'food_beverage',
  'other',
] as const;

export const CLIENT_CURRENCIES = ['USD', 'COP', 'MXN', 'EUR'] as const;

export const DOCUMENT_STATUSES = ['draft', 'published', 'archived'] as const;

// ─── createClientSchema ───────────────────────────────────────────────────────

export const createClientSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(200, 'Máximo 200 caracteres'),
  legalName: z.string().trim().min(1).max(300).nullable().optional(),
  slug: SlugSchema.max(100).optional(),
  status: z.enum(CLIENT_STATUSES).default('active'),
  industry: z.enum(CLIENT_INDUSTRIES).nullable().optional(),
  timezone: z.string().min(1).max(50).default('America/Bogota'),
  currency: z.enum(CLIENT_CURRENCIES).default('COP'),
  website: z.string().trim().url('URL inválida').nullable().optional(),
  email: z.string().trim().email('Email inválido').nullable().optional(),
  phone: z.string().trim().min(1).max(30).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type CreateClientFormValues = z.infer<typeof createClientSchema>;

// ─── updateClientSchema ───────────────────────────────────────────────────────

export const updateClientSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  legalName: z.string().trim().min(1).max(300).nullable().optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  industry: z.enum(CLIENT_INDUSTRIES).nullable().optional(),
  timezone: z.string().min(1).max(50).optional(),
  currency: z.enum(CLIENT_CURRENCIES).optional(),
  website: z.string().trim().url('URL inválida').nullable().optional(),
  email: z.string().trim().email('Email inválido').nullable().optional(),
  phone: z.string().trim().min(1).max(30).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateClientFormValues = z.infer<typeof updateClientSchema>;

// ─── clientFilterSchema ───────────────────────────────────────────────────────

export const clientFilterSchema = z
  .object({
    status: z.enum(CLIENT_STATUSES).optional(),
    industry: z.enum(CLIENT_INDUSTRIES).optional(),
    search: z.string().trim().max(200).optional(),
    includeDeleted: z.coerce.boolean().default(false),
  })
  .merge(PaginationSchema);

export type ClientFilterValues = z.infer<typeof clientFilterSchema>;

// ─── upsertClientDocumentSchema ───────────────────────────────────────────────

export const upsertClientDocumentSchema = z.object({
  documentKey: z
    .string()
    .regex(/^[a-z0-9_-]+$/, 'Solo letras minúsculas, números, guiones y guiones bajos')
    .min(1)
    .max(100),
  title: z.string().trim().min(1, 'El título es requerido').max(200),
  category: z.string().trim().min(1).max(50).default('general'),
  content: z.string().default(''),
  status: z.enum(DOCUMENT_STATUSES).default('draft'),
});

export type UpsertClientDocumentFormValues = z.infer<typeof upsertClientDocumentSchema>;
