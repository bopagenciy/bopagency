# Phase 3 — Closure Document

**Phase:** 3 — Client Management
**Status:** ✅ CLOSED
**Closed:** 2026-07-30
**Implemented by:** Claude (Anthropic) — Cowork mode

---

## Verification checklist

### Database

- [x] Migration `20260730120000_phase3_clients.sql` created
- [x] 3 enums: `client_status`, `document_status`, `integration_status`
- [x] 4 tables: `clients`, `client_contacts`, `client_documents`, `client_integrations`
- [x] Soft delete columns on clients (`deleted_at`, `deleted_by`)
- [x] Partial unique index on `(organization_id, slug) WHERE deleted_at IS NULL`
- [x] FTS index on `clients.name`
- [x] UNIQUE `(client_id, document_key)` on documents for upsert semantics
- [x] `UNIQUE (client_id, provider)` on integrations
- [x] Trigger `check_client_organization_match()` on 3 child tables
- [x] RLS enabled on all 4 tables with correct role boundaries
- [x] ⚠️ MANUAL ACTION REQUIRED: Apply migration in Supabase Dashboard SQL Editor

### Domain package

- [x] Branded types: `ClientId`, `ClientContactId`, `ClientDocumentId`, `ClientIntegrationId`
- [x] Entities: `Client`, `ClientContact`, `ClientDocument`, `ClientIntegration`, `ClientWithDocuments`
- [x] `ClientRepository` interface with 13 methods
- [x] Domain errors: `clientDeleted`, `documentNotFound`, `contactNotFound`
- [x] All types exported from package index

### Shared package

- [x] `createClientSchema` with all fields + defaults
- [x] `updateClientSchema` (all optional)
- [x] `clientFilterSchema`
- [x] `upsertClientDocumentSchema`
- [x] Constants: `CLIENT_STATUSES`, `CLIENT_INDUSTRIES`, `CLIENT_CURRENCIES`
- [x] All exported from package index

### Application package

- [x] `createClient` use case
- [x] `updateClient` use case
- [x] `softDeleteClient` use case with admin role enforcement
- [x] `getClientWithDocuments` use case
- [x] `upsertClientDocument` use case
- [x] All exported from package index

### Infrastructure package

- [x] `SupabaseClientRepository` — all 13 interface methods
- [x] `InMemoryClientRepository` — all 13 interface methods + test helpers
- [x] Row→entity mappers for all 4 tables
- [x] All exported from package index

### UI / Pages

- [x] `Header` extended with `actions` slot
- [x] `ClientStatusBadge` component
- [x] `ClientList` component (search, filter, pagination)
- [x] `ClientForm` component (create + edit modes)
- [x] `DocumentEditor` component
- [x] `/clients` — paginated list page
- [x] `/clients/new` — create form page
- [x] `/clients/[clientId]` — detail page with contacts, documents, integrations, danger zone
- [x] `/clients/[clientId]/edit` — edit form page
- [x] `/clients/[clientId]/documents/[key]` — document editor page
- [x] Server actions: `createClientAction`, `updateClientAction`, `softDeleteClientAction`, `upsertDocumentAction`
- [x] Role enforcement: operator for CUD, admin for delete

### Tests

- [x] `packages/infrastructure/src/supabase/mappers/__tests__/client.mapper.test.ts` — 7 tests
- [x] `packages/application/src/__tests__/create-client.test.ts` — 6 tests
- [x] `packages/application/src/__tests__/soft-delete-client.test.ts` — 5 tests
- [x] `packages/application/src/__tests__/list-clients.test.ts` — updated (2 tests)
- [x] **Total Phase 3: 20 new/updated tests**
- [x] **Grand total validated: 78 tests in 10 files across all packages**

### Validation

- [x] `tsc --noEmit` — packages/shared ✅ packages/domain ✅ packages/application ✅ packages/infrastructure ✅ apps/web ✅
- [x] `eslint` — apps/web ✅ 0 errors
- [x] `vitest run` — 78 tests ✅ 0 failures
- [x] `prettier --check` ✅ all files formatted

### Documentation

- [x] PHASE_3_SUMMARY.md
- [x] DATA_MODEL.md
- [x] DEVELOPER_GUIDE.md
- [x] PHASE_3_CHANGELOG.md
- [x] PHASE_3_CLOSURE.md

---

## Constraints observed

- No Fase 4 started
- No Auth/onboarding/organizations/settings modified
- No commit or push
- No `any`, `@ts-ignore`, `eslint-disable`, `--force`, `--legacy-peer-deps`
- No existing data deleted
- No remote Supabase migrations executed
- Supabase imports always explicit (`/server`, `/browser`, `/middleware`) — never from barrel

---

## Deferred to Phase 4+

- `createClientContact` and `deleteClientContact` use cases (UI currently shows contacts read-only)
- Pagination cursor-based (current: offset/page)
- Client search via full-text search vector (current: ILIKE)
- Integration management UI (currently read-only from detail page)
- Client restore (undo soft delete)
- Bulk operations on clients
- Client export (CSV/PDF)
- Supabase type codegen (`supabase gen types typescript`) to replace hand-written `ClientRow` types

---

## Manual actions required before testing

1. Apply `supabase/migrations/20260730120000_phase3_clients.sql` in Supabase Dashboard → SQL Editor
2. Ensure Phase 2 migrations are already applied (prerequisite)
3. Verify RLS policies work: log in as different roles and confirm access boundaries
