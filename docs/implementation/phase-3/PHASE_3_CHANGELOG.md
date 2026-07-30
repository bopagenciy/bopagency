# Phase 3 — Changelog

All changes relative to Phase 2 closure state.

## supabase/migrations/

- `20260730120000_phase3_clients.sql` — CREATE TABLE clients, client_contacts, client_documents, client_integrations; enums; RLS policies; trigger; indexes

## packages/domain/

- `src/entities/client.ts` — Extended from stub. Added: `ClientContactId`, `ClientDocumentId`, `ClientIntegrationId`, `ClientStatus`, `ClientIndustry`, `DocumentStatus`, `IntegrationStatus`, `ClientContact`, `ClientDocument`, `ClientIntegration`, `ClientWithDocuments`, `ClientFilter`, `CreateClientInput`, `UpdateClientInput`, `UpsertClientDocumentInput`, `CreateClientContactInput`
- `src/repositories/client.repository.ts` — Rewritten with 13 methods: `findById`, `findAll`, `findBySlug`, `create`, `update`, `delete`, `softDelete`, `findByIdWithDocuments`, `listContacts`, `listDocuments`, `getDocumentByKey`, `upsertDocument`, `listIntegrations`
- `src/errors/domain.errors.ts` — Added: `clientDeleted()`, `documentNotFound()`, `contactNotFound()`
- `src/index.ts` — Exports all new types and errors

## packages/shared/

- `src/schemas/client.schema.ts` — NEW: `createClientSchema`, `updateClientSchema`, `clientFilterSchema`, `upsertClientDocumentSchema`, `CLIENT_STATUSES`, `CLIENT_INDUSTRIES`, `CLIENT_CURRENCIES`
- `src/index.ts` — Exports all new schemas and constants

## packages/application/

- `src/use-cases/clients/create-client.use-case.ts` — NEW
- `src/use-cases/clients/update-client.use-case.ts` — NEW
- `src/use-cases/clients/soft-delete-client.use-case.ts` — NEW
- `src/use-cases/clients/get-client-with-documents.use-case.ts` — NEW
- `src/use-cases/clients/upsert-client-document.use-case.ts` — NEW
- `src/index.ts` — Exports all 5 use cases and their input/deps types
- `src/__tests__/list-clients.test.ts` — Updated mock to include all new Client fields and new repo methods
- `src/__tests__/create-client.test.ts` — NEW (6 tests)
- `src/__tests__/soft-delete-client.test.ts` — NEW (5 tests)

## packages/infrastructure/

- `src/supabase/mappers/client.mapper.ts` — NEW: row types + 4 mapper functions
- `src/supabase/mappers/__tests__/client.mapper.test.ts` — NEW: 7 tests
- `src/supabase/supabase-client.repository.ts` — NEW: full `ClientRepository` implementation
- `src/in-memory/in-memory-client.repository.ts` — REWRITTEN: full implementation with test helpers
- `src/index.ts` — Exports `SupabaseClientRepository`, `InMemoryClientRepository`, mappers and row types

## apps/web/src/lib/supabase/

- `types.ts` — Added `ClientStatus`, `ClientIndustry`, `DocumentStatus`, `IntegrationStatus` aliases; `ClientRow`, `ClientContactRow`, `ClientDocumentRow`, `ClientIntegrationRow`; all Insert/Update variants; extended `Database.public.Tables`

## apps/web/src/components/

- `layout/Header.tsx` — Added `actions?: ReactNode` prop with right-side slot
- `clients/ClientStatusBadge.tsx` — NEW
- `clients/ClientList.tsx` — NEW
- `clients/ClientForm.tsx` — NEW
- `clients/DocumentEditor.tsx` — NEW

## apps/web/src/app/(protected)/clients/

- `actions.ts` — NEW: `createClientAction`, `updateClientAction`, `softDeleteClientAction`, `upsertDocumentAction`
- `page.tsx` — REPLACED stub with real paginated list
- `new/page.tsx` — NEW
- `[clientId]/page.tsx` — REPLACED stub with full detail view
- `[clientId]/edit/page.tsx` — NEW
- `[clientId]/documents/[key]/page.tsx` — NEW

