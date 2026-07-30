# Comando: /set-client

## Descripción
Carga el contexto completo de un cliente existente para usarlo como referencia en todas las respuestas de la sesión.

## Uso
```
/set-client [nombre-del-cliente]
```

Ejemplo:
```
/set-client acme-dental
```

## Proceso

Al ejecutar este comando, Claude debe:

1. Buscar la carpeta `clients/[nombre-cliente]/`
2. Leer `brand-profile.md` y cargar todos sus datos
3. Leer `services.md` para conocer los servicios contratados
4. Leer `compliance-rules.md` para aplicar restricciones específicas
5. Confirmar al usuario que el cliente está activo con un resumen

## Mensaje de Confirmación

```
✅ Cliente activo: [Nombre del Cliente]
📊 Industria: [Industria]
🎯 Objetivo principal: [Objetivo]
⚠️ Compliance: [Restricciones principales]
📦 Servicios activos: [Lista de servicios]

Todo el contenido de esta sesión usará el perfil de [Cliente].
```

## Instrucción para Claude

Después de cargar el cliente, aplicar su tono, restricciones y contexto a TODAS las respuestas siguientes de la sesión. Si el usuario pide crear una campaña, copy, reporte o cualquier entregable, usar el perfil del cliente activo.

## Referencias
- clients/[cliente]/brand-profile.md
- clients/[cliente]/compliance-rules.md
- agents/account-manager.md
