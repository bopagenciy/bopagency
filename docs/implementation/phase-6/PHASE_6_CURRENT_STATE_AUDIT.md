# Phase 6 — Auditoría del Estado Actual
**Fecha:** 2026-08-04  
**Rama:** feat/phase-6-automation-runtime  
**Scope:** Automatización, AI Engine, n8n, integraciones, modelo de datos existente

---

## 1. Resumen Ejecutivo

Phase 6 ("Automation Runtime") comienza con una base Clean Architecture sólida proveniente de las Phases 1–5, pero el motor de automatización está **incompleto en todas las capas**. Existen contratos de dominio, una tabla Supabase heredada de Phase 4, y un sistema legado Express+n8n totalmente funcional — pero las capas de aplicación, infraestructura y UI son stubs o están vacías. El AI Engine y las integraciones externas son **solo contratos sin ninguna implementación**.

**Estado general:** Andamiaje sólido. Motor sin motor.

---

## 2. Inventario de Componentes por Paquete

### 2.1 `packages/automation-engine` — INCOMPLETE

| Componente | Archivo | Estado | Clasificación |
|-----------|---------|--------|--------------|
| `AutomationDefinition` | `contracts/automation-definition.ts` | ✅ Definido | **reusable** |
| `AutomationTrigger` (schedule/webhook/event) | `contracts/automation-definition.ts` | ✅ Definido | **reusable** |
| `AutomationRun` | `contracts/automation-run.ts` | ✅ Definido | **reusable** |
| `AutomationRunStatus` (pending/running/success/failed/cancelled) | `contracts/automation-run.ts` | ✅ Definido | **reusable** |
| `WorkflowDispatcher` (interfaz) | `contracts/workflow-dispatcher.ts` | ✅ Interfaz definida | **reusable** |
| `RetryPolicy` + `computeDelay` + `DEFAULT_RETRY_POLICY` | `contracts/retry-policy.ts` | ✅ Implementado | **reusable** |
| `IdempotencyKey` + `idempotencyKey()` | `contracts/idempotency-key.ts` | ✅ Implementado | **reusable** |
| Adapter n8n (N8nWebhookDispatcher) | — | ❌ No existe | **missing** |
| AutomationRunRepository | — | ❌ No existe | **missing** |
| Scheduler / Cron registry | — | ❌ No existe | **missing** |
| Dead-letter handling | — | ❌ No existe | **missing** |
| Tests | — | ❌ Sin tests | **missing** |

**Comentarios críticos:**
- `AutomationRunStatus` usa `success` pero la DB ENUM usa `inactive/draft/archived`. Divergencia que debe resolverse en Phase 6A.
- El paquete no tiene ningún test.

### 2.2 `packages/ai-engine` — CONTRACTS ONLY

| Componente | Archivo | Estado | Clasificación |
|-----------|---------|--------|--------------|
| `AIProvider` (interfaz) | `contracts/ai-provider.ts` | ✅ Interfaz + tipos | **reusable** |
| `AgentDefinition` | `contracts/agent-definition.ts` | ✅ Definido | **reusable** |
| `SkillDefinition` | `contracts/skill-definition.ts` | ✅ Definido | **reusable** |
| `PromptReference` + `renderPrompt()` | `contracts/prompt-reference.ts` | ✅ Implementado | **reusable** |
| `TemplateDefinition` | `contracts/template-definition.ts` | ✅ Definido | **reusable** |
| `ClaudeAPIProvider` adapter | — | ❌ No existe | **missing** |
| Skill registry | — | ❌ No existe | **missing** |
| Agent orchestration loop | — | ❌ No existe | **missing** |
| Prompt versioning store | — | ❌ No existe | **missing** |
| Guardrails / PII filtering | — | ❌ No existe | **missing** |
| Token cost tracking | — | ❌ No existe | **missing** |
| Tests | — | ❌ Sin tests | **missing** |

**Nota:** Phase 6 (Automation Runtime) no requiere implementar el AI Engine completo. Solo se necesita la interfaz `AIProvider` si alguna automatización llama a IA. El AI Engine completo es scope de Phase 7+.

### 2.3 `packages/integrations` — CONTRACTS ONLY

