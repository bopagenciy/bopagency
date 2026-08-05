# Phase 6 — Rollback Runbook
**Versión:** 1.0 — 2026-08-05
**Propósito:** Procedimiento de reversión controlada de Phase 6 sin pérdida de datos.

> REGLA ABSOLUTA: No ejecutar DROP TABLE. No eliminar datos de producción.
> El objetivo es deshabilitar funcionalidad, no destruir historial.

---

## Cuándo usar este runbook

- Webhook de n8n recibe errores sistemáticos (>10% de callbacks)
- Dispatch falla en >50% de los intentos durante más de 15 minutos
- Secreto HMAC comprometido o sospecha de compromiso
- Error crítico de seguridad en el código Phase 6
- Rollback de emergencia solicitado explícitamente

---

## Fase 1 — Desactivación Inmediata (0-5 minutos)

### 1.1 Desactivar dispatch (feature flag via env var)

Configurar en la plataforma de hosting (Vercel/Railway/etc.):

```bash
# Añadir variable de entorno que deshabilita el dispatch hacia n8n
# El código lee esta variable antes de intentar el dispatch
N8N_DISPATCH_DISABLED=true
```

> Nota: Si `N8N_DISPATCH_DISABLED=true` está definida, el use case `startExecution`
> debe retornar un error `DISPATCH_DISABLED` sin intentar el request HTTP.
> Si esta variable no está implementada aún, usar el Paso 1.2.

### 1.2 Alternativa: eliminar N8N_BASE_URL

Eliminar la variable `N8N_BASE_URL` del entorno de producción. El dispatcher
lanzará una excepción al intentar enviar, produciendo error controlado.

```bash
# El dispatcher hace:
# throw new Error('[n8n] N8N_BASE_URL no está configurado')
# → el start-execution use case captura esto y retorna err(DISPATCH_FAILED)
```

### 1.3 Deshabilitar la ruta de webhook

Configurar una variable de entorno para rechazar todos los callbacks:

```bash
N8N_WEBHOOK_DISABLED=true
```

O en caso de emergencia: crear un middleware que retorne 503 para
`/api/webhooks/n8n`.

### 1.4 Pausar todas las automatizaciones activas

Desde Supabase Studio (acceso directo a DB, evitar código web):

```sql
-- SOLO en emergencia — pausar TODAS las automatizaciones activas
-- Usar con cuidado: afecta a todas las organizaciones
UPDATE public.automations
SET status = 'paused'
WHERE status = 'active';

-- Registrar cuántas se pausaron (para restaurar después)
-- Guardar este número en el ticket de incidente
```

---

## Fase 2 — Rotación de Secreto (si comprometido)

### 2.1 Generar nuevo secreto

```bash
openssl rand -hex 32
# Guardar el valor: NUEVO_SECRETO=<output>
```

### 2.2 Actualizar en n8n primero

1. Ir al panel de n8n
2. Actualizar la variable `BOP_WEBHOOK_SECRET` con el nuevo valor
3. Guardar y verificar que el workflow puede leer la nueva variable

### 2.3 Actualizar en Next.js

```bash
# Actualizar AUTOMATION_WEBHOOK_SECRET en la plataforma de hosting
# Hacer un nuevo deploy para que el cambio tome efecto
```

### 2.4 Verificar que los callbacks del secreto viejo ya no son aceptados

Cualquier callback firmado con el secreto anterior ahora devolverá 403.
Esto es el comportamiento esperado.

---

## Fase 3 — Preservación de Datos

### 3.1 Verificar integridad de datos existentes

```sql
-- Contar ejecuciones por estado
SELECT status, COUNT(*) 
FROM public.automation_executions 
GROUP BY status;

-- Ejecuciones en estado intermedio (queued/running/retrying) que necesitan atención
SELECT id, automation_id, status, attempt, queued_at
FROM public.automation_executions
WHERE status IN ('queued', 'running', 'retrying')
ORDER BY queued_at;
```

### 3.2 Marcar ejecuciones en vuelo como canceladas (si corresponde)

Solo si se decide que las ejecuciones en vuelo no se recuperarán:

```sql
-- NO ejecutar automáticamente — requiere decisión explícita del equipo
-- UPDATE public.automation_executions
-- SET status = 'cancelled',
--     completed_at = NOW(),
--     error_code = 'ROLLBACK',
--     error_message = 'Cancelled due to Phase 6 rollback'
-- WHERE status IN ('queued', 'running', 'retrying')
-- AND organization_id = '<org_id>';  -- Si aplica solo a una org
```

### 3.3 Preservar logs y alertas

Los datos de `automation_executions`, `automation_execution_logs`,
`automation_webhook_events`, y `automation_secrets_metadata` se MANTIENEN.

