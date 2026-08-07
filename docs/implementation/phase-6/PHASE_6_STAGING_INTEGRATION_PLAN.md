# Phase 6 — Staging Integration Plan

> **Estado:** PREPARADO — pendiente ejecución manual
> **Branch:** `feat/phase-6-automation-runtime`
> **Fecha de preparación:** 2026-08-05
> **Restricción:** NO aplicar a producción. NO hacer commit automático. NO activar workflows.

---

## 1. Objetivo

Validar el runtime completo de Phase 6 (automatizaciones + n8n + Supabase) en un entorno de staging aislado antes de cualquier acción en producción.

## 2. Prerrequisitos

### 2.1 Repositorio

| Check | Estado |
|-------|--------|
| Branch `feat/phase-6-automation-runtime` | ✅ CONFIRMED |
| Working tree clean | ✅ CONFIRMED |
| Commit de cierre Phase 6 presente (`d14158e`) | ✅ CONFIRMED |
| `.env.local` no trackeado en git | ✅ CONFIRMED |
| `test-results`, `playwright-report`, `.next` no trackeados | ✅ CONFIRMED |

### 2.2 Entornos requeridos

| Recurso | Estado detectado |
|---------|-----------------|
| Supabase staging (proyecto separado) | ⚠️ **MANUAL ACTION REQUIRED** — Ver §3 |
| n8n staging | ⚠️ **MANUAL ACTION REQUIRED** — Ver §4 |
| Variables de entorno staging completas | ⚠️ **MANUAL ACTION REQUIRED** — Ver §5 |

---

## 3. Supabase Staging

### 3.1 Estado detectado

**ESTADO: C — UNKNOWN — MANUAL CONFIRMATION REQUIRED**

El repositorio contiene:
- `supabase/config.toml` configurado para **local** (`http://127.0.0.1:54321`)
- `apps/web/.env.local` con credenciales enmascaradas (no se puede determinar si apunta a local o a cloud)
- No se detectó proyecto Supabase cloud separado para staging en el repositorio

**Acción requerida:** El responsable debe confirmar cuál de los siguientes aplica:
- A. Existe un proyecto Supabase cloud etiquetado como "staging" con project ref diferente al de producción
- B. Solo existe el proyecto de producción (en este caso NO aplicar migración hasta crear uno)
- C. Se usa Supabase local (`supabase start`) como staging

### 3.2 Identificación del proyecto (sin exponer claves)

Para confirmar a qué proyecto apunta el entorno actual:
```bash
# Verificar project ref sin exponer keys
supabase projects list
# Identificar el ref del proyecto staging (distinto al de producción)
```

Para verificar conectividad desde CLI:
```bash
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db remote changes
```

### 3.3 Verificación de tablas base (Phase 2–5)

Ejecutar contra staging solo para verificar — no modificar:
```sql
-- Verificar precondiciones de Phase 6B
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'organizations', 'users', 'organization_members',
    'automations', 'clients'
  )
ORDER BY table_name;

-- Verificar enum automation_status existente
SELECT unnest(enum_range(NULL::public.automation_status))::text AS value;
-- Expected antes de 6B: active, paused, error, disabled, inactive (o subconjunto)
```

### 3.4 Verificación de migración Phase 6B (pre-aplicación)

```sql
-- ¿Ya fue aplicada?
SELECT version FROM supabase_migrations.schema_migrations
WHERE version = '20260804000000';
-- Si retorna fila: ya aplicada
-- Si retorna vacío: pendiente de aplicar
```

---

## 4. n8n Staging

### 4.1 Estado detectado

**ESTADO: B — LOCAL N8N ONLY**

El repositorio contiene `n8n-local/` con `docker-compose.yml` apuntando a imagen `docker.n8n.io/n8nio/n8n:stable`. No se detectó instancia staging separada ni URL `https://n8n.*.com` configurada.

El runbook (`PHASE_6_N8N_INTEGRATION_RUNBOOK.md`) documenta:
- Local: `http://localhost:5678`
- Producción: `https://n8n.bopagency.com` (comentado)

**Acción requerida:** Definir la instancia n8n a usar para staging smoke tests:
- Opción A: Levantar `n8n-local/` con `docker compose up` y usarla como staging
- Opción B: Crear instancia cloud n8n separada para staging
- Opción C: Usar la instancia de producción en modo read-only (NO RECOMENDADO — riesgo de contaminar workflows productivos)

### 4.2 Levantamiento local (Opción A — mínimo riesgo)

```bash
cd n8n-local
# Verificar que .env tiene WEBHOOK_URL apuntando al callback de staging
# Ejemplo seguro con placeholder:
# WEBHOOK_URL=http://localhost:3200
docker compose up -d
# Verificar salud
curl http://localhost:5678/healthz
```

