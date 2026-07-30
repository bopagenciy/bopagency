# Skill: n8n Workflow Designer

## Descripción
Diseña workflows detallados para n8n con triggers, nodes, lógica, condiciones y casos de uso para marketing automation.

## Nodos Comunes en n8n para Marketing

**Triggers:**
- Webhook — Recibir datos de Meta Leads, formularios, APIs
- Schedule — Ejecutar tareas periódicas
- Email Trigger — Actuar cuando llega un email

**Acciones:**
- HTTP Request — Conectar con cualquier API
- Google Sheets — Leer y escribir datos
- Gmail / Outlook — Enviar emails
- WhatsApp (Twilio/360dialog) — Enviar mensajes
- HubSpot / GoHighLevel — CRM operations
- Slack — Notificaciones al equipo
- OpenAI — Procesar texto con IA

**Lógica:**
- IF node — Condiciones y ramas
- Switch — Múltiples condiciones
- Set — Transformar datos
- Merge — Combinar flujos
- Wait — Pausar entre acciones

## Formato de Salida

```
## WORKFLOW n8n — [Nombre del Workflow]
**Cliente:** [Cliente]
**Propósito:** [Qué automatiza este workflow]

---
### DIAGRAMA DEL FLUJO
[Descripción visual en texto]

TRIGGER → Node 1 → Node 2 → [Condición] → Node 3a / Node 3b → Fin

---
### CONFIGURACIÓN DE CADA NODO

**NODO 1: [Nombre] ([Tipo de nodo])**
- Propósito: [Qué hace]
- Configuración:
  - Campo 1: [Valor]
  - Campo 2: [Valor]
- Output: [Datos que pasa al siguiente nodo]

**NODO 2: IF — [Condición]**
- Condición: [Campo] [operador] [valor]
- Si TRUE → [Siguiente nodo]
- Si FALSE → [Rama alternativa]

**NODO 3A: [Nombre]**
[...]

---
### MAPEO DE DATOS
| Campo de entrada | Campo de salida | Transformación |
|-----------------|-----------------|----------------|
| lead.email | contact.email | Ninguna |
| lead.name | contact.firstName | Split por espacio |

---
### MANEJO DE ERRORES
- Si falla HTTP Request: [Acción]
- Si datos incompletos: [Acción]
- Notificación de error a: [Email/Slack]

---
### CHECKLIST DE IMPLEMENTACIÓN
- [ ] Credenciales configuradas en n8n
- [ ] Webhook URL registrada en plataforma origen
- [ ] Test con datos reales
- [ ] Error handling activado
- [ ] Notificaciones de equipo configuradas
- [ ] Documentación entregada al cliente

---
### VARIABLES DEL WORKFLOW
[Lista de variables/credenciales necesarias]
```

## Workflows Comunes Pre-diseñados

1. **Meta Lead → CRM + Email + WhatsApp** (el más solicitado)
2. **Formulario Web → Google Sheets + Notificación**
3. **Nueva venta → Email de bienvenida + Crear tarea**
4. **Lead inactivo → Secuencia de reactivación**

## Referencias
- agents/marketing-automation-specialist.md
- templates/plan-automatizacion-n8n.md
