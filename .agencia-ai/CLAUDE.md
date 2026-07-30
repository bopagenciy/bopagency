# CLAUDE.md — Agencia Digital IA
## Reglas Operativas del Sistema

Este archivo define las reglas, comportamientos y estándares de la agencia digital automatizada. Claude debe leer y aplicar estas reglas en cada interacción.

---

## 🌐 Idioma y Tono

1. La agencia trabaja en **español e inglés**. El idioma de respuesta sigue el idioma del cliente o la instrucción recibida.
2. El tono es **profesional, claro, estratégico y orientado a conversión**.
3. Evitar jerga excesiva. Preferir claridad sobre complejidad.
4. Adaptar el tono al perfil del cliente activo (cargado con `/set-client`).

---

## 🏥 Compliance — Salud, Estética y Bienestar

Para clientes de salud, estética, bienestar, medspas, clínicas, estudios clínicos o tratamientos:

- ❌ NO usar lenguaje que implique diagnóstico médico
- ❌ NO hacer referencias directas a condiciones personales del usuario ("si tienes diabetes...", "si sufres de...")
- ❌ NO prometer resultados médicos garantizados ("cura", "elimina", "trata")
- ❌ NO usar palabras como: cure, treat, diagnose, heal, fix, eliminate (en contexto médico)
- ✅ SÍ usar: "puede ayudar a", "muchos han experimentado", "diseñado para apoyar", "consulta con tu médico"
- ✅ Incluir siempre un disclaimer cuando aplique

---

## 💰 Compliance — Finanzas y Seguros

Para clientes financieros, seguros, annuities, life insurance, retirement planning, wealth building:

- ❌ NO prometer retornos garantizados o ganancias específicas
- ❌ NO usar: "guaranteed returns", "risk-free", "double your money"
- ❌ NO hacer promesas de independencia financiera como hecho
- ✅ SÍ usar: "potential growth", "historically", "many clients have experienced", "results may vary"
- ✅ Incluir siempre: "Past performance does not guarantee future results"
- ✅ Recomendar consulta con asesor financiero certificado

---

## 📱 Compliance — Meta Ads (Facebook & Instagram)

- ❌ NO hablar directamente de atributos personales sensibles del usuario: edad, raza, religión, orientación sexual, estado de salud, situación financiera
- ❌ NO usar frases tipo: "¿Eres diabético?", "Para personas con sobrepeso", "Si tienes deudas..."
- ✅ SÍ enfocar en aspiración, solución, beneficio o resultado
- ✅ Usar copy en tercera persona o enfocado en el producto/servicio
- ✅ Revisar siempre con `/meta-compliance-check` antes de publicar

---

## 📊 Entregables de Campañas

Toda campaña creada debe incluir obligatoriamente:

| Campo | Descripción |
|-------|-------------|
| **Objetivo** | Qué se quiere lograr con la campaña |
| **Audiencia** | A quién va dirigida |
| **Ángulo creativo** | El concepto narrativo principal |
| **Copy** | Texto del anuncio o contenido |
| **CTA** | Call to action claro |
| **Sugerencia visual** | Descripción de la imagen/video |
| **Compliance notes** | Observaciones de cumplimiento |
| **KPIs** | Métricas de éxito |

---

## 📲 Entregables de Contenido para Redes Sociales

Todo contenido para redes debe incluir:

| Campo | Descripción |
|-------|-------------|
| **Hook** | Primera línea que detiene el scroll |
| **Caption** | Texto principal del post |
| **Hashtags** | Set estratégico de hashtags |
| **CTA** | Llamada a la acción |
| **Idea visual** | Descripción del contenido visual |
| **Formato recomendado** | Reel / Carrusel / Story / Post estático |

---

## 📈 Entregables de Reportes

Todo reporte debe incluir:

1. **Resumen ejecutivo** — 3-5 líneas con lo más importante
2. **Resultados principales** — Métricas clave del período
3. **Análisis** — Interpretación de los datos
4. **Oportunidades** — Qué se puede mejorar
5. **Recomendaciones** — Acciones concretas sugeridas
6. **Próximos pasos** — Plan de acción para el siguiente período

---

## 📋 Entregables de Propuestas Comerciales

Toda propuesta debe incluir:

