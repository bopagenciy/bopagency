# ADR-008: Estrategia de Migración — Coexistencia Progresiva (Strangler Fig)
**Estado:** Aceptado  
**Fecha:** 2026-07-29  
**Autores:** Francisco (Bop Agency)  
**Revisores:** Pendiente

---

## Contexto

BopIAgency es un sistema en producción activa. El equipo de Bop Agency usa diariamente:
- El dashboard Express en `127.0.0.1:3101` para ver métricas, tareas y alertas
- Los workflows de n8n para sincronizar métricas de Meta Ads cada madrugada
- Los agentes y skills de Claude Code CLI para crear contenido
- Los archivos JSON en `shared-data/` como fuente de verdad

Una migración big-bang (apagar todo y encender el nuevo sistema) tiene un riesgo alto de pérdida de datos, interrupción de operaciones, y falta de rollback viable.

**Riesgos identificados en la migración (de `MIGRATION_RISKS.md`):**
- R-01: Pérdida de credenciales de n8n si el volumen Docker se pierde
- R-02: N8N_ENCRYPTION_KEY expuesta en texto plano
- R-03: Sin tests — imposible verificar equivalencia funcional
- R-04: Inconsistencia de schemas entre clientes
- R-07: Sin autenticación en la nueva app si no se implementa desde el primer PR
- R-10: Meta Access Token puede expirar durante la migración

**Opciones consideradas:**
1. Big-bang: apagar legacy, encender nuevo sistema de golpe
2. Strangler Fig: nueva app coexiste y gradualmente absorbe funcionalidad del legacy
3. Branch by abstraction: crear interfaces sobre el legacy, migrar implementaciones
4. Parallel run: ambos sistemas activos con verificación de equivalencia

---

## Decisión

**Se adopta el patrón Strangler Fig con Parallel Run selectivo para datos críticos.**

La migración ocurre en 13 fases progresivas (ver `IMPLEMENTATION_ROADMAP.md`), donde el sistema legacy permanece 100% operativo hasta que cada funcionalidad equivalente en el nuevo stack esté validada.

---

## Principios de la migración

### 1. Preservación de datos — invariante absoluto

Los archivos JSON en `shared-data/` y `.agencia-ai/` **nunca se eliminan durante la migración**. Son la fuente de verdad de respaldo. Si la nueva app falla, el equipo puede volver al dashboard Express mientras se resuelve.

Solo en la Fase 12 (Producción), después de confirmar integridad en Supabase, los archivos originales se archivan (no se eliminan).

### 2. Orden de migración de datos

```
Fase 0 (Seguridad)
  → Rotar credenciales expuestas
  → Exportar tokens de n8n
  → Crear .gitignore raíz

Fase 4 (Migración de datos)
  → Scripts idempotentes de importación
  → Verificación de conteos (N filas Supabase == N archivos JSON)
  → Datos originales intactos

Fase 8 (Automatización)
  → Inngest funciona en staging
  → n8n DESHABILITADO (no eliminado)
  → 1 semana de validación

Fase 12 (Producción)
  → n8n apagado definitivamente
  → Legacy archivado en legacy/
```

### 3. Feature flags por funcionalidad

Durante la coexistencia, las funcionalidades se van habilitando progresivamente:

| Funcionalidad | Fuente actual | Migración a | Validación requerida |
|--------------|--------------|------------|---------------------|
| Ver lista de clientes | `clients-index.json` + Express | Supabase + Next.js | Contar clientes antes y después |
| Ver métricas | `shared-data/metrics/` + Express | Supabase + Next.js | Comparar valores por cliente y período |
| Sincronizar métricas Meta | n8n workflow W-02/W-03 | Inngest `syncMetaPlatformMetrics` | Ejecutar ambos un día, comparar resultados |
| Enviar alertas | n8n workflow W-04 | Inngest `sendAlertNotifications` | Verificar emails recibidos |
| Generar reportes | n8n workflow W-05/W-06 | Inngest `generateReports` | Comparar estructura de reportes |
| Ejecutar agentes IA | Claude Code CLI | Claude API + Next.js | Evaluar calidad de output |

### 4. Scripts de migración idempotentes