---

## 5. Variables de Entorno

### 5.1 Tabla maestra

| Variable | Local | Staging | Producción | Ubicación | Sensible | Origen |
|----------|-------|---------|------------|-----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | ✅ | Cliente | No | Supabase Dashboard > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | ✅ | Cliente | No* | Supabase Dashboard > API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | ✅ | Solo servidor | **SÍ** | Supabase Dashboard > API |
| `N8N_BASE_URL` | ✅ | ✅ | ✅ | Solo servidor | No | Config n8n |
| `AUTOMATION_WEBHOOK_SECRET` | ✅ | ✅ | ✅ | Solo servidor | **SÍ** | `openssl rand -hex 32` |
| `N8N_API_KEY` | Opcional | Opcional | Opcional | Solo servidor | **SÍ** | n8n Settings > API |
| `N8N_DISPATCH_TIMEOUT_MS` | Opcional | Opcional | Opcional | Solo servidor | No | Config |
| `AUTOMATION_WEBHOOK_TOLERANCE_SECONDS` | Opcional | Opcional | Opcional | Solo servidor | No | Config |
| `NEXT_PUBLIC_APP_URL` | ✅ | ✅ | ✅ | Cliente | No | Config |
| `NODE_ENV` | ✅ | ✅ | ✅ | Build | No | Config |
| `E2E_TEST_EMAIL` | E2E | E2E | ❌ | Solo servidor | Parcial | Cuenta de prueba staging |
| `E2E_TEST_PASSWORD` | E2E | E2E | ❌ | Solo servidor | **SÍ** | Cuenta de prueba staging |
| `E2E_BASE_URL` | Opcional | E2E | ❌ | Solo servidor | No | Config |

> (*) `NEXT_PUBLIC_SUPABASE_ANON_KEY` es pública por diseño — la protección real es RLS.
> ⚠️ NUNCA usar prefijo `NEXT_PUBLIC_` para `SERVICE_ROLE_KEY`, `WEBHOOK_SECRET`, ni `N8N_API_KEY`.

### 5.2 Variables faltantes en .env.example

Las siguientes variables son usadas en código pero no están documentadas en `apps/web/.env.example`. Deben añadirse:

```bash
# Agregar a apps/web/.env.example
N8N_BASE_URL=http://localhost:5678
AUTOMATION_WEBHOOK_SECRET=generate-with-openssl-rand-hex-32
N8N_API_KEY=your-n8n-api-key-here
N8N_DISPATCH_TIMEOUT_MS=10000
AUTOMATION_WEBHOOK_TOLERANCE_SECONDS=300
E2E_TEST_EMAIL=test-staging@example.com
E2E_TEST_PASSWORD=change-me-staging-only
E2E_BASE_URL=http://localhost:3200
```

### 5.3 Archivo .env.staging (NO commitear)

Crear localmente en `apps/web/.env.staging` (gitignoreado):
```bash
# Staging — no commitear
NEXT_PUBLIC_SUPABASE_URL=https://<STAGING_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>
N8N_BASE_URL=http://localhost:5678
AUTOMATION_WEBHOOK_SECRET=<generated-separately>
NEXT_PUBLIC_APP_URL=http://localhost:3200
E2E_TEST_EMAIL=staging-test@bopagency.com
E2E_TEST_PASSWORD=<staging-only-password>
```

---

## 6. Migración Phase 6B — Plan de Aplicación

> **STOP: No ejecutar hasta confirmar que el proyecto objetivo es STAGING.**

### 6.1 Migración identificada

```
Archivo: supabase/migrations/20260804000000_phase6b_automation_runtime.sql
Versión:  20260804000000
```

### 6.2 Tablas afectadas

| Operación | Objeto |
|-----------|--------|
| ALTER TYPE | `public.automation_status` — añade `draft`, `archived` |
| UPDATE | `public.automations` — migra `inactive` → `paused` |
| ALTER TABLE | `public.automations` — añade 6 columnas |
| CREATE TABLE | `public.automation_executions` |
| CREATE TABLE | `public.automation_execution_logs` |
| CREATE TABLE | `public.automation_webhook_events` |
| CREATE TABLE | `public.automation_secrets_metadata` |
| CREATE POLICY | 7 políticas RLS |
| CREATE INDEX | 15 índices |
| CREATE TRIGGER | 3 triggers `set_updated_at` |

### 6.3 Comandos de aplicación (staging únicamente)

**Paso 1 — Backup previo:**
```bash
# Schema
supabase db dump --linked --schema-only > backup-staging-schema-$(date +%Y%m%d).sql
# Datos relevantes
supabase db dump --linked --data-only --table automations > backup-staging-automations-$(date +%Y%m%d).sql
```

