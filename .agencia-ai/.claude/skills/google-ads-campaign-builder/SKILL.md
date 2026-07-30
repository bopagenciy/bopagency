# Skill: Google Ads Campaign Builder

## Descripción
Crea campañas completas para Google Ads: keywords, estructura de grupos, copy de anuncios, extensiones, negative keywords y KPIs.

## Parámetros de Entrada
- Cliente: [nombre]
- Tipo de campaña: [Search / Display / Performance Max / YouTube]
- Servicio o producto
- URL de landing page
- Ubicación geográfica objetivo
- Presupuesto diario

## Formato de Salida

```
## CAMPAÑA GOOGLE ADS — [Nombre del Cliente]
**Tipo:** [Search] | **Presupuesto:** [$X/día]

### ESTRUCTURA

**CAMPAÑA: [Nombre]**
- Objetivo: [Leads / Ventas / Tráfico]
- Estrategia de puja: [Maximizar conversiones / CPA objetivo]
- Red: [Solo búsqueda / Búsqueda + Display]
- Ubicaciones: [País / Ciudad]
- Idioma: [Español / Inglés]

**GRUPO DE ANUNCIOS 1: [Nombre — tema específico]**
Keywords (exacta): ["keyword 1", "keyword 2"]
Keywords (frase): ["keyword broad 1"]
Keywords (amplia mod.): [+keyword +modificada]

  **RSA 1:**
  Headlines (15 opciones):
  1. [Headline con keyword principal]
  2. [Beneficio directo]
  3. [Propuesta de valor]
  ... (hasta 15)

  Descriptions (4 opciones):
  1. [Descripción con beneficio + CTA]
  2. [Descripción con prueba social]
  3. [Descripción con urgencia]
  4. [Descripción alternativa]

**EXTENSIONES:**
Sitelinks:
- [Texto] | [URL]
Callouts: ["Texto 1", "Texto 2", "Texto 3"]
Structured Snippets: Servicios: [S1, S2, S3]

**NEGATIVE KEYWORDS INICIALES:**
[Lista de términos a excluir]

### KPIs
- CPA objetivo: [$X]
- CTR objetivo: [X%]
- Quality Score mínimo: [7+]
- Conversion Rate objetivo: [X%]
```

## Referencias
- agents/google-ads-specialist.md
- templates/campaña-google-ads.md
