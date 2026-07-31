# Phase 4 — Plan de Migración de Datos

## Estado: PENDIENTE DE EJECUCIÓN

La infraestructura y los scripts están listos. La migración real requiere:

1. Revisión y aprobación del dry-run
2. Provisión del `MIGRATION_ORGANIZATION_ID`
3. Ejecución manual con `--execute`

## Objetivo

Importar datos existentes desde archivos JSON y Markdown al esquema Supabase de BopIAgency de forma idempotente, auditada y sin pérdida de datos originales.

## Fases implementadas en esta iteración

### Fase 4A — Auditoría y Plan (COMPLETA)

- ✓ Inventario de fuentes
- ✓ Clasificación de clientes
- ✓ Matriz de tablas destino
- ✓ Modelo de idempotencia
- ✓ Plan de rollback
- ✓ Modelo de seguridad
- ✓ Documentación de Vault

### Fase 4B — Esquema SQL (COMPLETA)

- ✓ Migración `20260730150000_phase4_data_migration_targets.sql`
- ✓ Tablas: tasks, client_metrics, alerts, reports, report_recipients, agents, skills, templates, automations
- ✓ Tablas de control: migration_runs, migration_records
- ✓ RLS en todas las tablas
- ✓ Índices únicos para idempotencia

### Fase 4C — Framework TypeScript (COMPLETA)

- ✓ CLI con flags: --dry-run, --execute, --organization-id, --client, --limit, --verbose, --resume
- ✓ Logger seguro con sanitización
- ✓ Hash SHA-256 de contenido normalizado
- ✓ Runner con control de migration_runs
- ✓ Validators Zod por formato

### Fase 4D — Importadores (COMPLETA)

- ✓ clients-importer (2 clientes aprobados)
- ✓ documents-importer (22 documentos Markdown)
- ✓ metrics-importer (4 periodos)
- ✓ alerts-importer (1 estado)
- ✓ reports-importer (9 reportes)
- ✓ agents-importer (17 agentes)
- ✓ skills-importer (27 skills)
- ✓ templates-importer (17 templates)
- ✓ automations-importer (7 automations)

### Fase 4E — Vault (DOCUMENTADA, NO AUTOMATIZADA)

- ✓ VAULT_SETUP.md con procedimiento manual
- ✓ SECRETS_REQUIRING_VAULT.md con nombres lógicos

### Fase 4F — Verificación (LISTA PARA DRY-RUN)

- ✓ Dry-run simulado
- ✓ Reporte JSON sanitizado
- ✓ Tests unitarios

## Comando de uso

```bash
# Instalar dependencias del script
cd scripts/migrations/phase-4
npm install

# Dry-run (predeterminado, no escribe nada)
npm run migrate:phase4 -- --dry-run --organization-id=<UUID>

# Dry-run con verbose
npm run migrate:phase4 -- --dry-run --organization-id=<UUID> --verbose

# Solo clientes aprobados
npm run migrate:phase4 -- --dry-run --organization-id=<UUID> --client=legalink-col --client=magic-bungalow

# Ejecución real (requiere confirmación explícita)
npm run migrate:phase4 -- --execute --organization-id=<UUID>

# Rollback de una ejecución
npm run migrate:phase4 -- --rollback --run-id=<UUID> --execute
```

## Matriz de tablas destino

| Fuente                 | Tabla destino         | Existe en BD | RLS | Repository               | Unique key                             | Estado    |
| ---------------------- | --------------------- | ------------ | --- | ------------------------ | -------------------------------------- | --------- |
| clients-index.json     | `clients`             | ✓            | ✓   | SupabaseClientRepository | org_id+slug                            | ✓ listo   |
| `*/*.md`               | `client_documents`    | ✓            | ✓   | via RPC                  | client_id+document_key                 | ✓ listo   |
| integrations.json      | `client_integrations` | ✓            | ✓   | SupabaseClientRepository | client_id+provider                     | ✓ (vacío) |
| tasks.json             | `tasks`               | ✓ (nueva)    | ✓   | —                        | org_id+legacy_source+legacy_id         | ✓ listo   |
| metrics/periods/       | `client_metrics`      | ✓ (nueva)    | ✓   | —                        | client_id+platform+account+period      | ✓ listo   |
| alert-state.json       | `alerts`              | ✓ (nueva)    | ✓   | —                        | org_id+alert_key                       | ✓ listo   |
| reports/clients/       | `reports`             | ✓ (nueva)    | ✓   | —                        | client_id+type+period_start+period_end | ✓ listo   |
| report-recipients.json | `report_recipients`   | ✓ (nueva)    | ✓   | —                        | org_id+client_id+email+report_type     | ✓ (vacío) |
| agents/*.md            | `agents`              | ✓ (nueva)    | ✓   | —                        | org_id+slug                            | ✓ listo   |
| skills/*/SKILL.md      | `skills`              | ✓ (nueva)    | ✓   | —                        | org_id+slug                            | ✓ listo   |
| templates/*.md         | `templates`           | ✓ (nueva)    | ✓   | —                        | org_id+slug                            | ✓ listo   |
| automations-registry   | `automations`         | ✓ (nueva)    | ✓   | —                        | org_id+legacy_id                       | ✓ listo   |

## Acciones manuales pendientes antes de ejecutar

1. Proveer `MIGRATION_ORGANIZATION_ID` (UUID de la organización destino en Supabase)
2. Aplicar migración SQL en Supabase: `supabase/migrations/20260730150000_phase4_data_migration_targets.sql`
3. Revisar dry-run output en `migration-output/phase-4-dry-run-summary.json`
4. Aprobar o ajustar clasificación de `cliente-prueba-automatizacion-marketing-digital`
5. Cargar secretos de Meta Ads en Vault (ver VAULT_SETUP.md)
6. Ejecutar con `--execute` solo tras revisión y aprobación
