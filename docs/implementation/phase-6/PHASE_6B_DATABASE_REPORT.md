# Phase 6B — Database and Supabase Repositories: Implementation Report

**Fecha:** 2026-08-04  
**Rama:** `feat/phase-6-automation-runtime`  
**Estado:** ✅ COMPLETE

---

## 1. Resumen Ejecutivo

Phase 6B implementa el modelo de datos completo para el runtime de automatizaciones, incluyendo:

- Migración SQL que alinea `public.automations` con el dominio Phase 6A
- Cuatro tablas nuevas: `automation_executions`, `automation_execution_logs`, `automation_webhook_events`, `automation_secrets_metadata`
- Estrategia de compatibilidad `inactive → paused` con mapper transitorio
- Repositorios Supabase que implementan exactamente los contratos Phase 6A
- 128 tests nuevos (mappers + repositorios) — todos pasan
- TypeCheck, Lint y Build limpios en todos los workspaces
- Phase 4 intacta: 317 tests pasan sin modificación

---

## 2. Migración SQL

**Archivo:** `supabase/migrations/20260804000000_phase6b_automation_runtime.sql`

### 2.1 Estructura

| Sección | Contenido |
|---------|-----------|
| A | ALTER TYPE automation_status — añadir 'draft' y 'archived' |
| B | ALTER TABLE automations — columnas de dominio + trigger updated_at |
| C | CREATE TABLE automation_executions |
| D | CREATE TABLE automation_execution_logs |
| E | CREATE TABLE automation_webhook_events |
| F | CREATE TABLE automation_secrets_metadata |
| G | Row Level Security — todas las tablas nuevas |
| H | Comentarios de documentación |

### 2.2 Enum automation_status

**Estado ANTES** (Phase 4): `'active' | 'paused' | 'error' | 'disabled' | 'inactive'`  
**Estado DESPUÉS** (Phase 6B): añadidos `'draft'` y `'archived'`  
**Estado final del enum en DB**: `'active' | 'paused' | 'error' | 'disabled' | 'inactive' | 'draft' | 'archived'`

> `'error'`, `'disabled'` e `'inactive'` permanecen como deuda técnica (Phase 6E).

### 2.3 Columnas añadidas a public.automations

| Columna | Tipo | Default | Nota |
|---------|------|---------|------|
| `trigger_config` | jsonb NOT NULL | `'{}'` | Tipo de disparador + configuración |
| `retry_policy` | jsonb NOT NULL | `'{maxAttempts:3,...}'` | Política de reintento |
| `n8n_workflow_id` | text NULL | — | ID en n8n (distinto de legacy `workflow_id`) |
| `metadata` | jsonb NOT NULL | `'{}'` | Metadatos libres — sin secretos |
| `is_manual_only` | boolean NOT NULL | `false` | Solo ejecución manual |
| `last_executed_at` | timestamptz NULL | — | Denormalizado para dashboard |

---

## 3. Tablas Nuevas

### 3.1 public.automation_executions

**Propósito:** Registro de cada intento de ejecución. Fuente de verdad del runtime.

**Columnas clave:**
- `id` uuid PK
- `organization_id` uuid NOT NULL → organizations (aislamiento multi-tenant)
- `automation_id` uuid NOT NULL → automations ON DELETE CASCADE
- `client_id` uuid NULL → clients ON DELETE RESTRICT
- `status` text CHECK IN ('queued','running','succeeded','failed','cancelled','retrying')
- `attempt` integer NOT NULL DEFAULT 1 CHECK >= 1
- `idempotency_key` text NOT NULL (UNIQUE por organization_id — no global)
- `triggered_by` text NOT NULL (user ID o nombre de sistema)
- `trigger_type` text NOT NULL CHECK IN ('schedule','webhook','event','manual')
- `input_metadata` jsonb NULL (sin secretos ni PII)
- `output_metadata` jsonb NULL
- `error_code` text NULL
- `error_message` text NULL CHECK length <= 500 (sanitizado)
- `queued_at`, `started_at`, `completed_at`, `created_at`, `updated_at` timestamptz

**Constraints de coherencia temporal:**
- `started_at >= queued_at`
- `completed_at` requiere `started_at`
- `completed_at >= started_at`

