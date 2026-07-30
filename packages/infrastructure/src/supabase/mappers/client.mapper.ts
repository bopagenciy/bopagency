/**
 * Mappers: Supabase DB rows → Domain entities (Client layer)
 *
 * Funciones puras, sin dependencias externas. Los tipos de fila deben coincidir
 * exactamente con las columnas definidas en 20260730120000_phase3_clients.sql.
 */
import type {
  Client,
  ClientId,
  ClientContact,
  ClientContactId,
  ClientDocument,
  ClientDocumentId,
  ClientIntegration,
  ClientIntegrationId,
  ClientStatus,
  ClientIndustry,
  DocumentStatus,
  IntegrationStatus,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import { organizationId } from '@bop-agency/domain';

// ─── Row types ────────────────────────────────────────────────────────────────

export type ClientRow = {
  id: string;
  organization_id: string;
  name: string;
  legal_name: string | null;
  slug: string;
  status: string;
  industry: string | null;
  timezone: string;
  currency: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type ClientContactRow = {
  id: string;
  client_id: string;
  organization_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ClientDocumentRow = {
  id: string;
  client_id: string;
  organization_id: string;
  document_key: string;
  title: string;
  category: string;
  content: string;
  status: string;
  version: number;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientIntegrationRow = {
  id: string;
  client_id: string;
  organization_id: string;
  provider: string;
  external_account_id: string;
  status: string;
  configuration: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function rowToClient(row: ClientRow): Client {
  return {
    id: row.id as ClientId,
    organizationId: organizationId(row.organization_id) as OrganizationId,
    name: row.name,
    legalName: row.legal_name,
    slug: row.slug,
    status: row.status as ClientStatus,
    industry: (row.industry ?? null) as ClientIndustry | null,
    timezone: row.timezone,
    currency: row.currency,
    website: row.website,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    metadata: row.metadata,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    deletedBy: row.deleted_by,
  };
}

export function rowToClientContact(row: ClientContactRow): ClientContact {
  return {
    id: row.id as ClientContactId,
    clientId: row.client_id as ClientId,
    organizationId: organizationId(row.organization_id) as OrganizationId,
    name: row.name,
    title: row.title,
    email: row.email,
    phone: row.phone,
    isPrimary: row.is_primary,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  };
}

export function rowToClientDocument(row: ClientDocumentRow): ClientDocument {
  return {
    id: row.id as ClientDocumentId,
    clientId: row.client_id as ClientId,
    organizationId: organizationId(row.organization_id) as OrganizationId,
    documentKey: row.document_key,
    title: row.title,
    category: row.category,
    content: row.content,
    status: row.status as DocumentStatus,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function rowToClientIntegration(row: ClientIntegrationRow): ClientIntegration {
  return {
    id: row.id as ClientIntegrationId,
    clientId: row.client_id as ClientId,
    organizationId: organizationId(row.organization_id) as OrganizationId,
    provider: row.provider,
    externalAccountId: row.external_account_id,
    status: row.status as IntegrationStatus,
    configuration: row.configuration,
    lastSyncedAt: row.last_synced_at ? new Date(row.last_synced_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
