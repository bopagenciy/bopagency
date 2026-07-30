# Comando: /client-brief

## Descripción
Genera un brief completo del cliente activo, listo para usar en cualquier entregable o para compartir con el equipo.

## Uso
```
/client-brief
/client-brief [nombre-cliente]
```

## Proceso

Leer todos los archivos del cliente y generar un documento consolidado con:
- Resumen ejecutivo del cliente
- Servicios y objetivos
- Buyer personas
- Mensajes clave
- Restricciones de compliance
- Estado de campañas activas
- Próximas entregas

## Formato de Salida

```
# BRIEF DE CLIENTE — [Nombre]
**Fecha:** [Fecha] | **Account Manager:** [Agencia]

## EMPRESA
[Descripción en 2-3 oraciones]

## SERVICIOS CONTRATADOS
[Lista de servicios activos]

## OBJETIVOS ACTUALES
[Metas del trimestre/mes]

## AUDIENCIA TARGET
[Descripción del buyer persona principal]

## VOZ DE MARCA
Tono: [Descripción]
Palabras SÍ: [Lista]
Palabras NO: [Lista]

## COMPLIANCE
[Restricciones específicas]

## CAMPAÑAS ACTIVAS
[Resumen]

## PRÓXIMAS ENTREGAS
[Fechas y entregables]
```

## Referencias
- clients/[cliente]/brand-profile.md
- clients/[cliente]/services.md
- clients/[cliente]/campaigns.md
