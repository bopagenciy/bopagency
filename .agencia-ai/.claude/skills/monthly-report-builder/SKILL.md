# Skill: Monthly Report Builder

## Descripción
Crea reportes mensuales profesionales para clientes con KPIs, interpretación, análisis y recomendaciones.

## Parámetros de Entrada
- Cliente y mes reportado
- Canales incluidos
- Métricas disponibles (pegar datos o indicar que se necesita template)
- Contexto: ¿fue un mes normal o hubo algo especial?

## Formato de Salida

```
## REPORTE MENSUAL — [Cliente]
**Período:** [Mes Año] | **Preparado por:** Bop Agency

---
### RESUMEN EJECUTIVO
[3-5 bullets con los highlights más importantes del mes]
• ✅ [Logro principal]
• 📈 [Crecimiento destacado]
• ⚠️ [Área de atención]
• 🎯 [Progreso hacia objetivo]

---
### RESULTADOS POR CANAL

**META ADS**
| Métrica | Este mes | Mes anterior | Variación |
|---------|----------|--------------|-----------|
| Inversión | $X | $X | +/- X% |
| Leads | X | X | +/- X% |
| CPL | $X | $X | +/- X% |
| CTR | X% | X% | +/- X% |
| ROAS | X | X | +/- X% |

Análisis: [Interpretación en 2-3 oraciones]

**GOOGLE ADS**
[Tabla similar]
Análisis: [Interpretación]

**REDES SOCIALES ORGÁNICAS**
[Métricas de crecimiento y engagement]

**EMAIL MARKETING** (si aplica)
[Open rate, CTR, conversiones]

---
### TOP CAMPAÑAS DEL MES
1. [Campaña] — [Resultado destacado] — [Por qué funcionó]
2. [Campaña] — [Resultado]

---
### ANÁLISIS E INSIGHTS
[Paragráfo con análisis más profundo: tendencias, comportamientos observados, hallazgos importantes]

---
### OPORTUNIDADES IDENTIFICADAS
1. [Oportunidad 1 — con acción sugerida]
2. [Oportunidad 2]
3. [Oportunidad 3]

---
### RECOMENDACIONES PARA [MES SIGUIENTE]
1. [Recomendación específica y accionable]
2. [Recomendación 2]
3. [Recomendación 3]

---
### PRÓXIMOS PASOS
- [Acción 1] — Responsable: [Agencia/Cliente] — Fecha: [X]
- [Acción 2] — Responsable: — Fecha:
```

## Referencias
- agents/analytics-reporting-specialist.md
- templates/reporte-mensual.md

---

## EJEMPLO DE OUTPUT REAL

**Input:** Cliente: Dental Studio Monterrey | Mes: Abril 2025 | Meta Ads: $2,400 invertido, 87 leads, CPL $27.58 | Mes anterior: 71 leads, CPL $33.20

**Output (Resumen Ejecutivo):**

```
## REPORTE MENSUAL — Dental Studio Monterrey
Período: Abril 2025 | Inversión Total: $2,400

RESUMEN EJECUTIVO
• ✅ Generamos 87 leads este mes — 22% más que marzo (71 leads)
• 📉 El costo por lead bajó de $33.20 a $27.58 (-17%) — estamos siendo
  más eficientes con el mismo presupuesto
• 🏆 La campaña de "Blanqueamiento + Ortodoncia" fue la estrella del mes
  con 34 leads a $21 cada uno
• ⚠️ Google Ads tuvo una semana de rendimiento bajo por un cambio de
  algoritmo — ajustamos bids y ya está recuperado
• 🎯 Recomendamos aumentar el presupuesto de Meta en $500/mes para
  escalar lo que está funcionando
```

## Benchmark de KPIs por Industria

| Industria | CPL Bueno | CPL Aceptable | CPL Alto |
|-----------|-----------|---------------|---------|
| Dental | <$25 | $25-45 | >$45 |
| Medspa | <$30 | $30-60 | >$60 |
| Real Estate | <$20 | $20-50 | >$50 |
| Consultoría | <$40 | $40-100 | >$100 |
| E-commerce ROAS | >4x | 2-4x | <2x |
| Seguros | <$35 | $35-75 | >$75 |

Usa estos benchmarks para contextualizar los resultados para el cliente.
