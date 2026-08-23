# Phase 7F — Campaign Automation / Notifications

**Branch:** `feat/phase-7-campaign-studio`
**HEAD base:** `8506790` (7A–7E completas)
**Estado:** Implementado + runtime smoke manual COMPLETO (4/4 PASS, ver §18c) + 1549 tests passed en Windows (ver §14). Sin `git add`/`commit`/`push`. Sin migración. Sin publicación externa. Phase 7G (E2E / closure) sigue PENDIENTE — este reporte no declara Phase 7 completa.

---

## 1. Precheck

```
git branch --show-current  → feat/phase-7-campaign-studio
git log -1 --oneline       → 8506790 feat(phase-7): complete campaign studio UI and multi-provider AI
git status --short         → M supabase/config.toml
                              ?? .agencia-ai/.claude/commands/new-client.md
```
Ambos archivos fuera del commit se dejaron intactos — no se hizo `git add`, ni se modificó su contenido.

---

## 2. Audit de reuso de Phase 6 — resultado

Phase 6F (`evaluate-automation-incident.use-case.ts`) ya resuelve, para incidentes técnicos de automatización, exactamente el mismo problema que 7F necesita resolver para eventos de negocio de campaña:

| Necesidad de 7F | Pieza de Phase 6 reutilizada tal cual |
|---|---|
| Crear una tarea operativa, deduplicada | `TaskRepository.create()` + `TaskRepository.findActiveBySignatureTag()` |
| Crear/actualizar una alerta, deduplicada | `AlertRepository.upsertByAlertKey()` (INSERT … ON CONFLICT DO UPDATE, atómico) |
| Ejecutar el side effect sin bloquear ni revertir la operación principal | Patrón "silently" post-commit (`evalIncidentSilently` en `start-execution.use-case.ts`) |
| Mapear severidad/prioridad de forma cerrada y testeable | Mismo patrón que `automation-incident-severity.ts` |
| Firmas de deduplicación (`alert_key`/signature tag) deterministas | Mismo patrón que `automation-incident-signatures.ts` |
| Visibilidad en dashboard | `AutomationSignalsWidget` ya cuenta `alerts`/`tasks` org-wide de forma genérica — las señales de campaña aparecen ahí sin cambios |

**Conclusión del audit:** no hace falta ningún runtime, tabla, ni tipo de entidad nuevo. 7F es, en esencia, un segundo "evaluador" (`evaluateCampaignAutomation`) que habla los mismos dos repositorios (`AlertRepository`, `TaskRepository`) con firmas propias (prefijo `campaign:` en vez de `automation:`). No se creó `CampaignAutomationRuntimeV2`, `CampaignTaskTable` ni `CampaignAlertTable`.

### RPC boundary (§6 de la especificación)
`approve_campaign`/`reject_campaign` siguen siendo RPCs `SECURITY DEFINER` puras — no se les añadió ninguna llamada HTTP/n8n. El hook de automatización se dispara desde el **use case de application**, **después** de que `CampaignRepository.approve`/`.reject` (que internamente llama a la RPC) devuelve éxito. Si la RPC falla, el use case retorna el error tal cual y el hook nunca se ejecuta.

---

## 3. Modelo de eventos (§2)

`campaign-automation-types.ts` documenta los 7 eventos de negocio de Campaign Studio (`CampaignBusinessEvent`) sin introducir event sourcing: son solo un union type de documentación/futuro uso. De esos 7, únicamente 4 producen un side effect interno hoy — modelados como un tipo cerrado separado, `CampaignAutomationType`:

```
campaign_review_requested   ← campaign.submitted_for_review (draft → review)
campaign_rejected           ← campaign.rejected            (review → rejected)
campaign_approved           ← campaign.approved            (review → approved)
campaign_ai_provider_failure ← fallo real de proveedor de IA en generate/regenerate
```

