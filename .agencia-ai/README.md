# Bop Agency AI System
## Agencia de Marketing Digital Automatizada con Claude Code

Bienvenido al sistema de agencia digital inteligente. Esta estructura te permite operar una agencia de marketing digital completa usando Claude Code como motor central de inteligencia.

---

## ¿Qué es esta estructura?

Es un sistema modular de automatización para agencias digitales construido sobre Claude Code. Incluye:

- **16 agentes especializados** que actúan como miembros del equipo
- **30 skills modulares** para tareas específicas de marketing
- **27 slash commands** para ejecutar procesos con un comando
- **8 workflows** con pasos detallados para procesos completos
- **Sistema multi-cliente** con memoria de marca por cliente
- **Plantillas profesionales** para todos los entregables

---

## Inicio Rápido

### 1. Crear un nuevo cliente
```
/new-client
```
Se te pedirá: nombre del cliente, industria, website, servicios. Se creará automáticamente su carpeta con todos los archivos necesarios.

### 2. Cargar un cliente existente
```
/set-client [nombre-del-cliente]
```
Carga el contexto completo del cliente para que todas las respuestas usen su tono, restricciones y objetivos.

### 3. Crear una campaña
```
/create-meta-campaign
/create-google-campaign
/create-youtube-campaign
```

### 4. Generar contenido
```
/content-calendar
/create-reels
/create-captions
```

### 5. Hacer auditorías
```
/brand-audit
/website-audit
/competitor-analysis
```

---

## Cómo Usar los Agentes

Los agentes están en `.claude/agents/`. Cada uno es un especialista con rol, responsabilidades, estilo de trabajo e instrucciones específicas.

**Para invocar un agente:**
```
Actúa como el [nombre del agente]. Necesito que...
```

**Ejemplo:**
```
Actúa como el Meta Ads Specialist. Crea una campaña para [cliente] 
con objetivo de generación de leads para su servicio de [servicio].
```

**Lista de agentes disponibles:**
- `chief-marketing-strategist` — Estrategia general
- `account-manager` — Gestión de clientes
- `brand-strategist` — Identidad y voz de marca
- `meta-ads-specialist` — Facebook & Instagram Ads
- `google-ads-specialist` — Google Ads
- `seo-aeo-geo-specialist` — SEO / AEO / GEO
- `content-strategist` — Estrategia de contenido
- `copywriter` — Redacción y copy
- `creative-director` — Dirección creativa
- `landing-page-cro-specialist` — Optimización de landing pages
- `email-marketing-specialist` — Email marketing
- `marketing-automation-specialist` — Automatizaciones
- `analytics-reporting-specialist` — Reportes y análisis
- `proposal-builder` — Propuestas comerciales
- `compliance-reviewer` — Revisión de cumplimiento
- `project-manager` — Gestión de proyectos

---

## Cómo Usar las Skills

Las skills están en `.claude/skills/[nombre-skill]/SKILL.md`. Cada skill tiene instrucciones, parámetros, formato de salida y ejemplos.

**Para activar una skill:**
```
Usa la skill [nombre-skill] para [tarea específica]
```

**Ejemplo:**
```
Usa la skill reel-script-generator para crear un script de 30 segundos 
para [cliente] promocionando su servicio de [servicio].
```

**Skills disponibles por categoría:**

*Auditorías:*
- `brand-audit` / `website-audit` / `competitor-analysis`

*Campañas de Pago:*
- `meta-ads-campaign-builder` / `google-ads-campaign-builder` / `youtube-ads-campaign-builder`

*SEO / Contenido:*
- `seo-content-brief` / `geo-content-brief` / `social-media-calendar`
- `reel-script-generator` / `caption-generator` / `youtube-seo-description`

*Copy y Conversión:*
- `landing-page-copy` / `landing-page-cro-review` / `offer-builder`
- `email-sequence-builder` / `newsletter-builder`

*Reportes y Propuestas:*
- `monthly-report-builder` / `campaign-performance-analysis` / `proposal-builder`

*Clientes:*
- `client-onboarding` / `client-brand-profile`

*Compliance:*
- `meta-ads-compliance-review` / `health-marketing-compliance` / `finance-marketing-compliance`

*Automatización:*
- `whatsapp-automation` / `n8n-workflow-designer`

*Especialidades:*
- `local-business-campaign` / `bilingual-campaign-builder` / `luxury-brand-campaign`

---

## Cómo Usar los Slash Commands

Los commands están en `.claude/commands/`. Son atajos para procesos completos.

