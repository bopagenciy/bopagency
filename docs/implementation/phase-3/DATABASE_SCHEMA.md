# Phase 3 — Esquema de Base de Datos

> Migración: `supabase/migrations/20260730120000_phase3_clients.sql`

## Enums

### `client_status`

```
active | inactive | onboarding | churned
```

### `client_industry`

```
hospitality | legal | ecommerce | retail | healthcare |
technology | education | real_estate | finance | food_beverage | other
```

### `document_status`

```
draft | published | archived
```

### `integration_status`

```
active | inactive | error
```

---

## Tabla `clients`

Entidad raíz multi-tenant. Toda fila pertenece a exactamente una organización.

| Columna           | Tipo              | Nullable | Default             | Descripción                                   |
| ----------------- | ----------------- | -------- | ------------------- | --------------------------------------------- |
| `id`              | `uuid`            | NO       | `gen_random_uuid()` | PK                                            |
| `organization_id` | `uuid`            | NO       | —                   | FK → `organizations.id` ON DELETE CASCADE     |
| `name`            | `text`            | NO       | —                   | Nombre comercial                              |
| `legal_name`      | `text`            | SÍ       | NULL                | Razón social                                  |
| `slug`            | `text`            | NO       | —                   | Identificador URL-safe único por organización |
| `status`          | `client_status`   | NO       | `'active'`          | Estado del cliente                            |
| `industry`        | `client_industry` | SÍ       | NULL                | Sector                                        |
| `timezone`        | `text`            | NO       | `'America/Bogota'`  | Zona horaria IANA                             |
| `currency`        | `text`            | NO       | `'COP'`             | ISO 4217                                      |
| `website`         | `text`            | SÍ       | NULL                | URL                                           |
| `email`           | `text`            | SÍ       | NULL                | Email de contacto principal                   |
| `phone`           | `text`            | SÍ       | NULL                | Teléfono                                      |
| `notes`           | `text`            | SÍ       | NULL                | Notas internas                                |
| `metadata`        | `jsonb`           | NO       | `'{}'`              | Datos adicionales (debe ser objeto JSON)      |
| `created_by`      | `uuid`            | NO       | —                   | Asignado por trigger desde `auth.uid()`       |
| `updated_by`      | `uuid`            | SÍ       | NULL                | Asignado por trigger desde `auth.uid()`       |
| `created_at`      | `timestamptz`     | NO       | `now()`             | Inmutable                                     |
| `updated_at`      | `timestamptz`     | NO       | `now()`             | Actualizado por trigger `set_updated_at`      |
| `deleted_at`      | `timestamptz`     | SÍ       | NULL                | Soft delete; requiere rol `admin+`            |
| `deleted_by`      | `uuid`            | SÍ       | NULL                | Asignado por trigger desde `auth.uid()`       |

### Índices

| Nombre                        | Columnas                                             | Tipo             |
| ----------------------------- | ---------------------------------------------------- | ---------------- |
| `clients_pkey`                | `id`                                                 | PRIMARY KEY      |
| `uq_clients_org_slug`         | `(organization_id, slug)` WHERE `deleted_at IS NULL` | UNIQUE (parcial) |
| `idx_clients_organization_id` | `organization_id`                                    | BTREE            |
| `idx_clients_status`          | `status`                                             | BTREE            |
| `idx_clients_deleted_at`      | `deleted_at`                                         | BTREE            |

### CHECK constraints

- `ck_clients_metadata_object`: `jsonb_typeof(metadata) = 'object'`

---

## Tabla `client_contacts`

Contactos asociados a un cliente. Soporta soft delete independiente.

| Columna           | Tipo          | Nullable | Default             | Descripción                                                        |
| ----------------- | ------------- | -------- | ------------------- | ------------------------------------------------------------------ |
| `id`              | `uuid`        | NO       | `gen_random_uuid()` | PK                                                                 |
| `client_id`       | `uuid`        | NO       | —                   | FK → `clients.id` ON DELETE CASCADE                                |
| `organization_id` | `uuid`        | NO       | —                   | FK → `organizations.id` ON DELETE CASCADE; desnormalizado para RLS |
| `name`            | `text`        | NO       | —                   | Nombre completo                                                    |
| `title`           | `text`        | SÍ       | NULL                | Cargo                                                              |
| `email`           | `text`        | SÍ       | NULL                | Email                                                              |
| `phone`           | `text`        | SÍ       | NULL                | Teléfono                                                           |
| `is_primary`      | `boolean`     | NO       | `false`             | Contacto principal                                                 |
| `notes`           | `text`        | SÍ       | NULL                | Notas                                                              |
| `created_at`      | `timestamptz` | NO       | `now()`             | Inmutable                                                          |
| `updated_at`      | `timestamptz` | NO       | `now()`             | Actualizado por trigger                                            |
| `deleted_at`      | `timestamptz` | SÍ       | NULL                | Soft delete                                                        |

### Índices

| Nombre                           | Columnas                                                     | Tipo             |
| -------------------------------- | ------------------------------------------------------------ | ---------------- |
| `client_contacts_pkey`           | `id`                                                         | PRIMARY KEY      |
| `idx_client_contacts_client_id`  | `client_id`                                                  | BTREE            |
| `uq_client_contacts_one_primary` | `client_id` WHERE `is_primary = true AND deleted_at IS NULL` | UNIQUE (parcial) |

> El índice `uq_client_contacts_one_primary` garantiza que solo puede existir un contacto primario activo por cliente a nivel de BD.

---

## Tabla `client_documents`

Documentos clave-valor asociados a un cliente. Sin soft delete propio (se borran con el cliente). Versión incremental para control de concurrencia.