`campaign.created`, `campaign.updated`, `campaign.ai_generated`, `campaign.ai_regenerated` quedan documentados en `CAMPAIGN_BUSINESS_EVENTS` pero **no** disparan ningún side effect en 7F — no hay tarea/alerta de alto valor definida para ellos en la especificación, y crear una habría sido ruido no solicitado.

---

## 4. Automatizaciones implementadas (§3)

### A. `campaign_review_requested` (draft → review)
- Trigger: `submitCampaignForReview`, después de que `CampaignRepository.update` confirma el nuevo status.
- Efecto: **1 task**, prioridad `medium`, título `"Revisar campaña: <name>"`, descripción con link interno `/campaigns/{id}`. Org-scoped (Task no tiene columna `assignee_id` — ver `domain/entities/task.ts` — visible a owner/admin/strategist/operator vía RLS existente de `tasks`).
- Ningún alert.

### B. `campaign_rejected` (review → rejected)
- Trigger: `rejectCampaign`, después de que la RPC `reject_campaign` confirma.
- Efecto: **1 task**, título `"Campaña rechazada: <name>"`, incluye la nota de rechazo (truncada a 300 chars) en la descripción. Org-scoped por la misma razón que A — no existe un `assignee_id` para dirigir la tarea específicamente al creador; el creador sigue siendo visible vía `campaign.createdBy` en el propio detalle de campaña y vía `CampaignApprovalPanel`/`listCampaignApprovals` (7C), que ya muestra quién decidió y la nota.

### C. `campaign_approved` (review → approved)
- Trigger: `approveCampaign`, después de que la RPC `approve_campaign` confirma.
- Efecto: **1 task**, título `"Preparar activación de campaña: <name>"`. La descripción declara explícitamente: *"Esta tarea NO implica publicación automática en ningún proveedor externo — la activación sigue siendo manual."* — cumpliendo la regla crítica de producto.

### D. `campaign_ai_provider_failure` (generate/regenerate)
- Trigger: `generateCampaignDraftWithAI` / `regenerateCampaignContent`, en la rama de error de `campaignGeneratorPort.generate()`.
- Filtro de ruido: se usa `getAiErrorKind(error)` (ya existente de Phase 7D.1) para distinguir un fallo real de proveedor (`AI_EXTERNAL_SERVICE_ERROR`, `AI_TIMEOUT`, `AI_RATE_LIMITED`, `AI_PROVIDER_NOT_CONFIGURED`) de una validación de usuario (plataforma no soportada, output con `platform` mismatch, etc. — códigos `VALIDATION_ERROR`, sin `aiErrorKind`). Solo el primer grupo dispara el evaluador — el segundo nunca llega a `evalCampaignAutomationSilently`.
- Efecto: **1 alert** (`severity: warning`), nunca una task — un fallo de proveedor no es una tarea operativa para un humano de campaña, es una señal para el equipo de plataforma (mismo criterio que Phase 6F separa incidentes técnicos de trabajo operativo).
- Caso especial — **`generateCampaignDraftWithAI` puede fallar antes de que exista una campaña persistida** (`CampaignRepository.create()` solo se llama tras generación exitosa). La alerta se agrupa entonces por `client:{clientId}` en vez de por `campaignId` (ver `campaignAiProviderFailureKey`, que acepta un `scopeId` string en vez de forzar un `CampaignId`). `regenerateCampaignContent` siempre opera sobre una campaña ya persistida, así que ahí se agrupa por `campaignId` real.

---

## 5. Idempotencia (§4) — obligatoria, implementada

Cada evento tiene una firma determinística, sin timestamps ni valores aleatorios:

```
campaign:{orgId}:{campaignId}:submitted-for-review
campaign:{orgId}:{campaignId}:rejected
campaign:{orgId}:{campaignId}:approved
campaign:{orgId}:{campaignId|client:{clientId}}:ai-provider-failure:{AI_ERROR_KIND}
```

