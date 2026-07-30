# Phase 3 — Modelo RLS (Row-Level Security)

> Migración: `supabase/migrations/20260730120000_phase3_clients.sql`

## Principios de diseño

1. **Defense-in-depth**: la lógica de permisos vive en la base de datos, no solo en la capa de aplicación. Las Server Actions imponen el mismo control, pero la BD es la línea de defensa final.
2. **Mínimo privilegio**: `authenticated` puede leer sus datos de organización; las escrituras destructivas requieren `admin` o superior.
3. **Ninguna fuga cross-tenant**: cada política filtra por `organization_id` vía `is_organization_member(org_id)`.
4. **Sin `USING (true)` ni `WITH CHECK (true)`**: todas las políticas tienen predicados explícitos.
5. **Auditoría desde la BD**: `created_by`, `updated_by`, `deleted_by` son asignados por triggers desde `auth.uid()`, nunca confiados desde la aplicación.

---

## Funciones helper reutilizadas (Phase 2)

| Función                                         | Semántica                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `is_organization_member(org_id uuid)`           | `true` si el usuario tiene `status = 'active'` en la organización                                      |
| `has_organization_role(org_id uuid, role text)` | `true` si el rol del miembro es `role` **o superior** (viewer < operator < strategist < admin < owner) |
| `can_manage_organization(org_id uuid)`          | shorthand para `has_organization_role(org_id, 'admin')`                                                |

> Todas operan sobre `organization_members` filtrando `status = 'active'`.

---

## Tabla `clients`

### Políticas SELECT

```
Nombre: clients_select
Roles:  authenticated
USING:  is_organization_member(organization_id)
```

Cualquier miembro activo puede leer clientes de su organización. Los registros con `deleted_at IS NOT NULL` son visibles solo para quien tiene el predicado correcto — las rutas de la app filtran `deleted_at IS NULL` explícitamente.

### Políticas INSERT

```
Nombre:     clients_insert
Roles:      authenticated
WITH CHECK: has_organization_role(organization_id, 'operator')
```

Requiere rol `operator` o superior.

### Políticas UPDATE

```
Nombre:     clients_update
Roles:      authenticated
USING:      has_organization_role(organization_id, 'operator')
WITH CHECK: has_organization_role(organization_id, 'operator')
            AND organization_id = (SELECT organization_id FROM clients WHERE id = id)
```

El trigger `trg_clients_guard` (→ `manage_client_write()`) añade protección adicional:

- Campos inmutables (`id`, `organization_id`, `created_at`, `created_by`) no pueden modificarse.
- Actualizaciones a clientes con `deleted_at IS NOT NULL` son bloqueadas.
- Establecer `deleted_at` requiere `has_organization_role(org_id, 'admin')`.
- Restaurar (`deleted_at IS NOT NULL → NULL`) queda bloqueado; usar RPC dedicada en el futuro.

### Sin política DELETE

No existe política `DELETE` para `authenticated`. El borrado físico está reservado a `service_role` (procesos de mantenimiento).

### Soft delete

El borrado lógico se realiza vía RPC `soft_delete_client(p_client_id)` que:

1. Verifica autenticación.
2. Obtiene `organization_id` desde BD (nunca del cliente).
3. Verifica `has_organization_role(org_id, 'admin')`.
4. Asigna `deleted_at = now()`, `deleted_by = auth.uid()`.

---

## Tabla `client_contacts`

### SELECT

```
USING: is_organization_member(organization_id)
       AND EXISTS (SELECT 1 FROM clients c
                   WHERE c.id = client_id
                     AND c.organization_id = client_contacts.organization_id
                     AND c.deleted_at IS NULL)
```

### INSERT

```
WITH CHECK: has_organization_role(organization_id, 'operator')
            AND EXISTS (active parent client check)
```

### UPDATE

```
USING/WITH CHECK: has_organization_role(organization_id, 'operator')
                  AND EXISTS (active parent client check)
```

Trigger `trg_client_contacts_immutable` (→ `protect_child_immutable_fields()`) protege `id`, `organization_id`, `client_id`, `created_at`.

### Unicidad de contacto primario

Índice parcial único:

```sql
CREATE UNIQUE INDEX uq_client_contacts_one_primary
  ON client_contacts(client_id)
  WHERE is_primary = true AND deleted_at IS NULL;
```

Solo puede haber un contacto primario activo por cliente.

---

## Tabla `client_documents`

### SELECT / INSERT / UPDATE

Misma estructura que `client_contacts`: miembro activo + check de cliente activo.

### Upsert con control de versión optimista

RPC `upsert_client_document(p_client_id, p_document_key, p_title, p_category, p_content, p_status, p_expected_version DEFAULT NULL)`:

