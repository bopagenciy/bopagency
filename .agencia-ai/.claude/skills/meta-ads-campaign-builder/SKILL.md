# Skill: Meta Ads Campaign Builder

## Descripción
Crea campañas completas para Facebook e Instagram Ads: objetivo, estructura, audiencias, copy, creatividades, presupuesto y compliance.

## Cuándo Usar
- Para crear campañas nuevas en Meta
- Para estructurar campañas existentes
- Para obtener copy, hooks y sugerencias visuales

## Parámetros de Entrada
- Cliente: [nombre]
- Objetivo: [Leads / Ventas / Tráfico / Reconocimiento / Engagement]
- Servicio o producto a promocionar
- Presupuesto diario o total
- Audiencia objetivo (si se tiene)
- Restricciones de compliance (industria del cliente)

## Proceso

1. Definir objetivo de campaña
2. Crear estructura (campaña > ad sets > anuncios)
3. Definir audiencias (frío, tibio, retargeting)
4. Crear copy para cada anuncio
5. Sugerir creatividades
6. Revisar compliance
7. Definir KPIs y métricas de éxito

## Formato de Salida

```
## CAMPAÑA META ADS — [Nombre del Cliente]
**Objetivo:** [Objetivo] | **Presupuesto:** [$X/día]

---
### ESTRUCTURA DE CAMPAÑA

**CAMPAÑA 1: [Nombre]**
Objetivo: [Objetivo de Meta]
Presupuesto: [$X/día]
Tipo: [CBO/ABO]

**AD SET 1: [Nombre] — Audiencia Fría**
- Ubicaciones: [Facebook Feed / Instagram Feed / Reels / Stories]
- Audiencia: [Edad, género, intereses detallados]
- Optimización: [Leads / Conversiones / Alcance]
- Presupuesto: [$X/día]

  **ANUNCIO 1A:**
  Formato: [Imagen / Video / Carrusel]
  Hook: [Primera línea que detiene el scroll]
  Copy principal:
  """
  [Copy completo del anuncio]
  """
  Headline: [Título en el botón/link]
  CTA: [Botón: Más información / Enviar mensaje / Comprar]
  Sugerencia visual: [Descripción de la imagen o video]
  Compliance notes: [Observaciones]

  **ANUNCIO 1B (variante A/B):**
  [Segunda versión con ángulo diferente]

**AD SET 2: [Nombre] — Retargeting**
[Estructura similar para retargeting]

---
### PLAN DE TESTING
- Variable 1: Hook (A vs B)
- Variable 2: Formato (imagen vs video)
- Variable 3: Audiencia (intereses vs lookalike)

### KPIs
- CPL objetivo: [$X]
- CTR objetivo: [X%]
- Frecuencia máxima: [X]
- Período de evaluación: [X días]

### COMPLIANCE NOTES
[Revisión de cumplimiento con políticas Meta]
```

## Referencias
- agents/meta-ads-specialist.md
- agents/compliance-reviewer.md
- .claude/skills/meta-ads-compliance-review/SKILL.md
- templates/campaña-meta-ads.md

---

## EJEMPLO DE OUTPUT REAL — Medspa (Industria Regulada)

**Input:** Cliente: Lumina Medspa Miami | Objetivo: Leads | Servicio: Tratamiento de rejuvenecimiento facial | Presupuesto: $30/día

**Output:**

```
## CAMPAÑA META ADS — Lumina Medspa
Objetivo: Generación de Leads | Presupuesto: $30/día

CAMPAÑA 1: LUMI_Leads_Rejuvenecimiento_[Mes]
Tipo: CBO | Objetivo: Leads

AD SET 1: Mujeres 38-55 — Miami-Dade — Intereses Belleza
- Audiencia: Mujeres, 38-55 años, Miami + 25mi
- Intereses: Skin care, anti-aging, beauty treatments, wellness
- Optimización: Leads (formulario Meta)
- Presupuesto: $20/día

  ANUNCIO 1A — Ángulo: Confianza + Expertise
  Formato: Imagen profesional (no before/after)
  
  Hook: "Tu piel en manos de especialistas certificados"
  
  Copy:
  En Lumina, cada tratamiento es diseñado para ti — no para un estándar
  de belleza. Nuestro equipo médico certificado usa las tecnologías más
  avanzadas para que luzca y se sienta como la mejor versión de ti misma.
  
  ✨ Tecnología de última generación
  👩‍⚕️ Médicos especializados en estética
  📍 Miami Beach | Consulta inicial sin costo
  
  Headline: "Consulta gratuita — Agenda hoy"
  CTA: Más información
  Visual: Médica estética en ambiente premium, luz natural, no procedimiento
  
  ⚠️ COMPLIANCE: No se mencionan condiciones médicas del lector, no hay
  before/after, no hay claims de resultado específico.

  ANUNCIO 1B — Ángulo: Experiencia Premium
  Hook: "El cuidado de tu piel merece manos expertas"
  [Versión alternativa para A/B test]

AD SET 2: Retargeting — Visitantes web 30 días
- Mensaje: "Ya conoces Lumina. Da el siguiente paso."
- Copy: más directo hacia la conversión
```

## EJEMPLO DE OUTPUT REAL — Negocio B2B (Sin restricciones especiales)

**Input:** Cliente: AgenciaFit | Objetivo: Ventas | Servicio: Software de gestión para gimnasios | Presupuesto: $50/día

**Output:** [Estructura similar con copy más directo, audiencia de dueños de gimnasio, ángulo de ROI y eficiencia]

## Casos de Uso por Industria

| Industria | Objetivo Típico | CPL Benchmark | Nota |
|-----------|----------------|---------------|------|
| Medspa | Leads | $15-45 | Alta competencia |
| Consultoría B2B | Leads calificados | $25-80 | Audiencia pequeña |
| E-commerce | ROAS | 3-6x | Pixel maduro |
| Educación/Cursos | Leads | $8-25 | Gran audiencia |
| Seguros | Leads | $20-60 | Categoría especial |
| Real Estate | Leads | $15-50 | Categoría especial |
