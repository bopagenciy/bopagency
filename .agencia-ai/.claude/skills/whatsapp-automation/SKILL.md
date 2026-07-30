# Skill: WhatsApp Automation

## Descripción
Diseña automatizaciones para WhatsApp Business que convierten leads en clientes de forma automática y eficiente.

## Plataformas

- **WhatsApp Business API** — Para empresas con volumen alto
- **ManyChat** — Para automatizar con mayor facilidad
- **n8n + Twilio/360dialog** — Para integraciones avanzadas

## Flujos de Automatización Comunes

1. **Lead de Meta → WhatsApp** — Lead llega por Facebook Leads y se contacta automáticamente por WhatsApp
2. **Formulario web → WhatsApp** — Lead llena formulario y recibe mensaje inmediato
3. **Seguimiento de no respondidos** — Recontacto automático a leads que no respondieron
4. **Calificación de leads** — Bot que pregunta y segmenta antes de pasar al vendedor
5. **Secuencia de nurturing** — Mensajes programados para educar y convertir

## Formato de Salida

```
## FLUJO DE AUTOMATIZACIÓN WHATSAPP — [Cliente]

**Trigger:** [Meta Lead / Formulario / Manual]
**Plataforma:** [ManyChat / n8n / API]
**Objetivo:** [Calificar leads / Agendar cita / Vender]

---
### FLUJO DE MENSAJES

**MENSAJE 1 — Inmediato (0-5 min)**
Texto:
"Hola [Nombre] 👋
Vi que estás interesado en [servicio].
¿Cuándo tienes 15 minutos para hablar?"

Botones:
▶️ "Hoy por la tarde"
▶️ "Mañana"
▶️ "Esta semana"

---
**MENSAJE 2 — Si no responde en 24h**
Texto: [Follow-up amigable]

**MENSAJE 3 — Si no responde en 48h**
Texto: [Último seguimiento]

---
### CONDICIONES Y RAMAS
[Qué pasa si responde SÍ / NO / No responde]

### INTEGRACIÓN CON CRM
[Cómo se registra en el CRM]

### NOTIFICACIÓN AL EQUIPO DE VENTAS
[Cuándo y cómo se notifica]

### CHECKLIST DE IMPLEMENTACIÓN
- [ ] Número de WhatsApp Business configurado
- [ ] Plataforma de automatización conectada
- [ ] Mensajes aprobados
- [ ] Test realizado
- [ ] CRM integrado
- [ ] Equipo de ventas notificado del flujo
```

## Referencias
- agents/marketing-automation-specialist.md
- .claude/skills/n8n-workflow-designer/SKILL.md