Todos los scripts de importación de datos (Fase 4) deben ser idempotentes: se pueden ejecutar múltiples veces sin crear duplicados. Esto permite:
- Re-ejecutar el script si falla a mitad
- Actualizar los datos de Supabase si los archivos JSON cambian durante la transición

Mecanismo: `INSERT ... ON CONFLICT DO UPDATE` (UPSERT) con claves naturales únicas.

### 5. Parallel run para datos críticos

Para las métricas de Meta Ads (dato más crítico para el negocio):
- Durante la Fase 8, tanto n8n como Inngest sincronizan métricas en staging
- Se comparan los resultados de ambos sistemas para un mismo cliente y período
- Solo cuando los valores son equivalentes (≤ 0.1% de diferencia por redondeo), se deshabilita n8n

---

## Plan de rollback por fase

| Fase | Rollback disponible | Cómo |
|------|--------------------|----- |
| 0-3 | 100% | El sistema legacy no se ha modificado |
| 4 | 100% | Los archivos JSON están intactos; desconectar Supabase |
| 5 | 100% | El dashboard Express sigue operativo |
| 6 | 100% | Claude Code CLI sigue disponible |
| 7 | 100% | Las campañas en Supabase pueden ignorarse |
| 8 | 100% | Rehabilitar workflows de n8n en 5 minutos |
| 9-11 | 90% | Los reportes se pueden generar manualmente |
| 12 | Limitado | Después de archivar legacy, rollback requiere restaurar archivos |

---

## Criterios de éxito para la migración

La migración se considera completa cuando todos estos criterios se cumplen:

| Criterio | Verificación |
|----------|-------------|
| Los 3 clientes activos están en Supabase con todos sus documentos | `SELECT COUNT(*) FROM clients` == 3 |
| Las métricas de todos los períodos históricos están en Supabase | Comparar con archivos JSON por período |
| Las automatizaciones de Inngest llevan 1 semana sin fallos | Inngest Dashboard: 0 errores en 7 días |
| Los reportes mensuales se generaron y enviaron correctamente | `report_deliveries.status = 'sent'` para el último período |
| La autenticación funciona sin incidentes | 0 accesos no autorizados en logs |
| El dashboard Express está archivado (no activo) | Proceso no corriendo en `127.0.0.1:3101` |
| n8n Docker está apagado | `docker ps` no muestra contenedores de n8n |
| Los archivos originales están en `legacy/` | `ls legacy/shared-data/` no vacío |

---

## Consecuencias

**Positivas:**
- Rollback disponible en cada fase — riesgo mínimo de pérdida de operación
- La migración puede pausarse en cualquier punto y retomarse
- El equipo puede aprender el nuevo sistema gradualmente sin presión
- La comparación parallel run valida la equivalencia funcional antes de cortar

**Negativas:**
- La coexistencia tiene un período de mantenimiento de dos sistemas en paralelo
- Los scripts de migración requieren tiempo de desarrollo adicional (Fase 4)
- El parallel run de métricas requiere coordinación y monitoreo activo

**Duración estimada de coexistencia:** 4-8 semanas desde que el nuevo sistema entra en producción hasta que el legacy se apaga.

---

## Alternativas descartadas

**Big-bang:** Requeriría un fin de semana de downtime y asumir que la nueva app funciona perfectamente el primer día. El riesgo de pérdida de datos o de métricas no sincronizadas es inaceptable para una agencia en operación.

**Branch by abstraction:** Crearía interfaces sobre el legacy Express (ej: adaptar el Express API como backend temporal del Next.js). Añade una capa extra de complejidad sin beneficio — el Express se elimina de todas formas en la Fase 12.

---

## Referencias

- `docs/audit/MIGRATION_RISKS.md` — 15 riesgos de migración identificados
- `docs/audit/REUSE_MIGRATE_ARCHIVE.md` — clasificación de 108 elementos del repositorio
- `docs/architecture/IMPLEMENTATION_ROADMAP.md` — 13 fases con tareas específicas
- `shared-data/` — fuente de verdad actual (debe preservarse hasta Fase 12)
- Fowler, M. (2004). Strangler Fig Application: https://martinfowler.com/bliki/StranglerFigApplication.html