| Componente | Archivo | Estado | Clasificación |
|-----------|---------|--------|--------------|
| `AdvertisingPlatformProvider` | `contracts/advertising-platform.provider.ts` | ✅ Interfaz | **reusable** |
| `MetricsProvider` | `contracts/metrics.provider.ts` | ✅ Interfaz | **reusable** |
| `EmailProvider` | `contracts/email.provider.ts` | ✅ Interfaz | **reusable** |
| `StorageProvider` | `contracts/storage.provider.ts` | ✅ Interfaz | **reusable** |
| Meta Ads SDK adapter | — | ❌ No existe | **missing** |
| Resend email adapter | — | ❌ No existe | **missing** |
| R2/S3 storage adapter | — | ❌ No existe | **missing** |
| Tests | — | ❌ Sin tests | **missing** |

### 2.4 `packages/domain` — PARCIALMENTE DEFINIDO

| Componente | Archivo | Estado | Clasificación |
|-----------|---------|--------|--------------|
| `Automation` entity | `entities/automation.ts` | ⚠️ Incompleto | **incomplete** |
| `AutomationId` branded type | `entities/automation.ts` | ✅ Correcto | **reusable** |
| `AutomationStatus` (active/paused/error/disabled) | `entities/automation.ts` | ⚠️ Diverge de DB | **incomplete** |
| `AutomationRepository` | `repositories/automation.repository.ts` | ⚠️ Solo 3 métodos | **incomplete** |
| `Agent` entity | `entities/agent.ts` | ✅ Definido | **reusable** |
| `AutomationExecution` entity | — | ❌ No existe | **missing** |
| `AutomationExecutionRepository` | — | ❌ No existe | **missing** |
| `AutomationTrigger` entity/value object | — | ❌ No existe en domain | **missing** |

**Divergencia crítica — `AutomationStatus`:**

| Capa | Valores | Fuente |
|------|---------|--------|
| `packages/domain` | `active \| paused \| error \| disabled` | `entities/automation.ts` |
| DB Supabase (Phase 4) | `active \| inactive \| draft \| archived` | `20260730150000_phase4_data_migration_targets.sql` |
| Legacy `agency-dashboard` | `active \| inactive \| draft \| unknown` | `schemas/automationSchemas.ts` |

Esta divergencia debe resolverse en Phase 6A antes de cualquier implementación.

**Ausencia crítica — `organization_id`:**  
La entidad `Automation` en domain NO tiene `organizationId`. Sin este campo, el repositorio no puede implementar aislamiento multi-tenant. Debe añadirse en Phase 6A.

### 2.5 `packages/application` — STUB

| Componente | Archivo | Estado | Clasificación |
|-----------|---------|--------|--------------|
| `listAutomations` use case | `use-cases/automations/list-automations.use-case.ts` | ✅ Implementado | **reusable** |
| `createAutomation` use case | — | ❌ No existe | **missing** |
| `activateAutomation` use case | — | ❌ No existe | **missing** |
| `pauseAutomation` use case | — | ❌ No existe | **missing** |
| `dispatchAutomation` use case | — | ❌ No existe | **missing** |
| `cancelExecution` use case | — | ❌ No existe | **missing** |
| `getExecutionHistory` use case | — | ❌ No existe | **missing** |
| `retryExecution` use case | — | ❌ No existe | **missing** |
| `EventBusPort` | `ports/event-bus.port.ts` | ✅ Definido | **reusable** |
| `LoggerPort` | `ports/logger.port.ts` | ✅ Definido | **reusable** |
| Tests de automations | — | ❌ Sin tests | **missing** |

### 2.6 `packages/infrastructure` — SIN ADAPTADORES DE AUTOMATIZACIÓN

| Componente | Archivo | Estado | Clasificación |
|-----------|---------|--------|--------------|
| `SupabaseAutomationRepository` | — | ❌ No existe | **missing** |
| `SupabaseAutomationExecutionRepository` | — | ❌ No existe | **missing** |
| `N8nWebhookDispatcher` | — | ❌ No existe | **missing** |
| `ConsoleLogger` | `logging/console.logger.ts` | ✅ Implementado | **reusable** |
| `InMemoryClientRepository` | `in-memory/...` | ✅ Existe | **reusable** |

### 2.7 `apps/web` — STUB

| Ruta | Estado | Nota |
|------|--------|------|
| `/automations` | `<UnderConstruction>` "Fase 8" | No implementada |
| `/reports` | `<UnderConstruction>` "Fase 9" | No implementada |
| `/campaigns` | `<UnderConstruction>` "Fase 7" | No implementada |
| Server Actions para automations | — | No existen |

---

## 3. Auditoría n8n

### 3.1 Infraestructura n8n

