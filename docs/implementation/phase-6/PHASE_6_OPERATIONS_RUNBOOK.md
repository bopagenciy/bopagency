# Phase 6 — Operations & Deployment Runbook
**Versión:** 1.0 — 2026-08-05
**Propósito:** Operaciones day-2 y procedimiento de deployment para Phase 6.

---

## Parte A — Deployment Runbook

### Requisitos previos

- [ ] Rama `feat/phase-6-automation-runtime` aprobada para merge
- [ ] Staging environment disponible con Supabase apuntando a DB de staging
- [ ] Credenciales de n8n de staging disponibles
- [ ] Backup de DB de producción realizado (paso 1)

### Orden de Deployment

#### Paso 1 — Backup de base de datos

```bash
# En Supabase: Settings → Backups → Create backup
# O via pg_dump:
pg_dump "postgresql://postgres:<password>@<host>:5432/postgres" \
  --schema=public \
  -f backup_pre_phase6_$(date +%Y%m%d_%H%M%S).sql
```

Verificar que el backup es legible antes de continuar.

#### Paso 2 — Verificar variables de entorno

Confirmar que todas estas variables están configuradas:

```bash
# Obligatorias
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AUTOMATION_WEBHOOK_SECRET=        # mínimo 64 chars hex
N8N_BASE_URL=                     # sin trailing slash
NEXT_PUBLIC_APP_URL=              # URL pública de la app

# Opcionales (con defaults seguros)
N8N_DISPATCH_TIMEOUT_MS=10000
AUTOMATION_WEBHOOK_TOLERANCE_SECONDS=300
N8N_API_KEY=                      # para cancelación remota
```

#### Paso 3 — Aplicar migración en STAGING

```bash
# Via Supabase CLI
npx supabase db push --project-ref <STAGING_PROJECT_REF>
# O aplicar manualmente en Supabase Studio (SQL Editor):
# Pegar contenido de: supabase/migrations/20260804000000_phase6b_automation_runtime.sql
```

Verificar:
```sql
-- En Supabase Studio (staging)
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'automation_executions',
    'automation_execution_logs',
    'automation_webhook_events',
    'automation_secrets_metadata'
  );
-- Debe devolver 4 filas
```

#### Paso 4 — Regenerar tipos Supabase (staging)

```bash
npx supabase gen types typescript \
  --project-id <STAGING_PROJECT_REF> \
  --schema public \
  > apps/web/src/lib/supabase/database.types.ts

# Verificar que los tipos generados incluyen las nuevas tablas
grep "automation_executions\|automation_execution_logs" \
  apps/web/src/lib/supabase/database.types.ts
```

Si los tipos difieren significativamente de los manuales actuales,
revisar y ajustar antes de continuar.

#### Paso 5 — Deploy de la web app

```bash
# Build local primero
npm run typecheck
npm run lint
npm run build --workspace=@bop-agency/web

# Si todo pasa, hacer deploy a staging
# (proceso específico de la plataforma: Vercel/Railway/etc.)
```

#### Paso 6 — Configurar n8n (staging) — URL base y webhook path

En el panel de n8n:
1. Ir a Settings → Environment Variables
2. Añadir `AUTOMATION_WEBHOOK_SECRET` con el MISMO valor que `AUTOMATION_WEBHOOK_SECRET` en Next.js (mismo nombre de variable en ambos lados; no existe una variable "callback base url" en el código real)
3. Verificar que los workflows de staging apuntan a la URL correcta

#### Paso 7 — Configurar secreto HMAC (staging)

Verificar que `AUTOMATION_WEBHOOK_SECRET` en Next.js (staging) es
exactamente igual a `AUTOMATION_WEBHOOK_SECRET` en n8n (staging).

#### Paso 8 — Smoke test: cargar página de automations

```bash
# Abrir en navegador (staging):
# https://staging.bopagencia.com/automations
```

- [ ] La página carga sin errores 500
- [ ] La tabla de automatizaciones muestra datos (o estado vacío)
- [ ] Los badges de estado son visibles
- [ ] No hay errores en la consola del navegador

#### Paso 9 — Validar endpoint de webhook

```bash
# Test básico: POST sin firma → debe retornar 401
curl -X POST https://staging.bopagencia.com/api/webhooks/n8n \
  -H "Content-Type: application/json" \
  -d '{"test": true}' \
  -w "\nHTTP Status: %{http_code}\n"
# Esperado: 401 Unauthorized
```

#### Paso 10 — Validar RLS con usuario viewer

1. Crear sesión con usuario que tiene rol `viewer` en una organización de staging
2. Intentar llamar `startExecutionAction` desde la UI
3. Verificar que retorna error de permisos (403/FORBIDDEN)
4. Intentar acceder directamente a `automation_webhook_events` desde el cliente
5. Verificar que devuelve 0 filas (RLS bloquea acceso)

#### Paso 11 — Validar alertas creadas en fallo

1. Crear una automatización en staging con un `n8n_workflow_id` inválido
2. Intentar ejecutarla (dispatch fallará)
3. Verificar que se crea una alerta en el dashboard con tipo `dispatch_failed`
4. Verificar que se crea una tarea manual si corresponde