### 3.2 public.automation_execution_logs

**Propósito:** Log línea por línea de cada ejecución.

**Columnas clave:**
- `execution_id` uuid NOT NULL → automation_executions ON DELETE CASCADE
- `level` text CHECK IN ('debug','info','warn','error')
- `event_type` text NULL
- `message` text NOT NULL CHECK length <= 2000
- `metadata` jsonb NULL (sin secretos, tokens, PII)
- `occurred_at` timestamptz NOT NULL

**Seguridad:** INSERT solo desde service_role. `authenticated` solo SELECT.

### 3.3 public.automation_webhook_events

**Propósito:** Deduplicación de callbacks n8n y auditoría de recepción. Soporte HMAC (Phase 6C).

**Columnas clave:**
- `external_event_id` text NULL + `source` text → UNIQUE (source, external_event_id)
- `payload_hash` text NULL CHECK regex SHA-256 (sin payload crudo)
- `status` text CHECK IN ('received','processed','failed')
- `received_at`, `processed_at` timestamptz

**Seguridad:** RLS habilitado. No se crean políticas para `authenticated` — el acceso es denegado por defecto. `service_role` es el único actor autorizado (webhook route Phase 6C con verificación HMAC previa).

### 3.4 public.automation_secrets_metadata

**Propósito:** Referencias a secretos en Supabase Vault. **Nunca almacena el secreto en sí.**

**Columnas clave:**
- `secret_name` text NOT NULL
- `vault_reference` text NOT NULL (ID en vault.secrets)
- `provider` text NOT NULL DEFAULT 'supabase_vault'
- `status` text CHECK IN ('active','expired','revoked')
- UNIQUE (organization_id, automation_id, secret_name) separado por casos con/sin automation_id

---

## 4. Estrategia inactive → paused

### Problema
La tabla `automations` en Phase 4 usa `status = 'inactive'` como valor por defecto. El dominio Phase 6A define `'paused'` como equivalente semántico.

### Solución implementada

1. **Migración SQL:** `UPDATE public.automations SET status = 'paused' WHERE status = 'inactive'`  
   Limpia las filas existentes antes de que el sistema procese nuevas ejecuciones.

2. **Mapper transitorio** (`automation.mapper.ts`): `parseAutomationStatus()` mapea `'inactive' → 'paused'` para cualquier fila que pueda quedar del periodo de transición.

3. **countByStatus** en el repositorio también aplica la misma lógica transitoria.

### Deuda técnica pendiente (Phase 6E)
- El enum aún contiene `'inactive'`, `'error'`, `'disabled'`
- No se pueden eliminar valores de un enum en PostgreSQL sin recrear el tipo
- Estrategia Phase 6E: confirmar 0 filas con esos valores → recrear enum → migrar columnas

---

## 5. Índices

### automation_executions
| Índice | Columnas | Descripción |
|--------|----------|-------------|
| `uq_exec_org_idempotency` | (organization_id, idempotency_key) UNIQUE | Idempotencia por tenant |
| `idx_exec_org_created` | (organization_id, created_at DESC) | Listado por organización |
| `idx_exec_automation_created` | (automation_id, created_at DESC) | Historial por automatización |
| `idx_exec_client_created` | (client_id, created_at DESC) WHERE NOT NULL | Historial por cliente |
| `idx_exec_status_created` | (status, created_at DESC) | Filtros por estado |
| `idx_exec_org_automation_status` | (organization_id, automation_id, status) | KPIs y health checks |

### automation_execution_logs
| Índice | Columnas |
|--------|----------|
| `idx_exec_logs_execution_occurred` | (execution_id, occurred_at DESC) |
| `idx_exec_logs_org_occurred` | (organization_id, occurred_at DESC) |
| `idx_exec_logs_org_level_warn_error` | (organization_id, occurred_at DESC) WHERE level IN ('warn','error') |

### automation_webhook_events
| Índice | Columnas |
|--------|----------|
| `uq_webhook_source_external_id` | (source, external_event_id) UNIQUE WHERE NOT NULL |
| `idx_webhook_events_received` | (received_at DESC) |
| `idx_webhook_events_status_failed` | (status) WHERE status = 'failed' |

