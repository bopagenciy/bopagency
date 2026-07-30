# Comando: /proposal

## Descripción
Crea una propuesta comercial profesional completa.

## Uso
```
/proposal
/proposal cliente=[nombre] servicios=[servicio1, servicio2] presupuesto=[rango]
```

## Instrucción para Claude
Actúa como `proposal-builder`. Usa las skills `proposal-builder` y `offer-builder`. Crear propuesta con diagnóstico del cliente, solución, paquetes de servicios, cronograma, inversión y próximos pasos. Siempre presentar 2-3 opciones de paquete.

## Referencias
- .claude/skills/proposal-builder/SKILL.md
- .claude/skills/offer-builder/SKILL.md
- agents/proposal-builder.md
- templates/propuesta-comercial.md