No ejecutar DROP TABLE ni DELETE masivo.
Los datos son evidencia del comportamiento pre-rollback.

### 3.4 Preservar alertas y tareas existentes

Las alertas en estado `active` o `acknowledged` quedan visibles en el dashboard.
Las tareas manuales creadas por el sistema siguen siendo gestionables.

---

## Fase 4 — Reversión de Código

### 4.1 Identificar el último commit estable pre-Phase 6

```bash
git log --oneline | grep -v "phase-6\|phase6"
# El commit 66767d8 (docs: add phase 6 audit) o
# el commit anterior al primer commit de Phase 6
```

### 4.2 Crear rama de hotfix desde el commit estable

```bash
git checkout 66767d8  # docs: add phase 6 audit
git checkout -b hotfix/rollback-phase-6
```

### 4.3 NO hacer revert del commit de migración SQL

La migración de DB ya se ejecutó. El código revertido debe ser
compatible con el schema existente (las tablas nuevas son aditivas,
no modifican tablas existentes de forma incompatible).

Las tablas Phase 6 permanecen en la DB pero el código no las usa.

---

## Fase 5 — Tratamiento del Enum Legacy

El enum `public.automation_status` tiene valores legacy (`error`, `disabled`, `inactive`)
y nuevos (`draft`, `archived`). Si se revierte el código:

- El mapper anterior ignoraba `draft` y `archived` → filas con esos valores quedan en DB
- El código revertido debe manejar esos valores gracefully (no crashear)
- Si hay filas con `status = 'draft'` → el código antiguo las veía como estado desconocido

**Acción recomendada si se revierte:**

```sql
-- Convertir filas 'draft' → 'inactive' (para que el código viejo las entienda)
-- Solo si hay filas afectadas y se confirma que es seguro
SELECT COUNT(*) FROM public.automations WHERE status IN ('draft', 'archived');
-- Si hay > 0, coordinar con el equipo antes de actualizar
```

---

## Fase 6 — Recuperación de n8n

### 6.1 Notificar al equipo de n8n

El equipo de n8n debe:
1. Revertir la configuración del secreto HMAC (si se cambió)
2. Verificar que los workflows no tienen callbacks pendientes hacia BopIAgency
3. Detener cualquier reintento automático hacia `/api/webhooks/n8n`

### 6.2 Limpiar ejecuciones en vuelo en n8n

En el panel de n8n:
1. Ir a Executions
2. Identificar ejecuciones con estado "Running" o "Waiting"
3. Cancelar o dejar que fallen gracefully
4. NO reenviar callbacks después del rollback

---

## Fase 7 — Validación post-rollback

```bash
# 1. Verificar que la UI de automations muestra estado coherente
# 2. Verificar que no hay callbacks llegando al webhook
# 3. Verificar que las alertas activas son visibles en dashboard
# 4. Verificar que las tareas manuales pendientes son accionables

# Logs del servidor deben mostrar:
# - Sin entradas de [webhook/n8n]
# - Sin entradas de [n8n/dispatch]
```

---

## Comunicación de Incidente

### Template de notificación interna

```
INCIDENTE PHASE 6 — ROLLBACK ACTIVADO
Fecha: <datetime>
Motivo: <descripción breve>
Estado actual: <qué funciona, qué no>
Acciones tomadas: <lista de pasos ejecutados>
ETA de resolución: <estimado o "pendiente investigación">
Datos afectados: <número de ejecuciones en vuelo, alertas activas>
Siguiente paso: <acción inmediata requerida>
```

---

## Checklist de Rollback Completo

### Inmediato
- [ ] N8N_BASE_URL eliminada o N8N_DISPATCH_DISABLED=true configurada
- [ ] N8N_WEBHOOK_DISABLED=true configurada (o middleware 503)
- [ ] Nuevo deploy realizado
- [ ] Verificado que dispatch ya no ocurre
- [ ] Verificado que webhooks devuelven 503/error

### Si secreto comprometido
- [ ] Nuevo secreto generado
- [ ] Actualizado en n8n
- [ ] Actualizado en Next.js con nuevo deploy
- [ ] Secreto viejo ya no aceptado

### Datos
- [ ] Ejecuciones en vuelo revisadas
- [ ] Decisión sobre ejecuciones queued/running documentada en ticket
- [ ] Sin DROP TABLE ejecutado
- [ ] Sin DELETE masivo ejecutado

### Código
- [ ] Rama de hotfix creada desde commit estable
- [ ] Deploy realizado desde rama stable
- [ ] Verificado en staging antes de producción

### Comunicación
- [ ] Equipo de n8n notificado
- [ ] Ticket de incidente creado con timeline
- [ ] Post-mortem planificado
