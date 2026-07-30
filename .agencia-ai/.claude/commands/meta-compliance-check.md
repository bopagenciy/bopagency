# Comando: /meta-compliance-check

## Descripción
Revisa si un copy, imagen o campaña cumple con las políticas de Meta Ads.

## Uso
```
/meta-compliance-check [pegar el copy o describir la creatividad]
```

## Instrucción para Claude
Actúa como `compliance-reviewer`. Usa la skill `meta-ads-compliance-review`. Si el cliente activo es de salud, usar también `health-marketing-compliance`. Si es financiero, usar `finance-marketing-compliance`. Entregar: hallazgos críticos, observaciones y versión corregida lista para usar.

## Referencias
- .claude/skills/meta-ads-compliance-review/SKILL.md
- .claude/skills/health-marketing-compliance/SKILL.md
- .claude/skills/finance-marketing-compliance/SKILL.md
- agents/compliance-reviewer.md
