import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  Client,
  ClientId,
  ClientFilter,
  ClientContact,
  ClientDocument,
  ClientIntegration,
  ClientWithDocuments,
  CreateClientInput,
  UpdateClientInput,
  UpsertClientDocumentInput,
} from '../entities/client';
import type { OrganizationId } from '../entities/organization';

export interface ClientRepository {
  // ── Core CRUD ────────────────────────────────────────────────────────────────
  findById(id: ClientId, organizationId: OrganizationId): Promise<Result<Client>>;
  findAll(filter: ClientFilter, pagination: PaginationParams): Promise<PaginatedResult<Client>>;
  findBySlug(slug: string, organizationId: OrganizationId): Promise<Result<Client>>;

  create(data: CreateClientInput): Promise<Result<Client>>;
  update(
    id: ClientId,
    organizationId: OrganizationId,
    data: UpdateClientInput,
  ): Promise<Result<Client>>;

  /** Hard delete — úsese solo para tests o admin; la app usa softDelete. */
  delete(id: ClientId): Promise<Result<void>>;

  // ── Soft delete ───────────────────────────────────────────────────────────────
  softDelete(
    id: ClientId,
    organizationId: OrganizationId,
    deletedBy: string,
  ): Promise<Result<Client>>;

  // ── Aggregate ─────────────────────────────────────────────────────────────────
  findByIdWithDocuments(
    id: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<ClientWithDocuments>>;

  // ── Contacts ─────────────────────────────────────────────────────────────────
  listContacts(
    clientId: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<ClientContact[]>>;

  // ── Documents ─────────────────────────────────────────────────────────────────
  listDocuments(
    clientId: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<ClientDocument[]>>;

  getDocumentByKey(
    clientId: ClientId,
    organizationId: OrganizationId,
    key: string,
  ): Promise<Result<ClientDocument | null>>;

  upsertDocument(
    clientId: ClientId,
    organizationId: OrganizationId,
    data: UpsertClientDocumentInput,
  ): Promise<Result<ClientDocument>>;

  // ── Integrations ──────────────────────────────────────────────────────────────
  listIntegrations(
    clientId: ClientId,
    organizationId: OrganizationId,
  ): Promise<Result<ClientIntegration[]>>;
}
