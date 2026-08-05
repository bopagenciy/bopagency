# Phase 6 — Registro de Riesgos
**Fecha:** 2026-08-04  
**Rama:** feat/phase-6-automation-runtime

---

## Escala de Severidad

| Nivel | Probabilidad × Impacto | Acción |
|-------|----------------------|--------|
| 🔴 Crítico | Alta probabilidad, alto impacto | Bloquea la subfase — resolver antes de continuar |
| 🟠 Alto | Media/Alta probabilidad, alto impacto | Mitigar antes de implementar |
| 🟡 Medio | Media probabilidad, impacto acotado | Plan de contingencia documentado |
| 🟢 Bajo | Baja probabilidad o impacto mínimo | Monitorear |

---

## Riesgos de Seguridad

### R-SEC-01 — `N8N_ENCRYPTION_KEY` en historial de git
**Severidad:** 🔴 Crítico  
**Probabilidad:** Media (el archivo `.env` puede no tener `.gitignore` desde el inicio)  
**Impacto:** Si la clave de cifrado de n8n estuvo en git, un atacante podría descifrar todos los tokens OAuth almacenados en el vault de n8n (Meta Access Token, Gmail OAuth2)  
**Acción requerida:** Ejecutar `git log --all --full-history -- n8n-local/.env` antes de Phase 6A. Si aparece: rotar `N8N_ENCRYPTION_KEY`, revocar y regenerar Meta Access Tokens y Gmail OAuth2.  
**Responsable:** Francisco (acción manual)  
**Deadline:** Antes de Phase 6A

### R-SEC-02 — `AUTOMATION_WEBHOOK_SECRET` débil o ausente
**Severidad:** 🔴 Crítico  
**Impacto:** Sin HMAC válido, cualquier actor puede enviar webhooks falsos y marcar ejecuciones como exitosas o crear alertas falsas  
**Mitigación:** La webhook route rechaza con 403 si falta la firma o el secret no está configurado. El secret debe tener mínimo 32 bytes aleatorios (`openssl rand -hex 32`).  
**Acción:** Generar y documentar en `.env.example` antes de Phase 6C.

### R-SEC-03 — `service_role` en webhook route mal contenido
**Severidad:** 🟠 Alto  
**Impacto:** Si el service_role se usa en más lugares de los documentados, bypasea RLS completamente  
**Mitigación:** Grep periódico: `grep -rn "service_role\|createServiceRoleClient" apps/web/src/`. Debe aparecer SOLO en `apps/web/src/app/api/webhooks/n8n/route.ts`.  
**Acción:** Añadir test de linting custom o comentario de auditoría en el cierre de cada subfase.

### R-SEC-04 — PII en `output_payload` o logs de ejecución
**Severidad:** 🟡 Medio  
**Impacto:** Si n8n incluye datos de clientes (nombres, emails, cuentas publicitarias) en el payload de respuesta, quedan persistidos en Supabase  
**Mitigación:** Sanitización de claves sospechosas antes de persistir. Límite de 10KB en `output_payload`. Revisar qué retorna cada workflow n8n.  
**Acción:** Documentar en las instrucciones de n8n que el payload de respuesta debe ser solo metadata de ejecución, no datos de negocio.

---

## Riesgos Técnicos

### R-TECH-01 — Divergencia de `AutomationStatus` entre domain, DB y legado
**Severidad:** 🔴 Crítico  
**Probabilidad:** Alta — ya confirmado en auditoría  
**Impacto:** Si se implementa sin resolver, los mappers rompen al intentar convertir `inactive` → `AutomationStatus`  
**Mitigación:** Phase 6A resuelve el dominio. Phase 6B resuelve la DB con migración `ADD VALUE` + UPDATE de filas.  
**Acción requerida:** Resolver en Phase 6A antes de cualquier mapper.

### R-TECH-02 — `ADD VALUE` en ENUM PostgreSQL no es transaccional
**Severidad:** 🟠 Alto  
**Probabilidad:** Alta — es una limitación conocida de PostgreSQL  
**Impacto:** No se puede hacer `BEGIN; ALTER TYPE ... ADD VALUE; COMMIT;` — falla  
**Mitigación:** La migración que añade `paused` al ENUM debe ser una sentencia standalone, NO dentro de un bloque de transacción. Separar en migración dedicada (`20260804010000`).  
**Acción:** Documentar esto en la migración y en las notas del desarrollador.

