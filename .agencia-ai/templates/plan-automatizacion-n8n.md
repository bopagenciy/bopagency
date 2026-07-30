# PLAN DE AUTOMATIZACIÓN — n8n
**Cliente:** [Nombre] | **Workflow:** [Nombre] | **Fecha:** [Fecha]

---

## OBJETIVO DEL WORKFLOW

[Qué problema resuelve esta automatización — en términos de negocio]

---

## RESUMEN DEL FLUJO

```
[Trigger] → [Paso 1] → [Condición] → [Acción A / Acción B] → [Notificación]
```

---

## CONFIGURACIÓN DETALLADA

### NODO 1: TRIGGER — [Tipo]
- **Tipo de nodo:** [Webhook / Schedule / etc.]
- **Configuración:**
  - URL del webhook: [Se genera en n8n]
  - Método HTTP: POST
- **Datos que recibe:** [Lista de campos]

### NODO 2: [Nombre] — [Tipo de nodo]
- **Propósito:** [Qué hace]
- **Configuración:**
  - Campo 1: [Valor / {{expresión}}]
  - Campo 2: [Valor]
- **Output:** [Datos que pasa al siguiente]

### NODO 3: IF — [Condición]
- **Condición:** [Campo] [operador] [valor]
- **Si TRUE:** [Rama A]
- **Si FALSE:** [Rama B]

[Continuar con todos los nodos...]

---

## MAPEO DE DATOS

| Campo origen | Campo destino | Transformación |
|-------------|---------------|----------------|
| [Campo] | [Campo CRM] | [Ninguna / Split / Format] |

---

## MENSAJES DEL WORKFLOW

**Mensaje de bienvenida WhatsApp:**
```
[Texto del mensaje con {{variables}}]
```

**Email de confirmación:**
- Subject: [Texto]
- Body: [Texto]

---

## INTEGRACIONES REQUERIDAS

| Plataforma | Credencial necesaria | Estado |
|-----------|---------------------|--------|
| Meta Leads API | Token de acceso | ⏳ |
| Twilio/360dialog | API Key | ⏳ |
| Google Sheets | OAuth | ⏳ |
| CRM | API Key | ⏳ |

---

## CHECKLIST DE IMPLEMENTACIÓN

**Pre-implementación:**
- [ ] n8n instalado y accesible
- [ ] Todas las credenciales disponibles

**Configuración:**
- [ ] Webhook URL creado en n8n
- [ ] Webhook URL registrado en Meta (o plataforma origen)
- [ ] Todos los nodos configurados
- [ ] Mapeo de datos verificado

**Testing:**
- [ ] Test con datos de prueba
- [ ] Verificar llegada en todos los destinos
- [ ] Test de rama TRUE y FALSE
- [ ] Test de error handling

**Post-implementación:**
- [ ] Monitoreo activado
- [ ] Documentación entregada al cliente
- [ ] Equipo de ventas notificado del nuevo flujo

---

## NOTAS TÉCNICAS

[Notas importantes: IDs de webhook, tokens, configuraciones especiales]
