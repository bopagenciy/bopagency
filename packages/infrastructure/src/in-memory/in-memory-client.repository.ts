import { ok, err, notFound, paginate } from '@bop-agency/shared';
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
import type { OrganizationId } from '@bop-agency/domain';
import type { ClientDocumentId } from '@bop-agency/domain';

/**
 * InMemoryClientRepository
 *
 * Solo para tests y desarrollo local. No usa Supabase.
 * Implementa la interfaz completa de ClientRepository.
 */
export class InMemoryClientRepository implements ClientRepository {
  private readonly clients = new Map<string, Client>();
  private readonly contacts = new Map<string, ClientContact[]>();
  private readonly documents = new Map<string, ClientDocument[]>();
  private readonly integrations = new Map<string, ClientIntegration[]>();

  // ── Core CRUD ────────────────────────────────────────────────────────────────

  async findById(id: ClientId, _organizationId: OrganizationId): Promise<Result<Client>> {
    const client = this.clients.get(id);
    if (!client || client.deletedAt !== null) {
      return err(notFound(`Client not found: ${id}`));
    }
    return ok(client);
  }

  async findAll(
    filter: ClientFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Client>> {
    let items = Array.from(this.clients.values());

    // Exclude soft-deleted by default
    if (!filter.includeDeleted) {
      items = items.filter((c) => c.deletedAt === null);
    }
    if (filter.organizationId !== undefined) {
      items = items.filter((c) => c.organizationId === filter.organizationId);
    }
    if (filter.status !== undefined) {
      items = items.filter((c) => c.status === filter.status);
    }
    if (filter.industry !== undefined) {
      items = items.filter((c) => c.industry === filter.industry);
    }
    if (filter.search !== undefined) {
      const q = filter.search.toLowerCase();
      items = items.filter((c) => c.name.toLowerCase().includes(q));
    }

    return paginate(items, items.length, pagination);
  }

  async findBySlug(slug: string, _organizationId: OrganizationId): Promise<Result<Client>> {
    const client = Array.from(this.clients.values()).find(
      (c) => c.slug === slug && c.deletedAt === null,
    );
    return client ? ok(client) : err(notFound(`Client not found: ${slug}`));
  }

  async create(data: CreateClientInput): Promise<Result<Client>> {
    const id = `client_${Date.now()}` as ClientId;
    const now = new Date();
    const slug = data.slug ?? slugify(data.name);
    const client: Client = {
      id,
      organizationId: data.organizationId,
      name: data.name,
      legalName: data.legalName ?? null,
      slug,
      status: data.status ?? 'active',
      industry: data.industry ?? null,
      timezone: data.timezone ?? 'America/Bogota',
      currency: data.currency ?? 'COP',
      website: data.website ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      notes: data.notes ?? null,
      metadata: data.metadata ?? {},
      createdBy: data.createdBy,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedBy: null,
    };
    this.clients.set(id, client);
    return ok(client);
  }

  async update(
    id: ClientId,
    _organizationId: OrganizationId,
    data: UpdateClientInput,
  ): Promise<Result<Client>> {
    const existing = this.clients.get(id);
    if (!existing || existing.deletedAt !== null) {
      return err(notFound(`Client not found: ${id}`));
    }
    const updated: Client = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.legalName !== undefined && { legalName: data.legalName }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.industry !== undefined && { industry: data.industry }),
      ...(data.timezone !== undefined && { timezone: data.timezone }),
      ...(data.currency !== undefined && { currency: data.currency }),
      ...(data.website !== undefined && { website: data.website }),
      ...(data.email !== undefined && { email: data.email }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.metadata !== undefined && { metadata: data.metadata }),
      updatedBy: data.updatedBy,
      updatedAt: new Date(),
    };
    this.clients.set(id, updated);
    return ok(updated);
  }

  async delete(id: ClientId): Promise<Result<void>> {
    if (!this.clients.has(id)) return err(notFound(`Client not found: ${id}`));
    this.clients.delete(id);
    return ok(undefined);
  }

  async softDelete(
    id: ClientId,
    _organizationId: OrganizationId,
    deletedBy: string,
  ): Promise<Result<Client>> {
    const existing = this.clients.get(id);
    if (!existing || existing.deletedAt !== null) {
      return err(notFound(`Client not found: ${id}`));
    }
    const deleted: Client = {
      ...existing,
      deletedAt: new Date(),
      deletedBy,
      updatedAt: new Date(),
    };
    this.clients.set(id, deleted);
    return ok(deleted);
  }

  // ── Aggregate ─────────────────────────────────────────────────────────────────

  async findByIdWithDocuments(
    id: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<ClientWithDocuments>> {
    const clientResult = await this.findById(id, organizationId);
    if (!clientResult.success) return clientResult;

    const contactsResult = await this.listContacts(id, organizationId);
    const docsResult = await this.listDocuments(id, organizationId);
    const integrationsResult = await this.listIntegrations(id, organizationId);

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
    _organizationId: OrganizationId,
  ): Promise<Result<ClientContact[]>> {
    const list = (this.contacts.get(clientId) ?? []).filter((c) => c.deletedAt === null);
    return ok(list);
  }

  // ── Documents ─────────────────────────────────────────────────────────────────

  async listDocuments(
    clientId: ClientId,
    _organizationId: OrganizationId,
  ): Promise<Result<ClientDocument[]>> {
    const list = this.documents.get(clientId) ?? [];
    return ok(list);
  }

  async getDocumentByKey(
    clientId: ClientId,
    _organizationId: OrganizationId,
    key: string,
  ): Promise<Result<ClientDocument | null>> {
    const list = this.documents.get(clientId) ?? [];
    const doc = list.find((d) => d.documentKey === key) ?? null;
    return ok(doc);
  }

  async upsertDocument(
    clientId: ClientId,
    organizationId: OrganizationId,
    data: UpsertClientDocumentInput,
  ): Promise<Result<ClientDocument>> {
    const list = this.documents.get(clientId) ?? [];
    const existingIdx = list.findIndex((d) => d.documentKey === data.documentKey);
    const now = new Date();

    if (existingIdx >= 0) {
      const existing = list[existingIdx];
      if (!existing)
        return err({ code: 'INTERNAL_ERROR' as const, message: 'Document index mismatch' });
      const updated: ClientDocument = {
        ...existing,
        title: data.title,
        category: data.category ?? existing.category,
        content: data.content,
        status: data.status ?? existing.status,
        version: existing.version + 1,
        updatedBy: data.updatedBy,
        updatedAt: now,
      };
      list[existingIdx] = updated;
      this.documents.set(clientId, list);
      return ok(updated);
    }

    const newDoc: ClientDocument = {
      id: `doc_${Date.now()}` as ClientDocumentId,
      clientId,
      organizationId,
      documentKey: data.documentKey,
      title: data.title,
      category: data.category ?? 'general',
      content: data.content,
      status: data.status ?? 'draft',
      version: 1,
      createdBy: data.createdBy,
      updatedBy: data.updatedBy,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(clientId, [...list, newDoc]);
    return ok(newDoc);
  }

  // ── Integrations ──────────────────────────────────────────────────────────────

  async listIntegrations(
    clientId: ClientId,
    _organizationId: OrganizationId,
  ): Promise<Result<ClientIntegration[]>> {
    const list = this.integrations.get(clientId) ?? [];
    return ok(list);
  }

  // ── Test helpers ─────────────────────────────────────────────────────────────

  seed(client: Client): void {
    this.clients.set(client.id, client);
  }

  seedContact(clientId: ClientId, contact: ClientContact): void {
    const list = this.contacts.get(clientId) ?? [];
    this.contacts.set(clientId, [...list, contact]);
  }

  seedDocument(clientId: ClientId, doc: ClientDocument): void {
    const list = this.documents.get(clientId) ?? [];
    this.documents.set(clientId, [...list, doc]);
  }

  seedIntegration(clientId: ClientId, integration: ClientIntegration): void {
    const list = this.integrations.get(clientId) ?? [];
    this.integrations.set(clientId, [...list, integration]);
  }

  clear(): void {
    this.clients.clear();
    this.contacts.clear();
    this.documents.clear();
    this.integrations.clear();
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