### R-TECH-03 — `host.docker.internal:3101` no funciona en Linux
**Severidad:** 🟡 Medio  
**Probabilidad:** Alta si se despliega en un servidor Linux  
**Impacto:** n8n no puede comunicarse con la Express API en producción Linux  
**Mitigación:** Phase 6 migra a `N8N_WEBHOOK_BASE_URL` para apuntar al nuevo stack (apps/web), eliminando la dependencia de `host.docker.internal:3101`. La Express API legada deja de ser necesaria progresivamente.  
**Acción:** Actualizar la configuración de n8n en Phase 6C para que use la URL del servidor Next.js.

### R-TECH-04 — W-05, W-06, W-07 sin backup JSON
**Severidad:** 🟡 Medio  
**Probabilidad:** Alta si n8n se reinicia o actualiza sin backup  
**Impacto:** Se pierden los workflows de generación y envío de reportes  
**Mitigación:** Exportar desde n8n antes de Phase 6 (acción manual). Ver sección de acciones pre-Phase 6.  
**Acción:** Francisco debe exportar antes de Phase 6A.

### R-TECH-05 — n8n no responde al dispatch (timeout)
**Severidad:** 🟡 Medio  
**Probabilidad:** Baja en entorno local; media en producción con carga  
**Impacto:** La ejecución queda en estado `queued` indefinidamente si el dispatcher lanza timeout y no se actualiza el estado  
**Mitigación:** El use case `dispatchAutomation` actualiza a `failed` si el dispatcher retorna error. El estado `queued` sin actualizar durante >5 minutos puede generar una alerta de monitoreo (Phase 6F).  
**Plan de contingencia:** Worker de limpieza que detecta executions en `queued` por >10min y las marca `failed`. Implementar en Phase 6G.

### R-TECH-06 — Replay attack: n8n reenvía el mismo webhook
**Severidad:** 🟡 Medio  
**Probabilidad:** Media — n8n puede reintentar si no recibe 200 a tiempo  
**Impacto:** Doble actualización del estado de ejecución; doble creación de alertas  
**Mitigación:** Tabla `automation_webhook_events` con `UNIQUE(idempotency_key)`. La route detecta duplicados y retorna 200 sin procesar.  
**Acción:** Test de idempotencia en Phase 6G.

### R-TECH-07 — Meta Access Token expira durante Phase 6
**Severidad:** 🟡 Medio  
**Probabilidad:** Media — los tokens de larga duración de Meta duran ~60 días y se revocan si no se usan  
**Impacto:** W-02 y W-03 fallarían con 401 de Meta Graph API  
**Mitigación:** `automation_secrets_metadata.expires_at` alerta 7 días antes del vencimiento. En Phase 6F, esta alerta se genera automáticamente.  
**Acción:** Registrar fecha de vencimiento del token actual al crear la tabla.

---

## Riesgos de Proceso

### R-PROC-01 — Sin Inngest: n8n como único ejecutor
**Severidad:** 🟢 Bajo  
**Probabilidad:** No es un riesgo inmediato  
**Impacto:** n8n es una deuda técnica. Si se necesita escalar a decenas de automatizaciones, la arquitectura de un workflow por cliente no escala.  
**Mitigación:** Phase 6 introduce el `WorkflowDispatcher` como abstracción. Migrar de n8n a Inngest en el futuro solo requiere implementar un nuevo adapter, no cambiar el dominio.  
**Acción:** Documentar la hoja de ruta hacia Inngest en el cierre de Phase 6.

### R-PROC-02 — agency-dashboard legado en uso paralelo
**Severidad:** 🟡 Medio  
**Probabilidad:** Alta — el legado sigue siendo la interfaz operativa actual  
**Impacto:** Los datos de `shared-data/automations/` y los datos de `public.automations` en Supabase pueden divergir durante la transición  
**Mitigación:** Phase 6 no migra datos del legado a Supabase. Los datos de Phase 6 comienzan desde cero en Supabase (automations nuevas). La migración del historial del legado es scope de una Phase futura.  
**Acción:** Documentar claramente que `/automations` en apps/web muestra SOLO automatizaciones en Supabase, no las del legado.

