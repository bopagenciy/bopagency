---
name: add-task
description: Agrega una tarea validada al tasks.json de un cliente activo de BOP AI Agency OS.
argument-hint: "[client-id]"
disable-model-invocation: true
user-invocable: true
---

# Skill: add-task

Agrega de forma segura una nueva tarea al archivo `clients/[client-id]/tasks.json` sin modificar ningún otro archivo del cliente.

---

## Paso 1 — Recibir y validar client-id

Si no se proporcionó un `client-id` como argumento, detener y responder:

```
❌ Uso correcto: /add-task [client-id]
Ejemplo: /add-task acme-corp
```

---

## Paso 2 — Verificar que el cliente existe y está listo

Usando el `client-id` recibido, comprobar la existencia de los tres archivos siguientes:

1. `clients/[client-id]/client.json`
2. `clients/[client-id]/tasks.json`
3. `clients/[client-id]/.ready`

Si alguno no existe, detener con el mensaje correspondiente:

- Si falta `client.json` → `❌ No se encontró el cliente "[client-id]". Verifica el ID e intenta de nuevo.`
- Si falta `tasks.json` → `❌ El cliente "[client-id]" no tiene archivo tasks.json. Ejecuta /new-client para inicializarlo.`
- Si falta `.ready` → `❌ El cliente "[client-id]" no está marcado como listo (.ready no existe). Verifica el estado del cliente.`

---

## Paso 3 — Verificar que el cliente está activo

Leer `clients/[client-id]/client.json` y comprobar que el campo `status` es `"active"`.

Si `status` no es `"active"`, detener con:

```
❌ El cliente "[client-id]" no está activo (status: "[valor actual]").
Solo se pueden agregar tareas a clientes con status "active".
```

---

## Paso 4 — Leer y validar tasks.json

Leer `clients/[client-id]/tasks.json` completo.

Verificar que el contenido es JSON válido y que contiene el arreglo `tasks`.

Si el JSON está malformado, detener con:

```
❌ El archivo tasks.json del cliente "[client-id]" contiene JSON inválido.
No se puede continuar sin riesgo de pérdida de datos.
Revisa el archivo manualmente antes de agregar tareas.
```

---

## Paso 5 — Crear copia de seguridad

Antes de hacer cualquier modificación, crear una copia de seguridad del archivo actual:

- Ruta de destino: `clients/[client-id]/backups/tasks-[YYYYMMDD-HHmmss].json`
- Crear el directorio `backups/` si no existe.
- Copiar el contenido actual de `tasks.json` sin modificarlo.
- Confirmar que la copia fue creada correctamente.

Si no se puede crear la copia de seguridad, detener con:

```
❌ No se pudo crear la copia de seguridad. Operación cancelada por seguridad.
```

---

## Paso 6 — Solicitar los datos de la nueva tarea

Pedir al usuario los siguientes campos, uno a uno o en bloque. Indicar cuáles son opcionales:

| Campo | Obligatorio | Notas |
|-------|-------------|-------|
| `title` | Sí | No puede estar vacío |
| `description` | Sí | No puede estar vacío |
| `priority` | Sí | Debe ser: `low`, `medium`, `high` o `critical` |
| `status` | Sí | Ver estados permitidos abajo |
| `ownerAgent` | Sí | Agente responsable (ej: `project-manager`, `copywriter`) |
| `dueDate` | No | Fecha ISO 8601 o dejar vacío para `null` |
| `source` | Sí | Origen de la tarea (ej: `manual`, `client-request`, `audit`) |
| `reason` | Sí | Por qué se crea esta tarea |
| `expectedImpact` | Sí | Qué resultado se espera lograr |
| `requiresApproval` | Sí | `true` o `false` |
| `acceptanceCriteria` | Sí | Lista de criterios (puede ser vacía `[]`) |
| `dependencies` | No | IDs de tareas previas requeridas (puede ser vacía `[]`) |
| `tags` | No | Etiquetas clasificatorias (puede ser vacía `[]`) |

**Restricción de seguridad:** Si algún valor parece contener una contraseña, token, API key, secreto o credencial, rechazar el campo e indicar:

```
⚠️ No se pueden guardar credenciales, tokens ni contraseñas en tasks.json.
Por favor, usa un gestor de secretos o la sección designada para ese fin.
```

---

## Paso 7 — Validar campos antes de construir la tarea

Aplicar las siguientes validaciones:

- `title` → no vacío, no solo espacios
- `description` → no vacío, no solo espacios
- `status` → debe ser exactamente uno de: `idea`, `pending`, `awaiting_approval`, `approved`, `in_progress`, `in_review`, `blocked`, `completed`, `cancelled`
- `priority` → debe ser exactamente uno de: `low`, `medium`, `high`, `critical`
- `dueDate` → debe ser `null` o una fecha ISO 8601 válida (ej: `2026-07-01` o `2026-07-01T00:00:00Z`)
- `acceptanceCriteria` → debe ser un arreglo (puede ser vacío)
- `dependencies` → debe ser un arreglo (puede ser vacío)
- `tags` → debe ser un arreglo (puede ser vacío)

