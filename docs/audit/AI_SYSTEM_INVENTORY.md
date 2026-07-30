# AI SYSTEM INVENTORY
## BopIAgency — Inventario del Sistema AI (.agencia-ai/)
**Fecha:** 2026-07-29

---

## 1. DESCRIPCIÓN GENERAL

El sistema AI es el núcleo operativo de Bop Agency implementado sobre **Claude Code**. Es un sistema de 6 capas que convierte a Claude en un equipo completo de marketing digital, con contexto persistente por cliente, reglas de compliance automáticas, y capacidades especializadas por dominio.

**Runtime requerido:** Claude Code CLI (no funciona en la API directa sin el runtime de Claude Code)

---

## 2. REGLAS OPERATIVAS GLOBALES (.agencia-ai/CLAUDE.md)

Aplican automáticamente en toda sesión. Incluyen:

- **Idioma:** Español e inglés, adaptar al cliente activo
- **Tono:** Profesional, estratégico, orientado a conversión
- **Compliance por industria:** Salud, Finanzas, Meta Ads — con prohibiciones explícitas
- **Formato obligatorio de campañas:** Objetivo, Audiencia, Ángulo, Copy, CTA, Visual, Compliance, KPIs
- **Formato obligatorio de contenido social:** Hook, Caption, Hashtags, CTA, Idea Visual
- **Gestión de tareas:** Estados permitidos, prioridades, reglas de creación
- **Comportamiento de agentes:** Reglas de delegación y uso del contexto del cliente

---

## 3. AGENTES ESPECIALIZADOS (16 agentes)

Ubicación: `.agencia-ai/.claude/agents/`

| # | Archivo | Nombre | Especialidad |
|---|---------|--------|-------------|
| 1 | `account-manager.md` | Account Manager | Relación cliente-agencia, seguimiento, onboarding |
| 2 | `analytics-reporting-specialist.md` | Analytics & Reporting Specialist | Análisis de métricas, reportes, insights accionables |
| 3 | `brand-strategist.md` | Brand Strategist | Identidad de marca, posicionamiento, diferenciación |
| 4 | `chief-marketing-strategist.md` | Chief Marketing Strategist | Estrategia integral de marketing (30/60/90 días) |
| 5 | `compliance-reviewer.md` | Compliance Reviewer | Revisión de copy contra políticas de plataformas |
| 6 | `content-strategist.md` | Content Strategist | Estrategia de contenido, calendarios, sistemas de contenido |
| 7 | `copywriter.md` | Copywriter | Copy persuasivo, hooks, copy de conversión |
| 8 | `creative-director.md` | Creative Director | Concepto creativo, brief visual, dirección de arte |
| 9 | `email-marketing-specialist.md` | Email Marketing Specialist | Secuencias de email, automación, nurturing |
| 10 | `google-ads-specialist.md` | Google Ads Specialist | Search, Display, YouTube, Shopping, Performance Max |
| 11 | `landing-page-cro-specialist.md` | Landing Page CRO Specialist | Auditoría y optimización de landing pages |
| 12 | `marketing-automation-specialist.md` | Marketing Automation Specialist | n8n, workflows, automatización de marketing |
| 13 | `meta-ads-specialist.md` | Meta Ads Specialist | Facebook e Instagram Ads, estrategia y optimización |
| 14 | `project-manager.md` | Project Manager | Organización, entregables, procesos |
| 15 | `proposal-builder.md` | Proposal Builder | Propuestas comerciales que convierten |
| 16 | `seo-aeo-geo-specialist.md` | SEO / AEO / GEO Specialist | SEO, Answer Engine Optimization, Generative Engine Optimization |

**Capacidades de migración:** Cada agente es un archivo Markdown con rol, responsabilidades y formato de output. En Next.js, se convierten en system prompts de la Claude API con contexto de cliente inyectado dinámicamente.

---

## 4. SKILLS MODULARES (32 skills)

Ubicación: `.agencia-ai/.claude/skills/`  
**Nota:** 2 skills (`add-task` y `new-client`) tienen frontmatter YAML y son skills ejecutables con lógica de archivo. El resto son skills de instrucciones de proceso.

