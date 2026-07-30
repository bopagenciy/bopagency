# Comando: /brand-audit

## Descripción
Ejecuta una auditoría completa de marca usando la skill brand-audit.

## Uso
```
/brand-audit [URL del website]
/brand-audit [Nombre del cliente si ya está cargado]
```

## Proceso

1. Si hay cliente activo, usar su información base
2. Solicitar URL del website si no está en el perfil
3. Ejecutar la skill `brand-audit`
4. Entregar el reporte completo

## Instrucción para Claude

Usa el agente `brand-strategist` y la skill `brand-audit` para generar la auditoría completa. Sigue el formato de salida definido en la skill. Al finalizar, preguntar si se desea guardar el reporte en `clients/[cliente]/reports.md`.

## Referencias
- .claude/skills/brand-audit/SKILL.md
- agents/brand-strategist.md
- templates/auditoria-marca.md
