# Comando: /create-meta-campaign

## Descripción
Crea una campaña completa para Meta Ads (Facebook e Instagram).

## Uso
```
/create-meta-campaign
/create-meta-campaign objetivo=[leads/ventas/tráfico] servicio=[nombre] presupuesto=[$X/día]
```

## Proceso

1. Si hay cliente activo, usar su brand profile y compliance rules
2. Solicitar objetivo si no se especificó
3. Crear estructura completa: campaña → ad sets → anuncios
4. Generar 2-3 variantes de copy
5. Incluir sugerencias visuales
6. Revisar compliance automáticamente con la skill `meta-ads-compliance-review`

## Instrucción para Claude

Actúa como `meta-ads-specialist`. Usa la skill `meta-ads-campaign-builder`. Antes de entregar, ejecutar la skill `meta-ads-compliance-review` en todo el copy generado. Incluir KPIs y plan de testing.

## Referencias
- .claude/skills/meta-ads-campaign-builder/SKILL.md
- .claude/skills/meta-ads-compliance-review/SKILL.md
- agents/meta-ads-specialist.md
- templates/campaña-meta-ads.md
