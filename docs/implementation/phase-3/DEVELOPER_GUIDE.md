# Phase 3 — Developer Guide

## Creating a client

From a Server Action (operator role minimum):

```typescript
import { createClientAction } from '@/app/(protected)/clients/actions';

// In a <form action={createClientAction}>
// Required field: name
// Optional: legalName, slug, status, industry, timezone, currency, website, email, phone, notes
```

From the use case layer directly (e.g. in a custom server action):

```typescript
import { createClient } from '@bop-agency/application';
import { SupabaseClientRepository } from '@bop-agency/infrastructure';
import { consoleLogger } from '@bop-agency/infrastructure';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabase = await createServerSupabaseClient();
const repo = new SupabaseClientRepository(supabase);

const result = await createClient(
  {
    organizationId: org.id as OrganizationId,
    name: 'Acme Corp',
    createdBy: user.id,
  },
  { clientRepository: repo, logger: consoleLogger },
);

if (!result.success) {
  // result.error.code: 'VALIDATION_ERROR' | 'CONFLICT' | ...
  throw new Error(result.error.message);
}

const client = result.value; // Client entity
```

## Slug generation

If `slug` is not provided, it is auto-generated from `name`:

```
"Acme Corp & Partners" → "acme-corp-partners"
```

The slug must be unique per organization (among non-deleted clients). Slug collisions return `{ code: 'CONFLICT' }`.

## Upserting a document

Documents are keyed by `documentKey` — a lowercase alphanumeric slug (`^[a-z0-9_-]+$`). Calling upsert with the same key updates the existing document and bumps `version`.

```typescript
import { upsertDocumentAction } from '@/app/(protected)/clients/actions';

// formData must include: documentKey, title, content
// optional: category, status
```

## Soft deleting a client

Requires `admin` or `owner` role. The use case enforces this independently of the action-level `requireOrganizationRole('admin')` check — defence in depth.

```typescript
import { softDeleteClientAction } from '@/app/(protected)/clients/actions';
await softDeleteClientAction(clientId); // redirects to /clients on success
```

A client with `deletedAt !== null` returns `{ code: 'CLIENT_DELETED' }` if you try to soft-delete it again.

## Reading client data

All queries in Server Components use the user-scoped Supabase client (RLS active):

```typescript
const supabase = await createServerSupabaseClient();

// List
const { data } = await supabase
  .from('clients')
  .select('*')
  .eq('organization_id', orgId)
  .is('deleted_at', null)
  .order('created_at', { ascending: false });

// Detail + related
const [{ data: client }, { data: contacts }, { data: docs }] = await Promise.all([
  supabase.from('clients').select('*').eq('id', clientId).single(),
  supabase.from('client_contacts').select('*').eq('client_id', clientId).is('deleted_at', null),
  supabase.from('client_documents').select('*').eq('client_id', clientId).order('document_key'),
]);
```

Or via the repository (use case layer):

```typescript
const repo = new SupabaseClientRepository(supabase);
const result = await repo.findByIdWithDocuments(id as ClientId, orgId as OrganizationId);
```

## Writing tests

Use `InMemoryClientRepository` — no Supabase connection needed:

```typescript
import { InMemoryClientRepository } from '@bop-agency/infrastructure';

const repo = new InMemoryClientRepository();

// Seed a client
repo.seed({
  id: 'client_1' as ClientId,
  organizationId: 'org_1' as OrganizationId,
  name: 'Test Client',
  slug: 'test-client',
  status: 'active',
  // ... all required fields
});

// Seed related data
repo.seedDocument('client_1' as ClientId, {/* ClientDocument */});
repo.seedContact('client_1' as ClientId, {/* ClientContact */});

// Clean up between tests
repo.clear();
```

See `packages/application/src/__tests__/create-client.test.ts` and `soft-delete-client.test.ts` for full examples.

## Result pattern

All repository methods and use cases return `Result<T>`:

```typescript
import { isOk, isErr } from '@bop-agency/shared';

const result = await repo.findById(id, orgId);

if (isOk(result)) {
  console.log(result.value); // T
} else {
  console.error(result.error.code, result.error.message); // AppError
}

// Or with narrowing:
if (!result.success) {
  return { ok: false, error: result.error.message };
}
// result.value is available here
```

**Important:** The discriminant is `result.success` (boolean), NOT `result.ok`. There is no `.ok` property on `Result`.

## Supabase import rule

```typescript
// ✅ Server Components, Server Actions, Route Handlers
import { createServerSupabaseClient } from '@/lib/supabase/server';

// ✅ Client Components
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

// ✅ Middleware
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

// ❌ Never import from the barrel
import { ... } from '@/lib/supabase'; // FORBIDDEN
```

## Role requirements

| Action              | Minimum role |
| ------------------- | ------------ |
| View client list    | viewer       |
| View client detail  | viewer       |
| Create client       | operator     |
| Edit client         | operator     |
| Upsert document     | operator     |
| Soft delete client  | admin        |
| Manage integrations | admin        |

Enforced via `requireOrganizationRole(role)` in server actions AND `hasMinimumRole(callerRole, 'admin')` in the `softDeleteClient` use case.