### Skills de Campañas Publicitarias
| Skill | Descripción |
|-------|-------------|
| `meta-ads-campaign-builder` | Construye campañas completas de Meta Ads (estructura, copy, targeting, budget) |
| `google-ads-campaign-builder` | Campañas de Google Ads (Search, Display, Performance Max) |
| `youtube-ads-campaign-builder` | Campañas de YouTube Ads (TrueView, Bumper, Discovery) |
| `bilingual-campaign-builder` | Campañas en español e inglés simultáneamente |
| `local-business-campaign` | Campañas para negocios locales con geo-targeting |
| `luxury-brand-campaign` | Campañas para marcas premium/lujo |

### Skills de Contenido y Copywriting
| Skill | Descripción |
|-------|-------------|
| `caption-generator` | Genera captions estratégicos para redes sociales |
| `reel-script-generator` | Guiones para Reels/TikTok con hook, desarrollo y CTA |
| `email-sequence-builder` | Secuencias de email de bienvenida, nurturing y conversión |
| `newsletter-builder` | Newsletters completos con estructura editorial |
| `landing-page-copy` | Copy persuasivo para landing pages |
| `social-media-calendar` | Calendario mensual de contenido para redes sociales |

### Skills de Análisis y Estrategia
| Skill | Descripción |
|-------|-------------|
| `campaign-performance-analysis` | Análisis de resultados de campañas con insights |
| `competitor-analysis` | Análisis de competidores digitales |
| `brand-audit` | Auditoría completa de identidad de marca |
| `website-audit` | Auditoría técnica y de conversión de sitios web |
| `landing-page-cro-review` | Revisión CRO con recomendaciones priorizadas |
| `monthly-report-builder` | Construcción de reportes mensuales de resultados |

### Skills de SEO y Visibilidad
| Skill | Descripción |
|-------|-------------|
| `seo-content-brief` | Briefs de contenido optimizado para SEO |
| `geo-content-brief` | Briefs para Generative Engine Optimization (AI Overviews) |
| `youtube-seo-description` | Descripciones de YouTube optimizadas para SEO |

### Skills de Compliance
| Skill | Descripción |
|-------|-------------|
| `meta-ads-compliance-review` | Revisión de copy contra políticas de Meta Ads |
| `health-marketing-compliance` | Compliance para salud, estética, bienestar |
| `finance-marketing-compliance` | Compliance para finanzas, seguros, inversiones |

### Skills de Automatización e Integración
| Skill | Descripción |
|-------|-------------|
| `n8n-workflow-designer` | Diseño de workflows de n8n |
| `whatsapp-automation` | Automatización de WhatsApp Cloud API |
| `marketing-automation` | (ver workflows) |

### Skills de Gestión de Clientes
| Skill | Descripción |
|-------|-------------|
| `new-client` | **Ejecutable.** Crea carpeta + client.json + tasks.json + integrations.json + .ready para nuevo cliente |
| `client-brand-profile` | Rellena o actualiza el brand-profile.md del cliente |
| `client-onboarding` | Proceso completo de onboarding de nuevo cliente |
| `offer-builder` | Construye o refina la oferta comercial del cliente |
| `proposal-builder` | Propuestas comerciales personalizadas |

### Skills de Gestión de Tareas
| Skill | Descripción |
|-------|-------------|
| `add-task` | **Ejecutable.** Agrega una tarea validada al tasks.json del cliente activo |

---

## 5. SLASH COMMANDS (26 comandos)

Ubicación: `.agencia-ai/.claude/commands/`

