# Phase 4 — Target Schema

Tablas creadas en migración `20260730150000_phase4_data_migration_targets.sql`.

## tasks

| Columna                          | Tipo          | Restricciones                       | Notas                                      |
| -------------------------------- | ------------- | ----------------------------------- | ------------------------------------------ |
| id                               | uuid          | PK, DEFAULT gen_random_uuid()       |                                            |
| organization_id                  | uuid          | NOT NULL, FK organizations          |                                            |
| client_id                        | uuid          | NULL, FK clients ON DELETE SET NULL | Opcional                                   |
| title                            | text          | NOT NULL                            |                                            |
| description                      | text          | NULL                                |                                            |
| status                           | task_status   | NOT NULL DEFAULT 'pending'          | pending/in_progress/done/cancelled/blocked |
| priority                         | task_priority | NOT NULL DEFAULT 'medium'           | low/medium/high/urgent                     |
| due_date                         | date          | NULL                                |                                            |
| tags                             | text[]        | NULL DEFAULT '{}'                   |                                            |
| legacy_source                    | text          | NULL                                | Nombre del archivo fuente                  |
| legacy_id                        | text          | NULL                                | ID en fuente original                      |
| legacy_path                      | text          | NULL                                | Ruta relativa del archivo                  |
| migrated_at                      | timestamptz   | NULL                                |                                            |
| migration_version                | text          | NULL                                |                                            |
| created_by                       | uuid          | NOT NULL DEFAULT auth.uid()         |                                            |
| updated_by                       | uuid          | NULL                                |                                            |
| created_at/updated_at/deleted_at | timestamptz   |                                     | Soft delete                                |

**Índice único**: `(organization_id, legacy_source, legacy_id)` WHERE ambos NOT NULL y deleted_at IS NULL

## client_metrics

| Columna                                   | Tipo        | Restricciones                              |
| ----------------------------------------- | ----------- | ------------------------------------------ |
| id                                        | uuid        | PK                                         |
| client_id                                 | uuid        | NOT NULL, FK clients CASCADE               |
| organization_id                           | uuid        | NOT NULL, FK organizations CASCADE         |
| platform                                  | text        | NOT NULL                                   |
| account_id                                | text        | NOT NULL                                   |
| account_name                              | text        | NULL                                       |
| period_start/period_end                   | date        | NOT NULL, CHECK period_end >= period_start |
| currency                                  | text        | NOT NULL DEFAULT 'COP'                     |
| metrics                                   | jsonb       | NOT NULL DEFAULT '{}', CHECK object        |
| campaigns                                 | jsonb       | NOT NULL DEFAULT '[]'                      |
| data_quality                              | jsonb       | NULL                                       |
| legacy_path                               | text        | NULL                                       |
| migrated_at/migration_version/source_hash |             |                                            |
| created_at/updated_at                     | timestamptz |                                            |

**Índice único**: `(client_id, platform, account_id, period_start, period_end)`

## alerts

| Columna                                               | Tipo           | Notas                                |
| ----------------------------------------------------- | -------------- | ------------------------------------ |
| id                                                    | uuid           | PK                                   |
| organization_id                                       | uuid           | NOT NULL, FK                         |
| client_id                                             | uuid           | NULL, FK                             |
| alert_key                                             | text           | NOT NULL                             |
| alert_type                                            | text           | NOT NULL                             |
| severity                                              | alert_severity | info/warning/critical                |
| status                                                | alert_status   | active/acknowledged/snoozed/resolved |
| title/description/platform/account_id                 | text           | NULL                                 |
| detected_at/acknowledged_at/snoozed_until/resolved_at | timestamptz    | NULL                                 |
| acknowledged_by/resolved_by                           | uuid           | NULL                                 |
| metadata                                              | jsonb          | NOT NULL DEFAULT '{}'                |

**Índice único**: `(organization_id, alert_key)`

## reports

**Índice único**: `(client_id, report_type, period_start, period_end)`

Tipos de reporte: `weekly | monthly | custom`
Estado: `draft | generated | sent | failed`

## report_recipients

**Índice único**: `(organization_id, client_id, email)` y `(organization_id, email)` para globales

## agents

**Índice único**: `(organization_id, slug)` WHERE organization_id IS NOT NULL
Tipos: `specialist | strategist | analyst | creative | manager | custom`

## skills

**Índice único**: `(organization_id, slug)` WHERE organization_id IS NOT NULL

## templates

**Índice único**: `(organization_id, slug)` WHERE organization_id IS NOT NULL

## automations

**Índice único**: `(organization_id, legacy_id)`
Estado: `active | paused | error | disabled | inactive`

## migration_runs (control)

| Columna                                     | Tipo                             |
| ------------------------------------------- | -------------------------------- |
| id                                          | uuid PK                          |
| migration_name                              | text NOT NULL                    |
| migration_version                           | text NOT NULL                    |
| organization_id                             | uuid FK                          |
| mode                                        | migration_mode (dry_run/execute) |
| status                                      | migration_run_status             |
| started_at/completed_at                     | timestamptz                      |
| created_by                                  | uuid                             |
| source_summary/result_summary/error_summary | jsonb                            |

## migration_records (control)

| Columna         | Tipo                           |
| --------------- | ------------------------------ |
| id              | uuid PK                        |
| run_id          | uuid FK migration_runs CASCADE |
| organization_id | uuid NOT NULL                  |
| entity_type     | text                           |
| source_path     | text                           |
| source_key      | text                           |
| source_hash     | text NULL                      |
| target_table    | text                           |
| target_id       | uuid NULL                      |
| action          | migration_action enum          |
| error_code      | text NULL                      |
| error_message   | text NULL (sanitizado)         |

**Índice único**: `(run_id, source_path, source_key)`

## RLS

Todas las tablas operativas: SELECT para miembros, INSERT/UPDATE para operator+.
Tablas de control: solo admin+ puede SELECT. INSERT/UPDATE solo por service_role.