- **Alerts:** dedupe atómico vía `INSERT … ON CONFLICT (organization_id, alert_key) DO UPDATE` (ya existente en `SupabaseAlertRepository.upsertByAlertKey`, sin cambios). Dos llamadas concurrentes con la misma clave producen una fila, no dos.
- **Tasks:** dedupe vía `findActiveBySignatureTag` antes de `create()` — si ya existe una tarea activa con la misma firma (codificada también como tag, no solo como clave lógica), se salta la creación (`taskSkipped: true`). Esto es "check-then-act", no atómico a nivel de fila (a diferencia del alert upsert) — el mismo trade-off que ya acepta Phase 6F para tasks; no se introduce una garantía más débil de la que ya existía.
- Auditado: sí, Phase 6 ya tenía exactamente este mecanismo (`alert_key`/`findActiveBySignatureTag`) — reutilizado sin modificarlo.

---

## 6. Transacción / consistencia (§5)

El status de campaña es la fuente de verdad y **siempre** se persiste primero (vía `CampaignRepository.update` o la RPC `approve_campaign`/`reject_campaign`) — el hook de automatización se invoca **después**, envuelto en `evalCampaignAutomationSilently`, que:
1. Nunca lanza — atrapa cualquier excepción y la loguea como `warn`.
2. Nunca convierte un side effect fallido en un error de la operación principal — el use case siempre retorna `ok(campaña)` si la transición ya fue exitosa, sin importar qué pasó con la task/alert.
3. Es observable: cada fallo (repo error o excepción) se loguea con `organizationId`, `campaignId`, `automationType` y el código de error — nunca con el payload completo.

No se introdujo outbox pattern — no hizo falta (best-effort + dedupe determinística es suficiente para el volumen y la criticidad de este caso; un fallo de task/alert es recuperable manualmente y no bloquea el negocio).

---

## 7. Seguridad / roles (§10) — verificado contra RLS real

Las policies de INSERT en `tasks`/`alerts` (migración `20260730150000_phase4_data_migration_targets.sql`) exigen `has_organization_role(organization_id, 'operator')` para el actor autenticado (`auth.uid()`). Se verificó que **en todos los puntos de disparo, el actor ya cumple ese mínimo antes de llegar al hook**:

| Use case | Rol mínimo ya verificado antes del hook |
|---|---|
| `submitCampaignForReview` | `operator+` |
| `approveCampaign` | `admin+` (⊇ operator) |
| `rejectCampaign` | `admin+` (⊇ operator) |
| `generateCampaignDraftWithAI` / `regenerateCampaignContent` | `operator+` |

Por eso `campaign.composition.ts` wirea `alertRepository`/`taskRepository` con el **client de sesión del usuario** (RLS aplicada), no `service_role` — a diferencia del webhook de n8n (Phase 6F), que sí necesita `service_role` porque ahí no hay una sesión de usuario autenticada. Esto es más estricto que el mínimo necesario, no menos: ningún flujo de 7F puede escribir tasks/alerts fuera de su organización ni sin que el actor tenga el rol mínimo real — no se eleva ningún privilegio por la existencia de una tarea (§10 del brief), y el trigger `trg_alerts_70_audit_fields` (que protege `acknowledged_*`/`resolved_*`) nunca se activa porque el evaluador nunca toca esos campos.

---

## 8. Migración — decisión: **NO migración**

Justificación: toda la persistencia necesaria (dedupe, task/alert, metadata) cabe en `tasks`/`alerts` tal como existen hoy — usando `alert_key`/`tags[]`/`metadata` (JSON, solo en `alerts`; `tasks` no tiene columna de metadata JSON, ver R-TECH-14 en el risk register para la limitación que esto impone en la UI, deferida). No se creó tabla, columna, índice ni RPC nueva.

---

## 9. No publicación externa — garantizado

Grep de seguridad sobre los archivos tocados (`service_role`, `NEXT_PUBLIC_`, `Authorization`, `console.log`, `publish`, `meta`, `google`, `n8n`, `webhook`, `fetch(`) → **sin coincidencias funcionales**. Las únicas apariciones de `n8n`/`publish`/`meta`/`google` en el diff son comentarios de documentación que declaran explícitamente que NO se usan. Ningún archivo de 7F importa un SDK de proveedor externo, hace una llamada `fetch`, ni referencia `service_role`.