| Comando | Archivo | Propósito |
|---------|---------|-----------|
| `/set-client` | `set-client.md` | Activa el contexto de un cliente específico |
| `/create-meta-campaign` | `create-meta-campaign.md` | Lanza flujo completo de campaña Meta Ads |
| `/create-google-campaign` | `create-google-campaign.md` | Campaña Google Ads |
| `/create-youtube-campaign` | `create-youtube-campaign.md` | Campaña YouTube Ads |
| `/create-captions` | `create-captions.md` | Genera captions para redes |
| `/create-email-sequence` | `create-email-sequence.md` | Secuencia de emails |
| `/create-reels` | `create-reels.md` | Guiones de reels |
| `/content-calendar` | `content-calendar.md` | Calendario de contenido mensual |
| `/brand-audit` | `brand-audit.md` | Auditoría de marca |
| `/website-audit` | `website-audit.md` | Auditoría de sitio web |
| `/campaign-analysis` | `campaign-analysis.md` | Análisis de campaña |
| `/competitor-analysis` | `competitor-analysis.md` | Análisis de competencia |
| `/client-brief` | `client-brief.md` | Brief de cliente |
| `/proposal` | `proposal.md` | Propuesta comercial |
| `/monthly-report` | `monthly-report.md` | Reporte mensual |
| `/meta-compliance-check` | `meta-compliance-check.md` | Revisión de compliance Meta |
| `/landing-page-copy` | `landing-page-copy.md` | Copy de landing page |
| `/landing-page-review` | `landing-page-review.md` | Revisión de landing page |
| `/automation-plan` | `automation-plan.md` | Plan de automatización |
| `/n8n-workflow` | `n8n-workflow.md` | Diseño de workflow n8n |
| `/launch-strategy` | `launch-strategy.md` | Estrategia de lanzamiento |
| `/local-campaign` | `local-campaign.md` | Campaña para negocio local |
| `/bilingual-campaign` | `bilingual-campaign.md` | Campaña bilingüe |
| `/seo-brief` | `seo-brief.md` | Brief de SEO |
| `/geo-brief` | `geo-brief.md` | Brief de GEO |
| `/youtube-seo` | `youtube-seo.md` | SEO para YouTube |

---

## 6. WORKFLOWS DE PROCESO (8 workflows)

Ubicación: `.agencia-ai/.claude/workflows/`  
**Naturaleza:** Procesos multi-paso que orquestan múltiples agentes y skills en secuencia.

| Workflow | Descripción | Agentes involucrados |
|---------|-------------|---------------------|
| `new-client-onboarding.md` | Desde creación de carpeta hasta entrega de estrategia inicial de 30 días | Account Manager, Brand Strategist, Chief Marketing Strategist |
| `meta-ads-campaign.md` | Crear, lanzar y optimizar campaña de Meta Ads completa | Meta Ads Specialist, Copywriter, Creative Director, Compliance Reviewer |
| `google-ads-campaign.md` | Campaña completa de Google Ads de alto rendimiento | Google Ads Specialist, Copywriter |
| `content-calendar.md` | Calendario de contenido mensual para redes sociales | Content Strategist, Copywriter, Creative Director |
| `monthly-reporting.md` | Reporte mensual de resultados para el cliente | Analytics & Reporting Specialist |
| `landing-page-optimization.md` | Revisión y optimización de landing page para conversiones | Landing Page CRO Specialist, Copywriter |
| `marketing-automation.md` | Diseño e implementación de sistema de automatización | Marketing Automation Specialist |
| `website-audit.md` | Auditoría completa de sitio web con recomendaciones | SEO Specialist, Landing Page CRO Specialist |

---

## 7. PLANTILLAS (19 plantillas)

Ubicación: `.agencia-ai/templates/`  
**Naturaleza:** Plantillas de entregables con placeholders para personalización por cliente.

| Archivo | Entregable |
|---------|-----------|
| `auditoria-marca.md` | Reporte de auditoría de marca |
| `auditoria-website.md` | Reporte de auditoría de sitio web |
| `brief-creativo.md` | Brief creativo para equipo de diseño |
| `calendario-contenido.md` | Calendario de contenido mensual |
| `campaña-google-ads.md` | Estructura completa de campaña Google Ads |
| `campaña-meta-ads.md` | Estructura completa de campaña Meta Ads |
| `campaña-youtube-ads.md` | Estructura completa de campaña YouTube Ads |
| `estrategia-30-dias.md` | Plan estratégico de 30 días |
| `guion-reel.md` | Guión de Reel/TikTok |
| `landing-page-copy.md` | Copy completo de landing page |
| `newsletter.md` | Newsletter con estructura editorial |
| `perfil-cliente.md` | Brand profile del cliente |
| `plan-automatizacion-n8n.md` | Plan de automatización con n8n |
| `prompt-imagen-meta.md` | Prompt para generación de imágenes de Meta Ads |
| `propuesta-comercial.md` | Propuesta comercial completa |
| `reporte-mensual.md` | Reporte mensual de resultados |
| `secuencia-email.md` | Secuencia de email marketing |

**Nota:** Solo hay 17 archivos listados (se esperaban 19). Las plantillas de `perfil-comprador.md` y otra no están presentes o el conteo incluía templates en `_template-client/`.

---

## 8. REFERENCIAS PERMANENTES

Ubicación: `.agencia-ai/.claude/references/`

