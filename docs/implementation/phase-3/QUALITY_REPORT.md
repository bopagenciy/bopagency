# Phase 3 — Quality Report

Fecha: 2026-07-30

## Resumen ejecutivo

La Phase 3 (Gestión de Clientes) completó satisfactoriamente su ciclo de implementación, auditoría de seguridad y corrección. La suite de validación cierra con cero errores en todos los chequeos.

---

## Resultados de validación

### TypeScript (typecheck)

| Paquete                      | Resultado   |
| ---------------------------- | ----------- |
| `@bop-agency/shared`         | ✓ 0 errores |
| `@bop-agency/domain`         | ✓ 0 errores |
| `@bop-agency/application`    | ✓ 0 errores |
| `@bop-agency/infrastructure` | ✓ 0 errores |
| `apps/web`                   | ✓ 0 errores |

Configuración activa: `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`.

### ESLint (lint)

Archivos modificados en la auditoría de seguridad — 0 errores, 0 warnings:

- `apps/web/src/components/clients/DocumentEditor.tsx`
- `apps/web/src/app/(protected)/clients/actions.ts`
- `apps/web/src/app/(protected)/clients/[clientId]/documents/[key]/page.tsx`
- `packages/infrastructure/src/supabase/supabase-client.repository.ts`
- `packages/application/src/use-cases/clients/upsert-client-document.use-case.ts`

### Tests

| Suite                        | Tests  | Resultado   |
| ---------------------------- | ------ | ----------- |
| `create-client.test.ts`      | 6      | ✓ PASS      |
| `soft-delete-client.test.ts` | 5      | ✓ PASS      |
| `membership-status.test.ts`  | 16     | ✓ PASS      |
| `list-clients.test.ts`       | 2      | ✓ PASS      |
| **Total**                    | **29** | **✓ 29/29** |

---

## Auditoría de seguridad — correcciones aplicadas

La migración original fue sometida a una auditoría de 18 puntos. Las correcciones se agrupan en las categorías siguientes.

### 1. Re-ejecutabilidad

**Problema**: `CREATE TRIGGER` y `CREATE POLICY` sin `DROP IF EXISTS` fallaban en re-ejecución.

**Corrección**: Cada trigger y política va precedido de su correspondiente `DROP TRIGGER IF EXISTS` / `DROP POLICY IF EXISTS`.

### 2. Forja de campos de auditoría

**Problema**: `created_by`, `updated_by`, `deleted_by` se leían desde el payload de la aplicación, lo que permitía que un cliente los falsificase.

**Corrección**: Nuevo trigger `manage_client_write()` en `clients` y `set_document_audit()` en `client_documents`. Ambos asignan los campos de auditoría desde `auth.uid()` en `BEFORE INSERT OR UPDATE`. La aplicación ya no envía estos valores.

### 3. Mutabilidad de `organization_id`

**Problema**: Una UPDATE podía cambiar `organization_id`, moviendo un cliente entre organizaciones.

**Corrección**: `manage_client_write()` verifica en UPDATE que `NEW.organization_id = OLD.organization_id` y lanza excepción si difiere. Lo mismo aplica a `id` y `created_at`.

### 4. Operaciones sobre clientes borrados

**Problema**: Era posible actualizar un cliente con `deleted_at IS NOT NULL`.

**Corrección**: El trigger bloquea cualquier UPDATE sobre un cliente borrado con excepción explícita `'cannot update a deleted client'`.

### 5. Soft delete sin control de rol en BD

**Problema**: La RLS solo exigía `operator` para UPDATE; no había control de rol para establecer `deleted_at`.

**Corrección**: El trigger comprueba `has_organization_role(org_id, 'admin')` antes de permitir fijar `deleted_at`. La nueva RPC `soft_delete_client` es el punto de entrada canónico.

### 6. Tablas hijas sin check de cliente activo

**Problema**: Era posible insertar contactos, documentos o integraciones en un cliente borrado.

**Corrección**: Todas las políticas SELECT/INSERT/UPDATE de las tres tablas hijas incluyen un `EXISTS (SELECT 1 FROM clients WHERE id = child.client_id AND deleted_at IS NULL)`. El trigger `check_client_organization_match()` también rechaza operaciones cuando el padre está borrado.

### 7. Sin concurrencia optimista en documentos

**Problema**: Múltiples editores podían sobrescribirse sin detección de conflictos.

**Corrección**: RPC `upsert_client_document` con parámetro `p_expected_version`. Si la versión actual difiere de la esperada, la RPC lanza `'version conflict'`. `DocumentEditor` envía `<input type="hidden" name="expectedVersion" value={version} />`.