---

## 10. Observabilidad

Cada evaluación loguea (`logger.info`/`.warn`/`.debug`): `organizationId`, `campaignId` (o `null` si aún no existe), `automationType`, resultado (`created`/`updated`/`skipped`) y, en fallo, solo el `error.code` tipado — nunca contenido generado por IA completo, payloads crudos de proveedor, ni secretos. Verificado con un test dedicado (`'never persists secrets/raw provider payloads in alert metadata'`).

---

## 11. UI (§11–12)

- `CampaignAutomationActivity.tsx` (nuevo, Server Component de solo lectura) — se añadió al detalle de campaña, debajo de `CampaignApprovalPanel`. Muestra la tarea ACTIVA asociada al evento correspondiente al status actual de la campaña, si existe, con link a `/tasks`.
- **Limitación documentada, no oculta:** `TaskRepository` solo expone `findActiveBySignatureTag` (tareas activas), no un historial completo — ver R-TECH-14 en el risk register. Es intencional y coherente con "no sobrecargar Campaign detail".
- `AutomationSignalsWidget` (dashboard) no se tocó — ya cuenta `alerts`/`tasks` org-wide de forma genérica, así que las señales de campaña aparecen ahí automáticamente sin cambio de código.

---

## 12. Notifications — alcance de 7F

Solo: in-app task, in-app alert, dashboard signal (vía el widget existente). **No implementado** (documentado como diferido, no como pendiente silencioso): email, Slack, SMS, WhatsApp, push mobile.

---

## 13. Tests añadidos

| Archivo | Qué cubre |
|---|---|
| `campaign-automation-signatures.test.ts` (nuevo) | Determinismo, longitud ≤255, distinción por evento/campaña, formato de scope. |
| `evaluate-campaign-automation.use-case.test.ts` (nuevo) | Los 4 tipos de evento, idempotencia (segunda llamada no duplica), multi-tenant, best-effort ante fallo de repo, no-publicación en el texto de la task de `campaign_approved`, no-secretos en metadata de alert. |
| `submit-campaign-for-review.use-case.test.ts` (+3 tests) | Hook no-op si no está wireado; hook se dispara y no altera el resultado si está wireado; excepción del hook no revierte la transición ya persistida. |
| `approve-campaign.use-case.test.ts` (+3 tests) | Igual que arriba, para `campaign_approved`. |
| `reject-campaign.use-case.test.ts` (+3 tests) | Igual que arriba, para `campaign_rejected`. |
| `generate-campaign-draft-with-ai.use-case.test.ts` (+3 tests) | Alert scoped por cliente (sin campaignId aún); sin alert para errores de validación; no revienta si `alertRepository` no está wireado. |
| `regenerate-campaign-content.use-case.test.ts` (+2 tests) | Alert scoped por `campaignId` real (campaña ya existe); no persiste la regeneración cuando el proveedor falla. |

**Regresión:** ningún test preexistente de 6F/7B/7C/7D/7D.1/7E se modificó — los nuevos campos de `Deps` (`alertRepository`/`taskRepository`) son opcionales, así que los tests existentes que no los pasan siguen compilando y pasando (verificado con `tsc --noEmit` en `packages/application`, cero errores).

---

## 14. Validación ejecutada

Esta sección combina dos fuentes distintas, marcadas explícitamente para no mezclarlas:

- **(A) Verificado por Claude en el puente Linux (WSL)** durante la implementación — `tsc`/`eslint` únicamente, `vitest` no pudo correr ahí (ver nota debajo de la tabla).
- **(B) Ejecutado por el usuario en Windows/PowerShell**, con el `node_modules` real de la plataforma — incluye totales de tests reales, no estimados.

