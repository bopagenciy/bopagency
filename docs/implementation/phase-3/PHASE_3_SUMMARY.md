# Phase 3 — Summary

**Client Management**
Status: ✅ COMPLETE · Date: 2026-07-30

---

## What was built

### Database schema (4 tables + enums + RLS)

- `clients` — core client record with soft delete (`deleted_at`, `deleted_by`), partial unique index on `(organization_id, slug) WHERE deleted_at IS NULL`, FTS index on `name`
- `client_contacts` — contact persons per client, with soft delete
- `client_documents` — versioned documents with upsert semantics via `UNIQUE (client_id, document_key)`
- `client_integrations` — external provider accounts per client
- Three enums: `client_status` (active/inactive/onboarding/churned), `document_status` (draft/published/archived), `integration_status` (active/inactive/error)
- Trigger `check_client_organization_match()` enforces org_id consistency across child tables
- RLS: member → SELECT, operator+ → INSERT/UPDATE clients/contacts/documents, admin+ → integrations INSERT/UPDATE

### Domain package

- Branded types: `ClientId`, `ClientContactId`, `ClientDocumentId`, `ClientIntegrationId`
- Entities: `Client`, `ClientContact`, `ClientDocument`, `ClientIntegration`, `ClientWithDocuments`
- Type aliases: `ClientStatus`, `ClientIndustry`, `DocumentStatus`, `IntegrationStatus`
- Input types: `CreateClientInput`, `UpdateClientInput`, `UpsertClientDocumentInput`, `CreateClientContactInput`, `ClientFilter`
- `ClientRepository` interface — 13 methods covering CRUD, soft delete, and sub-resource access
- New domain errors: `clientDeleted()`, `documentNotFound()`, `contactNotFound()`

### Shared package

- `createClientSchema` — validates all client fields; `SlugSchema` pattern; `CLIENT_STATUSES`, `CLIENT_INDUSTRIES`, `CLIENT_CURRENCIES` constants
- `updateClientSchema` — all fields optional; reuses same validators
- `clientFilterSchema` — status, industry, search, includeDeleted, pagination
- `upsertClientDocumentSchema` — documentKey regex `^[a-z0-9_-]+$`

### Application package

Five new use cases:

| Use case                 | Key behavior                                                              |
| ------------------------ | ------------------------------------------------------------------------- |
| `createClient`           | Zod validation → auto-slug → uniqueness check → create                    |
| `updateClient`           | Verify exists → Zod validation → partial update                           |
| `softDeleteClient`       | `callerRole ≥ admin` enforced → marks `deleted_at`                        |
| `getClientWithDocuments` | Fetches client + contacts + documents + integrations in parallel          |
| `upsertClientDocument`   | Validate documentKey → verify client → insert or update with version bump |

### Infrastructure package

- `SupabaseClientRepository` — full implementation of `ClientRepository` with multi-tenant queries, soft delete, and upsert logic
- `InMemoryClientRepository` — complete in-memory implementation for tests, with `seed()`, `seedContact()`, `seedDocument()`, `seedIntegration()`, `clear()` helpers
- Mappers: `rowToClient`, `rowToClientContact`, `rowToClientDocument`, `rowToClientIntegration`

### UI — apps/web

Server actions (`/clients/actions.ts`):

- `createClientAction` — role: operator
- `updateClientAction` — role: operator
- `softDeleteClientAction` — role: admin; redirects to `/clients` on success
- `upsertDocumentAction` — role: operator

Pages (all under `(protected)/clients/`):

| Route                                 | Type             | Description                                                  |
| ------------------------------------- | ---------------- | ------------------------------------------------------------ |
| `/clients`                            | Server Component | Paginated list with search + status filter                   |
| `/clients/new`                        | Server Component | Create client form                                           |
| `/clients/[clientId]`                 | Server Component | Detail: info, contacts, documents, integrations, danger zone |
| `/clients/[clientId]/edit`            | Server Component | Edit form with prefilled values                              |
| `/clients/[clientId]/documents/[key]` | Server Component | Document editor (create or edit by key)                      |

Components:

- `ClientStatusBadge` — color-coded status chip
- `ClientList` — Client Component with live search/filter/pagination via router
- `ClientForm` — Client Component for create and edit modes
- `DocumentEditor` — Client Component with textarea and status toggle

Header extended with `actions?: ReactNode` slot (right side).

---

## Files created / modified

| Area                                    | Files                                                               |
| --------------------------------------- | ------------------------------------------------------------------- |
| `supabase/migrations/`                  | 1 migration                                                         |
| `packages/domain/src/`                  | 3 files (entities, repository, errors)                              |
| `packages/shared/src/`                  | 2 files (schema, index)                                             |
| `packages/application/src/`             | 6 files (5 use cases + index)                                       |
| `packages/infrastructure/src/`          | 5 files (supabase repo, in-memory repo, mapper, mapper test, index) |
| `apps/web/src/lib/supabase/`            | 1 file (types)                                                      |
| `apps/web/src/components/clients/`      | 4 files                                                             |
| `apps/web/src/components/layout/`       | 1 file (Header.tsx — added actions slot)                            |
| `apps/web/src/app/(protected)/clients/` | 6 files (actions + 5 pages)                                         |
| `packages/application/src/__tests__/`   | 3 files (2 new, 1 updated)                                          |

---

## Manual steps required (one-time)

Apply in Supabase Dashboard → SQL Editor:

```
supabase/migrations/20260730120000_phase3_clients.sql
```

**⚠️ Do not run migrations against remote Supabase via CLI without verifying the connection first.**

---

## Validation results

| Check                                    | Result                  |
| ---------------------------------------- | ----------------------- |
| `tsc --noEmit` (all packages + apps/web) | ✅                      |
| `eslint` (apps/web)                      | ✅                      |
| `vitest run` (all packages)              | ✅ 78 tests in 10 files |
| `prettier --check`                       | ✅                      |
