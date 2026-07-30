# ADR-003: Motor de Automatización — Inngest (reemplaza n8n)
**Estado:** Propuesto  
**Fecha:** 2026-07-29  
**Autores:** Francisco (Bop Agency)  
**Revisores:** Pendiente

> ⚠️ **CONTRADICCIÓN CON DECISIÓN APROBADA #9 — Estado: Propuesto mantenido**
>
> **Decisión aprobada #9 (Fase 0):** "Inngest NO se utilizará obligatoriamente para todos los procesos."
>
> **Conflicto:** Este ADR establece que "Se adopta Inngest como motor de automatización principal" y propone migrar las 6 automatizaciones existentes a funciones Inngest. La Decisión #9 contradice explícitamente el uso obligatorio de Inngest para todos los procesos.
>
> **Interpretación:** Inngest puede utilizarse pero no es la única solución válida. Algunos workflows podrían mantenerse en n8n temporalmente o implementarse con alternativas (Supabase Cron, Server Actions de Next.js, cron jobs simples). La decisión de qué motor usa cada workflow se tomará individualmente durante la migración.
>
> **Acción requerida:** Francisco debe revisar este ADR en Fase 8 (Migración de Automatizaciones) y confirmar qué workflows migrarán a Inngest y cuáles usarán una alternativa. El ADR pasará a "Aceptado" o "Reemplazado" en esa fase.

---

## Contexto

El sistema actual usa n8n en Docker local para 7 automatizaciones (4 con backup JSON + 3 inferidas). n8n corre en `127.0.0.1:5678` con Docker Compose, monta volumes locales de archivos, y usa `host.docker.internal` para comunicarse con la Express API.

**Problemas con n8n:**
- No puede desplegarse en la nube sin servidor dedicado (Docker requerido)
- Las funciones (workflows) no están versionadas en git — son JSON opacos
- No hay retry exponential backoff — los fallos se pierden silenciosamente
- La observabilidad se limita al dashboard de n8n local
- El contexto de ejecución depende de filesystem local (`/shared-data`, `/agencia-ai`) que no existirá en el nuevo stack
- El `N8N_ENCRYPTION_KEY` está expuesto en texto plano en `n8n-local/.env` (R-02)
- Los workflows JSON no son revisables en pull requests

**Requisitos del nuevo motor:**
- Retry automático con backoff exponencial para cada función
- Observabilidad: logs, historial de ejecuciones, alertas de fallos
- Pasos encadenados (fetch → normalize → upsert → notify) en una sola función
- Triggers por eventos (no solo cron) para reaccionar a cambios en tiempo real
- Aprobación humana en flujos de publicación de campañas
- Todo el código en TypeScript, versionado en git
- Compatible con despliegue serverless (sin servidor Docker)

**Opciones consideradas:**
1. Inngest (cloud-native, TypeScript, open-source SDK)
2. Supabase Cron (pg_cron) para tareas cron simples
3. Vercel Cron Jobs
4. GitHub Actions (para tareas batch)
5. Temporal.io (workflow engine enterprise)
6. Mantener n8n (self-hosted o cloud)

---

## Decisión

**Se adopta Inngest como motor de automatización principal.**

Las tareas cron simples sin lógica compleja pueden complementarse con Supabase Cron (pg_cron) en el futuro, pero Inngest cubre todos los casos de uso actuales.

---

## Justificación