| Columna           | Tipo              | Nullable | Default             | Descripción                                         |
| ----------------- | ----------------- | -------- | ------------------- | --------------------------------------------------- |
| `id`              | `uuid`            | NO       | `gen_random_uuid()` | PK                                                  |
| `client_id`       | `uuid`            | NO       | —                   | FK → `clients.id` ON DELETE CASCADE                 |
| `organization_id` | `uuid`            | NO       | —                   | FK → `organizations.id`; desnormalizado para RLS    |
| `document_key`    | `text`            | NO       | —                   | Clave URL-safe: `^[a-z][a-z0-9_-]{0,98}[a-z0-9]$`   |
| `title`           | `text`            | NO       | —                   | Título legible                                      |
| `category`        | `text`            | NO       | `'general'`         | Categoría libre                                     |
| `content`         | `text`            | NO       | `''`                | Contenido del documento                             |
| `status`          | `document_status` | NO       | `'draft'`           | Estado de publicación                               |
| `version`         | `integer`         | NO       | `1`                 | Versión; incrementada por RPC en cada actualización |
| `created_by`      | `uuid`            | NO       | —                   | Asignado por trigger desde `auth.uid()`             |
| `updated_by`      | `uuid`            | SÍ       | NULL                | Asignado por trigger desde `auth.uid()`             |
| `created_at`      | `timestamptz`     | NO       | `now()`             | Inmutable                                           |
| `updated_at`      | `timestamptz`     | NO       | `now()`             | Actualizado por trigger                             |

### Índices

| Nombre                           | Columnas                    | Tipo        |
| -------------------------------- | --------------------------- | ----------- |
| `client_documents_pkey`          | `id`                        | PRIMARY KEY |
| `uq_client_documents_key`        | `(client_id, document_key)` | UNIQUE      |
| `idx_client_documents_client_id` | `client_id`                 | BTREE       |

---

## Tabla `client_integrations`

Conexiones con plataformas externas (ej. Meta Ads, Google Analytics).

| Columna               | Tipo                 | Nullable | Default             | Descripción                                            |
| --------------------- | -------------------- | -------- | ------------------- | ------------------------------------------------------ |
| `id`                  | `uuid`               | NO       | `gen_random_uuid()` | PK                                                     |
| `client_id`           | `uuid`               | NO       | —                   | FK → `clients.id` ON DELETE CASCADE                    |
| `organization_id`     | `uuid`               | NO       | —                   | FK → `organizations.id`; desnormalizado para RLS       |
| `provider`            | `text`               | NO       | —                   | Nombre del proveedor (ej. `'meta_ads'`)                |
| `external_account_id` | `text`               | NO       | —                   | ID de cuenta en el proveedor                           |
| `status`              | `integration_status` | NO       | `'active'`          | Estado de la integración                               |
| `configuration`       | `jsonb`              | NO       | `'{}'`              | Config específica del proveedor (debe ser objeto JSON) |
| `last_synced_at`      | `timestamptz`        | SÍ       | NULL                | Último sync exitoso                                    |
| `created_at`          | `timestamptz`        | NO       | `now()`             | Inmutable                                              |
| `updated_at`          | `timestamptz`        | NO       | `now()`             | Actualizado por trigger                                |

### Índices

| Nombre                              | Columnas                | Tipo        |
| ----------------------------------- | ----------------------- | ----------- |
| `client_integrations_pkey`          | `id`                    | PRIMARY KEY |
| `uq_client_integrations_provider`   | `(client_id, provider)` | UNIQUE      |
| `idx_client_integrations_client_id` | `client_id`             | BTREE       |

### CHECK constraints

- `ck_client_integrations_config_object`: `jsonb_typeof(configuration) = 'object'`

---

## Relaciones

```
organizations
    │
    ├── clients (organization_id)
    │       │
    │       ├── client_contacts   (client_id, organization_id)
    │       ├── client_documents  (client_id, organization_id)
    │       └── client_integrations (client_id, organization_id)
```

- `organization_id` está desnormalizado en las tres tablas hijas para que las políticas RLS puedan filtrar por organización sin un JOIN adicional.
- El trigger `check_client_organization_match()` verifica en INSERT/UPDATE que el `organization_id` del hijo coincide con el del padre en `clients`, y que el padre no está borrado.

---

## Funciones y RPCs

| Nombre                              | Tipo       | `SECURITY DEFINER` | Descripción                                                                                   |
| ----------------------------------- | ---------- | ------------------ | --------------------------------------------------------------------------------------------- |
| `manage_client_write()`             | Trigger fn | NO                 | BEFORE INSERT/UPDATE en `clients`; asigna auditoría, protege inmutables, controla soft delete |
| `set_document_audit()`              | Trigger fn | NO                 | BEFORE INSERT/UPDATE en `client_documents`; asigna `created_by`/`updated_by`                  |
| `protect_child_immutable_fields()`  | Trigger fn | NO                 | BEFORE UPDATE en tablas hijas; protege `id`, `organization_id`, `client_id`, `created_at`     |
| `check_client_organization_match()` | Trigger fn | NO                 | BEFORE INSERT/UPDATE en tablas hijas; verifica coherencia de `organization_id` y padre activo |
| `set_updated_at()`                  | Trigger fn | NO                 | BEFORE UPDATE en todas las tablas; `NEW.updated_at = now()`                                   |
| `soft_delete_client(p_client_id)`   | RPC        | SÍ                 | Borrado lógico con verificación de rol `admin+`                                               |
| `upsert_client_document(...)`       | RPC        | SÍ                 | Upsert con control de versión optimista                                                       |
