# Phase 4 — Clasificación de Clientes

Auditoría realizada: 2026-07-30

## Carpetas detectadas en `.agencia-ai/clients/`

| Carpeta                                           | En clients-index | .ready | tasks.json   | integrations.json | Clasificación     | Razón                                                                                                                                                                                 |
| ------------------------------------------------- | ---------------- | ------ | ------------ | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_template-client`                                | NO               | NO     | ✓ (vacío)    | ✓ (vacío)         | **excluded**      | Carpeta de plantilla, prefijo `_`                                                                                                                                                     |
| `cliente-prueba-automatizacion-marketing-digital` | SÍ               | ✓      | ✓ (0 tareas) | ✓ (todo null)     | **manual-review** | Cliente de prueba, sin datos reales de integración. Requiere confirmación antes de migrar.                                                                                            |
| `legalink-col`                                    | SÍ               | ✓      | ✓ (0 tareas) | ✓ (vacío `[]`)    | **migrate**       | Cliente activo, en índice central, datos limpios                                                                                                                                      |
| `magic-bungalow`                                  | SÍ               | ✓      | ✓ (0 tareas) | ✓ (vacío `[]`)    | **migrate**       | Cliente activo. Datos limpios en `metrics/clients/magic-bungalow/`. Datos contaminados en `quarantine/` — EXCLUIDOS.                                                                  |
| `bop-soluciones`                                  | NO               | NO     | NO           | NO                | **manual-review** | No está en clients-index.json. Tiene archivos extra (campaigns.json, insights.json, metrics.json, alerts.json) en formato legacy distinto. Requiere revisión manual antes de incluir. |
| `the-industrial-depot`                            | NO               | NO     | NO           | NO                | **manual-review** | No está en clients-index.json. Tiene subcarpeta `campaigns/`. Sin tasks.json ni integrations.json. Requiere revisión.                                                                 |

## Clientes aprobados para migración automática

| slug             | name              | industry (fuente)              | industry (BD) | Acción |
| ---------------- | ----------------- | ------------------------------ | ------------- | ------ |
| `legalink-col`   | Legalink Colombia | Servicios legales digitales    | `legal`       | insert |
| `magic-bungalow` | Magic Bungalow    | Hotelería / Turismo / Glamping | `hospitality` | insert |

## Clientes en revisión manual

- **`cliente-prueba-automatizacion-marketing-digital`**: industry fuente = "Marketing Digital / Agencia" → mapea a `other`. Sin integrations reales (todo `null`/`false`). Documentos presentes. Tiene carpeta `backups/` que NO se migra. Aprobar explícitamente con `--client=cliente-prueba-automatizacion-marketing-digital`.
- **`bop-soluciones`**: Datos propietarios en formato pre-schema. Métricas y alertas en JSON legacy. No tiene slug compatible con clients-index. Migración manual futura.
- **`the-industrial-depot`**: Sin registro central. Campaña única en subcarpeta. Migración manual futura.

## Datos en cuarentena — NUNCA MIGRAR

| Ruta                                                                                           | Razón                |
| ---------------------------------------------------------------------------------------------- | -------------------- |
| `shared-data/quarantine/magic-bungalow-contaminated/metrics/2026-06-CONTAMINATED.json`         | Marcado CONTAMINATED |
| `shared-data/quarantine/magic-bungalow-contaminated/metrics/2026-07-CONTAMINATED.json`         | Marcado CONTAMINATED |
| `shared-data/quarantine/magic-bungalow-contaminated/monthly-reports/2026-06-CONTAMINATED.json` | Marcado CONTAMINATED |
| `shared-data/quarantine/magic-bungalow-contaminated/weekly-reports/2026-W25-CONTAMINATED.json` | Marcado CONTAMINATED |
| `shared-data/quarantine/magic-bungalow-contaminated/weekly-reports/2026-W27-CONTAMINATED.json` | Marcado CONTAMINATED |

El directorio `shared-data/quarantine/` está bloqueado en el importer por pathname. Cualquier archivo cuyo path resuelto contenga `/quarantine/` es rechazado automáticamente.

## Archivos de backup — EXCLUIDOS

| Ruta                                                                                 | Razón                           |
| ------------------------------------------------------------------------------------ | ------------------------------- |
| `.agencia-ai/clients/cliente-prueba-automatizacion-marketing-digital/backups/*.json` | Backups de tareas pre-migración |

Los archivos dentro de subcarpetas `backups/` son ignorados por el importer.

## Clientes con documentos pero sin registro central

| Carpeta                | Documentos                     | tasks | integrations | Estado                                    |
| ---------------------- | ------------------------------ | ----- | ------------ | ----------------------------------------- |
| `bop-soluciones`       | 14 .md + 4 .json extra         | NO    | NO           | missing-source (no está en clients-index) |
| `the-industrial-depot` | 11 .md + subcarpeta campaigns/ | NO    | NO           | missing-source (no está en clients-index) |

> Estos clientes tienen documentos en .agencia-ai pero NO aparecen en `shared-data/clients-index.json`. No se pueden migrar automáticamente porque no tienen slug canónico verificado.

## Métricas disponibles (solo para clientes aprobados)

| Cliente          | Periodos limpios | Plataforma | Account ID                        |
| ---------------- | ---------------- | ---------- | --------------------------------- |
| `legalink-col`   | 2026-06, 2026-07 | meta_ads   | act_9067685124***** (enmascarado) |
| `magic-bungalow` | 2026-06, 2026-07 | meta_ads   | act_8009603878***** (enmascarado) |

## Reportes disponibles

| Cliente          | Tipo    | Periodos                               |
| ---------------- | ------- | -------------------------------------- |
| `legalink-col`   | weekly  | 2026-W25, 2026-W27, 2026-W30           |
| `legalink-col`   | monthly | 2026-06                                |
| `magic-bungalow` | weekly  | 2026-W25, 2026-W26, 2026-W27, 2026-W30 |
| `magic-bungalow` | monthly | 2026-06                                |

## Resumen de conteos

| Tipo                 | Total detectado | Aprobados     | Manual review | Excluidos/Contaminados |
| -------------------- | --------------- | ------------- | ------------- | ---------------------- |
| Carpetas de clientes | 6               | 2             | 3             | 1 (_template)          |
| Clientes en index    | 3               | 2             | 1 (prueba)    | 0                      |
| Documentos Markdown  | ~66 (11×6)      | ~22 (11×2)    | ~33           | ~11 (_template)        |
| tasks.json           | 4               | 2 (vacíos)    | 1 (vacío)     | 1 (_template)          |
| integrations.json    | 3               | 2 (vacíos)    | 1 (vacío)     | 1 (_template)          |
| Periodos de métricas | 9               | 4             | 0             | 5 (quarantine)         |
| Reportes             | 9               | 9             | 0             | 0                      |
| Alertas (estados)    | 1               | 1             | 0             | 0                      |
| Automations          | 7               | 7             | 0             | 0                      |
| Agents               | 17              | 17 (globales) | 0             | 0                      |
| Skills               | 27              | 27 (globales) | 0             | 0                      |
| Templates            | 17              | 17 (globales) | 0             | 0                      |
