/**
 * SupabaseClientRepository
 *
 * Implementación de ClientRepository respaldada por Supabase.
 * Todas las operaciones filtran por organization_id (multi-tenant).
 * Queries de lectura excluyen deleted_at IS NOT NULL por defecto.
 * Usa el cliente del usuario con RLS activo — nunca service_role en esta capa.
 */
import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  Client,
  ClientId,
  ClientFilter,
  ClientContact,
  ClientDocument,
  ClientIntegration,
  ClientWithDocuments,
  ClientRepository,
  CreateClientInput,
  UpdateClientInput,
  UpsertClientDocumentInput,
} from '@bop-agency/domain';
import { clientNotFound, clientDeleted } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToClient,
  rowToClientContact,
  rowToClientDocument,
  rowToClientIntegration,
  type ClientRow,
  type ClientContactRow,
  type ClientDocumentRow,
  type ClientIntegrationRow,
} from './mappers/client.mapper';

export class SupabaseClientRepository implements ClientRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ── Core CRUD ────────────────────────────────────────────────────────────────

  async findById(id: ClientId, organizationId: OrganizationId): Promise<Result<Client>> {
    const { data, error } = await this.supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (error || !data) return err(clientNotFound(id));
    return ok(rowToClient(data as ClientRow));
  }

  async findAll(
    filter: ClientFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Client>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 20;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = this.supabase.from('clients').select('*', { count: 'exact' });

    if (filter.organizationId) {
      query = query.eq('organization_id', filter.organizationId);
    }
    if (!filter.includeDeleted) {
      query = query.is('deleted_at', null);
    }
    if (filter.status) {
      query = query.eq('status', filter.status);
    }
    if (filter.industry) {
      query = query.eq('industry', filter.industry);
    }
    if (filter.search?.trim()) {
      // ILIKE search over name (case-insensitive)
      query = query.ilike('name', `%${filter.search.trim()}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      };
    }

    const total = count ?? 0;
    const totalPages = Math.ceil(total / pageSize);
    const items = (data ?? []).map((row) => rowToClient(row as ClientRow));

    return {
      data: items,
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async findBySlug(slug: string, organizationId: OrganizationId): Promise<Result<Client>> {
    const { data, error } = await this.supabase
      .from('clients')
      .select('*')
      .eq('slug', slug)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (error || !data) return err(clientNotFound(slug));
    return ok(rowToClient(data as ClientRow));
  }

  async create(input: CreateClientInput): Promise<Result<Client>> {
    const slug = input.slug?.trim() ?? slugify(input.name);

    const { data, error } = await this.supabase
      .from('clients')
      .insert({
        organization_id: input.organizationId,
        name: input.name,
        legal_name: input.legalName ?? null,
        slug,
        status: input.status ?? 'active',
        industry: input.industry ?? null,
        timezone: input.timezone ?? 'America/Bogota',
        currency: input.currency ?? 'COP',
        website: input.website ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? {},
        // created_by/updated_by asignados por trigger manage_client_write desde auth.uid()
        // No pasar desde aplicación: el trigger los sobreescribe siempre para usuarios autenticados
      })
      .select('*')
      .single();

    if (error || !data) {
      // Unique constraint on slug → CONFLICT
      if (error?.code === '23505') {
        return err({
          code: 'CONFLICT' as const,
          message: `El slug "${slug}" ya está en uso en esta organización`,
        });
      }
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: error?.message ?? 'Error al crear el cliente',
      });
    }

    return ok(rowToClient(data as ClientRow));
  }

  async update(
    id: ClientId,
    organizationId: OrganizationId,
    input: UpdateClientInput,
  ): Promise<Result<Client>> {
    // Verify exists and not deleted
    const existing = await this.findById(id, organizationId);
    if (!existing.success) return existing;

    // updated_by asignado por trigger manage_client_write desde auth.uid()
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.legalName !== undefined) patch.legal_name = input.legalName;
    if (input.status !== undefined) patch.status = input.status;
    if (input.industry !== undefined) patch.industry = input.industry;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.website !== undefined) patch.website = input.website;
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    const { data, error } = await this.supabase
      .from('clients')
      .update(patch)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .select('*')
      .single();

    if (error || !data) {
      return err({
        code: 'INTERNAL_ERROR',
        message: error?.message ?? 'Error al actualizar el cliente',
      });
    }

    return ok(rowToClient(data as ClientRow));
  }

  async delete(id: ClientId): Promise<Result<void>> {
    const { error } = await this.supabase.from('clients').delete().eq('id', id);
    if (error) {
      return err({ code: 'INTERNAL_ERROR', message: error.message });
    }
    return ok(undefined);
  }

  async softDelete(
    id: ClientId,
    _organizationId: OrganizationId,
    _deletedBy: string,
  ): Promise<Result<Client>> {
    // Usa la RPC soft_delete_client que verifica rol admin/owner en BD y asigna auditoría
    const { data, error } = await (
      this.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc('soft_delete_client', { p_client_id: id });

    if (error) {
      const msg = (error as { message?: string }).message ?? 'Error al eliminar el cliente';
      if (msg.includes('not found')) return err(clientNotFound(id));
      if (msg.includes('already deleted')) return err(clientDeleted(id));
      if (msg.includes('requires admin')) {
        return err({ code: 'FORBIDDEN' as const, message: msg });
      }
      return err({ code: 'INTERNAL_ERROR' as const, message: msg });
    }

    const raw = (Array.isArray(data) ? data[0] : data) as ClientRow | null;
    if (!raw) return err(clientNotFound(id));
    return ok(rowToClient(raw));
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────────

  async findByIdWithDocuments(
    id: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<ClientWithDocuments>> {
    const clientResult = await this.findById(id, organizationId);
    if (!clientResult.success) return clientResult;

    const [contactsResult, docsResult, integrationsResult] = await Promise.all([
      this.listContacts(id, organizationId),
      this.listDocuments(id, organizationId),
      this.listIntegrations(id, organizationId),
    ]);

    return ok({
      ...clientResult.value,
      contacts: contactsResult.success ? contactsResult.value : [],
      documents: docsResult.success ? docsResult.value : [],
      integrations: integrationsResult.success ? integrationsResult.value : [],
    });
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  async listContacts(
    clientId: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<ClientContact[]>> {
    const { data, error } = await this.supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', clientId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('name');

    if (error) {
      return err({ code: 'INTERNAL_ERROR', message: error.message });
    }

    return ok((data ?? []).map((row) => rowToClientContact(row as ClientContactRow)));
  }

  // ── Documents ─────────────────────────────────────────────────────────────────

  async listDocuments(
    clientId: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<ClientDocument[]>> {
    const { data, error } = await this.supabase
      .from('client_documents')
      .select('*')
      .eq('client_id', clientId)
      .eq('organization_id', organizationId)
      .order('document_key');

    if (error) {
      return err({ code: 'INTERNAL_ERROR', message: error.message });
    }

    return ok((data ?? []).map((row) => rowToClientDocument(row as ClientDocumentRow)));
  }

  async getDocumentByKey(
    clientId: ClientId,
    organizationId: OrganizationId,
    key: string,
  ): Promise<Result<ClientDocument | null>> {
    const { data, error } = await this.supabase
      .from('client_documents')
      .select('*')
      .eq('client_id', clientId)
      .eq('organization_id', organizationId)
      .eq('document_key', key)
      .maybeSingle();

    if (error) {
      return err({ code: 'INTERNAL_ERROR', message: error.message });
    }

    return ok(data ? rowToClientDocument(data as ClientDocumentRow) : null);
  }

  async upsertDocument(
    clientId: ClientId,
    _organizationId: OrganizationId,
    input: UpsertClientDocumentInput,
  ): Promise<Result<ClientDocument>> {
    // Usa la RPC upsert_client_document con control de versión optimista.
    // La RPC verifica rol operator+, cliente activo, y asigna auditoría desde auth.uid().
    const { data, error } = await (
      this.supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc('upsert_client_document', {
      p_client_id: clientId,
      p_document_key: input.documentKey,
      p_title: input.title,
      p_category: input.category ?? 'general',
      p_content: input.content,
      p_status: input.status ?? 'draft',
      p_expected_version: input.expectedVersion ?? null,
    });

    if (error) {
      const msg = (error as { message?: string }).message ?? 'Error al guardar el documento';
      if (msg.includes('version conflict')) {
        return err({ code: 'CONFLICT' as const, message: msg });
      }
      if (msg.includes('not found or deleted')) return err(clientNotFound(clientId));
      return err({ code: 'INTERNAL_ERROR' as const, message: msg });
    }

    const raw = (Array.isArray(data) ? data[0] : data) as ClientDocumentRow | null;
    if (!raw) {
      return err({ code: 'INTERNAL_ERROR' as const, message: 'Error al guardar el documento' });
    }
    return ok(rowToClientDocument(raw));
  }

  // ── Integrations ──────────────────────────────────────────────────────────────

  async listIntegrations(
    clientId: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<ClientIntegration[]>> {
    const { data, error } = await this.supabase
      .from('client_integrations')
      .select('*')
      .eq('client_id', clientId)
      .eq('organization_id', organizationId)
      .order('provider');

    if (error) {
      return err({ code: 'INTERNAL_ERROR', message: error.message });
    }

    return ok((data ?? []).map((row) => rowToClientIntegration(row as ClientIntegrationRow)));
  }
}

// ── Local helper ──────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}
