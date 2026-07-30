# Workflow: New Client Onboarding

## Descripción
Proceso completo de onboarding para un nuevo cliente de la agencia. Desde la creación de la carpeta hasta la entrega de la estrategia inicial de 30 días.

## Duración Estimada
2-4 horas de trabajo (puede distribuirse en 1-2 sesiones)

## Prerrequisitos
- Reunión de discovery completada
- Contrato firmado
- Información básica del cliente disponible

---

## PASO 1: Crear Estructura del Cliente

**Acción:** Crear carpeta y archivos base
```
/new-client [nombre-cliente]
```

**Checklist:**
- [ ] Carpeta `clients/[nombre-cliente]/` creada
- [ ] Todos los archivos template copiados
- [ ] Nombre correcto (sin espacios, en minúsculas con guiones)

---

## PASO 2: Completar Brand Profile

**Acción:** Recopilar y documentar toda la información de marca

**Preguntas clave para el cliente:**
1. ¿Qué hace su empresa en una oración?
2. ¿A quién le vende? (demográfico + psicográfico)
3. ¿Cuál es su diferenciador principal?
4. ¿Cuál es el tono de su comunicación?
5. ¿Qué resultado principal obtiene su cliente?
6. ¿Quiénes son sus 3 principales competidores?

**Completar:** `clients/[cliente]/brand-profile.md`

---

## PASO 3: Documentar Servicios Contratados

**Acción:** Definir exactamente qué se entrega

**Completar:** `clients/[cliente]/services.md` con:
- Servicios del paquete contratado
- Entregables específicos por servicio
- Frecuencia de entrega
- Proceso de aprobación
- KPIs por servicio

---

## PASO 4: Crear Buyer Personas

**Acción:** Definir 1-2 buyer personas detalladas

**Completar:** `clients/[cliente]/buyer-personas.md` con:
- Nombre ficticio + foto stock (descripción)
- Demografía (edad, género, ubicación, ingresos)
- Ocupación y vida cotidiana
- Problemas y frustraciones relacionados al servicio
- Motivaciones y aspiraciones
- Canales que usa (redes sociales, plataformas)
- Objeciones típicas para comprar

---

## PASO 5: Definir Reglas de Compliance

**Acción:** Identificar restricciones específicas de la industria

**Completar:** `clients/[cliente]/compliance-rules.md` con:
- Industria y regulaciones aplicables
- Palabras/frases prohibidas
- Claims que requieren disclaimer
- Restricciones de targeting
- Disclaimers estándar a usar

**Usar:** `.claude/skills/meta-ads-compliance-review/SKILL.md` como referencia

---

## PASO 6: Crear Checklist de Assets Necesarios

**Acción:** Listar todos los materiales que se necesitan del cliente

**Assets típicos necesarios:**
- [ ] Logo en vectorial (AI, EPS) y PNG transparente
- [ ] Colores de marca en HEX
- [ ] Tipografías usadas
- [ ] Fotos profesionales del equipo/local/productos
- [ ] Testimonios escritos (mínimo 3)
- [ ] Acceso a Meta Business Manager
- [ ] Acceso a Google Ads Manager
- [ ] Acceso a Google Analytics / Search Console
- [ ] Website en WordPress/Shopify/etc. con acceso
- [ ] Pixel de Meta instalado (o necesita instalarse)
- [ ] Tag de Google configurado (o necesita configurarse)

---

## PASO 7: Estrategia Inicial de 30 Días

**Acción:** Crear plan de acción para el primer mes

**Activar:** Agente `chief-marketing-strategist`

**Entregar en:** `clients/[cliente]/campaigns.md`

**Incluir:**
- Semana 1-2: Setup y quick wins
  - Auditoría de lo existente
  - Configuración de tracking
  - Primera campaña de prueba
- Semana 3-4: Primera campaña formal
  - Canal principal elegido
  - Objetivo de la campaña
  - Copy y creatividades
  - KPIs semana 1
- Mes 2-3: Expansión
  - Canales adicionales
  - Optimización basada en datos

---

## PASO 8: Reunión de Kickoff

**Objetivo:** Alinear expectativas, presentar estrategia, confirmar próximos pasos

**Agenda sugerida:**
1. Presentación del equipo de la agencia (5 min)
2. Resumen del brand profile y confirmación (10 min)
3. Estrategia inicial 30 días (15 min)
4. Entregables y fechas (5 min)
5. Proceso de comunicación y aprobaciones (5 min)
6. Preguntas (10 min)

---

## ENTREGABLES FINALES DEL ONBOARDING

- [ ] Brand profile completo
- [ ] Buyer personas documentadas
- [ ] Compliance rules definidas
- [ ] Estrategia 30 días entregada
- [ ] Kickoff realizado
- [ ] Accesos obtenidos y verificados

## Agentes Involucrados
- account-manager (coordinación)
- brand-strategist (brand profile)
- chief-marketing-strategist (estrategia 30 días)
- compliance-reviewer (compliance rules)
