import { describe, it, expect } from 'vitest';
import {
  rowToClient,
  rowToClientContact,
  rowToClientDocument,
  rowToClientIntegration,
  type ClientRow,
  type ClientContactRow,
  type ClientDocumentRow,
  type ClientIntegrationRow,
} from '../client.mapper';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseClientRow: ClientRow = {
  id: 'client-uuid-1',
  organization_id: 'org-uuid-1',
  name: 'Restaurante Demo',
  legal_name: 'Restaurante Demo S.A.S.',
  slug: 'restaurante-demo',
  status: 'active',
  industry: 'hospitality',
  timezone: 'America/Bogota',
  currency: 'COP',
  website: 'https://demo.com',
  email: 'hola@demo.com',
  phone: '+57 300 000 0000',
  notes: 'Notas del cliente',
  metadata: { source: 'onboarding' },
  created_by: 'user-uuid-1',
  updated_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  deleted_at: null,
  deleted_by: null,
};

// ─── rowToClient ─────────────────────────────────────────────────────────────

describe('rowToClient', () => {
  it('mapea todos los campos correctamente', () => {
    const client = rowToClient(baseClientRow);
    expect(client.id).toBe('client-uuid-1');
    expect(client.organizationId).toBe('org-uuid-1');
    expect(client.name).toBe('Restaurante Demo');
    expect(client.legalName).toBe('Restaurante Demo S.A.S.');
    expect(client.slug).toBe('restaurante-demo');
    expect(client.status).toBe('active');
    expect(client.industry).toBe('hospitality');
    expect(client.timezone).toBe('America/Bogota');
    expect(client.currency).toBe('COP');
    expect(client.website).toBe('https://demo.com');
    expect(client.email).toBe('hola@demo.com');
    expect(client.phone).toBe('+57 300 000 0000');
    expect(client.notes).toBe('Notas del cliente');
    expect(client.metadata).toEqual({ source: 'onboarding' });
    expect(client.createdBy).toBe('user-uuid-1');
    expect(client.updatedBy).toBeNull();
    expect(client.createdAt).toBeInstanceOf(Date);
    expect(client.deletedAt).toBeNull();
    expect(client.deletedBy).toBeNull();
  });

  it('mapea campos nullable como null', () => {
    const row: ClientRow = {
      ...baseClientRow,
      legal_name: null,
      industry: null,
      website: null,
      email: null,
      phone: null,
      notes: null,
      updated_by: null,
      deleted_at: null,
      deleted_by: null,
    };
    const client = rowToClient(row);
    expect(client.legalName).toBeNull();
    expect(client.industry).toBeNull();
    expect(client.website).toBeNull();
    expect(client.email).toBeNull();
    expect(client.phone).toBeNull();
    expect(client.notes).toBeNull();
  });

  it('mapea deleted_at como Date cuando está presente', () => {
    const row: ClientRow = {
      ...baseClientRow,
      deleted_at: '2026-06-01T12:00:00.000Z',
      deleted_by: 'user-uuid-2',
    };
    const client = rowToClient(row);
    expect(client.deletedAt).toBeInstanceOf(Date);
    expect(client.deletedBy).toBe('user-uuid-2');
  });
});

// ─── rowToClientContact ───────────────────────────────────────────────────────

describe('rowToClientContact', () => {
  const contactRow: ClientContactRow = {
    id: 'contact-uuid-1',
    client_id: 'client-uuid-1',
    organization_id: 'org-uuid-1',
    name: 'Juan Pérez',
    title: 'Gerente',
    email: 'juan@demo.com',
    phone: '+57 310 000 0000',
    is_primary: true,
    notes: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
  };

  it('mapea todos los campos', () => {
    const contact = rowToClientContact(contactRow);
    expect(contact.id).toBe('contact-uuid-1');
    expect(contact.clientId).toBe('client-uuid-1');
    expect(contact.name).toBe('Juan Pérez');
    expect(contact.title).toBe('Gerente');
    expect(contact.email).toBe('juan@demo.com');
    expect(contact.isPrimary).toBe(true);
    expect(contact.deletedAt).toBeNull();
  });
});

// ─── rowToClientDocument ──────────────────────────────────────────────────────

describe('rowToClientDocument', () => {
  const docRow: ClientDocumentRow = {
    id: 'doc-uuid-1',
    client_id: 'client-uuid-1',
    organization_id: 'org-uuid-1',
    document_key: 'brand_profile',
    title: 'Perfil de Marca',
    category: 'branding',
    content: '## Marca\n\nLorem ipsum...',
    status: 'published',
    version: 3,
    created_by: 'user-uuid-1',
    updated_by: 'user-uuid-2',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-02-15T00:00:00.000Z',
  };

  it('mapea todos los campos', () => {
    const doc = rowToClientDocument(docRow);
    expect(doc.id).toBe('doc-uuid-1');
    expect(doc.documentKey).toBe('brand_profile');
    expect(doc.title).toBe('Perfil de Marca');
    expect(doc.category).toBe('branding');
    expect(doc.content).toBe('## Marca\n\nLorem ipsum...');
    expect(doc.status).toBe('published');
    expect(doc.version).toBe(3);
    expect(doc.createdBy).toBe('user-uuid-1');
    expect(doc.updatedBy).toBe('user-uuid-2');
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
  });
});

// ─── rowToClientIntegration ───────────────────────────────────────────────────

describe('rowToClientIntegration', () => {
  const integrationRow: ClientIntegrationRow = {
    id: 'int-uuid-1',
    client_id: 'client-uuid-1',
    organization_id: 'org-uuid-1',
    provider: 'meta_ads',
    external_account_id: 'act_123456',
    status: 'active',
    configuration: { currency: 'COP' },
    last_synced_at: '2026-07-30T10:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-07-30T10:00:00.000Z',
  };

  it('mapea todos los campos', () => {
    const integration = rowToClientIntegration(integrationRow);
    expect(integration.id).toBe('int-uuid-1');
    expect(integration.provider).toBe('meta_ads');
    expect(integration.externalAccountId).toBe('act_123456');
    expect(integration.status).toBe('active');
    expect(integration.configuration).toEqual({ currency: 'COP' });
    expect(integration.lastSyncedAt).toBeInstanceOf(Date);
  });

  it('mapea last_synced_at null correctamente', () => {
    const row: ClientIntegrationRow = { ...integrationRow, last_synced_at: null };
    const integration = rowToClientIntegration(row);
    expect(integration.lastSyncedAt).toBeNull();
  });
});
