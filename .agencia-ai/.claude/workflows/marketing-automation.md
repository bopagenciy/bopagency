# Workflow: Marketing Automation

## Descripción
Proceso para diseñar e implementar un sistema de automatización de marketing completo.

---

## PASO 1: Definir Trigger (Punto de Inicio)

¿Qué activa el workflow?
- [ ] Lead de Meta Leads Ads (webhook)
- [ ] Formulario web (Typeform, Gravity Forms, ContactForm7)
- [ ] WhatsApp inbound
- [ ] Compra completada
- [ ] Inactividad de X días
- [ ] Fecha específica o cumpleaños
- [ ] Acción en el CRM

## PASO 2: Definir Fuente del Lead

Información que llega en el trigger:
- [ ] Nombre
- [ ] Email
- [ ] Teléfono/WhatsApp
- [ ] Servicio de interés
- [ ] Origen del anuncio (UTM o nombre de campaña)
- [ ] Cualquier dato adicional del formulario

## PASO 3: Definir CRM o Base de Datos

¿Dónde se guarda el lead?
- [ ] Google Sheets (más simple, sin costo)
- [ ] HubSpot (CRM robusto)
- [ ] GoHighLevel (todo en uno para agencias)
- [ ] ActiveCampaign (email + CRM)
- [ ] Notion Database
- [ ] Airtable

## PASO 4: Definir Mensajes de Seguimiento

**Canal 1: WhatsApp (si aplica)**
- Mensaje 1 (inmediato): [Bienvenida + próximo paso]
- Mensaje 2 (24h sin respuesta): [Follow-up amigable]
- Mensaje 3 (48h sin respuesta): [Último intento]

**Canal 2: Email**
- Email 1 (inmediato): [Confirmación + valor inicial]
- Email 2 (día 2): [Contenido de valor]
- Email 3 (día 4): [Caso de éxito]
- Email 4 (día 7): [Oferta o CTA directo]

## PASO 5: Definir Condiciones y Ramificaciones

¿Qué pasa en cada escenario?
- Si responde → [Acción]
- Si no responde en Xh → [Acción]
- Si hace clic en link → [Acción]
- Si compra → [Acción]
- Si dice "no interesado" → [Remover del flujo]

## PASO 6: Definir Notificaciones Internas

¿Cuándo debe ser notificado el equipo de ventas?
- Lead nuevo ingresa → Notificación inmediata por WhatsApp/Slack
- Lead responde → Notificación al vendedor asignado
- Lead calificado (pasó por el bot) → Notificación con su información

## PASO 7: Diseñar el Workflow en n8n

Usar skill `n8n-workflow-designer/SKILL.md`:
- [ ] Diagrama del flujo completo
- [ ] Configuración de cada nodo
- [ ] Mapeo de datos entre nodos
- [ ] Manejo de errores

## PASO 8: Crear Checklist de Implementación

- [ ] n8n instalado y accesible (cloud o self-hosted)
- [ ] Credenciales de todas las plataformas configuradas
- [ ] Webhook URL registrada en la plataforma origen
- [ ] Test con lead de prueba real
- [ ] Verificación de que los datos llegan correctamente
- [ ] Test de los mensajes (recibidos correctamente)
- [ ] Notificaciones internas activadas
- [ ] Monitoreo de errores configurado
- [ ] Documentación del workflow entregada al cliente

---

## Agentes Involucrados
- marketing-automation-specialist (líder)
- account-manager (coordinación con cliente)

## Herramientas
- skill: n8n-workflow-designer
- skill: whatsapp-automation
- templates/plan-automatizacion-n8n.md