| Comando | Descripción |
|---------|-------------|
| `/new-client` | Crear nuevo cliente |
| `/set-client` | Cargar cliente existente |
| `/client-brief` | Generar brief del cliente |
| `/brand-audit` | Auditoría de marca |
| `/website-audit` | Auditoría de website |
| `/competitor-analysis` | Análisis de competidores |
| `/create-meta-campaign` | Campaña Meta Ads completa |
| `/create-google-campaign` | Campaña Google Ads completa |
| `/create-youtube-campaign` | Campaña YouTube Ads |
| `/content-calendar` | Calendario de contenido mensual |
| `/create-reels` | Ideas y scripts de reels |
| `/create-captions` | Captions para redes sociales |
| `/create-email-sequence` | Secuencia de emails |
| `/landing-page-copy` | Copy de landing page |
| `/landing-page-review` | Auditoría de landing page |
| `/monthly-report` | Reporte mensual de resultados |
| `/campaign-analysis` | Análisis de campaña |
| `/proposal` | Propuesta comercial |
| `/seo-brief` | Brief SEO |
| `/geo-brief` | Brief para buscadores con IA |
| `/meta-compliance-check` | Verificar compliance Meta |
| `/automation-plan` | Plan de automatización |
| `/n8n-workflow` | Diseño de workflow n8n |
| `/youtube-seo` | SEO para YouTube |
| `/launch-strategy` | Estrategia de lanzamiento |
| `/local-campaign` | Campaña para negocio local |
| `/bilingual-campaign` | Campaña bilingüe ES/EN |

---

## Cómo Crear un Nuevo Cliente

1. Ejecutar `/new-client`
2. Proporcionar:
   - Nombre del cliente/empresa
   - Industria
   - Website
   - Servicios que ofrece
   - Público objetivo
   - Objetivo principal de marketing
3. Claude creará automáticamente `clients/[nombre-cliente]/` con:
   - `brand-profile.md` — Perfil completo de marca
   - `services.md` — Servicios y ofertas
   - `buyer-personas.md` — Personas del comprador
   - `offers.md` — Ofertas activas
   - `campaigns.md` — Historial de campañas
   - `content-calendar.md` — Calendario de contenido
   - `reports.md` — Reportes del cliente
   - `assets.md` — Assets disponibles
   - `notes.md` — Notas del account manager
   - `compliance-rules.md` — Reglas de compliance del cliente
   - `automation-map.md` — Mapa de automatizaciones

---

## Cómo Crear Campañas

**Campaña completa Meta Ads:**
```
/create-meta-campaign
Objetivo: [leads / ventas / tráfico / reconocimiento]
Cliente: [nombre]
Servicio: [qué se está promoviendo]
Presupuesto: [$X/día]
```

**Campaña completa Google Ads:**
```
/create-google-campaign
Tipo: [Search / Display / YouTube / Performance Max]
Cliente: [nombre]
Keywords principales: [keyword1, keyword2]
```

---

## Cómo Generar Reportes

```
/monthly-report
Cliente: [nombre]
Mes: [mes y año]
Canales: [Meta Ads, Google Ads, SEO, etc.]
Métricas disponibles: [pegar datos o indicar que se necesita template]
```

---

## Cómo Agregar Nuevas Skills

1. Crear carpeta en `.claude/skills/[nombre-nueva-skill]/`
2. Crear archivo `SKILL.md` con la estructura:
   ```markdown
   # Skill: [Nombre]
   ## Descripción
   ## Cuándo Usar
   ## Parámetros de Entrada
   ## Proceso
   ## Formato de Salida
   ## Ejemplos
   ## Referencias
   ```
3. Documentar en este README
4. Opcionalmente, crear un comando en `.claude/commands/`

---

## Cómo Personalizar para Cada Cliente

Cada cliente tiene su propio `brand-profile.md` con:

- **Tono de comunicación** — Cómo se habla con su audiencia
- **Palabras que usa** — Vocabulario de marca
- **Palabras que evita** — Qué no encaja con la marca
- **Compliance específico** — Restricciones de su industria
- **Canales activos** — Dónde tiene presencia
- **Objetivos** — Qué quiere lograr

Al cargar un cliente con `/set-client`, todos los agentes y skills se adaptan automáticamente a este perfil.

---

## Estructura de Archivos

```
.agencia-ai/
├── CLAUDE.md                    ← Reglas operativas
├── README.md                    ← Este archivo
├── clients/
│   ├── _template-client/        ← Plantilla base
│   └── [nombre-cliente]/        ← Un folder por cliente
├── templates/                   ← Plantillas de entregables
├── reports/                     ← Reportes guardados
├── proposals/                   ← Propuestas guardadas
├── campaigns/                   ← Campañas activas
├── automations/                 ← Workflows de automatización
├── assets/                      ← Imágenes, logos, recursos
├── references/                  ← Benchmarks y referencias
└── .claude/
    ├── agents/                  ← 16 agentes especializados
    ├── skills/                  ← 30 skills modulares
    ├── commands/                ← 27 slash commands
    ├── workflows/               ← 8 workflows completos
    ├── hooks/                   ← Automatizaciones internas
    ├── templates/               ← Templates de Claude
    └── references/              ← Referencias del sistema
```

---

## Soporte

Para agregar funcionalidades, crear nuevas skills o modificar agentes, seguir las convenciones de este sistema y actualizar este README.

*Bop Agency AI System — v1.0*
