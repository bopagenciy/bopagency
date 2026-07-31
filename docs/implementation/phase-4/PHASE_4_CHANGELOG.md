# Phase 4 — Changelog

## [4.0.0] — 2026-07-30

### Añadido

#### Fase 4A — Auditoría y Plan

- `docs/implementation/phase-4/CLIENT_CLASSIFICATION.md` — Clasificación de 6 carpetas de clientes
- `docs/implementation/phase-4/SOURCE_MANIFEST.md` — 12 fuentes de datos inventariadas
- `docs/implementation/phase-4/IDEMPOTENCY_MODEL.md` — Algoritmo SHA-256 + migration_records
- `docs/implementation/phase-4/ROLLBACK_PLAN.md` — Rollback por run_id, orden FK-seguro
- `docs/implementation/phase-4/SECURITY_MODEL.md` — safeResolvePath, logger sanitizador, secret-detector
- `docs/implementation/phase-4/VAULT_SETUP.md` — Procedimiento manual de carga de secretos
- `docs/implementation/phase-4/PHASE_4_PLAN.md` — Matriz fuente→tabla, comandos CLI

#### Fase 4B — Schema SQL

- `supabase/migrations/20260730150000_phase4_data_migration_targets.sql`
  - Tablas nuevas: `tasks`, `client_metrics`, `alerts`, `reports`, `report_recipients`, `agents`, `skills`, `templates`, `automations`
  - Tablas de control: `migration_runs`, `migration_records`
  - 11 enums PostgreSQL nuevos
  - RLS en todas las tablas (service_role bypass para scripts de migración)
  - Índices únicos para idempotencia en cada tabla
  - Triggers `set_updated_at()` en todas las tablas operativas
  - Comentarios de documentación en cada tabla

#### Fase 4C — Framework TypeScript

- `scripts/migrations/phase-4/` — Workspace completo con:
  - `cli.ts` — Entry point con flags: `--dry-run`, `--execute`, `--organization-id`, `--client`, `--limit`, `--verbose`, `--resume`
  - `config.ts` — Validación de UUID, variables de entorno requeridas, fallo inmediato si faltan
  - `types.ts` — 20+ interfaces y tipos, sin `any`
  - `logger.ts` — Sanitización recursiva de secretos y enmascaramiento de emails
  - `hash.ts` — `computeHash()` (JSON normalizado) y `computeTextHash()` (Markdown)
  - `runner.ts` — Orquestación de migration_runs, batching de 100 registros
  - `adapters/supabase.ts` — Cliente singleton + verificación de organización
  - `adapters/filesystem.ts` — `safeResolvePath()`, `readJsonFile()`, `readTextFile()`
  - `adapters/secret-detector.ts` — 6 patrones de secreto, escaneo recursivo

#### Fase 4D — Importadores

- `importers/clients-importer.ts` — 2 clientes aprobados, 3 excluidos
- `importers/documents-importer.ts` — Markdown con derivación de título y hash de texto
- `importers/metrics-importer.ts` — JSON de periodos con resolución de cliente por accountId
- `importers/alerts-importer.ts` — alert-state.json con upsert por alert_key
- `importers/reports-importer.ts` — Reportes por cliente con derivación de tipo
- `importers/agents-importer.ts` — Agentes Markdown con clasificación de tipo
- `importers/skills-importer.ts` — Skills con fallback de SKILL.md → *.md → flat
- `importers/templates-importer.ts` — Templates con clasificación por nombre
- `importers/automations-importer.ts` — automations-registry.json con resolución de client_id

#### Fase 4E — Vault

- `scripts/migrations/phase-4/vault/README.md` — Guía de operadores
- `docs/implementation/phase-4/SECRETS_REQUIRING_VAULT.md` — 4 secretos identificados (sin valores)

#### Fase 4F — Verificación y Documentación

- `docs/implementation/phase-4/TARGET_SCHEMA.md` — Schema completo de 11 tablas nuevas
- `docs/implementation/phase-4/DRY_RUN_REPORT.md` — Proyección simulada: 104 registros, 3 excluidos
- `docs/implementation/phase-4/DEVELOPER_GUIDE.md` — Guía de desarrollo y extensión
- `docs/implementation/phase-4/PHASE_4_CHANGELOG.md` — Este archivo
- `docs/implementation/phase-4/PHASE_4_CLOSURE.md` — Cierre y estado de Phase 4

#### Tests

- `scripts/migrations/phase-4/__tests__/hash.test.ts` — 9 tests (100% pass)
- `scripts/migrations/phase-4/__tests__/logger.test.ts` — 7 tests (100% pass)
- `scripts/migrations/phase-4/__tests__/secret-detector.test.ts` — 8 tests (100% pass)
- `scripts/migrations/phase-4/__tests__/filesystem.test.ts` — 8 tests (100% pass)
- **Total**: 32/32 tests passing

### Restricciones cumplidas

- ✓ NO ejecutada migración real en Supabase remoto
- ✓ NO cargados secretos automáticamente
- ✓ NO tokens ni secretos en logs ni archivos de salida
- ✓ NO commit ni push
- ✓ NO se usó `any`, `@ts-ignore`, `eslint-disable`, `--force`, `--legacy-peer-deps`
- ✓ NO se modificaron migraciones de Fase 3
- ✓ NO se usa service_role desde browser ni Client Components
- ✓ NO se migraron registros en cuarentena
- ✓ NO se inició Phase 5
- ✓ NO se eliminaron archivos originales
