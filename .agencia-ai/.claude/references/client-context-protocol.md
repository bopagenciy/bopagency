# CLIENT CONTEXT PROTOCOL
## Protocolo de Gestión de Contexto Multi-Cliente
**Referencia interna para Claude — Bop Agency**

---

## ¿Qué es el Client Context Protocol?

Es el conjunto de reglas que garantizan que cuando se trabaja con múltiples clientes:
1. Nunca se mezcla información entre clientes
2. Siempre se aplica el perfil correcto de marca
3. Las restricciones de compliance se respetan automáticamente
4. El sistema "recuerda" quién es el cliente activo en toda la sesión

---

## REGLA #1: Un Cliente Activo a la Vez

En cualquier sesión de trabajo, solo puede haber **un cliente activo**. Al cambiar de cliente, el contexto anterior se reemplaza completamente.

```
CLIENTE ACTIVO = el último /set-client ejecutado en esta sesión
```

---

## REGLA #2: Jerarquía de Fuentes de Verdad

Cuando hay conflicto entre lo que el usuario dice y lo que dice el brand profile:

```
1. brand-profile.md del cliente     ← Mayor autoridad
2. compliance-rules.md del cliente  ← Segunda autoridad
3. compliance-master-guide.md       ← Referencia global
4. Lo que el usuario indica en el chat ← Complementa, no reemplaza
```

Si el usuario pide algo que viola el brand profile o compliance, señalarlo y ofrecer alternativa.

---

## REGLA #3: Verificación Automática de Compliance

Antes de entregar cualquier pieza de copy o creatividad para un cliente regulado, ejecutar mentalmente el checklist del compliance-master-guide.md correspondiente a su industria.

**Industrias que siempre requieren verificación:**
- Cualquier cliente de salud/estética → §1 y §2
- Cualquier cliente de pérdida de peso/fitness → §3
- Estudios clínicos → §4
- Finanzas/inversiones → §5
- Seguros → §6

---

## REGLA #4: Tono Dinámico

El tono de cada respuesta se adapta al brand profile del cliente activo, no a un tono genérico.

| Si el brand profile dice... | Claude responde con... |
|-----------------------------|-----------------------|
| "Tono sofisticado y médico" | Lenguaje técnico, formal, confiable |
| "Cercano y conversacional" | Lenguaje amigable, emojis moderados |
| "Premium y exclusivo" | Lenguaje aspiracional, sin descuentos |
| "Directo y sin rodeos" | Frases cortas, beneficios claros, cero fluff |

---

## REGLA #5: Protocolo de Cliente Nuevo (Sin Carpeta)

Si el usuario pide trabajar con un cliente que no tiene carpeta en `clients/`:

**Opción A:** Ejecutar `/new-client` para crear la estructura
**Opción B:** Trabajar con información que el usuario proporcione en el chat

En la Opción B, solicitar mínimo:
1. Nombre del cliente e industria
2. Servicio o producto a promover
3. Audiencia objetivo
4. ¿Hay restricciones de compliance?

---

## ÍNDICE DE CLIENTES (Actualizar manualmente)

Este índice debe mantenerse actualizado al crear nuevos clientes.

```
## CLIENTES ACTIVOS EN LA AGENCIA

| Cliente | Industria | Paquete | Riesgo Compliance | Carpeta |
|---------|-----------|---------|------------------|---------|
| [Nombre] | [Industria] | [Growth] | [Alto/Medio/Bajo] | clients/[nombre]/ |
```

---

## CÓMO VERIFICAR QUE EL SISTEMA FUNCIONA CORRECTAMENTE

Ejecutar este test mental antes de entregar cualquier entregable:

**Pregunta 1:** ¿Estoy usando el tono correcto del cliente activo?
**Pregunta 2:** ¿Estoy respetando las palabras que el cliente evita?
**Pregunta 3:** ¿Apliqué el compliance correcto para esta industria?
**Pregunta 4:** ¿El entregable sigue el formato estándar de la agencia?
**Pregunta 5:** ¿Incluí todos los elementos requeridos (KPIs, compliance notes, sugerencia visual, etc.)?

Si alguna respuesta es "no sé", revisar el brand-profile.md del cliente antes de continuar.

---

## FLUJO COMPLETO DE UNA SESIÓN TÍPICA

```
1. Usuario: "/set-client lumina-medspa"
   → Account Manager activa el cliente
   → Se carga brand-profile, compliance-rules, campaigns
   → Confirmación de activación mostrada

2. Usuario: "/create-meta-campaign"
   → Meta Ads Specialist toma el briefing
   → Carga tono del brand profile de Lumina
   → Aplica §2 del compliance-master-guide (Medspa)
   → Entrega campaña con compliance notes incluidas

3. Usuario: "/monthly-report mes=Abril"
   → Analytics Specialist toma los datos
   → Usa benchmarks de la industria medspa
   → Entrega reporte en formato estándar

4. Usuario: "/set-client dental-studio-mx" ← CAMBIO DE CLIENTE
   → Account Manager descarga contexto de Lumina
   → Carga brand-profile de Dental Studio
   → Aplica §1 del compliance-master-guide (Salud dental)
   → Confirmación de cambio mostrada

5. Todo el trabajo siguiente es para Dental Studio
```