### automation_secrets_metadata
| Índice | Columnas |
|--------|----------|
| `uq_secrets_org_automation_name` | (organization_id, automation_id, secret_name) WHERE NOT NULL |
| `uq_secrets_org_global_name` | (organization_id, secret_name) WHERE automation_id IS NULL |

---

## 6. Row Level Security

### automation_executions

| Política | Operación | Rol | Condición |
|----------|-----------|-----|-----------|
| `exec_select` | SELECT | authenticated | `is_organization_member(organization_id)` |
| `exec_insert` | INSERT | authenticated | `has_organization_role(org, 'operator')` + client_id válido |
| `exec_update` | UPDATE | authenticated | `has_organization_role(org, 'admin')` |

### automation_execution_logs

| Política | Operación | Rol | Condición |
|----------|-----------|-----|-----------|
| `exec_logs_select` | SELECT | authenticated | `is_organization_member(organization_id)` |
| (ninguna) | INSERT | — | Solo service_role (sin GRANT a authenticated) |

### automation_webhook_events
**RLS habilitado.** No se crean políticas para `authenticated` — cuando RLS está activo sin política aplicable, el acceso es denegado por defecto. `service_role` omite RLS por diseño en Supabase y es el único actor autorizado (webhook route Phase 6C con verificación HMAC). `REVOKE ALL` en sección E4 actúa como defensa en profundidad adicional.

> ⚠️ **Corrección aplicada (revisión 2026-08-04):** La migración inicial omitía `ENABLE ROW LEVEL SECURITY` en esta tabla y tenía comentarios incorrectos indicando "sin RLS". Corregido: RLS habilitado, sin políticas para authenticated, acceso exclusivo vía service_role.

### automation_secrets_metadata

| Política | Operación | Rol | Condición |
|----------|-----------|-----|-----------|
| `secrets_meta_select` | SELECT | authenticated | `has_organization_role(org, 'admin')` |
| `secrets_meta_insert` | INSERT | authenticated | `has_organization_role(org, 'admin')` + automation_id válido |
| `secrets_meta_update` | UPDATE | authenticated | `has_organization_role(org, 'admin')` |

**Nota:** Viewers no pueden crear, pausar, cancelar ni modificar automatizaciones ni ejecuciones.

---

## 7. Mappers

### automation.mapper.ts

**AutomationRow:** Incluye columnas Phase 4 (legacy_id, schedule, etc.) + Phase 6B (trigger_config, retry_policy, n8n_workflow_id, metadata). Las columnas legacy son ignoradas por el mapper.

**parseAutomationStatus:** Mapper transitorio `inactive → paused`. `error` y `disabled` lanzan error descriptivo.

**parseTriggerConfig:** Valida campo `type` y devuelve `AutomationTrigger`. Tipo desconocido → `{ type: 'manual' }` como fallback seguro.

**parseRetryPolicy:** Valida campos numéricos. Cualquier campo inválido → `DEFAULT_AUTOMATION_RETRY_POLICY`.

### automation-execution.mapper.ts

**sanitizeErrorMessage:** Trunca a 500 chars. Redacta tokens (`Bearer ...`, `sk-...`, `ey...`) con `[REDACTED]`.

**parseAttempt:** Valida entero >= 1.

**parseIdempotencyKey:** Valida no vacío antes de crear branded type.

---

## 8. Repositorios Supabase

### SupabaseAutomationRepository

Implementa `AutomationRepository` (contrato Phase 6A).

| Método | Notas |
|--------|-------|
| `create` | Status inicial siempre 'draft'. Genera `legacy_id` para compatibilidad con constraint Phase 4 |
| `update` | Patch solo con campos presentes. PGRST116 → NOT_FOUND. 23505 → CONFLICT |
| `archive` | Idempotente: archivar ya archivado = ok |
| `findById` | Siempre `.eq('id',...).eq('organization_id',...)` |
| `findByOrganization` | Filtros opcionales: status, clientId. Paginación. |
| `findByClient` | Delega a `findByOrganization` con clientId |
| `existsByName` | Soporte `excludeId` para updates. Busca con `.limit(1)` |
| `countByStatus` | Aplica `inactive → paused` en el conteo. Ignora 'error'/'disabled' |

