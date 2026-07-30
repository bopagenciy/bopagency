# AGENCY OPERATING SYSTEM
## Manual de Operaciones — Bop Agency AI
### Cómo usar el sistema completo, paso a paso

---

> **¿Qué es este documento?**
> Es el manual de operaciones de la agencia. Si no sabes qué comando usar, qué agente activar o cómo estructurar un entregable, empieza aquí. Este documento asume que eres el director de operaciones y explica cada pieza del sistema como si fuera tu primer día — y también como si llevaras un año usándolo.

---

## TABLA DE CONTENIDOS

1. [Arquitectura del Sistema](#1-arquitectura-del-sistema)
2. [Los 3 Niveles de Uso](#2-los-3-niveles-de-uso)
3. [Inicio Rápido: Tu Primera Semana](#3-inicio-rápido-tu-primera-semana)
4. [Sistema de Clientes — Multi-Client Manager](#4-sistema-de-clientes)
5. [Cómo Usar los Agentes](#5-cómo-usar-los-agentes)
6. [Cómo Usar las Skills](#6-cómo-usar-las-skills)
7. [Cómo Usar los Slash Commands](#7-cómo-usar-los-slash-commands)
8. [Cómo Usar los Workflows](#8-cómo-usar-los-workflows)
9. [Crear Campañas Completas](#9-crear-campañas-completas)
10. [Crear Contenido para Redes Sociales](#10-crear-contenido-para-redes-sociales)
11. [Generar Reportes Mensuales](#11-generar-reportes-mensuales)
12. [Crear Propuestas Comerciales](#12-crear-propuestas-comerciales)
13. [Compliance por Industria](#13-compliance-por-industria)
14. [Automatizaciones con n8n y WhatsApp](#14-automatizaciones)
15. [Guía por Tipo de Cliente](#15-guía-por-tipo-de-cliente)
16. [Flujos de Trabajo Diarios y Semanales](#16-flujos-de-trabajo-diarios-y-semanales)
17. [Cómo Expandir el Sistema](#17-cómo-expandir-el-sistema)
18. [Troubleshooting](#18-troubleshooting)

---

## 1. ARQUITECTURA DEL SISTEMA

El sistema tiene 6 capas que trabajan juntas:

```
┌─────────────────────────────────────────────────┐
│  CAPA 1: REGLAS OPERATIVAS                      │
│  CLAUDE.md — Las instrucciones permanentes       │
│  Aplican en TODA sesión automáticamente          │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  CAPA 2: CONTEXTO DEL CLIENTE                   │
│  clients/[nombre]/ — Brand profile, compliance,  │
│  campañas activas, tono de marca                │
│  Se activa con: /set-client                     │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  CAPA 3: AGENTES ESPECIALIZADOS                 │
│  .claude/agents/ — 16 expertos del equipo        │
│  Cada uno tiene rol, estilo y formato definido   │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  CAPA 4: SKILLS MODULARES                       │
│  .claude/skills/ — 30 capacidades específicas    │
│  Cada skill tiene proceso y formato de output    │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  CAPA 5: COMANDOS Y WORKFLOWS                   │
│  .claude/commands/ — 27 atajos de proceso        │
│  .claude/workflows/ — 8 procesos completos       │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  CAPA 6: REFERENCIAS Y COMPLIANCE               │
│  .claude/references/ — Guías permanentes         │
│  compliance-master-guide.md + client-context     │
└─────────────────────────────────────────────────┘
```

### Mapa de Archivos del Sistema

```
.agencia-ai/
│
├── 📄 CLAUDE.md                    ← Reglas que Claude sigue siempre
├── 📄 README.md                    ← Guía resumida de uso
├── 📄 AGENCY-OPERATING-SYSTEM.md  ← Este documento
│
├── 👥 clients/
│   ├── _template-client/           ← Copiar para cada cliente nuevo
│   └── [nombre-cliente]/           ← Un folder por cliente
│       ├── brand-profile.md        ← Fuente de verdad de la marca
│       ├── services.md             ← Servicios contratados
│       ├── buyer-personas.md       ← Clientes ideales
│       ├── offers.md               ← Ofertas activas
│       ├── campaigns.md            ← Historial de campañas
│       ├── content-calendar.md     ← Calendario de contenido
│       ├── reports.md              ← Reportes mensuales
│       ├── assets.md               ← Logos, colores, accesos
│       ├── notes.md                ← Notas del account manager
│       ├── compliance-rules.md     ← Reglas específicas del cliente
│       └── automation-map.md       ← Mapa de automatizaciones
│
├── 📋 templates/                   ← 17 plantillas listas para usar
├── 📊 reports/                     ← Reportes generados
├── 📝 proposals/                   ← Propuestas comerciales
├── 🚀 campaigns/                   ← Campañas activas
├── ⚙️  automations/                 ← Flujos de automatización
├── 🎨 assets/                      ← Assets y recursos
├── 📚 references/                  ← Benchmarks externos
│
└── .claude/
    ├── 🤖 agents/                  ← 16 agentes especializados
    ├── 🧩 skills/                  ← 30 skills con SKILL.md
    ├── ⚡ commands/                 ← 27 slash commands
    ├── 🔄 workflows/               ← 8 workflows completos
    ├── 🔗 hooks/                   ← Automatizaciones internas
    └── 📖 references/              ← compliance-master-guide.md
                                       client-context-protocol.md
```

---

## 2. LOS 3 NIVELES DE USO

### NIVEL 1 — Uso Básico (comandos rápidos)
Para el 80% de las tareas del día a día:
```
/set-client [cliente]         → Activa el cliente
/create-meta-campaign         → Crea campaña
/content-calendar             → Crea calendario
/monthly-report               → Genera reporte
/proposal                     → Crea propuesta
```

### NIVEL 2 — Uso Avanzado (agentes + skills)
Para trabajo más detallado y contextualizado:
```
Actúa como [agente]. [Instrucción específica]
Usa la skill [nombre-skill] para [tarea]
```

### NIVEL 3 — Uso Experto (workflows completos)
Para procesos de varias horas que siguen pasos específicos:
```
Sigue el workflow [nombre] paso a paso para [cliente]
```

---

## 3. INICIO RÁPIDO: TU PRIMERA SEMANA

### DÍA 1: Configurar tu primer cliente

**Paso 1:** Crear la estructura del cliente
```
/new-client
```
Claude te pedirá:
- Nombre de la empresa
- Industria
- Website
- Servicios principales
- Público objetivo
- Objetivo de marketing

**Paso 2:** Claude crea automáticamente:
```
clients/[nombre-cliente]/
├── brand-profile.md    ← Completo con tu información
├── services.md
├── buyer-personas.md
└── ... (todos los archivos)
```

**Paso 3:** Revisar y completar el brand profile
Abrir `clients/[nombre-cliente]/brand-profile.md` y verificar:
- Tono de comunicación está correcto
- Palabras que usa/evita están documentadas
- Restricciones de compliance están identificadas

---

### DÍA 2: Tu primera campaña de Meta Ads

**Paso 1:** Activar el cliente
```
/set-client [nombre-cliente]
```
Verás un resumen de activación con los datos clave.

**Paso 2:** Crear la campaña
```
/create-meta-campaign
```
Proporcionar:
- Objetivo: leads
- Servicio: [qué se promociona]
- Presupuesto: $30/día

**Paso 3:** El sistema entrega:
- Estructura de campaña (campaña > ad sets > anuncios)
- 2-3 copies con hooks
- Sugerencias visuales
- Compliance notes
- KPIs objetivo

**Paso 4:** Verificar compliance
```
/meta-compliance-check [pegar el copy generado]
```

---

### DÍA 3: Calendario de contenido mensual

```
/set-client [nombre-cliente]
/content-calendar mes=Enero plataformas=Instagram,TikTok,Facebook
```

Recibirás:
- 4 semanas de contenido planificado
- Hooks para cada post
- Captions completos
- Hashtags por set
- Sugerencias visuales
- CTAs variados

---

### DÍA 4: Auditoría de website

```
/set-client [nombre-cliente]
/website-audit [URL del website]
```

Recibirás:
- Diagnóstico en 5 segundos (lo que comunica la página)
- Análisis por sección (hero, propuesta de valor, CTAs, prueba social)
- Puntuaciones 1-10
- Quick wins (cambios de esta semana)
- Optimizaciones de mayor impacto

---

### DÍA 5: Primer reporte

```
/set-client [nombre-cliente]
/monthly-report mes=Diciembre 2024
[Pegar métricas de Meta Ads y Google Ads]
```

Si no tienes métricas todavía:
```
/monthly-report mes=Diciembre 2024 modo=template
```
Claude crea un template para que el cliente llene sus números.

---

## 4. SISTEMA DE CLIENTES

### Cómo Funciona el Multi-Client Manager

El sistema puede manejar ilimitados clientes de forma simultánea. La clave es usar `/set-client` antes de trabajar con cada uno.

**Crear cliente:**
```
/new-client
```

**Activar cliente:**
```
/set-client lumina-medspa
/set-client dental-studio-mx
/set-client coaching-finanzas-usa
```

**Ver brief completo:**
```
/client-brief
```

**Actualizar información del cliente:**
```
Actúa como Account Manager. Actualiza el brand-profile de [cliente] con:
[nueva información]
```

### Reglas de Consistencia Multi-Cliente

⚠️ El sistema NUNCA mezcla información entre clientes. Al activar un nuevo cliente, el anterior se desactiva completamente.

El brand profile define automáticamente:
- El tono de todas las respuestas
- Los disclaimers que se incluyen
- El nivel de compliance aplicado
- Las palabras que se usan/evitan

### Estructura Recomendada para Nombres de Clientes

```
[industria]-[nombre]-[ciudad/país]
```
Ejemplos:
- `medspa-lumina-miami`
- `dental-studio-monterrey`
- `finanzas-familia-segura-houston`
- `ecommerce-moda-cdmx`
- `coaching-bienestar-espana`

---

## 5. CÓMO USAR LOS AGENTES

Los 16 agentes son miembros especializados del equipo. Se activan diciendo:
```
Actúa como [nombre del agente]. [Instrucción]
```

### Directorio de Agentes

| Agente | Cuándo Usarlo | Comando |
|--------|--------------|---------|
| **chief-marketing-strategist** | Estrategia general, lanzamientos, posicionamiento | `/launch-strategy` |
| **account-manager** | Cargar clientes, crear briefs, coordinar | `/set-client`, `/client-brief` |
| **brand-strategist** | Auditar marca, crear voz y mensajes | `/brand-audit` |
| **meta-ads-specialist** | Todo sobre Facebook e Instagram Ads | `/create-meta-campaign` |
| **google-ads-specialist** | Google Search, Display, YouTube, PMax | `/create-google-campaign` |
| **seo-aeo-geo-specialist** | SEO, Answer Engine, Generative Engine | `/seo-brief`, `/geo-brief` |
| **content-strategist** | Estrategia de contenido, calendarios | `/content-calendar` |
| **copywriter** | Copy de anuncios, captions, scripts, emails | `/create-captions`, `/create-reels` |
| **creative-director** | Conceptos visuales, prompts de imagen, briefs | Solicitarlo directamente |
| **landing-page-cro-specialist** | Auditar y optimizar landing pages | `/landing-page-review` |
| **email-marketing-specialist** | Secuencias de email, newsletters | `/create-email-sequence` |
| **marketing-automation-specialist** | n8n, WhatsApp, CRM, automatizaciones | `/automation-plan`, `/n8n-workflow` |
| **analytics-reporting-specialist** | Reportes, análisis de campañas, KPIs | `/monthly-report`, `/campaign-analysis` |
| **proposal-builder** | Propuestas comerciales, paquetes, precios | `/proposal` |
| **compliance-reviewer** | Revisar copy antes de publicar | `/meta-compliance-check` |
| **project-manager** | Organizar tareas, SOPs, checklists | Solicitarlo directamente |

### Ejemplos de Uso de Agentes

**Ejemplo 1: Estrategia de lanzamiento**
```
Actúa como Chief Marketing Strategist.

Cliente activo: Lumina Medspa Miami
Quiero lanzar el servicio de tratamiento facial de plasma rico en plaquetas.
Fecha de lanzamiento: 15 de febrero.
Presupuesto total: $3,000 para el lanzamiento.

Crea la estrategia de lanzamiento completa.
```

**Ejemplo 2: Análisis de competidores**
```
Actúa como Brand Strategist.

Cliente: Dental Studio Monterrey
Analiza los 3 principales competidores en Monterrey:
- Clínica Dental ABC
- Sonrisas Premium
- Dental Center Norte

¿Cuáles son sus diferenciadores y cómo podemos posicionarnos mejor?
```

**Ejemplo 3: Creación de copy**
```
Actúa como Copywriter.

Cliente activo: Coaching Finanzas USA (agente de seguros de vida)
Crea 3 hooks diferentes para un reel de Instagram sobre la importancia
del seguro de vida para familias con hijos menores de 18 años.
Aplica compliance §6 (seguros).
```

---

## 6. CÓMO USAR LAS SKILLS

Las skills son capacidades específicas que producen un output con formato definido.

### Estructura de una Skill

Cada skill en `.claude/skills/[nombre]/SKILL.md` contiene:
- Descripción de qué hace
- Cuándo usarla
- Qué información necesita como input
- El proceso que sigue
- El formato exacto del output
- Ejemplos reales

### Cómo Activar una Skill

**Forma 1 — Directa:**
```
Usa la skill [nombre-skill] para [tarea específica].
```

**Forma 2 — Con parámetros:**
```
Usa la skill meta-ads-campaign-builder con estos parámetros:
- Cliente: Lumina Medspa
- Objetivo: Leads
- Servicio: Rejuvenecimiento facial
- Presupuesto: $40/día
- Audiencia: Mujeres 38-55, Miami
```

**Forma 3 — Con contexto del cliente activo:**
```
/set-client lumina-medspa
/create-meta-campaign objetivo=leads servicio="rejuvenecimiento facial" presupuesto=40
```
(El comando activa automáticamente la skill correcta con el contexto del cliente)

### Catálogo de Skills por Categoría

#### AUDITORÍAS
```
brand-audit          → Auditar marca, tono, posicionamiento
website-audit        → Auditar website, UX, conversión, CTAs
competitor-analysis  → Analizar competidores directos e indirectos
```

#### CAMPAÑAS DE PAGO
```
meta-ads-campaign-builder      → Campaña completa Facebook/Instagram
google-ads-campaign-builder    → Campaña completa Google Ads
youtube-ads-campaign-builder   → Campaña para YouTube
```

#### CONTENIDO
```
social-media-calendar    → Calendario mensual de contenido
reel-script-generator    → Scripts de reels 15/30/60 segundos
caption-generator        → Captions para todas las plataformas
youtube-seo-description  → Título, descripción, tags para YouTube
newsletter-builder       → Newsletters profesionales
```

#### SEO Y VISIBILIDAD
```
seo-content-brief    → Brief para contenido SEO
geo-content-brief    → Brief para buscadores con IA (ChatGPT, Gemini)
```

#### COPY Y CONVERSIÓN
```
landing-page-copy        → Copy completo para landing pages
landing-page-cro-review  → Auditar y optimizar landing pages
offer-builder            → Crear ofertas y paquetes de servicio
email-sequence-builder   → Secuencias de email completas
```

#### REPORTES Y PROPUESTAS
```
monthly-report-builder           → Reporte mensual profesional
campaign-performance-analysis    → Análisis de campaña específica
proposal-builder                 → Propuesta comercial completa
```

#### GESTIÓN DE CLIENTES
```
client-onboarding     → Proceso de onboarding de nuevo cliente
client-brand-profile  → Crear/actualizar perfil de marca
```

#### COMPLIANCE
```
meta-ads-compliance-review      → Revisar compliance Meta Ads
health-marketing-compliance     → Compliance para salud/estética
finance-marketing-compliance    → Compliance para finanzas/seguros
```

#### AUTOMATIZACIÓN
```
whatsapp-automation   → Diseñar flujos de WhatsApp Business
n8n-workflow-designer → Diseñar workflows para n8n
```

#### ESPECIALIZADAS
```
local-business-campaign      → Campañas para negocios locales
bilingual-campaign-builder   → Campañas bilingüe ES/EN
luxury-brand-campaign        → Campañas para marcas premium
```

---

## 7. CÓMO USAR LOS SLASH COMMANDS

Los slash commands son atajos que combinan agentes + skills en una sola instrucción.

### Referencia Completa de Commands

#### GESTIÓN DE CLIENTES
```
/new-client
  → Inicia el proceso de onboarding completo
  → Crea carpeta + brand profile + estrategia inicial
  → Solicita información mediante preguntas

/set-client [nombre]
  → Activa el cliente y carga todo su contexto
  → Muestra resumen de activación
  → Debe ejecutarse al inicio de cada sesión

/client-brief
  → Genera el brief completo del cliente activo
  → Incluye: resumen, objetivos, audiencia, compliance
```

#### AUDITORÍAS
```
/brand-audit [URL opcional]
  → Auditoría completa de marca
  → Usa: agente brand-strategist + skill brand-audit
  → Output: diagnóstico + recomendaciones priorizadas

/website-audit [URL]
  → Auditoría de website enfocada en CRO
  → Usa: agente landing-page-cro-specialist + skill website-audit
  → Output: puntuaciones + quick wins + optimizaciones

/competitor-analysis [competidor1, competidor2, ...]
  → Análisis competitivo completo
  → Identifica competidores si no se especifican
  → Output: mapa competitivo + oportunidades de diferenciación
```

#### CAMPAÑAS DE PAGO
```
/create-meta-campaign [parámetros opcionales]
  Parámetros: objetivo= servicio= presupuesto= audiencia=
  → Campaña completa con estructura, copy, creatividades
  → Incluye compliance check automático
  → Output: campaña lista para implementar

/create-google-campaign [parámetros opcionales]
  Parámetros: tipo= keywords= presupuesto=
  → Campaña con keywords, RSAs, extensiones
  → Output: estructura + copy + negative keywords

/create-youtube-campaign [parámetros opcionales]
  Parámetros: duración= objetivo=
  → Script del anuncio + segmentación + KPIs
```

#### CONTENIDO
```
/content-calendar [parámetros opcionales]
  Parámetros: mes= plataformas= frecuencia=
  → Calendario mensual completo
  → 4 semanas de posts con hooks, captions, hashtags

/create-reels [parámetros opcionales]
  Parámetros: duracion= cantidad= tema=
  → Scripts de reels listos para producir
  → Incluye: timing por segundo, captions, hashtags

/create-captions [parámetros opcionales]
  Parámetros: plataforma= tipo= cantidad=
  → Captions con hook, desarrollo, CTA
  → Versión A + Versión B por pieza
```

#### COPY Y CONVERSIÓN
```
/landing-page-copy [parámetros opcionales]
  Parámetros: objetivo= audiencia= oferta=
  → Copy completo de todas las secciones
  → Hero, problema, solución, prueba social, FAQ, CTA

/landing-page-review [URL]
  → Auditoría CRO detallada
  → Quick wins + hipótesis de A/B test
```

#### EMAIL
```
/create-email-sequence [parámetros opcionales]
  Parámetros: tipo= cantidad= objetivo=
  → Secuencia completa de emails
  → Subject lines + preview text + copy completo
```

#### SEO Y VISIBILIDAD
```
/seo-brief [keyword]
  → Brief completo para contenido SEO
  → Estructura, keywords secundarias, instrucciones para escritor

/geo-brief [tema o pregunta]
  → Brief para ser citado por ChatGPT/Perplexity/Gemini
  → Estructura optimizada para LLMs

/youtube-seo [tema del video]
  → Título (2 opciones) + descripción completa + tags
```

#### REPORTES Y ANÁLISIS
```
/monthly-report [parámetros]
  Parámetros: mes= canales= [datos de métricas]
  → Reporte mensual completo
  → Resumen ejecutivo + análisis + recomendaciones

/campaign-analysis [nombre campaña] [métricas]
  → Análisis de performance
  → Diagnóstico + plan de optimización
```

#### PROPUESTAS
```
/proposal [parámetros opcionales]
  Parámetros: cliente= servicios= presupuesto=
  → Propuesta comercial completa
  → 3 opciones de paquete + cronograma + próximos pasos
```

#### COMPLIANCE
```
/meta-compliance-check [copy a revisar]
  → Revisión completa del copy para Meta
  → Clasificación por criticidad + versión corregida
  → Para industrias especiales: incluye §1-§7 del Compliance Guide
```

#### AUTOMATIZACIÓN
```
/automation-plan [parámetros opcionales]
  → Plan completo de automatización de marketing
  → Flujo de mensajes + condiciones + checklist

/n8n-workflow [parámetros opcionales]
  → Diseño detallado de workflow para n8n
  → Configuración nodo por nodo + mapeo de datos

/whatsapp-automation (incluido en /automation-plan)
```

#### ESTRATEGIA
```
/launch-strategy [parámetros opcionales]
  Parámetros: producto= fecha= presupuesto=
  → Estrategia de lanzamiento semana a semana
  → Pre-lanzamiento + lanzamiento + post-lanzamiento

/local-campaign
  → Estrategia para negocio local
  → Google Business + Google Ads local + Meta con radio

/bilingual-campaign
  → Campaña bilingüe ES/EN
  → Adaptación cultural, no solo traducción
```

---

## 8. CÓMO USAR LOS WORKFLOWS

Los workflows son procesos completos con pasos secuenciales. Úsalos cuando tengas tiempo para seguir el proceso completo.

### Los 8 Workflows Disponibles

| Workflow | Cuándo Usarlo | Duración Estimada |
|---------|--------------|-------------------|
| `new-client-onboarding` | Al firmar un nuevo cliente | 2-4 horas |
| `website-audit` | Para auditar el website de un cliente | 1-2 horas |
| `meta-ads-campaign` | Para crear una campaña completa de Meta | 1-2 horas |
| `google-ads-campaign` | Para crear una campaña completa de Google | 1-2 horas |
| `monthly-reporting` | Para crear el reporte mensual | 30-60 minutos |
| `content-calendar` | Para crear el calendario del mes | 1-2 horas |
| `landing-page-optimization` | Para optimizar una landing page | 1-2 horas |
| `marketing-automation` | Para diseñar un flujo de automatización | 1-3 horas |

### Cómo Activar un Workflow

```
Sigue el workflow new-client-onboarding paso a paso para:
Cliente: Lumina Medspa
Información disponible: [pegar información del cliente]
```

O paso a paso:
```
Estoy en el Paso 3 del workflow meta-ads-campaign.
Ya completé: objetivo (leads), audiencias (mujeres 38-55 Miami).
Siguiente paso: crear estructura de campaña.
```

---

## 9. CREAR CAMPAÑAS COMPLETAS

### Meta Ads — Flujo Completo

**1. Preparación (5 min):**
```
/set-client [nombre]
```
Verificar en el resumen de activación:
- ¿Hay pixel instalado?
- ¿Hay conversiones configuradas?
- ¿Tiene historial de campañas?

**2. Creación de campaña (15-30 min):**
```
/create-meta-campaign
objetivo=leads
servicio=rejuvenecimiento facial
presupuesto=40
audiencia=mujeres 38-55, Miami-Dade
```

**3. Verificación de compliance (5 min):**
```
/meta-compliance-check [copy generado]
```
Para clientes de salud → aplica automáticamente §1 y §2 del Compliance Guide

**4. Dirección creativa (10 min):**
```
Actúa como Creative Director.
Crea el prompt de imagen para el Anuncio 1A de la campaña de Lumina.
El ángulo es "confianza + expertise médico". Formato 1:1.
```

**5. Documentar la campaña:**
```
Actúa como Account Manager.
Documenta esta campaña en clients/lumina-medspa/campaigns.md
```

---

### Google Ads — Flujo Completo

**1. Preparación:**
- URL de landing page lista y revisada con `/landing-page-review`
- Conversión de Google configurada

**2. Keyword research:**
```
Actúa como Google Ads Specialist.
Para [cliente], industria [industria], ubicación [ciudad],
¿cuáles son las 20 keywords principales de alta intención
para el servicio de [servicio]?
Incluir intención de búsqueda para cada una.
```

**3. Crear campaña:**
```
/create-google-campaign
tipo=search
keywords=[lista de keywords del paso anterior]
presupuesto=50
landing=[URL]
```

**4. Revisar con `/landing-page-review [URL]`** antes de lanzar

---

### Campaña de Lanzamiento — Flujo Multi-Canal

Para un lanzamiento que usa Meta + Google + Email + Orgánico:

```
/set-client [nombre]
/launch-strategy
producto=[nombre del producto/servicio]
fecha=[fecha de lanzamiento]
presupuesto=total $X
canales=Meta Ads, Google Ads, Email, Instagram orgánico
```

El sistema entrega:
- Estrategia por semana (2 semanas antes, semana del lanzamiento, 2 semanas después)
- Copy por canal
- Secuencia de email del lanzamiento
- Calendario de contenido orgánico
- KPIs por canal

---

## 10. CREAR CONTENIDO PARA REDES SOCIALES

### Flujo de Producción de Contenido Mensual

**Semana 1 del mes → Planificar el siguiente mes**

**Día 1: Estrategia y calendario**
```
/set-client [nombre]
/content-calendar
mes=Febrero
plataformas=Instagram, Facebook, TikTok
objetivos=[objetivo del mes, ej: generar leads para servicio X]
fechas-especiales=[San Valentín 14 Feb, Día del dentista 6 Mar]
```

**Día 2: Scripts de reels para la quincena**
```
/create-reels
duracion=30
cantidad=4
temas=[basados en el calendario generado]
```

**Día 3: Captions de los posts del mes**
```
/create-captions
plataforma=Instagram
posts=[lista de temas del calendario]
```

**Día 4: Prompts de imagen para el mes**
```
Actúa como Creative Director.
Crea los prompts de imagen para los 8 posts más importantes
del calendario de Febrero para [cliente].
```

### Formatos y Sus Objetivos

| Formato | Objetivo Principal | Mejor Para |
|---------|------------------|-----------|
| Reel (15-30s) | Alcance y awareness | Trending, tips rápidos |
| Reel (60s) | Educación y autoridad | Tutoriales, explicaciones |
| Carrusel | Guardados y educación | Listas, pasos, guías |
| Post estático | Anuncios, frases | Lanzamientos, citas |
| Stories | Engagement diario | Encuestas, Q&A, behind the scenes |
| YouTube largo | Autoridad y SEO | Explicaciones completas |
| YouTube Short | Alcance nuevo | Clips de contenido largo |

### Compliance para Contenido Orgánico

El contenido orgánico también tiene restricciones aunque es menos vigilado que los anuncios:
- Para salud/estética: mismas reglas que Meta Ads
- Para finanzas: incluir disclaimers en contenido educativo
- Para pérdida de peso: no usar before/after con claims

---

## 11. GENERAR REPORTES MENSUALES

### Cuándo Generar el Reporte

Los primeros 5 días del mes siguiente. Nunca esperar más de 10 días.

### Reporte con Datos Disponibles

```
/set-client [nombre]
/monthly-report
mes=Enero 2025

META ADS:
Inversión: $2,850
Leads: 94
CPL: $30.32
CTR: 2.8%
Impresiones: 145,000

GOOGLE ADS:
Inversión: $1,200
Clics: 380
Conversiones: 28
CPA: $42.85
CTR: 4.2%

REDES SOCIALES:
Seguidores nuevos IG: +127
Alcance total: 28,500
Post más viral: [descripción] — 4,200 alcance
```

### Reporte sin Todos los Datos

```
/monthly-report modo=template mes=Enero 2025
```
Claude crea el reporte con los campos vacíos listos para que el cliente/equipo rellene.

### Cómo Presentar el Reporte al Cliente

El reporte tiene dos versiones dentro del output:
1. **Versión técnica** — Para el equipo interno con todos los datos
2. **Resumen ejecutivo** — Para el cliente (los primeros 5 bullets del reporte)

Recomendar siempre presentar el resumen ejecutivo en la llamada mensual y dejar el reporte completo como documento de respaldo.

---

## 12. CREAR PROPUESTAS COMERCIALES

### Cuándo Usar el Sistema para Propuestas

- Después de una reunión de discovery con un prospecto
- Para upsell a cliente existente
- Para renovar un contrato
- Para presentar nuevos servicios

### Flujo Completo de Propuesta

**Paso 1: Preparar el contexto**
Si el prospecto es nuevo:
```
Actúa como Account Manager.
Tengo una reunión de discovery con [nombre empresa].
Industria: [industria]
Lo que me contaron: [notas de la reunión]
Crea un brief de discovery para preparar la propuesta.
```

**Paso 2: Crear la oferta primero**
```
Usa la skill offer-builder para [empresa].
Servicio principal a proponer: [servicios]
Presupuesto indicado por el cliente: [$X/mes]
Crea 3 opciones de paquete (Starter/Growth/Scale)
```

**Paso 3: Crear la propuesta completa**
```
/proposal
cliente=[nombre empresa]
industria=[industria]
problema-principal=[lo que dijo en el discovery]
servicios=[paquete recomendado]
presupuesto-estimado=[rango]
```

**Paso 4: Personalizar**
La propuesta siempre necesita personalización antes de enviar:
- Añadir el nombre del dueño en el saludo
- Mencionar detalles específicos de la conversación
- Incluir casos de éxito relevantes para su industria

### Estructura de Precios Recomendada

Presentar siempre 3 opciones:
- **Starter:** Punto de entrada, el cliente que tiene presupuesto limitado
- **Growth:** ⭐ La opción que queremos vender (mejor relación valor/precio)
- **Scale:** La opción premium que hace que Growth parezca razonable

---

## 13. COMPLIANCE POR INDUSTRIA

Esta sección es crítica. El Compliance Master Guide completo está en:
`.claude/references/compliance-master-guide.md`

### Tabla de Referencia Rápida

| Si el cliente es... | Sección del Guide | Comando de revisión |
|--------------------|------------------|---------------------|
| Clínica / Doctor | §1 Salud General | `/meta-compliance-check` |
| Medspa / Estética | §2 Estética | `/meta-compliance-check` |
| Pérdida de peso | §3 Peso | `/meta-compliance-check` |
| Estudio clínico | §4 Clinical Research | `/meta-compliance-check` |
| Asesor financiero | §5 Finanzas | `/meta-compliance-check` |
| Seguros de vida | §6 Seguros | `/meta-compliance-check` |
| Wellness / Coach | §7 Bienestar | `/meta-compliance-check` |
| Cualquier cliente | §8 Claims | Siempre aplicar |

### Regla Práctica para Todos los Clientes

Antes de publicar cualquier pieza de marketing, ejecutar mentalmente este filtro:

**El Test de los 3 Segundos:**
1. ¿Dice algo que el cliente no puede probar? → Reescribir
2. ¿Menciona atributos personales del lector? → Reescribir
3. ¿Usa palabras como "garantizado", "cura", "sin riesgo"? → Reescribir

---

### Ejemplos de Reescritura por Industria

**MEDSPA — Antes y Después:**
```
❌ "¿Avergonzada de tus arrugas? Botox en 30 min. Te vemos 10 años más joven."
✅ "Rejuvenecimiento facial con tecnología de última generación.
   Médicos certificados. Consulta inicial sin costo."
```

**PÉRDIDA DE PESO — Antes y Después:**
```
❌ "Pierde 10 kilos en 30 días con nuestro programa GARANTIZADO"
✅ "Programa de transformación basado en hábitos reales.
   +500 personas han cambiado su relación con la comida."
   (Footer: Resultados individuales varían.)
```

**SEGUROS — Antes y Después:**
```
❌ "Gana $500/mes vendiendo seguros de vida. SIN experiencia previa."
✅ "Construye una carrera sólida en servicios financieros.
   Entrenamiento completo incluido. [Estado] Licensed Agent."
```

**FINANZAS — Antes y Después:**
```
❌ "Invierte hoy y duplica tu dinero en 12 meses. GARANTIZADO."
✅ "Estrategias de inversión personalizadas para tu perfil de riesgo.
   Asesor registrado en [Estado]. Past performance does not guarantee
   future results."
```

---

## 14. AUTOMATIZACIONES

### Cuándo Diseñar una Automatización

Considera una automatización cuando:
- Los leads de Meta Ads no reciben seguimiento en menos de 5 minutos
- El equipo de ventas está haciendo tareas repetitivas manualmente
- Hay leads que se pierden porque nadie los siguió a tiempo
- El cliente necesita nutrir leads con múltiples toques automatizados

### El Flujo Más Común: Meta Lead → WhatsApp → CRM

```
/automation-plan
trigger=meta-leads-form
destino=whatsapp+google-sheets
objetivo=calificar leads y notificar al vendedor
```

El sistema diseña:
1. Webhook que recibe el lead de Meta
2. Mensaje inmediato de WhatsApp al lead (<5 minutos)
3. Preguntas de calificación automatizadas
4. Registro en Google Sheets
5. Notificación al vendedor con datos del lead calificado

### Diseño de Workflow n8n

```
/n8n-workflow
trigger=webhook-meta-leads
nodos=[whatsapp, google-sheets, gmail, hubspot]
condiciones=[calificado/no calificado, respondió/no respondió]
```

El output incluye:
- Diagrama del flujo completo en texto
- Configuración detallada de cada nodo
- Mapeo de datos (qué campo va a dónde)
- Manejo de errores
- Checklist de implementación

---

## 15. GUÍA POR TIPO DE CLIENTE

### MEDSPA / CLÍNICA ESTÉTICA

**Primeros pasos:**
1. `/new-client` → Asegurarse de marcar industria como "medspa"
2. Completar `compliance-rules.md` con procedimientos específicos
3. Documentar si hay médicos certificados (necesario para el copy)
4. `/brand-audit [URL]` para evaluar la comunicación actual

**Campañas que mejor funcionan:**
- Meta Leads con formulario (objetivo: consulta gratuita)
- Google Search para términos como "botox [ciudad]", "medspa [ciudad]"
- Instagram orgánico: educación + proceso + resultados (sin before/after)
- Retargeting de visitantes web con oferta de consulta gratis

**KPIs objetivo:**
- CPL Meta Ads: $20-45
- Tasa de lead a cita: 25-40%
- Google Ads CPA: $30-60

**Compliance crítico:** Secciones §1 y §2 del Compliance Master Guide

---

### AGENTE DE SEGUROS / FINANCIAL ADVISOR

**Primeros pasos:**
1. Documentar estados con licencia en `brand-profile.md`
2. Definir qué productos maneja (life, annuities, health, property)
3. Verificar si tiene RIA, BD o solo licencia de agente
4. Identificar nicho demográfico (hispanos, baby boomers, jóvenes profesionales)

**Campañas que mejor funcionan:**
- Meta Leads con formulario (objetivo: llamada de descubrimiento)
- Facebook Ads para audiencia 35-55 con intereses en retirement, family, insurance
- Contenido educativo en LinkedIn (para B2B o prospects más sofisticados)
- YouTube con explicaciones de productos (para SEO y educación)

**KPIs objetivo:**
- CPL Meta Ads: $25-60
- Tasa de lead a cita: 30-45%

**Compliance crítico:** Secciones §5 y §6 del Compliance Master Guide

---

### DENTISTA / CLÍNICA DENTAL

**Campañas que mejor funcionan:**
- Meta Ads con oferta de primera consulta/radiografía gratis
- Google Ads local para "dentista [ciudad]", "urgencia dental [ciudad]"
- Google Business Profile optimizado (fundamental para búsquedas locales)
- Reseñas de Google (estrategia de acumulación continua)

**KPIs objetivo:**
- CPL: $15-35
- Costo por paciente nuevo: $40-90

---

### E-COMMERCE / TIENDA ONLINE

**Primeros pasos:**
1. Documentar catálogo de productos (top 5 SKUs por margen y conversión)
2. Verificar pixel de Meta + conversiones configuradas
3. Identificar AOV (Average Order Value) y LTV (Lifetime Value)
4. Revisar si tienen email list activa

**Campañas que mejor funcionan:**
- Meta Ads con catálogo (dynamic product ads)
- Google Shopping + Performance Max
- Email: flujo de abandoned cart, post-purchase, winback
- Retargeting agresivo para visitors que no compraron

**KPIs objetivo:**
- ROAS Meta: 3-6x
- ROAS Google: 4-8x
- Email open rate: 25%+

---

### COACH / CONSULTOR / CREADOR DE CURSOS

**Campañas que mejor funcionan:**
- Meta Ads para webinar gratuito o masterclass → funnel de venta
- Lead magnet → secuencia de email → oferta
- Instagram orgánico: thought leadership + resultados de clientes
- YouTube: contenido de valor largo → funnel

**KPIs objetivo:**
- CPL para webinar: $3-15
- Costo por inscripción al curso: varía enormemente por precio del curso

---

### NEGOCIO LOCAL (RESTAURANTE, GYM, SPA, RETAIL)

```
/set-client [nombre]
/local-campaign
radio=5km
ciudad=[ciudad]
```

**Estrategia local obligatoria:**
1. Google Business Profile optimizado (posts semanales, fotos, respuesta a reseñas)
2. Meta Ads con targeting por radio (3-10km de la ubicación)
3. Google Ads local con extensión de ubicación y llamada
4. Estrategia de reseñas Google (proceso sistemático de pedir reseñas)

---

## 16. FLUJOS DE TRABAJO DIARIOS Y SEMANALES

### Flujo Diario (20-30 minutos)

```
MAÑANA:
1. Revisar métricas de campañas activas de todos los clientes
2. Identificar campañas que necesiten ajuste urgente
3. Revisar mensajes y aprobaciones pendientes
4. Priorizar tareas del día

TARDE:
5. Ejecutar las tareas priorizadas con el sistema
6. Documentar en notes.md de cada cliente
7. Preparar entregables para el día siguiente
```

### Flujo Semanal

```
LUNES: Revisión de performance de la semana anterior
MARTES-MIÉRCOLES: Producción de contenido y campañas
JUEVES: Revisión de compliance antes de publicar
VIERNES: Documentación, reportes parciales, planificación semana siguiente
```

### Flujo Mensual

```
DÍAS 1-5: Generar reportes mensuales de todos los clientes (/monthly-report)
DÍAS 5-10: Revisión de estrategia con cada cliente
DÍAS 10-20: Crear campañas y contenido del mes siguiente
DÍAS 20-25: Crear calendarios de contenido del mes siguiente
DÍAS 25-30: Revisión final, compliance check, entrega de materiales
```

---

## 17. CÓMO EXPANDIR EL SISTEMA

### Agregar una Nueva Skill

1. Crear carpeta: `.claude/skills/[nombre-nueva-skill]/`
2. Crear `SKILL.md` con esta estructura mínima:
```markdown
# Skill: [Nombre]

## Descripción
[Qué hace esta skill en 1-2 oraciones]

## Cuándo Usar
[Casos de uso específicos]

## Parámetros de Entrada
[Qué información necesita]

## Proceso
[Pasos que sigue]

## Formato de Salida
[Template del output con estructura definida]

## Ejemplos
[Al menos 1 ejemplo real de input y output]

## Referencias
[Links a agentes, templates y workflows relacionados]
```

3. Crear command opcional en `.claude/commands/[nombre].md`
4. Actualizar el índice de skills en este documento

### Agregar un Nuevo Agente

1. Crear `.claude/agents/[nombre-agente].md`
2. Incluir: Rol, Responsabilidades, Cuándo activar, Framework de trabajo, Formato de entregable, Señales de alerta, Ejemplo de uso, Referencias
3. Actualizar el directorio de agentes en este documento

### Agregar un Nuevo Cliente

```
/new-client
```
(El sistema crea toda la estructura automáticamente)

O manualmente:
1. Copiar la carpeta `clients/_template-client/` → `clients/[nombre-nuevo-cliente]/`
2. Completar `brand-profile.md` con la información del cliente
3. Completar `compliance-rules.md` con las restricciones de su industria
4. Actualizar el índice de clientes en `.claude/references/client-context-protocol.md`

---

## 18. TROUBLESHOOTING

### "El copy no suena como la marca del cliente"

**Causa:** El cliente no estaba activo o el brand-profile está incompleto.
**Solución:**
```
/set-client [nombre]    ← Asegurarse de activar el cliente
```
Luego revisar que `brand-profile.md` tenga:
- Tono de comunicación con adjetivos específicos
- Palabras que SÍ usa y palabras que EVITA
- Al menos 2 ejemplos de copy on-brand

---

### "El anuncio fue rechazado por Meta"

**Causa:** Violación de alguna política de Meta Ads.
**Solución:**
```
/meta-compliance-check [copy del anuncio rechazado]
```
Si el cliente es de salud/estética, también:
```
Usa la skill health-marketing-compliance para revisar este copy.
El tipo de negocio es: [medspa / clínica / suplementos]
```

---

### "No sé qué campaña hacer para este cliente"

**Causa:** Falta de contexto estratégico.
**Solución:**
```
/set-client [nombre]
Actúa como Chief Marketing Strategist.
El cliente tiene presupuesto de [$X/mes] y quiere generar [objetivo].
¿Cuál es la primera campaña que recomendarías y por qué?
```

---

### "El reporte se ve muy técnico para el cliente"

**Causa:** El reporte está en modo "equipo interno" no en modo "cliente".
**Solución:**
```
Toma este reporte y crea una versión ejecutiva de 1 página
para presentar al cliente. Lenguaje simple, sin tecnicismos,
enfocado en resultados de negocio. [Pegar reporte]
```

---

### "No tengo el pixel instalado ni conversiones configuradas"

**Causa:** Setup técnico incompleto.
**Solución antes de lanzar campañas:**
```
Actúa como Project Manager.
El cliente [nombre] no tiene pixel de Meta ni conversiones de Google.
Crea el checklist completo de setup técnico necesario antes de
lanzar cualquier campaña pagada.
```

---

### "El cliente quiere un servicio que no tiene una skill creada"

**Solución:**
```
Actúa como [agente más relevante].
No tenemos una skill específica para [servicio],
pero usa tu expertise para crear [entregable].
El cliente es [contexto] y necesita [qué necesita].
```

El sistema es flexible — los agentes pueden trabajar sin skill específica usando su expertise general.

---

## APÉNDICE: ÍNDICE MAESTRO DE COMANDOS

```
GESTIÓN DE CLIENTES
/new-client              Crear nuevo cliente completo
/set-client [nombre]     Activar cliente existente
/client-brief            Brief completo del cliente activo

AUDITORÍAS
/brand-audit             Auditar marca
/website-audit           Auditar website
/competitor-analysis     Analizar competidores

CAMPAÑAS PAGADAS
/create-meta-campaign    Campaña Facebook/Instagram
/create-google-campaign  Campaña Google Ads
/create-youtube-campaign Campaña YouTube Ads

CONTENIDO
/content-calendar        Calendario mensual
/create-reels            Scripts de reels
/create-captions         Captions para redes
/youtube-seo             SEO para YouTube

SEO Y VISIBILIDAD
/seo-brief               Brief para contenido SEO
/geo-brief               Brief para IA generativa

COPY Y CONVERSIÓN
/landing-page-copy       Copy completo de landing page
/landing-page-review     Auditoría CRO de landing page

EMAIL
/create-email-sequence   Secuencias de email

REPORTES
/monthly-report          Reporte mensual
/campaign-analysis       Análisis de campaña

PROPUESTAS
/proposal                Propuesta comercial

COMPLIANCE
/meta-compliance-check   Verificar compliance Meta Ads

AUTOMATIZACIÓN
/automation-plan         Plan de automatización
/n8n-workflow            Diseño de workflow n8n

ESTRATEGIA
/launch-strategy         Estrategia de lanzamiento
/local-campaign          Campaña para negocio local
/bilingual-campaign      Campaña bilingüe ES/EN
```

---

*AGENCY OPERATING SYSTEM v1.1*
*Bop Agency AI — Sistema de Operaciones Internas*
*Para mejoras o nuevas funcionalidades, ver Sección 17: Cómo Expandir el Sistema*