**Paso 2 — Verificar migration version actual:**
```bash
supabase migration list --linked
```

**Paso 3 — Dry-run (revisar diff):**
```bash
supabase db diff --linked --schema public
```

**Paso 4 — Aplicar migración:**
```bash
# Solo ejecutar después de confirmar proyecto es STAGING
supabase db push --linked
# O usando migration file directamente:
supabase migration up --linked
```

**Paso 5 — Verificar resultado:**
```sql
-- Confirmar tablas creadas
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'automation_executions','automation_execution_logs',
    'automation_webhook_events','automation_secrets_metadata'
  );

-- Confirmar enum actualizado
SELECT unnest(enum_range(NULL::public.automation_status))::text;
-- Expected: active, paused, error, disabled, inactive, draft, archived

-- Confirmar RLS activo
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'automation_executions','automation_execution_logs',
    'automation_webhook_events','automation_secrets_metadata'
  );
```

**Paso 6 — Rollback si falla:**
```sql
-- En orden inverso (ver sección DOWN en migración)
DROP TABLE IF EXISTS public.automation_secrets_metadata CASCADE;
DROP TABLE IF EXISTS public.automation_webhook_events CASCADE;
DROP TABLE IF EXISTS public.automation_execution_logs CASCADE;
DROP TABLE IF EXISTS public.automation_executions CASCADE;

ALTER TABLE public.automations
  DROP COLUMN IF EXISTS trigger_config,
  DROP COLUMN IF EXISTS retry_policy,
  DROP COLUMN IF EXISTS n8n_workflow_id,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS is_manual_only,
  DROP COLUMN IF EXISTS last_executed_at;

-- NOTA: 'draft' y 'archived' no pueden eliminarse del enum en PostgreSQL sin recrear el tipo.
-- Documentar como incompatibilidad de rollback de enum.
```

---

## 7. Regeneración de Tipos TypeScript

> Ejecutar solo DESPUÉS de aplicar la migración en staging.

```bash
# Generar tipos desde staging
supabase gen types typescript --linked > apps/web/src/lib/supabase/database.types.ts

# Verificar diff
git diff apps/web/src/lib/supabase/database.types.ts
```

### 7.1 Verificaciones post-generación

```bash
# Confirmar que automation_status incluye los 4 valores del dominio Phase 6A
grep -A 5 'automation_status' apps/web/src/lib/supabase/database.types.ts
# Expected: draft | active | paused | archived (además de legacy: error | disabled | inactive)

# Confirmar tablas Phase 6B presentes
grep -E 'automation_executions|automation_execution_logs|automation_webhook_events|automation_secrets_metadata' \
  apps/web/src/lib/supabase/database.types.ts
```

---

## 8. Callback URL — Verificación

### 8.1 Ruta

```
POST /api/webhooks/n8n
```

### 8.2 Headers requeridos (entrantes desde n8n)

| Header | Tipo | Descripción |
|--------|------|-------------|
| `x-bop-timestamp` | string | Unix seconds — ventana ±300s (configurable) |
| `x-bop-signature` | string | hex HMAC-SHA256 sobre `timestamp.rawBody` |
| `x-bop-event-id` | string | UUID único del evento — idempotencia |
| `Content-Type` | `application/json` | Requerido |

### 8.3 Flujo de seguridad (orden obligatorio)

1. Leer raw body (antes de parsear)
2. Verificar `x-bop-event-id` presente
3. Verificar `x-bop-timestamp` dentro de tolerancia
4. Verificar `x-bop-signature` HMAC (constant-time)
5. **Solo después del HMAC** → crear cliente Supabase service_role
6. Deduplicar via `automation_webhook_events` (atomic insert)
7. Validar payload Zod
8. Actualizar `automation_executions`
9. Insertar `automation_execution_logs` (sanitizado)
10. Responder `{"ok": true}`

### 8.4 Ejemplo de body (placeholders)

```json
{
  "eventType": "execution.succeeded",
  "executionId": "00000000-0000-0000-0000-000000000001",
  "automationId": "00000000-0000-0000-0000-000000000002",
  "organizationId": "00000000-0000-0000-0000-000000000003",
  "timestamp": "2026-08-05T00:00:00.000Z"
}
```

### 8.5 Respuestas esperadas

| Escenario | HTTP | Body |
|-----------|------|------|
| Éxito | 200 | `{"ok": true}` |
| Firma inválida | 401 | `{"ok": false}` |
| Timestamp vencido | 401 | `{"ok": false}` |
| Evento duplicado | 200 | `{"ok": true, "deduplicated": true}` |
| Payload inválido | 400 | `{"ok": false}` |
| Error interno | 500 | `{"ok": false}` |