| Workspace | typecheck | lint | tests |
|---|---|---|---|
| `packages/shared` | ✅ (A) | ✅ (A) | ✅ **106 passed** (B) |
| `packages/domain` | ✅ (A) | ✅ (A) | ✅ **229 passed** (B) |
| `packages/application` | ✅ (A) + ✅ (B) | ✅ (A) + ✅ (B) | ✅ **356 passed** (B) |
| `packages/infrastructure` | ✅ (A) + ✅ (B) | ✅ (A, tras el fix) + ✅ (B) | ✅ **502 passed** (B) |
| `packages/automation-engine` | ✅ (A) | ✅ (A) | ✅ **0 tests, exit code 0** (B) — sin suite propia en este paquete |
| `packages/ai-engine` | ✅ (A) | ✅ (A) | no ejecutado en Windows en esta ronda |
| `packages/integrations` | ✅ (A) | ✅ (A) | no ejecutado en Windows en esta ronda |
| `packages/ui` | ✅ (A) | ✅ (A) | no ejecutado en Windows en esta ronda |
| `apps/web` | ✅ (A) + ✅ (B) | ✅ (A) + ✅ (B) | ✅ **356 passed** (B) |

**TOTAL de tests confirmado en Windows: 1549 passed, 0 failed** (suma de `shared` 106 + `domain` 229 + `application` 356 + `infrastructure` 502 + `apps/web` 356 + `automation-engine` 0).

**Nota histórica — por qué (A) no incluye totales de test:** en el puente Linux desde el que Claude opera el repositorio, `node_modules` fue instalado en Windows (solo hay binarios nativos `@rollup/rollup-win32-x64-gnu`/`-msvc`); ese puente no tiene el binario nativo `@rollup/rollup-linux-x64-gnu` ni acceso a red para instalarlo. Por eso todo total de test de este reporte proviene exclusivamente de la ejecución real del usuario en Windows (B), nunca fabricado ni estimado desde el puente Linux.

---

## 15. Sweep de seguridad (§25) — resultado

```
service_role   → 0 coincidencias funcionales (solo en comentarios que documentan que NO se usa)
NEXT_PUBLIC_   → 0 coincidencias
Authorization  → 0 coincidencias
console.log    → 0 coincidencias (se usa LoggerPort, no console directo)
publish/meta/google → 0 coincidencias funcionales (solo en comentarios/nombres de test que confirman ausencia)
n8n/webhook/fetch( → 0 coincidencias funcionales (solo en comentarios que documentan que NO se usa)
```
Confirmado: sin publicación externa, sin secretos nuevos, sin lectura/escritura cross-org, sin `service_role` nuevo, sin escritura directa client-side a la base de datos, sin side effect en rutas de lectura (ningún use case de `list*`/`get*` fue modificado).

---

## 16. Git hygiene

```
git status --short → 14 archivos modificados/nuevos de 7F, más los 2 archivos preexistentes
                      (supabase/config.toml, .agencia-ai/.claude/commands/new-client.md)
                      SIN TOCAR por 7F.
git diff --check    → limpio (sin errores de whitespace)
```
**Nota operativa (no causada por 7F):** se detectó un `.git/index.lock` (0 bytes) presente en el repositorio del usuario — probablemente de un proceso de git concurrente (IDE, otra terminal). No se intentó eliminar (operación destructiva sobre archivos internos de git, fuera del alcance de esta tarea); `git status`/`git diff` funcionaron igual porque son de solo lectura. Si el usuario ve errores de "index locked" al hacer `git add`/`commit` por su cuenta, puede necesitar cerrarlo manualmente.

No se ejecutó `git add`, `git commit` ni `git push` en ningún momento.

---

## 17. Archivos — resumen

**Nuevos (8):**
```
packages/application/src/use-cases/campaigns/campaign-automation-types.ts
packages/application/src/use-cases/campaigns/campaign-automation-signatures.ts
packages/application/src/use-cases/campaigns/evaluate-campaign-automation.use-case.ts
packages/application/src/use-cases/campaigns/campaign-automation-dispatch.ts
packages/application/src/use-cases/campaigns/__tests__/campaign-automation-signatures.test.ts
packages/application/src/use-cases/campaigns/__tests__/evaluate-campaign-automation.use-case.test.ts
apps/web/src/components/campaigns/CampaignAutomationActivity.tsx
docs/implementation/phase-7/PHASE_7F_CAMPAIGN_AUTOMATION_REPORT.md
```