### SupabaseAutomationExecutionRepository

Implementa `AutomationExecutionRepository` (contrato Phase 6A).

| Método | Notas |
|--------|-------|
| `create` | Status inicial 'queued'. 23505 → CONFLICT semántico (idempotencia) |
| `updateStatus` | error_message sanitizado a 500 chars antes de persistir |
| `findById` | Siempre `org_id + exec_id` |
| `findByIdempotencyKey` | PGRST116 → `ok(null)` (no error — para deduplicación) |
| `findByAutomation` | Delega a `findByOrganization` con automationId |
| `findByOrganization` | Filtros: automationId, clientId, status. Orden por `queued_at DESC` |
| `countByStatus` | Opcionalmente filtrado por automationId |

**Regla de oro:** Ninguna query usa `.eq('id', id)` sin también usar `.eq('organization_id', organizationId)`.

---

## 9. Idempotencia

- `UNIQUE (organization_id, idempotency_key)` en `automation_executions`
- No es índice global — previene cross-tenant key collision
- `findByIdempotencyKey` recibe `organizationId` — nunca busca entre tenants
- `create` retorna `CONFLICT` con mensaje semántico cuando la clave ya existe en el tenant
- La webhook route (Phase 6C) manejará CONFLICT como respuesta idempotente 200

---

## 10. Retención de Datos

| Tabla | Política recomendada | Implementación |
|-------|---------------------|----------------|
| `automation_executions` | 90 días | Phase 6G (pg_cron o job n8n) |
| `automation_execution_logs` | 30 días (INFO), indefinido (ERROR) | Phase 6G |
| `automation_webhook_events` | 7 días | Phase 6G |
| `automation_secrets_metadata` | Hasta revocación | Manual |

La retención no está implementada todavía — se implementa en Phase 6G para evitar acumulación.

---

## 11. Seguridad

### Verificaciones realizadas
- ✅ No hay secretos en configuración, metadata ni error_message
- ✅ No se usa service_role desde código web
- ✅ No hay payloads crudos almacenados (solo `payload_hash` SHA-256)
- ✅ No hay políticas RLS abiertas `USING (true)`
- ✅ `organization_id` siempre presente en todas las operaciones
- ✅ `idempotency_key` con unicidad por tenant (no global)
- ✅ `error_message` sanitizado en mapper (truncado + REDACTED de tokens)
- ✅ `metadata` de tipo `Record<string, unknown>` opaco — no contiene campos protegidos predefinidos
- ✅ `automation_secrets_metadata` almacena solo `vault_reference` (ID), nunca el secreto

### Accesos por rol
| Rol | automations | executions | exec_logs | webhook_events | secrets_meta |
|-----|-------------|------------|-----------|----------------|--------------|
| viewer | R | R | R | — | — |
| operator | R | R+W | R | — | — |
| strategist | R | R+W | R | — | — |
| admin | R+W | R+W | R | — | R+W |
| owner | R+W | R+W | R | — | R+W |
| service_role | R+W | R+W | R+W | R+W | R+W |

---

## 12. Tests

### Resultados finales

| Workspace | Tests | Estado |
|-----------|-------|--------|
| `@bop-agency/infrastructure` — automation.mapper | 31 | ✅ PASS |
| `@bop-agency/infrastructure` — automation-execution.mapper | 44 | ✅ PASS |
| `@bop-agency/infrastructure` — supabase-automation.repository | 27 | ✅ PASS |
| `@bop-agency/infrastructure` — supabase-automation-execution.repository | 26 | ✅ PASS |
| `@bop-agency/infrastructure` — tests previos (alert, task, metric) | 70 | ✅ PASS |
| `@bop-agency/domain` | 169 | ✅ PASS |
| `@bop-agency/application` | 85 | ✅ PASS |
| Phase 4 (`scripts/migrations/phase-4`) | 317 | ✅ PASS |
| **TOTAL** | **769** | **✅ PASS** |

### TypeCheck / Lint / Build

| Paquete | TypeCheck | Lint | Build |
|---------|-----------|------|-------|
| `@bop-agency/infrastructure` | ✅ | ✅ | ✅ |
| `@bop-agency/domain` | ✅ | ✅ | ✅ |
| `@bop-agency/application` | ✅ | ✅ | ✅ |