#### Paso 12 — Monitorear staging durante 24h

Observar:
- Frecuencia de errores en `/api/webhooks/n8n`
- Alertas de automatización creadas vs resueltas
- Tiempo de respuesta del dispatch
- Errores de timeout

#### Paso 13 — Go/No-Go para producción

**Criterios de Go:**
- [ ] Smoke tests pasaron
- [ ] Sin errores 500 en las últimas 2 horas de staging
- [ ] RLS validado
- [ ] Alertas funcionan correctamente
- [ ] n8n integration smoke test exitoso

**Criterios de No-Go:**
- [ ] Cualquier fallo de seguridad (HMAC bypass, RLS bypass)
- [ ] Errores 500 sistemáticos
- [ ] Dispatch timeout > 5% de intentos
- [ ] Tipos de Supabase inconsistentes

#### Paso 14 — Aplicar migración en PRODUCCIÓN

Solo si el Go/No-Go es positivo:

```bash
npx supabase db push --project-ref <PRODUCTION_PROJECT_REF>
```

Y repetir pasos 5-12 para producción.

---

## Parte B — Operaciones Day-2

### Indicadores de Monitoreo

| Indicador | Fuente | Umbral de alerta |
|-----------|--------|-----------------|
| Tasa de error webhook (4xx/5xx) | Logs servidor | > 5% en 15min |
| Dispatch timeout rate | Logs [n8n/dispatch] | > 10% en 30min |
| Ejecuciones stuck (queued > 30min) | DB | > 5 ejecuciones |
| Alertas activas sin reconocer | Dashboard | > 10 alertas críticas |
| Tiempo promedio de ejecución | automation_execution_logs | Depende del workflow |

### Triage de Alertas

#### Alerta: `dispatch-failed`

**Síntoma:** n8n no recibió el webhook de dispatch.

1. Verificar que `N8N_BASE_URL` es accesible desde el servidor de Next.js
2. Revisar logs del servidor: `[n8n/dispatch]`
3. Verificar que n8n está operativo (panel de n8n)
4. Si es timeout: verificar `N8N_DISPATCH_TIMEOUT_MS` y rendimiento de n8n
5. Si es error de red: verificar firewall/VPC entre Next.js y n8n

```sql
-- Ejecuciones recientes con error de dispatch
SELECT id, automation_id, status, error_code, queued_at
FROM public.automation_executions
WHERE error_code = 'DISPATCH_FAILED'
  AND queued_at > NOW() - INTERVAL '1 hour'
ORDER BY queued_at DESC;
```

#### Alerta: `execution-failed`

**Síntoma:** Una o más ejecuciones de automatización fallaron.

1. Ver `error_code` en la alerta para identificar el tipo
2. Abrir el detalle de la ejecución en `/automations/executions/[id]`
3. Revisar el timeline de logs de ejecución
4. Si es fallo de negocio: revisar la configuración del workflow en n8n
5. Si es fallo de infraestructura: ver logs de n8n

Para reintentar:
```
1. Ir a /automations/executions/[id]
2. Hacer clic en "Reintentar"
3. (Si la política de reintento lo permite — maxAttempts no alcanzado)
```

#### Alerta: `max-attempts`

**Síntoma:** Se agotaron todos los intentos de reintento.

Esta alerta NO se resuelve automáticamente.
Requiere intervención manual:

1. Revisar logs de la última ejecución
2. Identificar la causa raíz del fallo recurrente
3. Corregir la causa (configuración n8n, datos de entrada, etc.)
4. Resolver la alerta manualmente desde el dashboard
5. Iniciar una nueva ejecución manual una vez corregido el problema

### Resolución de Tareas Manuales

Las tareas creadas por Phase 6F aparecen en `/tasks` con tipo relacionado a automatización.

| Tag de tarea | Acción recomendada |
|-------------|-------------------|
| `automation:dispatch-failed` | Investigar conectividad con n8n, reintentar dispatch |
| `automation:execution-failed:TIMEOUT` | Optimizar workflow n8n o aumentar timeout |
| `automation:max-attempts` | Requiere corrección manual de causa raíz |
| `automation:stuck:running` | Investigar ejecución en n8n, cancelar si es necesario |

Para resolver una tarea:
1. Ir a `/tasks`
2. Abrir la tarea
3. Cambiar estado a `in_progress` mientras se trabaja
4. Cambiar a `done` cuando se resuelva la causa raíz

### Detección de Ejecuciones Atascadas

Ejecutar manualmente (Phase 6F incluye el use case, falta el cron):

```sql
-- Ejecuciones en estado 'running' por más de 30 minutos
SELECT
  ae.id,
  ae.automation_id,
  a.name as automation_name,
  ae.status,
  ae.attempt,
  ae.started_at,
  EXTRACT(EPOCH FROM (NOW() - ae.started_at))/60 AS minutes_running
FROM public.automation_executions ae
JOIN public.automations a ON a.id = ae.automation_id
WHERE ae.status = 'running'
  AND ae.started_at < NOW() - INTERVAL '30 minutes'
ORDER BY ae.started_at;
```