---

## 9. HMAC — Procedimiento de Generación

> **CRÍTICO: No generar ni imprimir el secreto en este documento ni en ninguna salida de Claude.**

### 9.1 Generación (ejecutar localmente por el responsable)

```bash
# Generar secreto fuerte — mínimo 32 bytes
openssl rand -hex 32
# Alternativa Node.js
node -e "require('crypto').randomBytes(32).toString('hex')|0 && console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 9.2 Almacenamiento

- Guardar en secret manager del entorno staging (ej. Supabase Vault, o variable de entorno del hosting)
- Configurar el mismo valor en:
  - `AUTOMATION_WEBHOOK_SECRET` en `apps/web/.env.staging`
  - Variable de entorno de n8n (en el workflow que recibe/envía callbacks)
- **Nunca** guardar en código, commits, o documentación
- **Diferente** por entorno (local ≠ staging ≠ producción)

### 9.3 Rotación

- Rotar cada 90 días como mínimo
- Rotar inmediatamente si hay sospecha de exposición
- Procedimiento: generar nuevo → actualizar staging → actualizar n8n → verificar smoke test → desactivar viejo

---

## 10. n8n Workflow de Prueba — Especificación

> Diseñado exclusivamente para staging. NO usar en producción.

### 10.1 Campos de entrada esperados

```json
{
  "executionId": "uuid-staging",
  "automationId": "uuid-staging",
  "organizationId": "uuid-staging",
  "idempotencyKey": "staging:manual:2026-08-05:1",
  "callbackUrl": "http://localhost:3200/api/webhooks/n8n",
  "triggerType": "manual",
  "metadata": {
    "environment": "staging",
    "testVariant": "success"
  }
}
```

### 10.2 Comportamiento del workflow

```
1. Webhook Trigger — recibir dispatch
2. Validar campos mínimos (executionId, organizationId, callbackUrl)
3. Responder HTTP 200 al dispatch (aceptación)
4. HTTP Request → callbackUrl con evento "execution.running"
5. Wait 2 segundos (simula procesamiento)
6. HTTP Request → callbackUrl con evento "execution.succeeded" | "execution.failed"
```

### 10.3 Variantes de prueba

| Variante | Acción en workflow | Evento final |
|----------|-------------------|--------------|
| `success` | Completar normalmente | `execution.succeeded` |
| `failed` | Retornar error controlado | `execution.failed` |
| `timeout` | Wait > 10s (supera N8N_DISPATCH_TIMEOUT_MS) | No callback |
| `duplicate` | Enviar mismo eventId dos veces | Segundo debe ser deduplicado |

### 10.4 Restricciones del workflow

- Sin datos de clientes reales
- Sin credenciales reales en nodos
- Sin payload productivo
- Sin PII
- Identificable como `staging-test-workflow`

---

## 11. Plan de Despliegue Staging (secuencia manual)

```
[1] Confirmar proyecto Supabase staging ← MANUAL
[2] Confirmar instancia n8n staging     ← MANUAL
[3] Generar AUTOMATION_WEBHOOK_SECRET   ← MANUAL (openssl fuera del repo)
[4] Configurar .env.staging             ← MANUAL
[5] Backup de staging                   ← MANUAL (supabase db dump)
[6] Aplicar migración 20260804000000    ← MANUAL (supabase db push)
[7] Verificar tablas y RLS              ← MANUAL (queries §6.3)
[8] Regenerar tipos TypeScript          ← MANUAL (supabase gen types)
[9] Importar workflow de prueba en n8n  ← MANUAL
[10] Configurar HMAC en n8n             ← MANUAL
[11] Ejecutar smoke test matrix         ← MANUAL + E2E
[12] Revisar logs y observabilidad      ← MANUAL
[13] Certificar Go/No-Go producción     ← MANUAL
```

---

## 12. Riesgos y Blockers

| ID | Riesgo | Impacto | Mitigación |
|----|--------|---------|------------|
| R1 | No existe proyecto Supabase staging | BLOCKER | Crear proyecto antes de continuar |
| R2 | `draft`/`archived` en enum no reversibles sin recrear tipo | Alto | Documentar antes de aplicar |
| R3 | n8n local usa `host.docker.internal` que no funciona en Linux | Alto | Usar `localhost` o IP directa en Linux |
| R4 | HMAC secret diferente en web y n8n | Alto | Verificar antes de primer dispatch |
| R5 | Migración aplicada en producción por error | Crítico | Confirmar project ref antes de cada comando |
| R6 | `next build` falla en Linux sandbox (Bus error) | Bajo | El build PASS fue verificado en Windows local |

---

*Documento preparado para Phase 6 Staging. No ejecutar hasta tener confirmación explícita de entorno staging.*