| Campo | Valor |
|-------|-------|
| Imagen Docker | `docker.n8n.io/n8nio/n8n:stable` |
| Contenedor | `bop-n8n` |
| Puerto | `127.0.0.1:5678:5678` (solo localhost) |
| Config file | `n8n-local/.env` |
| Comunicación con Express API | `host.docker.internal:3101` (solo Docker Desktop Windows/Mac) |
| Volúmenes | `n8n_data:/home/node/.n8n`, `./local-files:/files`, `../shared-data:/shared-data`, `../.agencia-ai:/agencia-ai:ro` |
| Autenticación API n8n | `X-N8N-API-KEY` header |

### 3.2 Workflows Activos

| ID | Nombre | Trigger | Schedule | Estado | Backup JSON |
|----|--------|---------|----------|--------|------------|
| W-01 | CORE - Escanear Clientes | Schedule + Manual | Cada minuto | Activo | ✅ |
| W-02 | META - Sincronizar Métricas - Legalink Colombia | Schedule + Manual | Diario 06:00 | Activo | ✅ |
| W-03 | META - Sincronizar Métricas - Magic Bungalow | Schedule + Manual | Diario 06:00 | Activo | ✅ |
| W-04 | ALERTAS - Enviar Correos Críticos | Schedule + Manual | Cada hora | Activo | ✅ |
| W-05 | REPORTES - Generar Reportes Mensuales | Schedule | Mensual | Activo | ❌ |
| W-06 | REPORTES - Generar Reportes Semanales | Schedule | Semanal | Activo | ❌ |
| W-07 | REPORTES - Enviar Reportes Mensuales | Schedule | Mensual | Activo | ❌ |

### 3.3 Problemas Detectados en n8n

| # | Problema | Severidad | Impacto |
|---|---------|-----------|---------|
| N-01 | `host.docker.internal:3101` solo funciona en Docker Desktop (Windows/Mac), no en Linux | Alta | Bloquea despliegue en servidor Linux |
| N-02 | Account ID de Meta (`act_XXXXXXXX`) hardcodeado en URLs de httpRequest | Alta | No escala con nuevos clientes |
| N-03 | Un workflow por cliente de Meta — no parametrizado | Alta | Con 10 clientes = 10 workflows duplicados |
| N-04 | Destinatario de email hardcodeado: `bopagencia@gmail.com` | Media | No usa la tabla de destinatarios por cliente |
| N-05 | Sin retry logic ante fallas de Meta Graph API | Media | Un fallo de red = datos perdidos para ese período |
| N-06 | W-01 ejecuta cada minuto sin detectar cambios | Baja | CPU waste pero sin impacto funcional |
| N-07 | W-05, W-06, W-07 no tienen backup JSON en repositorio | Media | Si n8n se reinicia, se pierden |
| N-08 | Sin deduplicación en alertas — misma alerta puede enviarse dos veces | Media | Spam de emails |
| N-09 | Credenciales Meta y Gmail solo en vault interno de n8n | Alta | Si n8n se borra, se pierden tokens |
| N-10 | `N8N_ENCRYPTION_KEY` en `n8n-local/.env` — riesgo si estuvo en git | Crítica | Tokens cifrados en vault podrían descifrarse |

### 3.4 Endpoints que n8n Consume de la Express API Local

```
GET  http://host.docker.internal:3101/api/alerts/notifications/pending
POST http://host.docker.internal:3101/api/alerts/notifications/{alertId}/attempt
POST http://host.docker.internal:3101/api/alerts/notifications/{alertId}/sent
POST http://host.docker.internal:3101/api/alerts/notifications/{alertId}/failed
POST http://host.docker.internal:3101/api/automations/{automationId}/executions
```

Todos protegidos con `Authorization: Bearer {API_KEY}` usando comparación con timing-safe.

---

## 4. Auditoría del Sistema Legado (agency-dashboard)

El `agency-dashboard/` es una aplicación Vite + Express que implementa el sistema completo de automatizaciones de forma local, con persistencia en archivos JSON (`shared-data/`). Está **en producción actualmente** para la operación de la agencia.

### 4.1 Servicios del servidor Express (`agency-dashboard/server/`)

