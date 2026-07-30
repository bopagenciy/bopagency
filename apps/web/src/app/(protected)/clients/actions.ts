'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireOrganizationRole } from '@/lib/auth/server';
import { SupabaseClientRepository } from '@bop-agency/infrastructure';
import {
  createClient,
  updateClient,
  softDeleteClient,
  upsertClientDocument,
} from '@bop-agency/application';
import { consoleLogger } from '@bop-agency/infrastructure';
import {
  createClientSchema,
  updateClientSchema,
  upsertClientDocumentSchema,
} from '@bop-agency/shared';
import type { ClientId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';

// ─── Discriminated result type ────────────────────────────────────────────────

type ActionSuccess<T = void> = T extends void ? { ok: true } : { ok: true; data: T };
type ActionFailure = { ok: false; error: string };
type ActionResult<T = void> = ActionSuccess<T> | ActionFailure;

// ─── createClientAction ───────────────────────────────────────────────────────

export async function createClientAction(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const { user, organization } = await requireOrganizationRole('operator');
  const supabase = await createServerSupabaseClient();
  const clientRepo = new SupabaseClientRepository(supabase);

  const raw = {
    name: formData.get('name'),
    legalName: formData.get('legalName') || null,
    slug: formData.get('slug') || undefined,
    status: formData.get('status') || 'active',
    industry: formData.get('industry') || null,
    timezone: formData.get('timezone') || 'America/Bogota',
    currency: formData.get('currency') || 'COP',
    website: formData.get('website') || null,
    email: formData.get('email') || null,
    phone: formData.get('phone') || null,
    notes: formData.get('notes') || null,
  };

  const parsed = createClientSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors.map((e) => e.message).join('; '),
    };
  }

  const slugValue = typeof raw.slug === 'string' ? raw.slug : undefined;

  const result = await createClient(
    {
      organizationId: organization.id as OrganizationId,
      name: parsed.data.name,
      legalName: parsed.data.legalName ?? null,
      ...(slugValue !== undefined && { slug: slugValue }),
      status: parsed.data.status,
      industry: parsed.data.industry ?? null,
      timezone: parsed.data.timezone,
      currency: parsed.data.currency,
      website: parsed.data.website ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      notes: parsed.data.notes ?? null,
      metadata: parsed.data.metadata,
      createdBy: user.id,
    },
    { clientRepository: clientRepo, logger: consoleLogger },
  );

  if (!result.success) {
    return { ok: false, error: result.error.message };
  }

  revalidatePath('/clients');
  return { ok: true, data: { id: result.value.id } };
}

// ─── updateClientAction ───────────────────────────────────────────────────────

export async function updateClientAction(
  clientId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { user, organization } = await requireOrganizationRole('operator');
  const supabase = await createServerSupabaseClient();
  const clientRepo = new SupabaseClientRepository(supabase);

  const raw = {
    name: formData.get('name') || undefined,
    legalName: formData.get('legalName') ?? undefined,
    status: formData.get('status') || undefined,
    industry: formData.get('industry') ?? undefined,
    timezone: formData.get('timezone') || undefined,
    currency: formData.get('currency') || undefined,
    website: formData.get('website') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  };

  const parsed = updateClientSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors.map((e) => e.message).join('; '),
    };
  }

  const result = await updateClient(
    {
      clientId: clientId as ClientId,
      organizationId: organization.id as OrganizationId,
      updatedBy: user.id,
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.legalName !== undefined && { legalName: parsed.data.legalName }),
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
      ...(parsed.data.industry !== undefined && { industry: parsed.data.industry }),
      ...(parsed.data.timezone !== undefined && { timezone: parsed.data.timezone }),
      ...(parsed.data.currency !== undefined && { currency: parsed.data.currency }),
      ...(parsed.data.website !== undefined && { website: parsed.data.website }),
      ...(parsed.data.email !== undefined && { email: parsed.data.email }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      ...(parsed.data.metadata !== undefined && { metadata: parsed.data.metadata }),
    },
    { clientRepository: clientRepo, logger: consoleLogger },
  );

  if (!result.success) {
    return { ok: false, error: result.error.message };
  }

  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/clients');
  return { ok: true };
}

// ─── softDeleteClientAction ───────────────────────────────────────────────────

export async function softDeleteClientAction(clientId: string): Promise<ActionResult> {
  const { user, organization, membership } = await requireOrganizationRole('admin');
  const supabase = await createServerSupabaseClient();
  const clientRepo = new SupabaseClientRepository(supabase);

  const result = await softDeleteClient(
    {
      clientId: clientId as ClientId,
      organizationId: organization.id as OrganizationId,
      deletedBy: user.id,
      callerRole: membership.role,
    },
    { clientRepository: clientRepo, logger: consoleLogger },
  );

  if (!result.success) {
    return { ok: false, error: result.error.message };
  }

  revalidatePath('/clients');
  redirect('/clients');
}

// ─── upsertDocumentAction ─────────────────────────────────────────────────────

export async function upsertDocumentAction(
  clientId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { user, organization } = await requireOrganizationRole('operator');
  const supabase = await createServerSupabaseClient();
  const clientRepo = new SupabaseClientRepository(supabase);

  const rawVersion = formData.get('expectedVersion');
  const expectedVersion =
    rawVersion && rawVersion !== '' ? parseInt(rawVersion as string, 10) : null;

  const raw = {
    documentKey: formData.get('documentKey'),
    title: formData.get('title'),
    category: formData.get('category') || 'general',
    content: formData.get('content') ?? '',
    status: formData.get('status') || 'draft',
  };

  const parsed = upsertClientDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.errors.map((e) => e.message).join('; '),
    };
  }

  const result = await upsertClientDocument(
    {
      clientId: clientId as ClientId,
      organizationId: organization.id as OrganizationId,
      documentKey: parsed.data.documentKey,
      title: parsed.data.title,
      category: parsed.data.category,
      content: parsed.data.content,
      status: parsed.data.status,
      createdBy: user.id,
      updatedBy: user.id,
      expectedVersion,
    },
    { clientRepository: clientRepo, logger: consoleLogger },
  );

  if (!result.success) {
    return { ok: false, error: result.error.message };
  }

  revalidatePath(`/clients/${clientId}/documents/${parsed.data.documentKey}`);
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
