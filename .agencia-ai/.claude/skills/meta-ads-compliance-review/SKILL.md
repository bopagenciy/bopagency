# Skill: Meta Ads Compliance Review

## Descripción
Revisa copy, imágenes y estructura de campaña para verificar cumplimiento con las políticas de publicidad de Meta (Facebook e Instagram).

## Áreas de Revisión

1. **Texto del anuncio** — Claims, lenguaje sensible, atributos personales
2. **Imágenes** — Contenido prohibido, texto en imagen, before/after
3. **Landing page** — Coherencia con el anuncio, contenido prohibido
4. **Segmentación** — Categorías especiales, targeting restringido
5. **Industria** — Restricciones específicas por tipo de negocio

## Categorías de Alto Riesgo

🔴 **Salud y Bienestar** — Clínicas, medspas, suplementos, tratamientos
🔴 **Finanzas** — Préstamos, inversiones, seguros, criptomonedas
🔴 **Pérdida de peso** — Dietas, suplementos, programas
🔴 **Servicios legales** — Abogados, inmigración, accidentes
🔴 **Empleos y oportunidades de negocio** — MLM, freelance, trabajo desde casa

## Formato de Revisión

```
## COMPLIANCE REVIEW META ADS — [Cliente/Campaña]

### COPY REVISADO
[Texto original]

### HALLAZGOS

🔴 CRÍTICO (debe cambiar para publicar):
- [Elemento problemático] — [Por qué viola política] — [Alternativa sugerida]

🟡 PRECAUCIÓN (puede causar restricción):
- [Elemento riesgoso] — [Recomendación]

✅ APROBADO:
- [Elementos que están bien]

### VERSIÓN REVISADA
[Copy corregido listo para usar]

### NOTAS DE CATEGORÍA ESPECIAL
[Si aplica: tipo de campaña especial requerida]
```

## Señales de Alerta Automáticas

Al revisar, buscar y marcar:
- "¿Eres [condición]?" → Referencia directa a atributo personal
- "Garantizado", "100%" → Claims absolutos
- "Pierda X kilos" → Claim de pérdida de peso específico
- "Gane $X" → Claim financiero específico
- Imágenes de antes/después → Muchas veces prohibidas

## Referencias
- agents/compliance-reviewer.md
- .claude/skills/health-marketing-compliance/SKILL.md
- .claude/skills/finance-marketing-compliance/SKILL.md
