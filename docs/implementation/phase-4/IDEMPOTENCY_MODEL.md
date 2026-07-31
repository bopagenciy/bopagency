# Phase 4 — Modelo de Idempotencia

## Principio general

Cada ejecución del script puede correr N veces con el mismo resultado. La idempotencia se garantiza por:

1. **Clave natural única**: identifica unívocamente el registro en la tabla destino.
2. **Hash de contenido (SHA-256)**: detecta cambios entre ejecuciones.
3. **Tabla `migration_records`**: registra qué se importó, desde dónde y con qué hash.

## Algoritmo por registro

```
para cada registro fuente:
  1. Calcular source_hash = SHA-256(contenido normalizado)
  2. Buscar en migration_records: (migration_name, source_path, source_key)
  3. Si NO existe en records:
     a. Buscar en tabla destino por clave natural
     b. Si NO existe → INSERT + record(action=insert)
     c. Si existe (manual) → skip + record(action=skip, note="pre-existing")
  4. Si existe en records:
     a. Si source_hash == record.source_hash → SKIP (no cambió)
     b. Si source_hash != record.source_hash:
        - Si --force-update → UPDATE + record(action=update)
        - Si no → conflict + record(action=conflict)
```

## Claves naturales por tabla

| Tabla                 | Clave natural                                                   | Nota                                             |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `clients`             | `organization_id + slug`                                        | slug derivado de clients-index.json[].id         |
| `client_documents`    | `client_id + document_key`                                      | document_key = nombre de archivo sin extensión   |
| `client_integrations` | `client_id + provider + external_account_id`                    | vacío en esta iteración                          |
| `tasks`               | `organization_id + legacy_source + legacy_id`                   | vacío en esta iteración                          |
| `client_metrics`      | `client_id + platform + account_id + period_start + period_end` | una fila por periodo+cuenta                      |
| `alerts`              | `organization_id + alert_key`                                   | alert_key = clave del estado en alert-state.json |
| `reports`             | `client_id + report_type + period_start + period_end`           |                                                  |
| `report_recipients`   | `organization_id + client_id + normalized_email + report_type`  | vacío en esta iteración                          |
| `agents`              | `organization_id + slug`                                        | slug = nombre de archivo sin extensión           |
| `skills`              | `organization_id + slug`                                        | slug = nombre de carpeta                         |
| `templates`           | `organization_id + slug`                                        | slug = nombre de archivo sin extensión           |
| `automations`         | `organization_id + legacy_id`                                   | legacy_id = id del registry                      |

## Hash de contenido

El hash se calcula sobre el contenido **normalizado** del registro, no el JSON raw:

```typescript
function computeHash(normalized: unknown): string {
  const canonical = JSON.stringify(normalized, Object.keys(normalized as object).sort());
  return createHash('sha256').update(canonical).digest('hex');
}
```

Normalización incluye:

- Fechas en ISO 8601 UTC
- Strings en trim()
- Emails en lowercase
- URLs con trailing slash removido
- Nulls explícitos para campos opcionales ausentes
- Sin campos de auditoría (created_at, updated_at, etc.)

## Comportamiento por acción

| Acción             | Condición                                   | Escribe en BD     | Escribe en migration_records |
| ------------------ | ------------------------------------------- | ----------------- | ---------------------------- |
| `insert`           | Registro no existe en destino ni en records | SÍ (en --execute) | SÍ                           |
| `update`           | Existe, hash cambió, --force-update         | SÍ (en --execute) | SÍ                           |
| `skip`             | Hash idéntico al record anterior            | NO                | NO (solo log)                |
| `skip-preexisting` | Existe en BD sin record de migración        | NO                | SÍ (con note)                |
| `conflict`         | Hash cambió sin --force-update              | NO                | SÍ (con error)               |
| `error`            | Validación fallida / excepción              | NO                | SÍ (con error_message)       |
| `excluded`         | Cuarentena / template / backup              | NO                | NO                           |

## Re-ejecución tras error

Si una ejecución falla a mitad:

1. Los records escritos ya son idempotentes (acción=insert/update).
2. En la siguiente ejecución: los registros con record existente y hash igual → `skip`.
3. Solo los registros sin record o con error previo se reintentarán.
4. `--resume` filtra solo los registros con `action IN ('error', 'conflict')` del último run.

## Campos de tracking en tablas destino

Las tablas de migración no añaden columnas legacy a las tablas operativas. En su lugar, `migration_records` actúa como índice externo. La única excepción son campos como `legacy_source` e `legacy_id` en `tasks` y `automations` donde es parte del modelo de negocio.