### R-PROC-03 — Build de producción falla en Windows por cambio en packages
**Severidad:** 🟢 Bajo  
**Probabilidad:** Baja — las Phases anteriores pasaron en Windows  
**Impacto:** Bloquea el despliegue  
**Mitigación:** Ejecutar `npm run build` como parte del criterio de aceptación de Phase 6G en el mismo entorno Windows que usó Phase 5.

### R-TECH-10 — `automation_webhook_events` sin RLS (detectado en revisión correctiva 6B)
**Severidad:** 🟢 Bajo  
**Estado:** ✅ RESUELTO — revisión correctiva 2026-08-04  
**Descripción:** La migración Phase 6B inicial documentaba `automation_webhook_events` como "sin RLS — solo service_role", omitiendo `ENABLE ROW LEVEL SECURITY`. Esto contradecía el requisito de activar RLS en todas las tablas nuevas.  
**Resolución:** Se añadió `ALTER TABLE public.automation_webhook_events ENABLE ROW LEVEL SECURITY;` en la sección G3 de la migración. No se crearon políticas para `authenticated` — cuando RLS está activo sin política aplicable, el acceso es denegado por defecto. `service_role` omite RLS por diseño en Supabase. `REVOKE ALL` en sección E4 actúa como defensa en profundidad. **automation_webhook_events tiene RLS habilitado y ninguna política para usuarios autenticados; será accesible únicamente mediante service_role después de verificar HMAC en Phase 6C.**

---

## Tabla Resumen de Riesgos

| ID | Riesgo | Severidad | Estado | Subfase |
|----|--------|-----------|--------|---------|
| R-SEC-01 | N8N_ENCRYPTION_KEY en git | 🔴 Crítico | Pendiente verificación manual | Pre-6A |
| R-SEC-02 | HMAC secret débil o ausente | 🔴 Crítico | Mitigado por diseño en 6C | 6C |
| R-SEC-03 | service_role descontrolado | 🟠 Alto | Mitigado por arquitectura | 6G (auditoría) |
| R-SEC-04 | PII en payloads de ejecución | 🟡 Medio | Mitigado por sanitización | 6D |
| R-TECH-01 | Divergencia AutomationStatus | 🔴 Crítico | ✅ RESUELTO en 6B (mapper transitorio + migración SQL inactive→paused) | 6A/6B |
| R-TECH-02 | ADD VALUE no transaccional | 🟠 Alto | ✅ RESUELTO en 6B (ADD VALUE IF NOT EXISTS fuera de transacción explícita) | 6B |
| R-TECH-03 | host.docker.internal en Linux | 🟡 Medio | Mitigado por variable de entorno | 6C |
| R-TECH-04 | Workflows sin backup JSON | 🟡 Medio | Acción manual pre-6A | Pre-6A |
| R-TECH-05 | n8n timeout en dispatch | 🟡 Medio | Mitigado por estado queued→failed | 6D |
| R-TECH-06 | Replay attack webhook | 🟡 Medio | ✅ RESUELTO en 6B — UNIQUE(org_id, idempotency_key) en automation_executions | 6B/6C |
| R-TECH-07 | Meta token expirado | 🟡 Medio | Mitigado por expires_at | 6F |
| R-TECH-08 | Valores legacy enum ('error','disabled','inactive') sin eliminar | 🟢 Bajo | Deuda técnica documentada — resolver en Phase 6E cuando no haya filas legacy | 6E |
| R-TECH-09 | FK circular automations ↔ executions (last_execution_id) | 🟢 Bajo | Pospuesto a Phase 6C cuando el dispatcher comience a escribir ejecuciones | 6C |
| R-TECH-10 | automation_webhook_events sin RLS (corregido) | 🟢 Bajo | ✅ RESUELTO en revisión correctiva 6B — RLS habilitado, sin políticas para authenticated; accesible únicamente mediante service_role después de verificar HMAC en Phase 6C | 6B |
| R-PROC-01 | n8n no escala | 🟢 Bajo | WorkflowDispatcher abstrae | Futuro |
| R-PROC-02 | Datos legado vs Supabase | 🟡 Medio | Scope delimitado: no migrar datos | 6G docs |
| R-PROC-03 | Build falla en Windows | 🟢 Bajo | Validar en 6G | 6G |