**Modificados (9):**
```
packages/application/src/index.ts
packages/application/src/use-cases/campaigns/submit-campaign-for-review.use-case.ts
packages/application/src/use-cases/campaigns/approve-campaign.use-case.ts
packages/application/src/use-cases/campaigns/reject-campaign.use-case.ts
packages/application/src/use-cases/campaigns/generate-campaign-draft-with-ai.use-case.ts
packages/application/src/use-cases/campaigns/regenerate-campaign-content.use-case.ts
packages/application/src/use-cases/campaigns/__tests__/{submit,approve,reject}-campaign*.test.ts (+3 c/u)
packages/application/src/use-cases/campaigns/__tests__/{generate,regenerate}-campaign*.test.ts
apps/web/src/lib/composition/campaign.composition.ts
apps/web/src/app/(protected)/campaigns/[id]/page.tsx
docs/implementation/phase-7/PHASE_7_IMPLEMENTATION_PLAN.md
docs/implementation/phase-7/PHASE_7_RISK_REGISTER.md
```

**Excluidos explícitamente (no tocar, no `git add`):**
```
supabase/config.toml
.agencia-ai/.claude/commands/new-client.md
```

---

## 18. Plan de smoke manual (§22) — documentado y EJECUTADO

> Este plan fue ejecutado por el usuario en runtime local tras el fix de `actorUserId` (ver §18b). Resultados reales en §18c — nada de esta sección 18 se fabricó.

**CASO A — Submitted for review:**
1. Crear una campaña (draft) como operator+.
2. `submitCampaignForReview`.
3. Verificar en `tasks`: exactamente 1 fila con `tags` conteniendo `campaign-id:{id}` y `event:campaign_review_requested`.
4. Repetir el submit (debería fallar por transición inválida — draft→review ya no aplica desde `review`) — de todas formas, si se reintenta la MISMA llamada antes de que el status cambie (doble-click), verificar que sigue habiendo solo 1 tarea.

**CASO B — Reject:**
1. Con la campaña en `review`, rechazar como admin+ con una nota.
2. Verificar 1 tarea nueva con la nota incluida en la descripción.
3. Verificar en `campaign_approvals` la fila `rejected` con la nota (ya cubierto por 7C, no reprobado aquí).

**CASO C — Approve:**
1. Con otra campaña en `review`, aprobar como admin+.
2. Verificar 1 tarea "Preparar activación…".
3. Verificar que NO se disparó ninguna llamada de red a Meta/Google/YouTube (inspeccionar logs del servidor / Network tab — no debería haber ninguna, 7F no las introduce).

**CASO D — Refresh/retry:**
1. Repetir cualquiera de los 3 casos anteriores refrescando la página o reintentando la Server Action tras un timeout de red simulado.
2. Verificar que el conteo de tasks/alerts para esa campaña+evento no aumenta.

**CASO E — Cross-org:**
1. Con dos organizaciones distintas, aprobar una campaña en la organización A.
2. Verificar que ningún usuario de la organización B ve la tarea creada (RLS de `tasks` ya cubre esto — no es código nuevo de 7F, pero vale re-verificar en este flujo específico).

---

## 18c. RUNTIME SMOKE — resultados reales (ejecutado por el usuario, post-fix)

> Ejecutado en runtime local, contra el fix de `actorUserId` de §18b. Resultados reportados por el usuario, no fabricados por Claude.

**1. `campaign_review_requested` — CASO A — PASS**
Campaña "Smoke 7F Review Fix", `draft → review`. Task creada: *"Revisar campaña: Smoke 7F Review Fix"*. DB confirmó exactamente 1 fila. Tags: `campaign`, `org:<organizationId>`, `campaign-id:<campaignId>`, `event:campaign_review_requested`, más la signature tag determinística. `created_by` = UUID real del usuario autenticado. Refresh de UI no creó duplicados (cubre también CASO D para este evento).

