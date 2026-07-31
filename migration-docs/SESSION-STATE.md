# BopIAgency Phase 4 — Estado de sesión

> Última actualización: 2026-07-30 (fin de jornada)
> Próxima acción: revisar si hay algo pendiente en Phase 4 antes de avanzar a Phase 5

---

## ¿Dónde estamos?

**Task 68 completada** — Corrección de manejo de errores y archivos de salida Phase 4.

Todo el CI pasa limpio:

- typecheck ✓ (tsc -p scripts/migrations/phase-4/tsconfig.json --noEmit → sin errores)
- eslint ✓ (sin advertencias en archivos modificados)
- prettier ✓ (format:check limpio)
- tests ✓ 168/168 pasando (10 archivos de test)

---

## Archivos modificados en Task 68

| Archivo                                                      | Cambio                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `scripts/migrations/phase-4/importers/templates-importer.ts` | Spread `extractPostgrestExtra` en UPSERT_FAILED (último importer pendiente)   |
| `scripts/migrations/phase-4/adapters/report-writer.ts`       | **NUEVO** — `buildReportFilenames`, `sanitizeErrorRecord`, `writeRunReport`   |
| `scripts/migrations/phase-4/cli.ts`                          | Usa `writeRunReport`; elimina `writeSanitizedReport`; fix mensaje hardcodeado |
| `scripts/migrations/phase-4/__tests__/report-writer.test.ts` | **NUEVO** — 17 tests                                                          |

---

## Estado final de todos los importers (extractPostgrestExtra)

Todos los importers tienen `extractPostgrestExtra` aplicado en sus sitios de error DB:

- `agents-importer.ts` ✓ (UPSERT_FAILED)
- `alerts-importer.ts` ✓ (UPSERT_FAILED)
- `automations-importer.ts` ✓ (UPSERT_FAILED)
- `clients-importer.ts` ✓ (UPDATE_FAILED, INSERT_FAILED)
- `documents-importer.ts` ✓ (RPC_ERROR)
- `metrics-importer.ts` ✓ (UPSERT_FAILED)
- `reports-importer.ts` ✓ (UPSERT_FAILED)
- `skills-importer.ts` ✓ (UPSERT_FAILED)
- `templates-importer.ts` ✓ (UPSERT_FAILED) ← completado en Task 68

---

## Comportamiento de archivos de salida (post-fix)

### Nombres por modo

- `dry_run` → `phase-4-dry-run-{runId}-summary.json` / `phase-4-dry-run-latest-summary.json`
- `execute` → `phase-4-execute-{runId}-summary.json` / `phase-4-execute-latest-summary.json`
- Igual para `*-errors.json`

### Regla no-overwrite

- Histórico (`{runId}` en nombre): escrito con flag `wx` → nunca se sobreescribe
- Latest: siempre sobreescrito

### Contenido de errores

- Cada error: registro individual con `runId`, `entityType`, `sourceKey`, `sourcePath` (relativa), `errorCode`, `errorMessage`, `targetTable`, `operation`, `timestamp`
- Campos Supabase opcionales: `supabaseCode`, `supabaseDetails`, `supabaseHint` (truncados)
- Sin rutas absolutas, sin secretos

---

## Status lógico (MigrationRunStatus)

| Condición                | Status local      | Status en DB                                          |
| ------------------------ | ----------------- | ----------------------------------------------------- |
| 0 errores                | `completed`       | `completed`                                           |
| errores + algunos éxitos | `partial_failure` | `failed` (+ `partial_writes: true` en result_summary) |
| solo errores             | `failed`          | `failed`                                              |

`partial_failure` es TypeScript-only, nunca escrito al enum de Supabase.

---

## Restricciones hard activas

- NO ejecutar --execute / NO migrar datos reales contra Supabase remoto
- NO hacer commit ni push
- NO avanzar a Fase 5 todavía
- NO modificar enum remoto sin nueva migración SQL
- NO usar any, @ts-ignore, eslint-disable generalizado
- NO leer/imprimir/guardar tokens en logs
- NO modificar migraciones SQL ya aplicadas
- NO migrar registros en cuarentena o contaminados
- Imports Supabase: servidor=`@/lib/supabase/server`, browser=`@/lib/supabase/browser`, NO desde barrel `@/lib/supabase`

---

## Arquitectura del proyecto

```
BopIAgency/                          # npm workspaces monorepo
├── apps/web/                        # Next.js 15.5.22 App Router
├── packages/
│   ├── application/                 # use cases, vitest config
│   ├── domain/                      # entidades, repositorios (interfaces)
│   ├── infrastructure/              # Supabase repos, mappers
│   └── shared/                      # schemas Zod, tipos compartidos
└── scripts/migrations/phase-4/     # CLI de migración Phase 4
    ├── cli.ts                       # entrada, arg parsing
    ├── runner.ts                    # orquestador
    ├── types.ts                     # tipos compartidos
    ├── adapters/
    │   ├── filesystem.ts
    │   ├── supabase.ts
    │   ├── secret-detector.ts
    │   ├── postgrest-error.ts       # extractPostgrestExtra
    │   ├── repository-root.ts       # resolveSharedDataPath, sanitizeLogPath
    │   ├── client-resolver.ts       # resolveMigrationClient
    │   └── report-writer.ts         # buildReportFilenames, writeRunReport ← NUEVO
    ├── importers/                   # 9 importers
    └── __tests__/                   # 10 archivos de test, 168 tests
```

### Convenciones clave

- Test runner: `packages/application/node_modules/.bin/vitest run <path>`
- Typecheck scripts: `node_modules/.bin/tsc -p scripts/migrations/phase-4/tsconfig.json --noEmit`
- Lint: `node_modules/.bin/eslint <files>`
- Format check: `node_modules/.bin/prettier --check <files>`
- Bash paths: `D:\...` → `/sessions/zealous-focused-tesla/mnt/BopIAgency/...`

### MigrationContext (Task 67 — ya implementado)

- `projectedClients: Map<string, ProjectedClient>` — poblado por ClientsImporter
- `excludedSlugs: Set<string>` — slugs no aprobados
- `resolveMigrationClient(slug, ctx)` → `{ kind: 'existing'|'projected'|'excluded'|'missing', clientId? }`
- Los importers dependientes (metrics, reports, documents, alerts, automations, agents) usan `resolveMigrationClient` en lugar de queries DB

---

## Próximos pasos probables

1. Validar en ejecución real (dry_run) que los archivos salen con nombres correctos
2. Decidir si hay algo más en Phase 4 o si se puede comenzar Phase 5
3. Phase 5 NO inicia sin autorización explícita de Francisco

---

## Preferencias de Francisco

- Respuestas concisas y directas, sin verbosidad innecesaria
- Sin listas de bullets excesivas — prefiere prosa o tablas
- Sin `any`, `@ts-ignore`, `--force`, ni shortcuts de deuda técnica
- Commits solo cuando él lo indique explícitamente
- Hard constraints deben permanecer activas entre sesiones
- Idioma: español para comunicación, inglés para código