## Security audit (post-implementation corrections)

### `supabase/migrations/20260730120000_phase3_clients.sql` — reescritura de seguridad

- Añadido `DROP TRIGGER IF EXISTS` / `DROP POLICY IF EXISTS` antes de cada creación (re-ejecutabilidad)
- Nueva función `manage_client_write()` — BEFORE INSERT OR UPDATE en `clients`: asigna auditoría desde `auth.uid()`, protege campos inmutables, bloquea updates a clientes borrados, requiere `admin+` para soft delete, bloquea restauración directa
- Nueva función `set_document_audit()` — BEFORE INSERT OR UPDATE en `client_documents`: asigna `created_by`/`updated_by` desde `auth.uid()`
- Nueva función `protect_child_immutable_fields()` — BEFORE UPDATE en `client_contacts` y `client_integrations`: protege `id`, `organization_id`, `client_id`, `created_at`
- Actualizado `check_client_organization_match()`: ahora rechaza si el cliente padre tiene `deleted_at IS NOT NULL`
- Nueva RPC SECURITY DEFINER `soft_delete_client(p_client_id)`: verifica auth + rol `admin+` + asigna auditoría desde `auth.uid()`; `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated`
- Nueva RPC SECURITY DEFINER `upsert_client_document(...)`: verifica auth + rol `operator+` + cliente activo + formato de key; control de versión optimista con `p_expected_version`; incrementa `version`
- Nuevo índice parcial único `uq_client_contacts_one_primary` — garantiza un solo contacto primario activo por cliente
- Nuevas CHECK constraints `ck_clients_metadata_object` y `ck_client_integrations_config_object` — JSONB debe ser objeto
- Todas las políticas SELECT/INSERT/UPDATE de tablas hijas incluyen check `EXISTS (active parent client)`
- Eliminado `USING (true)` y `WITH CHECK (true)` — todas las políticas tienen predicados explícitos
- Eliminada política DELETE para `authenticated` en todas las tablas

### `packages/domain/src/entities/client.ts`

- Añadido `expectedVersion?: number | null` a `UpsertClientDocumentInput`

### `packages/infrastructure/src/supabase/supabase-client.repository.ts`

- `create()`: eliminado `created_by` del payload INSERT (asignado por trigger)
- `update()`: eliminado `updated_by` del patch (asignado por trigger)
- `softDelete()`: reemplazado UPDATE directo por RPC `soft_delete_client`
- `upsertDocument()`: reemplazado `.upsert()` directo por RPC `upsert_client_document` con `p_expected_version`; manejo de error `'version conflict'` → `CONFLICT`

### `packages/application/src/use-cases/clients/upsert-client-document.use-case.ts`

- Añadido `expectedVersion?: number | null` al input; propagado al repositorio

### `apps/web/src/app/(protected)/clients/actions.ts`

- `upsertDocumentAction`: lee `expectedVersion` de `formData.get('expectedVersion')` y lo pasa al use case

### `apps/web/src/components/clients/DocumentEditor.tsx`

- Añadido `<input type="hidden" name="expectedVersion" value={version} />` para enviar versión actual al servidor

---

## Bug fixes

| Bug                                                                            | Fix                                                      |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Result discriminant `.ok` used instead of `.success` in repository and actions | Replaced throughout                                      |
| `Err<AppError>` accessed as `result.code` in tests                             | Fixed to `result.error.code`                             |
| `PaginatedResult` missing `hasNextPage`/`hasPreviousPage` in Supabase repo     | Added both fields                                        |
| `exactOptionalPropertyTypes` violation: `slug: string \| undefined` in actions | Conditional spread `...(slug !== undefined && { slug })` |
| Unused import `updateClientAction` in client detail page                       | Removed                                                  |
| Unused destructured param `pageSize` in `ClientList`                           | Renamed to `_pageSize`                                   |
| `industry ?? undefined` in edit page — type expected `null` not `undefined`    | Changed to `industry ?? null`                            |