**2. `campaign_rejected` — CASO B — PASS**
Misma campaña, `review → rejected`. Task creada: *"Campaña rechazada: Smoke 7F Review Fix"*. DB confirmó exactamente 2 tasks totales para la campaña (`campaign_review_requested` + `campaign_rejected`), con firmas distintas por evento — sin duplicados. `created_by` UUID real.

**3. `campaign_approved` — CASO C — PASS**
Campaña "Smoke 7F Approved", `draft → review → approved`. Tasks: *"Revisar campaña: Smoke 7F Approved"* + *"Preparar activación de campaña: Smoke 7F Approved"*. DB confirmó exactamente 2 filas (`campaign_review_requested` + `campaign_approved`), sin duplicados, `created_by` UUID real. Confirmado explícitamente: la aprobación **no publicó nada externamente**.

**4. `campaign_ai_provider_failure` — PASS**
Fallo controlado provocado con Gemini usando temporalmente un `model` id inválido → Gemini respondió HTTP 404. La UI mostró el mensaje saneado *"El proveedor de IA no está disponible temporalmente. Intenta nuevamente."* (nunca el 404 crudo). La campaña **no se creó** (consistente con el diseño: `CampaignRepository.create()` solo se llama tras generación exitosa). Se disparó `campaign_ai_provider_failure`; alert creada/upserted: *"Fallo de proveedor de IA en generación de campaña"*. DB confirmó exactamente **una** fila para el `alert_key` `campaign:<org>:client:<client>:ai-provider-failure:AI_EXTERNAL_SERVICE_ERROR`. `metadata` confirmó: `source=campaign`, `eventType=campaign_ai_provider_failure`, `campaignId=null` (correcto — la campaña nunca se persistió), `actorUserId`=UUID real, `aiErrorKind=AI_EXTERNAL_SERVICE_ERROR`, `occurredAt`=timestamp. `created_at`/`updated_at` distintos en la fila confirmaron que fue un UPDATE (upsert), no un INSERT duplicado. El modelo de Gemini fue restaurado después a `gemini-3.6-flash`.

**CASO D (refresh/retry) y CASO E (cross-org):** el refresh sin duplicados quedó cubierto implícitamente en los 3 primeros casos (§1–3 arriba). El caso E (cross-org) **no se ejerció explícitamente** en esta ronda de smoke — sigue siendo responsabilidad de RLS ya auditada en fases previas (Phase 4/6), no código nuevo de 7F; se deja como pendiente de re-verificación explícita si se quiere, no como bloqueante.

**Conclusión:** los 4 flujos que Phase 7F implementa (A, B, C, D-fallo de IA) pasaron en runtime real, con evidencia de BD directa (conteo exacto de filas, `created_by` UUID real, `alert_key` determinístico, `created_at`≠`updated_at` en el upsert) — no solo tests unitarios mockeados. El bug de §18b quedó confirmado como resuelto por esta misma evidencia (antes del fix, el CASO A no creaba ninguna fila en `tasks`).

---

## 18b. POSTMORTEM — bug encontrado en smoke real (corregido)

**Síntoma:** `campaign draft → submit review` cambiaba el status de la campaña correctamente, pero **nunca creaba la tarea de "Revisar campaña"**. Confirmado con consulta directa a `public.tasks`: 0 filas para la campaña.

**Causa raíz:** `evaluate-campaign-automation.use-case.ts` llamaba a `taskRepository.create({ ..., createdBy: 'campaign-automation-evaluator' })`. `tasks.created_by` es `uuid NULL REFERENCES auth.users(id)` — un string literal no-UUID hace que el INSERT falle a nivel de Postgres (tipo inválido). Como el hook es **best-effort post-commit** (por diseño — nunca debe revertir la transición de campaña ya confirmada), el fallo se logueaba como `warn` y se tragaba silenciosamente: la campaña pasaba a `review` correctamente, pero la tarea jamás existía. El diseño best-effort funcionó exactamente como se especificó (no revirtió nada) — el defecto estaba en el VALOR pasado, no en el patrón.

