# Phase 4 — Cierre

## Estado: LISTA PARA DRY-RUN

La implementación de Phase 4 está completa. Todos los entregables técnicos están creados y validados. La migración real está bloqueada intencionalmente hasta que el operador complete los pasos manuales descritos abajo.

## Entregables completados

### Infraestructura

- [x] SQL migration con 11 tablas + RLS + índices únicos
- [x] Framework TypeScript completo (typecheck 0 errores)
- [x] 9 importadores implementados
- [x] 32 tests unitarios pasando

### Documentación

- [x] CLIENT_CLASSIFICATION.md
- [x] SOURCE_MANIFEST.md
- [x] IDEMPOTENCY_MODEL.md
- [x] ROLLBACK_PLAN.md
- [x] SECURITY_MODEL.md
- [x] VAULT_SETUP.md
- [x] SECRETS_REQUIRING_VAULT.md
- [x] TARGET_SCHEMA.md
- [x] DRY_RUN_REPORT.md (simulado)
- [x] DEVELOPER_GUIDE.md
- [x] PHASE_4_PLAN.md
- [x] PHASE_4_CHANGELOG.md

## Acciones manuales requeridas antes de ejecutar

### Paso 1 — Aplicar migración SQL

```sql
-- En el SQL Editor de Supabase Dashboard o via Supabase CLI:
supabase db push
-- O aplicar manualmente el contenido de:
-- supabase/migrations/20260730150000_phase4_data_migration_targets.sql
```

### Paso 2 — Configurar variables de entorno

```bash
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Desde Supabase → Settings → API
export MIGRATION_ORGANIZATION_ID=<uuid>   # UUID de la organización en organizations table
```

### Paso 3 — Ejecutar dry-run

```bash
cd /path/to/BopIAgency
node -r ts-node/register scripts/migrations/phase-4/cli.ts \
  --dry-run \
  --organization-id=$MIGRATION_ORGANIZATION_ID \
  --verbose
```

### Paso 4 — Revisar output

```bash
cat migration-output/phase-4-dry-run-summary.json
cat migration-output/phase-4-dry-run-errors.json  # Debe estar vacío
```

### Paso 5 — Aprobar y ejecutar (solo si dry-run fue exitoso)

```bash
node -r ts-node/register scripts/migrations/phase-4/cli.ts \
  --execute \
  --organization-id=$MIGRATION_ORGANIZATION_ID
```

### Paso 6 — Cargar secretos en Vault (post-migración)

Ver: `docs/implementation/phase-4/VAULT_SETUP.md`

## Decisiones de diseño pendientes de revisión

1. **`bop-soluciones`** y **`the-industrial-depot`**: Presentes como carpetas pero ausentes de `clients-index.json`. Decisión: ¿agregar a clients-index y migrar, o mantener como `manual-review`?

2. **`cliente-prueba-automatizacion-marketing-digital`**: Clasificado como `manual-review`. Si es un cliente real, debe agregarse a la lista `APPROVED_CLIENTS` en `clients-importer.ts`.

3. **tasks.json vacíos**: Los archivos de tareas de los 2 clientes aprobados están vacíos en esta iteración. El importer no producirá registros de tasks hasta que se pueblen.

## Lo que NO incluye Phase 4

- Ejecución real de migración (requiere acción manual)
- Carga de secretos en Vault (requiere acción manual)
- Integración con n8n workflows (Phase 6)
- Rotación automática de tokens (Phase 6)
- Migración de `bop-soluciones`, `the-industrial-depot` (requiere revisión)

## Métricas de calidad

| Métrica                                        | Resultado                   |
| ---------------------------------------------- | --------------------------- |
| TypeScript errors (scripts/migrations/phase-4) | 0                           |
| Tests unitarios                                | 32/32 pass                  |
| Archivos con `any`                             | 0                           |
| Archivos con `@ts-ignore`                      | 0                           |
| Secretos en código                             | 0                           |
| Secretos en logs (diseño)                      | 0 (sanitizados)             |
| Archivos cuarentena accedidos                  | 0 (bloqueados por pathname) |