Si hay ejecuciones stuck:
1. Verificar en n8n si la ejecución sigue activa
2. Si n8n ya terminó pero no envió el callback → reenviar callback manualmente
3. Si n8n ya no tiene registro → marcar como `failed` con `error_code = 'STUCK'`

```sql
-- Solo ejecutar con decisión explícita del equipo
-- UPDATE public.automation_executions
-- SET status = 'failed',
--     completed_at = NOW(),
--     error_code = 'STUCK',
--     error_message = 'Execution stuck for > 30 minutes, marked failed manually'
-- WHERE id = '<execution_id>';
```

### Respuesta a Incidentes

#### Nivel 1 — Fallo individual de ejecución

- Impacto: una ejecución fallida para un cliente específico
- Acción: investigar logs, reintentar si aplica, resolver alerta
- Escalar si: el problema se repite > 3 veces en 24h

#### Nivel 2 — Fallo sistemático de dispatch

- Impacto: múltiples organizaciones no pueden ejecutar automatizaciones
- Acción: verificar n8n, revisar alertas de dispatch_failed, activar rollback parcial si > 30min
- Escalar si: no se resuelve en 15min

#### Nivel 3 — Compromiso de seguridad

- Impacto: secreto HMAC expuesto o firma bypass detectado
- Acción: INMEDIATO — ejecutar Fase 2 del rollback runbook (rotación de secreto)
- Escalar: siempre, a todo el equipo

### Ubicación de Logs

| Fuente | Ubicación | Formato |
|--------|-----------|---------|
| Webhook callbacks | Logs del servidor Next.js | `[webhook/n8n]` prefix |
| Dispatch a n8n | Logs del servidor Next.js | `[n8n/dispatch]` prefix |
| Evaluación de incidentes | Logs del servidor Next.js | `[webhook/n8n/6F]` prefix |
| Logs de ejecución | `automation_execution_logs` en DB | Supabase Studio |
| Eventos de webhook | `automation_webhook_events` en DB | Supabase Studio |

### Consultas SQL Útiles

```sql
-- Dashboard de salud de automatizaciones
SELECT
  status,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM public.automation_executions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY status;

-- Webhooks fallidos en la última hora
SELECT id, external_event_id, error_code, received_at
FROM public.automation_webhook_events
WHERE status = 'failed'
  AND received_at > NOW() - INTERVAL '1 hour'
ORDER BY received_at DESC;

-- Alertas activas de automatización
SELECT a.alert_key, a.severity, a.title, a.created_at
FROM public.alerts a
WHERE a.status = 'active'
  AND a.alert_key LIKE 'automation:%'
ORDER BY a.created_at DESC;
```

---

## Limitaciones Conocidas

1. **Sin scheduler/cron:** `evaluate-stuck-automation-executions` debe invocarse manualmente o desde un job externo. No hay cron configurado en Phase 6.

2. **Retención de logs:** No hay job de limpieza automática de `automation_execution_logs` ni `automation_webhook_events`. Requiere pg_cron o job n8n (Phase 7).

3. **Cancelación n8n:** Solo funciona si `N8N_API_KEY` está configurado Y n8n expone el endpoint REST de ejecuciones. Sin esto, cancelar desde la UI marca la ejecución como cancelada en BopIAgency pero n8n puede seguir ejecutando.

4. **Notificaciones externas:** No hay email/Slack cuando se crea una alerta. Solo visible en el dashboard. Integración externa pendiente para Phase 7.

5. **Escalado del webhook:** Si hay muchos callbacks simultáneos, el INSERT atómico en `automation_webhook_events` puede causar contención en el índice único. Monitorear si hay alta concurrencia.

6. **at-least-once:** El sistema garantiza at-least-once delivery, no exactly-once. Los workflows n8n deben ser idempotentes.

### Cuándo Escalar

Escalar siempre con el equipo de desarrollo si:
- Se detecta un bypass de HMAC o RLS en producción
- Hay pérdida de datos en `automation_executions`
- El webhook endpoint empieza a devolver 500 de forma sistemática
- El secreto HMAC necesita rotarse y n8n no puede actualizarse inmediatamente

### Errores Comunes y Soluciones

| Error | Mensaje en logs | Solución |
|-------|----------------|---------|
| Secreto no configurado | `AUTOMATION_WEBHOOK_SECRET no está configurado` | Configurar env var |
| n8n no accesible | `N8N_BASE_URL no está configurado` o timeout | Verificar URL y red |
| Firma inválida | `code: 'INVALID_SIGNATURE'` | Verificar que secretos coinciden |
| Ejecución no encontrada | `Ejecución no encontrada` (400) | Verificar executionId en payload n8n |
| Org mismatch | `organizationId mismatch — posible ataque` | Revisar configuración del workflow n8n |
| Transición inválida | `Invalid transition: X → Y` (409) | Verificar que n8n no reenvía callbacks viejos |
