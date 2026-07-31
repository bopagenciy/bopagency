# Phase 4 — Developer Guide

## Estructura del script de migración

```
scripts/migrations/phase-4/
├── cli.ts                   # Entry point — parsea args, orquesta ejecución
├── config.ts                # Carga y valida variables de entorno
├── types.ts                 # Tipos TypeScript (sin any, sin @ts-ignore)
├── logger.ts                # Logger seguro con sanitización de secretos
├── hash.ts                  # SHA-256 determinístico para idempotencia
├── runner.ts                # Orquesta migration_runs + importers
├── adapters/
│   ├── supabase.ts          # Cliente Supabase (service_role)
│   ├── filesystem.ts        # Lectura segura de archivos (safeResolvePath)
│   └── secret-detector.ts  # Detección de secretos en JSON
├── importers/
│   ├── clients-importer.ts
│   ├── documents-importer.ts
│   ├── metrics-importer.ts
│   ├── alerts-importer.ts
│   ├── reports-importer.ts
│   ├── agents-importer.ts
│   ├── skills-importer.ts
│   ├── templates-importer.ts
│   └── automations-importer.ts
├── vault/
│   └── README.md            # Guía de carga manual de secretos
├── __tests__/
│   ├── hash.test.ts
│   ├── logger.test.ts
│   ├── secret-detector.test.ts
│   └── filesystem.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Variables de entorno requeridas

```bash
SUPABASE_URL=https://xxxx.supabase.co          # URL del proyecto
SUPABASE_SERVICE_ROLE_KEY=eyJ...               # Key service_role (NUNCA en código)
MIGRATION_ORGANIZATION_ID=uuid-v4-aqui        # UUID de la organización destino
```

Opcional:

```bash
MIGRATION_DRY_RUN=true   # No tiene efecto en el CLI (se usa el flag --dry-run)
```

## Comandos disponibles

```bash
# Verificar tipos
cd scripts/migrations/phase-4
npx tsc --noEmit

# Tests unitarios (desde root del proyecto)
packages/application/node_modules/.bin/vitest run \
  --config scripts/migrations/phase-4/vitest.config.ts

# Dry-run (desde root, con ts-node)
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MIGRATION_ORGANIZATION_ID=... \
  npx ts-node scripts/migrations/phase-4/cli.ts --dry-run --verbose

# Filtrar clientes específicos
... cli.ts --dry-run --client=legalink-col --client=magic-bungalow

# Limitar registros (pruebas)
... cli.ts --dry-run --limit=5 --verbose

# Ejecución real (solo tras aprobación del dry-run)
... cli.ts --execute --organization-id=<UUID>
```

## Agregar un nuevo importer

1. Crear `importers/{nombre}-importer.ts` implementando la interfaz `Importer`.
2. El `entityType` debe coincidir con un valor de `EntityType` en `types.ts`.
3. La lógica de idempotencia va en el método `upsert*`:
   - Consultar `migration_records` por `source_key` + `target_table` + `action=insert`
   - Si `source_hash` coincide → retornar `skip-preexisting`
   - Si no coincide → upsert en tabla destino
4. Registrar el importer en `cli.ts`.

## Principios de seguridad

- `safeResolvePath()` es el único punto de acceso al filesystem — úsalo siempre.
- El `Logger` sanitiza automáticamente campos sensibles — nunca imprime datos en bruto.
- `detectSecrets()` debe ejecutarse en todos los archivos JSON antes de procesarlos.
- La `service_role key` vive solo en `config.ts` y nunca pasa a capas superiores.
- Los archivos Markdown se tratan como texto no confiable — nunca se evalúan.

## Idempotencia

El mecanismo de idempotencia se basa en:

1. `source_hash` = SHA-256 de contenido normalizado (claves ordenadas)
2. `migration_records` guarda `(run_id, source_key, target_table, action, source_hash)`
3. En re-ejecución: si hash coincide → `skip-preexisting`, si difiere → `update`

## Tests

Los tests de unidad prueban:

- `hash.ts`: Determinismo, diferentes datos → diferentes hashes
- `logger.ts`: Sanitización de secretos, enmascaramiento de emails
- `secret-detector.ts`: Detección de patrones de secreto, no falsos positivos
- `filesystem.ts`: Path traversal bloqueado, quarantine bloqueado

No hay tests de integración (requieren Supabase remoto).