| Servicio | Archivo | Función | Calidad |
|---------|---------|---------|---------|
| `automationService.ts` | 7 automatizaciones en registry JSON | CRUD + health dinámico + historial de ejecuciones | ✅ Buena — atomic writes, validación Zod, path traversal check |
| `n8nMonitorService.ts` | Monitor de estado de n8n | healthz, API auth check, last execution | ✅ Buena — fetchWithTimeout, códigos de error tipados |
| `alertNotificationService.ts` | Cola de notificaciones de alertas | pending/sent/failed states, hash de contenido, retry con backoff | ✅ Buena — limpieza de secretos en metadata |
| `alertsService.ts` | Resumen de alertas del filesystem | Lista + filtros | Funcional |
| `alertStateService.ts` | PATCH de estados de alerta | review/snooze/resolve/reopen | Funcional |
| `metricsService.ts` | Lectura de métricas desde JSON | Por cliente, por período | Funcional |
| `reportService.ts` | Generación de reportes | JSON → Markdown/HTML | Funcional |
| `reportDeliveryService.ts` | Cola de entrega de reportes | pending/sent/failed, igual a notifications | Funcional |
| `reportRecipientsService.ts` | Configuración de destinatarios | Por cliente | Funcional |

### 4.2 Estado de Datos en `shared-data/`

| Path | Descripción | Clientes |
|------|-------------|---------|
| `shared-data/clients-index.json` | Índice maestro de clientes | magic-bungalow, legalink-col |
| `shared-data/automations/automations-registry.json` | Registro de 7 automatizaciones | — |
| `shared-data/automations/executions/*.json` | Historial de ejecuciones por automation | 7 archivos |
| `shared-data/metrics/clients/*/periods/*.json` | Métricas por cliente y período | 2026-06, 2026-07 |
| `shared-data/alerts/alert-state.json` | Estados de alertas | — |
| `shared-data/alerts/notification-state.json` | Estado de notificaciones | — |
| `shared-data/reports/clients/*/` | Reportes generados | weekly, monthly |

### 4.3 Lógica Reutilizable del Legado (para extraer a Phase 6)

| Lógica | Ubicación | Qué reutilizar |
|--------|-----------|----------------|
| Cálculo dinámico de health por schedule type | `automationService.ts:computeAutomationHealth()` | Algoritmo de `warning/healthy` según tiempo desde última ejecución |
| Atomic file write | `automationService.ts:writeJsonAtomic()` | Patrón `.tmp` + rename — adaptar a Supabase upsert |
| Limpieza de secretos en metadata | `automationService.ts:registerExecution()` | Filtro de keys sospechosas antes de persistir |
| Hash de contenido de alerta | `alertNotificationService.ts:generateContentHash()` | SHA-256 para deduplicación — reutilizar para idempotencia |
| Retry con backoff de 30 min | `alertNotificationService.ts:getPendingNotifications()` | Lógica de reintentos automáticos |
| Schema Zod de automatizaciones | `schemas/automationSchemas.ts` | `AutomationSchema`, `ExecutionSchema` — adaptar |

---

## 5. Auditoría de la Base de Datos (Supabase)

### 5.1 Tabla `public.automations` (Phase 4)

La tabla existe con la siguiente estructura relevante:

```sql
CREATE TABLE IF NOT EXISTS public.automations (
  id               uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid      NOT NULL REFERENCES organizations(id),
  client_id        uuid      REFERENCES clients(id),
  name             text      NOT NULL,
  description      text,
  status           public.automation_status NOT NULL DEFAULT 'inactive',
  schedule         jsonb     NOT NULL DEFAULT '{}',
  legacy_id        text,
  legacy_path      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE public.automation_status AS ENUM ('active', 'inactive', 'draft', 'archived');
```

**Índices:** org_id, client_id, status, (org_id, client_id, status)  
**RLS:** Habilitado — `authenticated` tiene SELECT/INSERT/UPDATE  
**Política:** El organization_id del JWT controla acceso (patrón Phase 4)

### 5.2 Tablas de Automatización AUSENTES en Supabase

| Tabla | Necesaria para | Acción en Phase 6 |
|-------|--------------|------------------|
| `automation_executions` | Historial de ejecuciones, retries | Crear en Phase 6B |
| `automation_execution_logs` | Logs por línea de ejecución | Crear en Phase 6B |
| `automation_triggers` | Configuración de triggers desacoplada | Evaluar (puede ser JSONB en automations) |
| `automation_secrets_metadata` | Referencias a Supabase Vault sin exponer tokens | Crear en Phase 6B |
| `automation_webhook_events` | Registro de webhooks entrantes (deduplication) | Crear en Phase 6B |

### 5.3 Enum Mismatch — Resolución Propuesta