| Criterio | Inngest | Supabase Cron | Vercel Cron | GitHub Actions | n8n mantener |
|----------|---------|---------------|-------------|----------------|--------------|
| Retry exponential | ✅ Configurable | ❌ | ❌ | ⚠️ Solo re-run manual | ✅ |
| Observabilidad | ✅ Dashboard completo | ⚠️ pg_cron logs | ⚠️ Solo éxito/fallo | ✅ CI logs | ✅ Dashboard n8n |
| Pasos encadenados | ✅ `step.run()`, `step.sleep()` | ❌ SQL puro | ❌ | ✅ Jobs | ✅ Nodos |
| Aprobación humana | ✅ `step.waitForEvent()` | ❌ | ❌ | ❌ | ⚠️ Manual |
| Triggers de eventos | ✅ Event-driven nativo | ❌ | ❌ | ⚠️ Webhooks | ✅ |
| TypeScript en git | ✅ | ⚠️ SQL | ⚠️ | ✅ YAML | ❌ JSON opaco |
| Serverless | ✅ | ✅ | ✅ | ❌ Requiere runner | ❌ Requiere Docker |
| Next.js integration | ✅ `@inngest/next` oficial | ⚠️ | ✅ | ❌ | ⚠️ HTTP |
| Dev local | ✅ Inngest Dev Server | ✅ | ⚠️ | ✅ | ✅ |
| Costo actual | $0 Free (50K runs/mes) | $0 incluido | $0 Vercel Pro | $0 (2000 min/mes) | $0 self-hosted + infra |

**El factor decisivo es la aprobación humana:** El flujo de publicación de campañas (Fase 11) requiere que el workflow se pause, espere confirmación del usuario, y continúe. `step.waitForEvent()` de Inngest es la única opción nativa entre las evaluadas.

El hecho de que las funciones sean TypeScript versionadas en git resuelve el problema de mantenibilidad de los workflows JSON de n8n.

---

## Consecuencias

**Positivas:**
- Los workflows son TypeScript en git — revisables en pull requests
- Retry automático resuelve el problema de fallos silenciosos del sistema actual
- Inngest Dev Server permite ejecutar funciones localmente con eventos mock
- `step.waitForEvent()` habilita el flujo de aprobación humana para campañas
- El Free tier de Inngest cubre el volumen actual de Bop Agency (~500 runs/mes)

**Negativas:**
- Curva de aprendizaje del modelo de programación de Inngest (step functions)
- Dependencia de Inngest Cloud para el orquestador (aunque el SDK es open-source)
- Los workflows de n8n (JSON) deben reimplementarse en TypeScript

**Transición:**
- n8n permanece operativo durante toda la Fase 8
- Solo cuando Inngest esté validado en staging, se deshabilitan los workflows de n8n
- Los backups JSON de n8n se preservan en `backups/n8n-workflows/` indefinidamente

**Funciones a implementar (Fase 8):**
1. `sync-meta-metrics` — cron + evento manual
2. `evaluate-alerts` — evento `agency/metrics.synced`
3. `send-alert-notifications` — evento `agency/alert.created`
4. `generate-monthly-reports` — cron mensual
5. `generate-weekly-reports` — cron semanal
6. `send-report-emails` — evento `agency/report.generated`

---

## Alternativas descartadas

**Mantener n8n:** El filesystem local que los workflows consumen no existirá en el nuevo stack (Supabase reemplaza `shared-data/`). Los workflows tendrían que reescribirse de todas formas.

**Temporal.io:** Overkill para el volumen actual. Requiere un cluster de Workers dedicado y tiene una curva de aprendizaje mucho mayor. Apropiado para cuando la agencia escale a decenas de clientes con cientos de workflows.

**Supabase Cron:** Solo ejecuta SQL — no puede hacer HTTP calls a Meta API, Claude API, ni Resend. Útil solo como complemento para tareas puramente de DB.

---

## Referencias

- `docs/audit/N8N_WORKFLOW_INVENTORY.md` — inventario completo de workflows actuales
- `docs/architecture/AUTOMATION_MIGRATION_PLAN.md` — plan de migración detallado por workflow
- `docs/audit/MIGRATION_RISKS.md` — R-02 (credenciales), R-03 (sin tests)
- `backups/n8n-workflows/` — 4 workflows con backup JSON
- Inngest docs: https://www.inngest.com/docs
- `shared-data/automations/automations-registry.json` — 7 automatizaciones registradas