1. Verifica autenticación y rol `operator+`.
2. Verifica que el cliente existe y no está borrado.
3. Valida formato de `p_document_key` (`^[a-z][a-z0-9_-]{0,98}[a-z0-9]$`).
4. Si `p_expected_version IS NOT NULL` y difiere de la versión actual → error `version conflict`.
5. En INSERT: `version = 1`. En UPDATE: `version = current + 1`.
6. Asigna `created_by`/`updated_by` desde `auth.uid()` via trigger `trg_client_documents_audit`.

---

## Tabla `client_integrations`

### SELECT / INSERT / UPDATE

Misma estructura: miembro activo + check de cliente activo.

Trigger `trg_client_integrations_immutable` protege `id`, `organization_id`, `client_id`, `created_at`.

---

## Integridad cross-tabla

Trigger `check_client_organization_match()` ejecutado en `BEFORE INSERT OR UPDATE` de las tres tablas hijas:

- Verifica que `organization_id` del hijo coincide con el padre en `clients`.
- **Nuevo en Phase 3 security audit**: rechaza la operación si el cliente padre tiene `deleted_at IS NOT NULL`.

---

## Restricciones CHECK

| Tabla                 | Restricción                            | Condición                                |
| --------------------- | -------------------------------------- | ---------------------------------------- |
| `clients`             | `ck_clients_metadata_object`           | `jsonb_typeof(metadata) = 'object'`      |
| `client_integrations` | `ck_client_integrations_config_object` | `jsonb_typeof(configuration) = 'object'` |

---

## Resumen de triggers por tabla

### `clients`

| Trigger                  | Cuando                  | Función                 |
| ------------------------ | ----------------------- | ----------------------- |
| `trg_clients_guard`      | BEFORE INSERT OR UPDATE | `manage_client_write()` |
| `trg_clients_updated_at` | BEFORE UPDATE           | `set_updated_at()`      |

El orden alfabético garantiza que `guard` se ejecuta antes que `updated_at`.

### `client_documents`

| Trigger                           | Cuando                  | Función                             |
| --------------------------------- | ----------------------- | ----------------------------------- |
| `trg_client_documents_audit`      | BEFORE INSERT OR UPDATE | `set_document_audit()`              |
| `trg_client_documents_org_match`  | BEFORE INSERT OR UPDATE | `check_client_organization_match()` |
| `trg_client_documents_updated_at` | BEFORE UPDATE           | `set_updated_at()`                  |

### `client_contacts`

| Trigger                          | Cuando                  | Función                             |
| -------------------------------- | ----------------------- | ----------------------------------- |
| `trg_client_contacts_immutable`  | BEFORE UPDATE           | `protect_child_immutable_fields()`  |
| `trg_client_contacts_org_match`  | BEFORE INSERT OR UPDATE | `check_client_organization_match()` |
| `trg_client_contacts_updated_at` | BEFORE UPDATE           | `set_updated_at()`                  |

### `client_integrations`

| Trigger                              | Cuando                  | Función                             |
| ------------------------------------ | ----------------------- | ----------------------------------- |
| `trg_client_integrations_immutable`  | BEFORE UPDATE           | `protect_child_immutable_fields()`  |
| `trg_client_integrations_org_match`  | BEFORE INSERT OR UPDATE | `check_client_organization_match()` |
| `trg_client_integrations_updated_at` | BEFORE UPDATE           | `set_updated_at()`                  |

---

## RPCs SECURITY DEFINER

Todas las RPCs nuevas siguen el mismo patrón de hardening:

```sql
SET search_path = public;
REVOKE ALL ON FUNCTION public.<fn> FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<fn> TO authenticated;
```

| RPC                               | Rol mínimo | Descripción                       |
| --------------------------------- | ---------- | --------------------------------- |
| `soft_delete_client(p_client_id)` | `admin`    | Borrado lógico auditado           |
| `upsert_client_document(...)`     | `operator` | Upsert con concurrencia optimista |

---

## Matriz de permisos efectivos

| Operación                         | viewer | operator | strategist | admin | owner |
| --------------------------------- | ------ | -------- | ---------- | ----- | ----- |
| Leer clientes                     | ✓      | ✓        | ✓          | ✓     | ✓     |
| Crear cliente                     | ✗      | ✓        | ✓          | ✓     | ✓     |
| Actualizar cliente                | ✗      | ✓        | ✓          | ✓     | ✓     |
| Soft delete cliente               | ✗      | ✗        | ✗          | ✓     | ✓     |
| Leer contactos/docs/integraciones | ✓      | ✓        | ✓          | ✓     | ✓     |
| Crear/actualizar contactos        | ✗      | ✓        | ✓          | ✓     | ✓     |
| Upsert documentos (con versión)   | ✗      | ✓        | ✓          | ✓     | ✓     |
| Borrado físico (cualquier tabla)  | ✗      | ✗        | ✗          | ✗     | ✗     |