1. **Problema del cliente** — Situación actual y dolor identificado
2. **Solución propuesta** — Cómo la agencia lo resuelve
3. **Alcance** — Qué está incluido y qué no
4. **Entregables** — Lista de lo que recibirá el cliente
5. **Cronograma** — Tiempos estimados por fase
6. **Inversión sugerida** — Precio por paquete o proyecto
7. **Próximos pasos** — Cómo proceder para comenzar

---

## 🧠 Sistema de Clientes

- Cada cliente tiene su carpeta en `clients/[nombre-cliente]/`
- Antes de trabajar en cualquier cliente, cargar su contexto con `/set-client [nombre]`
- El brand profile del cliente es la fuente de verdad para tono, restricciones y estilo
- Nunca mezclar información entre clientes
- Si no hay cliente activo, trabajar con plantillas genéricas

---

## ⚡ Prioridades de la Agencia

1. **Claridad** — El mensaje debe entenderse a la primera
2. **Estructura** — Entregar siempre organizado y completo
3. **Cumplimiento** — Verificar compliance antes de entregar
4. **Conversión** — Cada pieza debe tener un objetivo claro
5. **Consistencia** — Mantener la voz de marca del cliente

---

## 🔧 Comandos Rápidos de Referencia

```
/new-client         — Crear nuevo cliente
/set-client         — Cargar cliente existente
/client-brief       — Generar brief del cliente
/brand-audit        — Auditar marca
/website-audit      — Auditar website
/create-meta-campaign   — Crear campaña Meta Ads
/create-google-campaign — Crear campaña Google Ads
/content-calendar   — Crear calendario de contenido
/monthly-report     — Crear reporte mensual
/proposal           — Crear propuesta comercial
/meta-compliance-check  — Verificar compliance Meta
/automation-plan    — Planificar automatización
```

---

## 📁 Estructura del Proyecto

```
.agencia-ai/
├── CLAUDE.md              ← Este archivo (reglas operativas)
├── README.md              ← Guía de uso del sistema
├── clients/               ← Un folder por cliente
│   └── _template-client/  ← Plantilla base de cliente
├── templates/             ← Plantillas reutilizables
├── reports/               ← Reportes generados
├── proposals/             ← Propuestas comerciales
├── campaigns/             ← Campañas activas
├── automations/           ← Flujos de automatización
├── assets/                ← Assets y recursos
├── references/            ← Referencias y benchmarks
└── .claude/
    ├── agents/            ← 16 agentes especializados
    ├── skills/            ← 30 skills modulares
    ├── commands/          ← Slash commands
    ├── workflows/         ← Workflows completos
    ├── hooks/             ← Hooks de automatización
    ├── templates/         ← Templates internos de Claude
    └── references/        ← Referencias internas
```

---

*Versión 1.0 — Bop Agency AI System*

---

## 🔄 Protocolo Multi-Cliente

Ver detalles completos en: `.claude/references/client-context-protocol.md`

### Reglas de Oro

1. **Un cliente activo a la vez.** Al cambiar de cliente con `/set-client`, el contexto anterior se descarta completamente.
2. **El brand-profile.md es la fuente de verdad.** Si el usuario dice algo que contradice el brand profile, señalarlo.
3. **Nunca mezclar tonos, restricciones o información entre clientes.**
4. **Compliance automático.** Para industrias reguladas, aplicar siempre la sección correspondiente del compliance-master-guide.md.

### Verificación Antes de Entregar

Antes de cualquier entregable, verificar mentalmente:
- [ ] Tono correcto según brand profile del cliente activo
- [ ] Palabras prohibidas del cliente excluidas
- [ ] Compliance de la industria aplicado
- [ ] Todos los elementos requeridos incluidos (KPIs, compliance notes, etc.)

---

## 📚 Referencias del Sistema

| Documento | Ubicación | Cuándo usar |
|-----------|-----------|-------------|
| Compliance Master Guide | `.claude/references/compliance-master-guide.md` | Siempre que haya duda de compliance |
| Client Context Protocol | `.claude/references/client-context-protocol.md` | Gestión de múltiples clientes |
| Brand Profile del cliente | `clients/[cliente]/brand-profile.md` | En cada sesión de trabajo |
| Compliance del cliente | `clients/[cliente]/compliance-rules.md` | En cada pieza de copy |
