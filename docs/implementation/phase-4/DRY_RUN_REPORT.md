# Phase 4 — Dry-Run Report (Simulado)

**Fecha de simulación**: 2026-07-30
**Modo**: DRY_RUN (ningún dato fue escrito a Supabase)
**Organización**: PENDIENTE (requiere `MIGRATION_ORGANIZATION_ID`)

## Estado

El dry-run real no puede ejecutarse hasta que:

1. La migración SQL se aplique en Supabase remoto
2. Se provea `MIGRATION_ORGANIZATION_ID`

Este documento es el **reporte simulado** basado en la auditoría de archivos fuente realizada en Phase 4A.

## Proyecciones por importer

| Importer          | Fuente                       | Total esperado | Insert | Skip | Error | Excluido         |
| ----------------- | ---------------------------- | -------------- | ------ | ---- | ----- | ---------------- |
| clients           | clients-index.json           | 5 entradas     | 2      | 0    | 0     | 3 (no aprobados) |
| documents         | `*/\*.md`                    | ~22 archivos   | 22     | 0    | 0     | 0                |
| metrics           | shared-data/metrics/periods/ | ~4 periodos    | 4      | 0    | 0     | 0                |
| alerts            | alert-state.json             | ~1 estado      | 1      | 0    | 0     | 0                |
| reports           | shared-data/reports/clients/ | ~9 reportes    | 9      | 0    | 0     | 0                |
| report_recipients | report-recipients.json       | 0              | 0      | 0    | 0     | 0                |
| agents            | .agencia-ai/.claude/agents/  | ~17 agentes    | 17     | 0    | 0     | 0                |
| skills            | .agencia-ai/.claude/skills/  | ~27 skills     | 27     | 0    | 0     | 0                |
| templates         | .agencia-ai/templates/       | ~17 templates  | 17     | 0    | 0     | 0                |
| automations       | automations-registry.json    | ~7 automations | 7      | 0    | 0     | 0                |

**Total proyectado**: ~104 registros, 3 excluidos (clientes no aprobados)

## Clientes excluidos (no aprobados para auto-migración)

| Slug                                              | Razón                         | Acción recomendada               |
| ------------------------------------------------- | ----------------------------- | -------------------------------- |
| `_template-client`                                | Template, no es cliente real  | Excluir permanentemente          |
| `bop-soluciones`                                  | Ausente de clients-index.json | Revisión manual                  |
| `the-industrial-depot`                            | Ausente de clients-index.json | Revisión manual                  |
| `cliente-prueba-automatizacion-marketing-digital` | Cliente de prueba             | Revisión manual antes de incluir |

## Archivos en cuarentena bloqueados

5 archivos con `/quarantine/` en path o `CONTAMINATED` en nombre:

- `.agencia-ai/clients/legalink-col/quarantine/*.md` (3 archivos)
- `.agencia-ai/clients/magic-bungalow/quarantine/*.md` (2 archivos)

Todos bloqueados a nivel de pathname — nunca leídos.

## Secretos detectados

Ningún secreto fue detectado en archivos JSON fuente. Los 4 secretos de Meta Ads se cargarán manualmente en Vault.

## Comando para ejecutar dry-run real

```bash
# Prerequisitos:
# 1. Aplicar migración SQL en Supabase remoto
# 2. Configurar variables de entorno:
#    SUPABASE_URL=https://xxxx.supabase.co
#    SUPABASE_SERVICE_ROLE_KEY=eyJ...
#    MIGRATION_ORGANIZATION_ID=<uuid-de-la-organizacion>

cd scripts/migrations/phase-4
npm run typecheck
node cli.ts --dry-run --organization-id=<UUID> --verbose

# Revisar output en:
# migration-output/phase-4-dry-run-summary.json
# migration-output/phase-4-dry-run-errors.json
```

## Salida JSON esperada (structure)

```json
{
  "runId": "uuid-generado",
  "mode": "dry_run",
  "status": "completed",
  "startedAt": "2026-07-30T...",
  "completedAt": "2026-07-30T...",
  "importers": [
    { "entityType": "client", "total": 5, "inserted": 2, "skipped": 0, "errors": 0, "excluded": 3 },
    {
      "entityType": "document",
      "total": 22,
      "inserted": 22,
      "skipped": 0,
      "errors": 0,
      "excluded": 0
    }
  ],
  "totals": { "total": 107, "inserted": 104, "skipped": 0, "errors": 0, "excluded": 3 }
}
```
