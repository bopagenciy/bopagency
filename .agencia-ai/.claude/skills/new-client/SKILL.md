---
name: new-client
description: Crea y configura un cliente nuevo para BOP AI Agency OS usando la plantilla oficial, generando client.json, tasks.json, integrations.json y .ready después de validar la estructura.
argument-hint: "[nombre del cliente] [industria]"
disable-model-invocation: true
user-invocable: true
---
# Comando: /new-client

## Descripción
Crea la estructura completa de un nuevo cliente en la agencia.

## Uso
```
/new-client
```
O con información previa:
```
/new-client [Nombre del cliente] [industria]
```

## Proceso Automático

Al ejecutar este comando, Claude debe:

1. **Solicitar información básica** (si no fue proporcionada):
   - Nombre del cliente/empresa
   - Industria
   - Website
   - Ciudad/País de operación
   - Servicios principales (3-5)
   - Público objetivo
   - Objetivo de marketing principal

2. **Crear la estructura de carpetas:**
   ```
   clients/[nombre-cliente]/
   ├── brand-profile.md
   ├── services.md
   ├── buyer-personas.md
   ├── offers.md
   ├── campaigns.md
   ├── content-calendar.md
   ├── reports.md
   ├── assets.md
   ├── notes.md
   ├── compliance-rules.md
   └── automation-map.md
   ```

3. **Completar brand-profile.md** con la información recopilada

4. **Generar checklist de assets necesarios** con base en los servicios contratados

5. **Crear estrategia inicial de 30 días** con recomendaciones de primeras campañas

## Instrucción para Claude

Usa la skill `client-onboarding` y el agente `account-manager` para ejecutar este proceso. Al finalizar, confirma que la carpeta fue creada y muestra el resumen del brand profile y los próximos pasos.

## Referencias
- .claude/skills/client-onboarding/SKILL.md
- .claude/skills/client-brand-profile/SKILL.md
- clients/_template-client/

---

## Integración obligatoria con BOP AI Agency OS

Después de completar el proceso normal de creación del cliente, prepara su carpeta para que sea reconocida automáticamente por la aplicación local y por n8n.

### Ruta de creación

Crear el cliente únicamente dentro de:

`.agencia-ai/clients/[client-id]/`

El `client-id` debe:

- estar en minúsculas;
- usar guiones en lugar de espacios;
- no contener tildes;
- no contener caracteres especiales;
- ser único.

### Uso de la plantilla

Copiar todo el contenido de:

`.agencia-ai/clients/_template-client/`

hacia:

`.agencia-ai/clients/[client-id]/`

No modificar `_template-client`.

### Archivos estructurados obligatorios

Cada cliente debe contener:

- `client.json`
- `tasks.json`
- `integrations.json`

### Configuración de client.json

Reemplazar:

- `__CLIENT_ID__`
- `__CLIENT_NAME__`
- `__INDUSTRY__`

También establecer:

- `status`: `active`
- `createdAt`: fecha ISO 8601
- `updatedAt`: fecha ISO 8601
- `language`
- `timezone`

### Configuración de tasks.json

Reemplazar `__CLIENT_ID__` por el identificador real.

Mantener inicialmente:

```json
"tasks": []

### Configuración de integrations.json

Reemplazar:

- `__CLIENT_ID__` por el identificador real.

Mantener todas las integraciones desactivadas inicialmente.

Nunca guardar en `integrations.json`:

- claves API;
- tokens;
- contraseñas;
- client secrets;
- refresh tokens;
- credenciales privadas.

### Validaciones obligatorias

Antes de finalizar:

1. Confirmar que existe `client.json`.
2. Confirmar que existe `tasks.json`.
3. Confirmar que existe `integrations.json`.
4. Validar que los tres archivos contienen JSON válido.
5. Confirmar que no quedan estos placeholders:
   - `__CLIENT_ID__`
   - `__CLIENT_NAME__`
   - `__INDUSTRY__`
6. Confirmar que el `id` de `client.json` coincide con el `clientId` de `tasks.json` e `integrations.json`.
7. Confirmar que todos los documentos declarados en `client.json` existen.
8. Confirmar que no hay claves, tokens, contraseñas ni secretos dentro de la carpeta del cliente.
9. Confirmar que la carpeta `_template-client` no fue modificada.
10. Confirmar que la carpeta del cliente no existía previamente o que el usuario autorizó explícitamente su actualización.

### Archivo de finalización

Solo después de completar satisfactoriamente todas las validaciones, crear:

`.agencia-ai/clients/[client-id]/.ready`

El archivo `.ready` debe contener JSON válido con esta estructura:

```json
{
  "status": "ready",
  "clientId": "[client-id]",
  "createdAt": "[fecha ISO 8601]",
  "schemaVersion": "1.0.0"
}
>>

No crear `.ready` si:

- falta información esencial;
- algún JSON es inválido;
- quedan placeholders;
- faltan documentos;
- los identificadores no coinciden;
- se detectaron credenciales o secretos;
- ocurrió un error durante la creación.

### Protección contra sobrescritura

Si ya existe una carpeta con el mismo `client-id`:

- no sobrescribirla automáticamente;
- no borrar archivos;
- no reemplazar información existente;
- informar que el cliente ya existe;
- solicitar otro identificador o autorización explícita para actualizarlo;
- crear una copia de seguridad antes de cualquier actualización autorizada.

### Resultado final

Al terminar, informar:

- nombre comercial del cliente;
- identificador del cliente;
- industria;
- ruta creada;
- número de archivos generados;
- resultado de la validación de JSON;
- resultado de la validación de documentos;
- confirmación de que no existen placeholders;
- confirmación de que no se guardaron secretos;
- confirmación de que `.ready` fue creado.