### 8. Sin unicidad de contacto primario

**Problema**: Podía haber múltiples contactos con `is_primary = true` para el mismo cliente.

**Corrección**: Índice parcial único `uq_client_contacts_one_primary ON client_contacts(client_id) WHERE is_primary = true AND deleted_at IS NULL`.

### 9. JSONB sin validación de tipo

**Problema**: `metadata` y `configuration` aceptaban cualquier valor JSON (arrays, strings, null).

**Corrección**: CHECK constraints `ck_clients_metadata_object` y `ck_client_integrations_config_object` garantizan `jsonb_typeof(...) = 'object'`.

### 10. Campos inmutables en tablas hijas

**Problema**: Un UPDATE en `client_contacts` o `client_integrations` podía reasignar `client_id` u `organization_id`.

**Corrección**: Trigger `protect_child_immutable_fields()` en BEFORE UPDATE de ambas tablas protege `id`, `organization_id`, `client_id`, `created_at`.

### 11. RPCs sin hardening de permisos

**Problema**: Funciones nuevas con `SECURITY DEFINER` sin `REVOKE ALL FROM PUBLIC` ni `search_path` explícito.

**Corrección**: Todas las RPCs incluyen:

```sql
SET search_path = public;
REVOKE ALL ON FUNCTION public.<fn> FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<fn> TO authenticated;
```

---

## Alineación TypeScript — correcciones aplicadas

| Archivo                                                       | Cambio                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/entities/client.ts`                      | Añadido `expectedVersion?: number \| null` a `UpsertClientDocumentInput`                                                                                                                                                                                                                    |
| `packages/infrastructure/.../supabase-client.repository.ts`   | `create()`: eliminado `created_by` del payload INSERT; `update()`: eliminado `updated_by` del patch; `softDelete()`: reemplazado UPDATE directo por RPC `soft_delete_client`; `upsertDocument()`: reemplazado `.upsert()` directo por RPC `upsert_client_document` con `p_expected_version` |
| `packages/application/.../upsert-client-document.use-case.ts` | Añadido `expectedVersion?: number \| null` al input; propagado al repositorio                                                                                                                                                                                                               |
| `apps/web/src/app/(protected)/clients/actions.ts`             | `upsertDocumentAction`: lee `expectedVersion` de `formData` y lo pasa al use case                                                                                                                                                                                                           |
| `apps/web/src/components/clients/DocumentEditor.tsx`          | Añadido `<input type="hidden" name="expectedVersion" value={version} />`                                                                                                                                                                                                                    |

---

## Bugs corregidos durante Phase 3 (pre-auditoría)

| Bug                                                               | Archivo                                                       | Fix                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------- |
| Discriminante `result.ok` inexistente (debe ser `result.success`) | Repository, actions, tests                                    | Reemplazado en todos los usos   |
| `result.code` en tests (debe ser `result.error.code`)             | `create-client.test.ts:117`, `soft-delete-client.test.ts:115` | Corregido                       |
| `PaginatedResult` sin `hasNextPage`/`hasPreviousPage`             | `supabase-client.repository.ts`                               | Añadidos ambos campos           |
| `exactOptionalPropertyTypes`: `slug: string \| undefined`         | `actions.ts`                                                  | Conditional spread              |
| `exactOptionalPropertyTypes`: spread `...parsed.data`             | `actions.ts`                                                  | Spread campo a campo con guards |
| `industry ?? undefined` en edit page (esperaba `null`)            | `[clientId]/edit/page.tsx`                                    | Cambiado a `?? null`            |
| Import no usado `updateClientAction`                              | `[clientId]/page.tsx`                                         | Eliminado                       |
| Parámetro no usado `pageSize`                                     | `ClientList.tsx`                                              | Renombrado a `_pageSize`        |

---

## Deuda técnica conocida

- La RLS de `client_contacts` no tiene una RPC dedicada para `is_primary` swap atómico. Si se necesita cambiar el contacto primario, la aplicación debe desmarcar el actual y marcar el nuevo en una transacción.
- No existe política de restauración de cliente borrado (`deleted_at IS NOT NULL → NULL`). Queda bloqueado en BD intencionalmente hasta definir el flujo de negocio.
- Las páginas web no implementan paginación real en el listado de documentos (se cargan todos). Aceptable para Phase 3 dado el volumen esperado; candidato a optimizar en Phase 4.
- Los tests de `SupabaseClientRepository` son de integración y requieren Supabase local. No están en la suite CI actual.