El status actual en DB es `active|inactive|draft|archived`. El dominio propone `active|paused|error|disabled`.

**Decisión propuesta:** Extender el ENUM de Supabase para incluir `paused` y `error`, y deprecar `disabled` → usar `archived`. Ver Phase 6A para la migración concreta.

---

## 6. Auditoría de Variables de Entorno

### 6.1 Variables actuales (`apps/web/.env.local` — redactado)

| Variable | Propósito | Disponible |
|----------|-----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública de Supabase | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anon Supabase | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo server-side | ✅ |
| `NEXT_PUBLIC_APP_URL` | URL base | ✅ |

### 6.2 Variables necesarias para Phase 6 (no existen aún)

| Variable | Propósito | Capa |
|----------|-----------|------|
| `N8N_WEBHOOK_BASE_URL` | URL base para disparar webhooks n8n | Server only |
| `N8N_API_KEY` | Autenticación con API de n8n | Server only |
| `AUTOMATION_WEBHOOK_SECRET` | HMAC para verificar webhooks entrantes de n8n | Server only |
| `META_ADS_APP_ID` | App ID de Meta | Server only |
| `RESEND_API_KEY` | Proveedor de email | Server only (Phase 6F) |

---

## 7. TODOs y FIXMEs Relevantes

| Archivo | Nota | Impacto en Phase 6 |
|---------|------|------------------|
| `automation-engine/README.md` | "N8nWebhookDispatcher adapter in @bop-agency/infrastructure — Fase 2+" | Implementar en Phase 6C |
| `ai-engine/README.md` | "ClaudeAPIProvider adapter — Fase 2+" | No en Phase 6 scope |
| `apps/web/automations/page.tsx` | `<UnderConstruction availableIn="Fase 8">` | Reemplazar en Phase 6E |
| `domain/repositories/automation.repository.ts` | Falta `create`, `delete`, `findByOrg` con paginación | Corregir en Phase 6A |
| `application/use-cases/automations/` | Solo `listAutomations` — faltan 7 use cases críticos | Implementar en Phase 6A |

---

## 8. Clasificación Final de Componentes

### Reutilizables (sin cambios o mínimos)
- `AutomationDefinition`, `AutomationTrigger`, `WorkflowDispatcher` (interfaz)
- `AutomationRun`, `AutomationRunStatus` (contratos)
- `RetryPolicy`, `DEFAULT_RETRY_POLICY`, `computeDelay`
- `IdempotencyKey`, `idempotencyKey()`
- `AIProvider`, `EmailProvider`, `AdvertisingPlatformProvider` (interfaces)
- `EventBusPort`, `LoggerPort`
- `ConsoleLogger`
- `renderPrompt()`
- `listAutomations` use case
- Algoritmos: `computeAutomationHealth`, hash SHA-256, retry backoff (del legado)
- Tabla `public.automations` (con extensión de ENUM)

### Incompletos (requieren modificación)
- `Automation` domain entity — falta `organizationId`, `organizationId` obligatorio
- `AutomationRepository` — faltan `create`, `delete`, `listByOrganization`
- `AutomationStatus` en domain — diverge de DB
- `packages/automation-engine` — solo contratos, necesita adapter n8n

### Faltantes (crear desde cero)
- `AutomationExecution` entity + `AutomationExecutionRepository`
- `SupabaseAutomationRepository`
- `SupabaseAutomationExecutionRepository`
- `N8nWebhookDispatcher` adapter
- Use cases: create, activate, pause, dispatch, cancel, retry, getHistory
- Tablas: `automation_executions`, `automation_execution_logs`, `automation_webhook_events`, `automation_secrets_metadata`
- `/automations` UI completa con listado, detalle, logs, reintentos
- Server Actions para dispatch/cancel/retry
- Webhook route (`/api/webhooks/n8n`) para recibir callbacks de ejecución

### Deprecated (no migrar)
- `agency-dashboard/` como fuente de verdad — reemplazar con Supabase
- Filesystem persistence (`shared-data/automations/`) — migrar a Supabase
- W-01 (CORE - Escanear Clientes) — se elimina, Supabase es el índice
- `host.docker.internal:3101` como endpoint — se elimina con el nuevo stack

### Riesgosos
- W-05, W-06, W-07 sin backup JSON — riesgo de pérdida antes de migración
- `N8N_ENCRYPTION_KEY` en `.env` sin confirmar si estuvo en git
- Credenciales Meta tokens solo en vault de n8n
