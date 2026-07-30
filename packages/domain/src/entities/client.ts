import type { OrganizationId } from './organization';

// ─── Branded IDs ──────────────────────────────────────────────────────────────

export type ClientId = string & { readonly _brand: 'ClientId' };
export type ClientContactId = string & { readonly _brand: 'ClientContactId' };
export type ClientDocumentId = string & { readonly _brand: 'ClientDocumentId' };
export type ClientIntegrationId = string & { readonly _brand: 'ClientIntegrationId' };

// ─── Enums / Unions ───────────────────────────────────────────────────────────

export type ClientStatus = 'active' | 'inactive' | 'onboarding' | 'churned';

export type ClientIndustry =
  | 'hospitality'
  | 'legal'
  | 'ecommerce'
  | 'retail'
  | 'healthcare'
  | 'technology'
  | 'education'
  | 'real_estate'
  | 'finance'
  | 'food_beverage'
  | 'other';

export type DocumentStatus = 'draft' | 'published' | 'archived';

export type IntegrationStatus = 'active' | 'inactive' | 'error';

// ─── Core Client entity ───────────────────────────────────────────────────────

export type Client = {
  readonly id: ClientId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly legalName: string | null;
  readonly slug: string;
  readonly status: ClientStatus;
  readonly industry: ClientIndustry | null;
  readonly timezone: string;
  readonly currency: string;
  readonly website: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdBy: string;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
  readonly deletedBy: string | null;
};

// ─── Client contact ───────────────────────────────────────────────────────────

export type ClientContact = {
  readonly id: ClientContactId;
  readonly clientId: ClientId;
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly title: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly isPrimary: boolean;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
};

// ─── Client document ──────────────────────────────────────────────────────────

export type ClientDocument = {
  readonly id: ClientDocumentId;
  readonly clientId: ClientId;
  readonly organizationId: OrganizationId;
  readonly documentKey: string;
  readonly title: string;
  readonly category: string;
  readonly content: string;
  readonly status: DocumentStatus;
  readonly version: number;
  readonly createdBy: string;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── Client integration ───────────────────────────────────────────────────────

export type ClientIntegration = {
  readonly id: ClientIntegrationId;
  readonly clientId: ClientId;
  readonly organizationId: OrganizationId;
  readonly provider: string;
  readonly externalAccountId: string;
  readonly status: IntegrationStatus;
  readonly configuration: Record<string, unknown>;
  readonly lastSyncedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── Aggregate ────────────────────────────────────────────────────────────────

export type ClientWithDocuments = Client & {
  readonly contacts: ClientContact[];
  readonly documents: ClientDocument[];
  readonly integrations: ClientIntegration[];
};

// ─── Filter ───────────────────────────────────────────────────────────────────

export type ClientFilter = {
  readonly organizationId?: OrganizationId;
  readonly status?: ClientStatus;
  readonly industry?: ClientIndustry;
  readonly search?: string;
  readonly includeDeleted?: boolean;
};

// ─── Input types ──────────────────────────────────────────────────────────────

export type CreateClientInput = {
  readonly organizationId: OrganizationId;
  readonly name: string;
  readonly legalName?: string | null;
  readonly slug?: string;
  readonly status?: ClientStatus;
  readonly industry?: ClientIndustry | null;
  readonly timezone?: string;
  readonly currency?: string;
  readonly website?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly createdBy: string;
};

export type UpdateClientInput = {
  readonly name?: string;
  readonly legalName?: string | null;
  readonly status?: ClientStatus;
  readonly industry?: ClientIndustry | null;
  readonly timezone?: string;
  readonly currency?: string;
  readonly website?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly notes?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly updatedBy: string;
};

export type UpsertClientDocumentInput = {
  readonly documentKey: string;
  readonly title: string;
  readonly category?: string;
  readonly content: string;
  readonly status?: DocumentStatus;
  readonly createdBy: string;
  readonly updatedBy: string;
  /** Control de concurrencia optimista. NULL = sin verificación (last-write-wins). */
  readonly expectedVersion?: number | null;
};

export type CreateClientContactInput = {
  readonly name: string;
  readonly title?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly isPrimary?: boolean;
  readonly notes?: string | null;
};