**Por qué no lo atrapó la suite de tests original:** todos los tests unitarios de 7F mockean `TaskRepository.create` con `vi.fn().mockResolvedValue(ok(makeTask()))` — un mock que siempre "succeeds" sin importar qué `createdBy` reciba, porque no valida tipos de columna real de Postgres. El bug solo era observable contra una base de datos real (o un test que aserte explícitamente el valor de `createdBy`, lo cual la suite original no hacía). Los tests nuevos (§13 más abajo) cierran ese gap.

**Fix — propagación del actor real (server-side, nunca inventado):**
- `EvaluateCampaignAutomationInput`/`CampaignAutomationDispatchInput` ganan un campo obligatorio `actorUserId: string`.
- Cada uno de los 5 call sites (`submitCampaignForReview`, `approveCampaign`, `rejectCampaign`, `generateCampaignDraftWithAI`, `regenerateCampaignContent`) ya tenía un `actorUserId: string` en su propio input — resuelto **server-side desde la sesión autenticada** en la Server Action correspondiente (nunca leído directamente del browser; los 5 use cases ya lo tenían de fases anteriores, 7F no lo introduce). Ese mismo valor se propaga tal cual — no se resuelve ni se deriva un actor nuevo en 7F.
- `evaluate-campaign-automation.use-case.ts`: `createdBy: 'campaign-automation-evaluator'` → `createdBy: actorUserId`.
- Guardia defensiva agregada (no solo el tipo TS): si `actorUserId` llega vacío/falsy en runtime, la task se **salta** (`taskSkipped: true`, logueado) en vez de intentar un INSERT con un valor inválido — nunca se fabrica un UUID.
- Para `campaign_ai_provider_failure` (que solo crea un `alert`, tabla sin columna `created_by`), el `actorUserId` se agrega a `alert.metadata.actorUserId` — no cambia el contrato de persistencia de `alerts`, solo mejora observabilidad/auditoría con un dato que ya no es secreto (es un UUID de usuario de la propia organización).

**Corrección de documentación (§7 del smoke, aplicada arriba):** `tasks` NO tiene columna `metadata` — la relación campaign→task en 7F usa exclusivamente `tags[]` + texto libre en `description` (link interno `/campaigns/{id}`), nunca `task.metadata`. La Sección 8 de este reporte ya lo decía correctamente antes del bug; se mantiene sin cambios y se reafirma aquí explícitamente porque el smoke pidió verificarlo.

**Ningún dato quedó en un estado ambiguo:** la campaña ya había transicionado correctamente a `review` en las campañas afectadas por el bug — solo faltaba la tarea. No se requiere ninguna reparación de datos de campañas (a diferencia de, por ejemplo, R-UX-01 en Phase 7D, que sí dejó presupuestos en $0). Si el usuario quiere confirmar cuántas campañas quedaron sin tarea mientras el bug estuvo presente, puede correr:
```sql
select c.id, c.name, c.status, c.submitted_for_review_at
from campaigns c
where c.status in ('review','approved','rejected')
  and not exists (
    select 1 from tasks t
    where t.organization_id = c.organization_id
      and 'campaign-id:' || c.id::text = any(t.tags)
  );
```
(Documentado como consulta de diagnóstico manual — no se ejecutó contra ninguna base real desde esta sesión.)

---

## 19. Deferido explícitamente (no es deuda oculta)

- Email / Slack / SMS / WhatsApp / push mobile — fuera de alcance de 7F por instrucción explícita.
- Historial completo de tasks por campaña en UI (requeriría un método de lectura nuevo en `TaskRepository` — ver R-TECH-14).
- n8n para estas notificaciones — no hay razón técnica que lo justifique hoy (application layer ya resuelve todo).
- Publicación real en Meta/Google/YouTube — fase posterior del roadmap, explícitamente fuera de 7F/7G.