| Archivo | Propósito |
|---------|-----------|
| `compliance-master-guide.md` | Guía maestra de compliance para 10 categorías de industria: Salud, Estética, Pérdida de Peso, Estudios Clínicos, Finanzas, Seguros, Bienestar, Claims de Resultados, Meta Ads, Google Ads |
| `client-context-protocol.md` | Protocolo de gestión de contexto multi-cliente: un cliente activo a la vez, jerarquía de fuentes de verdad, reglas anti-contaminación entre clientes |

---

## 9. ESTRUCTURA DE CLIENTES

### Clientes activos

| Cliente | ID | Industria | Integración Meta | Datos en shared-data |
|---------|-----|-----------|-----------------|---------------------|
| BOP Soluciones | `bop-soluciones` | Marketing Digital / Agencia | ⚠️ Solo en .agencia-ai | ❌ No |
| Legalink Colombia | `legalink-col` | Servicios legales digitales | ✅ Meta Ads activo | ✅ Sí |
| Magic Bungalow | `magic-bungalow` | Hotelería / Turismo / Glamping | ✅ Meta Ads activo | ✅ Sí |
| Cliente Prueba | `cliente-prueba-automatizacion-marketing-digital` | Marketing Digital / Agencia | ❌ No | ✅ Sí (vacío) |
| The Industrial Depot | `the-industrial-depot` | Industrial (B2B) | ❌ No | ❌ No |

### Estructura de archivos por cliente (template)
```
clients/{id}/
├── client.json          # Metadatos del cliente (ID, nombre, industria, status, documentos)
├── integrations.json    # Conexiones: Meta Ads, Google Ads, GA4, WhatsApp, etc.
├── tasks.json           # Tareas del cliente con estados y prioridades
├── brand-profile.md     # Fuente de verdad de la marca
├── services.md          # Servicios del cliente
├── buyer-personas.md    # Buyer personas definidas
├── offers.md            # Ofertas y propuestas de valor
├── campaigns.md         # Historial de campañas
├── content-calendar.md  # Calendario de contenido activo
├── reports.md           # Reportes generados
├── assets.md            # Activos (imágenes, videos, materiales)
├── notes.md             # Notas internas del equipo
├── compliance-rules.md  # Reglas de compliance específicas del cliente
├── automation-map.md    # Mapa de automatizaciones del cliente
└── .ready               # Flag: indica que el cliente está listo para indexar
```

### Archivos adicionales en clientes con más madurez (bop-soluciones)
- `alerts.json` — 5 alertas activas propias del cliente
- `metrics.json` — Métricas internas (formato distinto a shared-data)
- `insights.json` — Insights de rendimiento
- `campaigns.json` — Campañas en formato JSON estructurado
- `reels-scripts.md` — Guiones de reels generados
- `strategy-30-days.md` — Plan de 30 días
- `landing-page-diagnostico.md` — Diagnóstico de landing page
- `automation-whatsapp.md` — Automatización de WhatsApp

---

## 10. CONSIDERACIONES PARA MIGRACIÓN DEL SISTEMA AI

| Elemento | Migración en Next.js | Complejidad |
|---------|---------------------|------------|
| Agentes (16) | System prompts de Claude API — cada agente es un string configurable en DB | Baja |
| Skills de instrucciones (30) | Prompts de Claude API con templates Handlebars/string | Baja |
| Skills ejecutables (2: `new-client`, `add-task`) | Server Actions de Next.js + Supabase | Media |
| Comandos (26) | UI buttons / formularios que disparan Server Actions | Media |
| Workflows (8) | Inngest functions con pasos encadenados | Alta |
| Templates (19) | Almacenadas en Supabase (tabla `templates`) o archivos MDX | Baja |
| Perfiles de cliente | Tabla `clients` en Supabase con documentos en `client_documents` | Baja |
| tasks.json | Tabla `tasks` en Supabase | Baja |
| integrations.json | Tabla `client_integrations` en Supabase | Baja |
| compliance-master-guide.md | Prompt del Compliance Reviewer Agent (context permanente) | Baja |
| client-context-protocol.md | Middleware de Next.js + Row Level Security en Supabase | Media |
| CLAUDE.md (reglas globales) | System prompt base de la Claude API | Baja |

---

*Generado automáticamente el 2026-07-29 como parte de la auditoría de modernización BopIAgency.*