Si alguna validación falla, indicar el error específico y pedir la corrección antes de continuar.

---

## Paso 8 — Generar el ID único de la tarea

Usar la fecha actual en formato `YYYYMMDD`.

Revisar las tareas existentes en `tasks.json` para identificar cuántas tareas del mismo día ya existen.

Construir el ID con el siguiente consecutivo:

```
TASK-YYYYMMDD-001
TASK-YYYYMMDD-002
...
```

El nuevo ID debe ser único. Nunca reutilizar un ID existente.

---

## Paso 9 — Construir el objeto de la tarea

Usar la fecha y hora actual en formato ISO 8601 para `createdAt` y `updatedAt`.

```json
{
  "id": "TASK-YYYYMMDD-NNN",
  "title": "[título ingresado]",
  "description": "[descripción ingresada]",
  "status": "[estado validado]",
  "priority": "[prioridad validada]",
  "ownerAgent": "[agente responsable]",
  "createdAt": "[ISO 8601 actual]",
  "updatedAt": "[ISO 8601 actual]",
  "dueDate": null,
  "source": "[origen]",
  "reason": "[razón]",
  "expectedImpact": "[impacto esperado]",
  "requiresApproval": true,
  "acceptanceCriteria": [],
  "dependencies": [],
  "tags": []
}
```

---

## Paso 10 — Actualizar tasks.json de forma segura

Aplicar las siguientes reglas sin excepción:

- **NO borrar tareas anteriores.**
- **NO sobrescribir el arreglo `tasks` completo** sin conservar todas las tareas existentes.
- **NO modificar** `client.json`, `.ready`, `integrations.json` ni ningún otro archivo del cliente.
- **NO modificar** nada en `_template-client`.

Agregar la nueva tarea al final del arreglo `tasks`.

Actualizar los siguientes campos del objeto raíz del JSON:

- `lastUpdatedAt` → fecha y hora ISO 8601 actual
- `schemaVersion` → conservar el valor existente sin modificarlo

Escribir el archivo con indentación de 2 espacios.

---

## Paso 11 — Validar el JSON resultante

Después de escribir el archivo, leerlo nuevamente y verificar que:

- El contenido es JSON válido.
- La nueva tarea está presente con su ID correcto.
- Las tareas anteriores siguen intactas.
- `lastUpdatedAt` fue actualizado.

Si la validación post-escritura falla:

1. Restaurar automáticamente la copia de seguridad creada en el Paso 5.
2. Informar al usuario:

```
❌ Error al validar el archivo después de escribirlo.
Se restauró la copia de seguridad: clients/[client-id]/backups/tasks-[timestamp].json
El archivo tasks.json no fue modificado.
```

---

## Paso 12 — Mostrar resumen final

Si todo fue exitoso, mostrar el siguiente resumen:

```
✅ Tarea agregada exitosamente

Cliente:           [client-id]
ID de tarea:       TASK-YYYYMMDD-NNN
Título:            [título]
Prioridad:         [prioridad]
Estado:            [estado]
Responsable:       [ownerAgent]
Fecha límite:      [dueDate o "Sin fecha límite"]
Requiere aprobación: [Sí / No]

Backup guardado en: clients/[client-id]/backups/tasks-[timestamp].json
Total de tareas:   [N] tareas en el archivo
JSON válido:       ✅ Confirmado
```

---

## Estados permitidos

| Estado | Descripción |
|--------|-------------|
| `idea` | Tarea en fase de ideación, sin compromiso aún |
| `pending` | Tarea definida, pendiente de inicio |
| `awaiting_approval` | Esperando aprobación antes de proceder |
| `approved` | Aprobada, lista para ejecutarse |
| `in_progress` | En ejecución activa |
| `in_review` | Completada, pendiente de revisión |
| `blocked` | Bloqueada por una dependencia o impedimento |
| `completed` | Finalizada y aceptada |
| `cancelled` | Cancelada sin completarse |

---

## Prioridades permitidas

| Prioridad | Descripción |
|-----------|-------------|
| `low` | Puede esperar, impacto menor |
| `medium` | Importante pero no urgente |
| `high` | Urgente o de alto impacto |
| `critical` | Bloquea otras tareas o tiene impacto crítico en el cliente |

---

## Archivos que esta skill puede leer

- `clients/[client-id]/client.json` (solo lectura)
- `clients/[client-id]/tasks.json` (lectura + escritura)
- `clients/[client-id]/.ready` (solo verificación de existencia)

## Archivos que esta skill puede escribir

- `clients/[client-id]/tasks.json`
- `clients/[client-id]/backups/tasks-[timestamp].json`

## Archivos que esta skill NUNCA debe tocar

- `clients/[client-id]/client.json`
- `clients/[client-id]/.ready`
- `clients/[client-id]/integrations.json`
- `clients/_template-client/` (ningún archivo dentro)
- Cualquier otro archivo no listado arriba
