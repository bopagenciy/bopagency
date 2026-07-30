# Phase 3 — Data Model

## Entity Relationship

```
organizations
    └── clients (organization_id, soft delete)
            ├── client_contacts    (client_id + organization_id)
            ├── client_documents   (client_id + organization_id, UNIQUE on document_key)
            └── client_integrations (client_id + organization_id)
```

## Table: `clients`

| Column            | Type            | Notes                                                                                                                          |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`              | `uuid` PK       | gen_random_uuid()                                                                                                              |
| `organization_id` | `uuid` FK       | → organizations.id ON DELETE CASCADE                                                                                           |
| `name`            | `text` NOT NULL | Full display name                                                                                                              |
| `legal_name`      | `text`          | Official legal name, nullable                                                                                                  |
| `slug`            | `text` NOT NULL | URL-safe identifier; partial UNIQUE `(org_id, slug) WHERE deleted_at IS NULL`                                                  |
| `status`          | `client_status` | active / inactive / onboarding / churned                                                                                       |
| `industry`        | `text`          | hospitality / legal / ecommerce / retail / healthcare / technology / education / real_estate / finance / food_beverage / other |
| `timezone`        | `text`          | Default: America/Bogota                                                                                                        |
| `currency`        | `text`          | Default: COP                                                                                                                   |
| `website`         | `text`          | nullable                                                                                                                       |
| `email`           | `text`          | nullable                                                                                                                       |
| `phone`           | `text`          | nullable                                                                                                                       |
| `notes`           | `text`          | Internal notes, nullable                                                                                                       |
| `metadata`        | `jsonb`         | Extensible KV store, default `{}`                                                                                              |
| `created_by`      | `uuid`          | FK → auth.users                                                                                                                |
| `updated_by`      | `uuid`          | nullable, FK → auth.users                                                                                                      |
| `created_at`      | `timestamptz`   | auto                                                                                                                           |
| `updated_at`      | `timestamptz`   | auto via trigger                                                                                                               |
| `deleted_at`      | `timestamptz`   | nullable — soft delete marker                                                                                                  |
| `deleted_by`      | `uuid`          | nullable, FK → auth.users                                                                                                      |

**Indexes:**

- `idx_clients_organization_id` on `(organization_id)`
- `idx_clients_status` on `(organization_id, status)`
- `idx_clients_slug_org` UNIQUE on `(organization_id, slug) WHERE deleted_at IS NULL`
- `idx_clients_name_fts` GIN on `to_tsvector('spanish', name)`

## Table: `client_contacts`

| Column                      | Type            | Notes                                      |
| --------------------------- | --------------- | ------------------------------------------ |
| `id`                        | `uuid` PK       |                                            |
| `client_id`                 | `uuid` FK       | → clients.id ON DELETE CASCADE             |
| `organization_id`           | `uuid` FK       | Denormalized for RLS — enforced by trigger |
| `name`                      | `text` NOT NULL |                                            |
| `title`                     | `text`          | nullable                                   |
| `email`                     | `text`          | nullable                                   |
| `phone`                     | `text`          | nullable                                   |
| `is_primary`                | `boolean`       | Default false                              |
| `notes`                     | `text`          | nullable                                   |
| `created_at` / `updated_at` | `timestamptz`   | auto                                       |
| `deleted_at`                | `timestamptz`   | soft delete                                |

## Table: `client_documents`

| Column                      | Type              | Notes                                                            |
| --------------------------- | ----------------- | ---------------------------------------------------------------- |
| `id`                        | `uuid` PK         |                                                                  |
| `client_id`                 | `uuid` FK         | → clients.id ON DELETE CASCADE                                   |
| `organization_id`           | `uuid` FK         | Denormalized, trigger-enforced                                   |
| `document_key`              | `text` NOT NULL   | Slug-like key; `UNIQUE (client_id, document_key)` enables upsert |
| `title`                     | `text` NOT NULL   |                                                                  |
| `category`                  | `text`            | Default: general                                                 |
| `content`                   | `text` NOT NULL   | Raw text / markdown                                              |
| `status`                    | `document_status` | draft / published / archived                                     |
| `version`                   | `integer`         | Bumped on each upsert                                            |
| `created_by` / `updated_by` | `uuid`            | FK → auth.users                                                  |
| `created_at` / `updated_at` | `timestamptz`     | auto                                                             |

## Table: `client_integrations`

| Column                         | Type                 | Notes                                   |
| ------------------------------ | -------------------- | --------------------------------------- |
| `id`                           | `uuid` PK            |                                         |
| `client_id`                    | `uuid` FK            | → clients.id ON DELETE CASCADE          |
| `organization_id`              | `uuid` FK            | Denormalized, trigger-enforced          |
| `provider`                     | `text` NOT NULL      | e.g. google_analytics, meta_ads         |
| `external_account_id`          | `text` NOT NULL      | Account ID in the provider              |
| `status`                       | `integration_status` | active / inactive / error               |
| `configuration`                | `jsonb`              | Provider-specific config, default `{}`  |
| `last_synced_at`               | `timestamptz`        | nullable                                |
| `created_at` / `updated_at`    | `timestamptz`        | auto                                    |
| `UNIQUE (client_id, provider)` |                      | One integration per provider per client |

## RLS Policies

| Table                 | SELECT | INSERT    | UPDATE    | DELETE                           |
| --------------------- | ------ | --------- | --------- | -------------------------------- |
| `clients`             | member | operator+ | operator+ | admin+ (hard delete discouraged) |
| `client_contacts`     | member | operator+ | operator+ | —                                |
| `client_documents`    | member | operator+ | operator+ | —                                |
| `client_integrations` | member | admin+    | admin+    | —                                |

All policies use `is_organization_member()` / `has_organization_role()` SECURITY DEFINER functions (defined in Phase 2).

## Soft Delete Pattern

- A client is "deleted" when `deleted_at IS NOT NULL`.
- `deleted_by` records which user performed the action.
- All SELECT queries must add `.is('deleted_at', null)` to exclude deleted records.
- The partial unique index on `(org_id, slug) WHERE deleted_at IS NULL` allows slug reuse after soft delete.
- Only `admin` or `owner` roles can soft-delete a client (enforced in the use case layer, not DB).
- Child records (contacts, documents, integrations) are kept intact after a client soft delete; `ON DELETE CASCADE` only fires on hard deletes.

## Multi-tenant Integrity

The trigger `check_client_organization_match()` fires BEFORE INSERT OR UPDATE on `client_contacts`, `client_documents`, and `client_integrations`. It verifies that `NEW.organization_id` equals the parent client's `organization_id`. This prevents cross-org data leakage even if a bug passes the wrong org_id.
