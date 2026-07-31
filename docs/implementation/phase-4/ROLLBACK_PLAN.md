# Phase 4 — Plan de Rollback

## Principio

El rollback elimina **exclusivamente** los registros creados por una ejecución identificada. Nunca afecta registros creados manualmente ni por otras ejecuciones.

## Identificación de ejecuciones

Cada ejecución genera un `migration_run_id` (UUID). La tabla `migration_records` registra cada acción con su `run_id`. El rollback opera sobre un `run_id` concreto.

## Procedimiento de rollback

```bash
# Ver ejecuciones disponibles
npm run migrate:phase4 -- --list-runs --organization-id=<uuid>

# Simular rollback (dry-run)
npm run migrate:phase4 -- --rollback --run-id=<uuid> --dry-run

# Ejecutar rollback
npm run migrate:phase4 -- --rollback --run-id=<uuid> --execute
```

## Alcance del rollback

| Acción original | Rollback                                                           |
| --------------- | ------------------------------------------------------------------ |
| `insert`        | DELETE del registro en tabla destino + DELETE del migration_record |
| `update`        | No reversible automáticamente (los datos previos no se almacenan)  |
| `skip`          | Sin rollback (no se escribió nada)                                 |
| `error`         | Sin rollback (no se escribió nada)                                 |

> Los registros con `action=update` no tienen rollback automático porque los datos anteriores no se almacenan. Se deben restaurar manualmente o desde backup.

## Restricciones de seguridad

1. **Solo registros de migración**: el rollback verifica que `migration_records.run_id = ?` antes de eliminar.
2. **No DELETE masivo**: se eliminan de uno en uno, en lotes de 100.
3. **Verificación pre-DELETE**: antes de eliminar un registro, se verifica que existe en `migration_records` con `action=insert` y el mismo `target_id`.
4. **Los registros pre-existentes** (`action=skip-preexisting`) no se tocan en rollback.
5. **No se eliminan tablas**: solo filas individuales.
6. **No afecta otras organizaciones**: el rollback incluye filtro por `organization_id`.

## Tablas con soft delete

Para tablas que usan soft delete (`clients`, `client_contacts`):

- El rollback marca `deleted_at = now()` en lugar de DELETE físico.
- Se usa RPC `soft_delete_client` para respetar las reglas de auditoría.

## Tablas sin soft delete (importadas en Phase 4)

Las tablas nuevas (`agents`, `skills`, `templates`, `automations`, `client_metrics`, `reports`, `alerts`) usan DELETE físico en rollback, ya que son datos de migración que se pueden volver a importar.

## Tabla migration_runs — estados de rollback

```
status: pending → running → completed | failed | rolled_back
```

Al hacer rollback exitoso:

- `migration_runs.status` = `rolled_back`
- `migration_runs.completed_at` = timestamp del rollback

## Prioridad de rollback (orden de eliminación)

Para evitar violaciones de FK, el rollback elimina en orden inverso a la inserción:

1. `report_recipients`
2. `reports`
3. `alerts`
4. `client_metrics`
5. `tasks`
6. `client_documents`
7. `client_integrations`
8. `clients`
9. `agents`, `skills`, `templates`, `automations` (sin FK a clients)

## Protección adicional

El script de rollback:

- Rechaza `--run-id` si el run pertenece a otra organización.
- Rechaza si el run tiene `status=rolled_back` (ya fue revertido).
- Solicita confirmación explícita (o flag `--confirm`) antes de eliminar.
- Emite reporte de lo que se eliminaría en dry-run.