---

## 13. Rollback

El rollback completo está documentado en la sección DOWN del archivo de migración.

### Pasos de rollback (orden inverso)

```sql
-- 1. Eliminar tablas nuevas (preserva automations existente)
DROP TABLE IF EXISTS public.automation_secrets_metadata CASCADE;
DROP TABLE IF EXISTS public.automation_webhook_events CASCADE;
DROP TABLE IF EXISTS public.automation_execution_logs CASCADE;
DROP TABLE IF EXISTS public.automation_executions CASCADE;

-- 2. Revertir columnas añadidas a automations
ALTER TABLE public.automations
  DROP COLUMN IF EXISTS trigger_config,
  DROP COLUMN IF EXISTS retry_policy,
  DROP COLUMN IF EXISTS n8n_workflow_id,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS is_manual_only,
  DROP COLUMN IF EXISTS last_executed_at;

-- 3. Revertir status de filas (con advertencia)
-- ADVERTENCIA: Requiere decisión explícita si hay filas nuevas con status='paused'.
UPDATE public.automations SET status = 'inactive' WHERE status = 'paused';
```

### Incompatibilidades de rollback conocidas
- Los valores `'draft'` y `'archived'` añadidos al enum NO pueden eliminarse en PostgreSQL sin recrear el tipo. Si hay filas con esos valores, el rollback requiere actualización previa de esas filas.
- No se revierten automáticamente filas `status='paused'` que fueron migradas desde `'inactive'` si también hubiera filas nuevas con `'paused'` legítimo.

---

## 14. Archivos Creados / Modificados

### Nuevos
```
supabase/migrations/20260804000000_phase6b_automation_runtime.sql
packages/infrastructure/src/supabase/mappers/automation.mapper.ts
packages/infrastructure/src/supabase/mappers/automation-execution.mapper.ts
packages/infrastructure/src/supabase/mappers/__tests__/automation.mapper.test.ts
packages/infrastructure/src/supabase/mappers/__tests__/automation-execution.mapper.test.ts
packages/infrastructure/src/supabase/repositories/supabase-automation.repository.ts
packages/infrastructure/src/supabase/repositories/supabase-automation-execution.repository.ts
packages/infrastructure/src/supabase/repositories/__tests__/supabase-automation.repository.test.ts
packages/infrastructure/src/supabase/repositories/__tests__/supabase-automation-execution.repository.test.ts
docs/implementation/phase-6/PHASE_6B_DATABASE_REPORT.md
```

### Modificados
```
packages/infrastructure/src/index.ts  (+10 líneas — exports Phase 6B)
docs/implementation/phase-6/PHASE_6_IMPLEMENTATION_PLAN.md
docs/implementation/phase-6/PHASE_6_RISK_REGISTER.md
```

---

## 15. Deuda Técnica Pendiente

| ID | Descripción | Phase objetivo |
|----|-------------|----------------|
| DT-6B-1 | Eliminar valores `'inactive'`, `'error'`, `'disabled'` del enum `automation_status` | 6E |
| DT-6B-2 | Añadir `last_execution_id` (FK circular automations ↔ executions) | 6C |
| DT-6B-3 | Implementar retención automática (pg_cron o job n8n) | 6G |
| DT-6B-4 | Validar aislamiento multi-tenant con tests de integración contra Supabase real | 6C |
| DT-6B-5 | Runbook de rollback detallado para producción | Previo a deploy |
| DT-6B-6 | La columna `legacy_id` en automations requiere un valor en `create` (constraint Phase 4). El repositorio genera un valor temporal `domain-{timestamp}-{random}`. Debe documentarse y limpiarse en Phase 6E junto con otros campos legacy | 6E |

---

## 16. No Implementado (intencionalmente)

Siguiendo las restricciones de la especificación, Phase 6B NO incluye:
- n8n, WorkflowDispatcher, webhooks, HMAC, dispatch
- Retry orchestration, Server Actions, UI
- service_role desde código web
- Variables de entorno nuevas

---

*Recomendación de commit: `feat(phase-6b): automation database, mappers and supabase repositories`*
