# PHASE 8A — Campaign Activation Model — Audit + Architecture

**Rama:** `feat/phase-8-campaign-operations`
**HEAD auditado:** `fd8b79d` (`feat(phase-8): add branding and theming foundation`)
**Base `main`:** `a8025ec` (`docs(phase-7): close campaign studio phase`)
**Subfase:** AUDIT + ARCHITECTURE ONLY — sin implementación de código.
**Fecha:** 2026-08-24

> Este documento cubre íntegramente el encargo de Phase 8A: auditoría de
> código real, diseño del dominio de activación, modelo de datos propuesto
> (sin migración), RLS conceptual, capa de aplicación, contratos de
> repositorio, arquitectura de UI, estrategia de idempotencia/auditabilidad/
> seguridad, relación con Phase 6 (runtime de automatización) y Phase 7
> (aprobación de campañas), diseño del futuro Publishing Gateway (Phase 8B,
> sin implementar), taxonomía de errores, observabilidad, riesgos, límite de
> MVP y subfases recomendadas. No se creó ninguna migración, entidad,
> repositorio, use case, componente UI, Server Action, API externa ni
> workflow n8n.

---

## 0. Precheck

```
git branch --show-current  → feat/phase-8-campaign-operations
git log -1 --oneline        → fd8b79d feat(phase-8): add branding and theming foundation
git status --short          →  M supabase/config.toml
                                ?? .agencia-ai/.claude/commands/new-client.md
git branch -vv               feat/phase-6-automation-runtime  3fc9fee [origin/feat/phase-6-automation-runtime] ...
                              feat/phase-7-campaign-studio     a8025ec [origin/feat/phase-7-campaign-studio] ...
                            * feat/phase-8-campaign-operations fd8b79d [origin/feat/phase-8-campaign-operations] ...
                              main                             a8025ec [origin/main] docs(phase-7): close campaign studio phase
```

Confirmado: branch, HEAD, `main` y el estado local coinciden exactamente con
lo esperado. Los dos archivos fuera de scope (`supabase/config.toml`
modificado, `.agencia-ai/.claude/commands/new-client.md` sin trackear) son
los únicos cambios locales — no se tocaron, no se stagearon, no se
revirtieron. `origin/feat/phase-8-campaign-operations` está alineada con
`HEAD` (no hay commits locales sin push ni divergencia).

---

## 1. Current-state audit

### 1.A Campaigns — dominio, aplicación, UI, aprobación, automatización

**Dominio** (`packages/domain/src/entities/campaign.ts`):

- `Campaign` es inmutable en TypeScript (`readonly` en todos los campos) y
  vive en `organizationId` + `clientId` obligatorios. Campos relevantes para
  activación: `platform: AdPlatform` (enum cerrado de 14 valores —
  `meta_ads`, `google_ads`, `youtube_ads`, `tiktok_ads`, `linkedin_ads`,
  `twitter_ads`, `snapchat_ads`, `pinterest_ads`, `amazon_ads`,
  `microsoft_ads`, `spotify_ads`, `apple_ads`, `ga4`, `shopify`),
  `objective`, `budget`/`currency`, `startDate`/`endDate`,
  `generatedContent: Record<string, unknown> | null` (contenido IA
  estructurado, Phase 7D), `metadata: Record<string, unknown>`.
- `CampaignStatus` (en `@bop-agency/shared`, `constants/status.ts`):
  `draft | review | approved | active | paused | completed | rejected`.
  El grafo de transición puro (`canTransitionCampaign`) YA incluye
  `approved → active` y `active → paused | completed`, pero **ningún use
  case existente ejecuta esa transición** — es una invariante de dominio
  declarada por adelantado, sin caller. Esto es exactamente el vacío que
  Phase 8A debe llenar: hoy no existe ningún mecanismo (RPC, use case,
  trigger) que lleve una campaña de `approved` a `active`.
- `campaign-generated-content.ts`: contenido IA con union discriminada por
  `platform` (`meta_ads` | `google_ads` únicamente — `SUPPORTED_GENERATION_PLATFORMS`).
  Persistido en `campaigns.generated_content` (jsonb). **Este es el
  candidato natural a snapshotear** en una activation — es ya un objeto
  jsonb versionado (`schemaVersion`) y validado, pensado para persistencia
  duradera.
- `campaign-approval.ts`: `CampaignApproval` es un audit trail
  **append-only e inmutable**. Se escribe EXCLUSIVAMENTE dentro de las RPCs
  `approve_campaign`/`reject_campaign` (`SECURITY DEFINER`), nunca por
  `INSERT` directo del dominio — no existe método `create` en
  `CampaignApprovalRepository`. Este es el patrón arquitectónico más
  importante a replicar en Phase 8A: **transiciones críticas de estado se
  hacen vía RPC `SECURITY DEFINER` que revalida rol+status dentro de la
  misma transacción que escribe el audit trail**, nunca vía `UPDATE`
  directo desde el cliente autenticado.

**Aplicación** (`packages/application/src/use-cases/campaigns/`):

- `approveCampaign`: revalida rol `admin+` server-side, revalida transición
  de dominio, llama a `campaignRepository.approve()` (que internamente
  invoca la RPC), y SOLO DESPUÉS del commit exitoso dispara
  `evalCampaignAutomationSilently('campaign_approved')` — un side effect
  **best-effort, post-commit**, que crea una tarea interna ("Preparar
  activación de campaña: `<name>`"). Un fallo en este paso NO revierte la
  aprobación. Este es el patrón exacto que Phase 8A debe seguir para
  cualquier side effect propio (crear alert/task de activación).
- `submitCampaignForReview`, `rejectCampaign`, `createCampaignDraft`,
  `editCampaignDraft`, `generateCampaignDraftWithAI`,
  `regenerateCampaignContent`: cubren el ciclo `draft → review → approved|
  rejected` y la generación de contenido IA. Ninguno conoce el concepto de
  "activación" — el flujo termina explícitamente en `approved` + task
  informativa.
- `campaign-automation-*.ts` (Phase 7F): tres archivos que implementan el
  patrón "evento de negocio interno → task/alert best-effort, con firma
  determinística de deduplicación (`alert_key`/`signatureTag`)". Es un
  espejo deliberado del patrón de Phase 6F
  (`automation-incident-signatures.ts`/`evaluate-automation-incident.use-case.ts`).
  **Phase 8A debe reutilizar este MISMO patrón** (firma
  `activation:{orgId}:{activationId}:{evento}`) en vez de inventar uno
  nuevo.

**UI** (`apps/web/src/app/(protected)/campaigns/`, `components/campaigns/`):

- Server Actions en `campaigns/actions.ts`: `createCampaignDraftAction`,
  `generateCampaignDraftWithAiAction`, `regenerateCampaignContentAction`,
  `editCampaignDraftAction`, `submitCampaignForReviewAction`,
  `approveCampaignAction`, `rejectCampaignAction`. No existe ninguna acción
  de activación/publicación.
- Componentes: `CampaignApprovalPanel`, `CampaignStatusBadge`,
  `CampaignAutomationActivity` (probablemente lista de tasks/alerts
  generados por Phase 7F — reutilizable conceptualmente para mostrar el
  activity log de una activation), `CampaignWizardForm`,
  `GeneratedContentView`, `ComplianceReview`. No existe ruta ni componente
  de activación.
- **Conclusión de flujo actual:** `Campaign approved` → task "Preparar
  activación de campaña" → **STOP**. Coincide exactamente con el diagrama
  del encargo.

### 1.B Clients / Integrations

- `ClientIntegration` (dominio, `client.ts`): `provider: string` (texto
  libre, NO enum), `externalAccountId: string`, `status: IntegrationStatus`
  (`active | inactive | error`), `configuration: Record<string, unknown>`
  (jsonb, con comentario explícito en la migración: **"nunca guardar
  secrets/tokens en texto plano"**), `lastSyncedAt`.
- **`ClientRepository` solo expone `listIntegrations()` (lectura).** No hay
  `create`/`update`/`delete` de integraciones en ningún use case de
  `packages/application/src/use-cases/clients/`. La tabla
  `client_integrations` (`supabase/migrations/20260730120000_phase3_clients.sql`)
  existe con constraint `UNIQUE (client_id, provider, external_account_id)`
  y un CHECK de que `configuration` sea un objeto JSON, pero **no hay
  ningún camino de escritura en la aplicación** — ni Server Action, ni RPC,
  ni seed real de Meta/Google.
- **Conclusión crítica:** hoy NO existen integraciones Meta/Google reales
  ni siquiera como placeholders configurados — la tabla está vacía de
  facto (sin escritor). Cualquier diseño de Phase 8A que asuma
  `client_integrations` pobladas es prematuro. Phase 8A debe **referenciar**
  `client_integrations` (FK opcional) para cuando 8E/8F provean el
  escritor, pero no puede depender de que existan filas reales todavía.
  El campo `provider` es texto libre en dominio — Phase 8A A debe decidir
  si activation.provider usa el mismo enum cerrado que se proponga para
  canales, o permanece desacoplado (recomendación: enum propio y cerrado
  para activation, ver §7 — no heredar el `provider: string` libre de
  `client_integrations`).

### 1.C Automations (Phase 6 runtime)

- `Automation` (definición): `status: draft|active|paused|archived`,
  `triggerConfig` (schedule/webhook/event/manual), `retryPolicy` embebida,
  `n8nWorkflowId` nullable.
- `AutomationExecution` (runtime de UNA ejecución):
  `status: queued|running|succeeded|failed|cancelled|retrying`,
  `attempt`, `idempotencyKey` (branded type, único por
  `organizationId`+key), `triggeredBy`, `triggerType`, `inputMetadata`/
  `outputMetadata` (sanitizados — hay una lista explícita
  `FORBIDDEN_METADATA_KEYS` que filtra `secret|token|key|password|auth|
  credential|...`), `errorCode`/`errorMessage`.
- `startAutomationExecution`: idempotencia real vía constraint único
  `(organizationId, idempotencyKey)` + recuperación en `CONFLICT` (23505) —
  no depende de deshabilitar el botón en UI. Dispatch vía
  `WorkflowDispatcherPort` (puerto de aplicación) →
  `N8nDispatcherAdapter` (infra) → `N8nWebhookDispatcher` (HMAC-SHA256,
  timeout configurable, callback URL SIEMPRE resuelto server-side desde
  `NEXT_PUBLIC_APP_URL`, nunca aceptado del caller — cierre explícito de
  vía SSRF).
- `retryAutomationExecution`: crea una NUEVA fila (nunca sobrescribe),
  backoff exponencial calculado ANTES de crear la ejecución (si hay
  backoff pendiente, no crea fila — devuelve `retryDeferred: true`),
  idempotencyKey determinística `previousKey:retry:N`.
- `evaluateAutomationIncident` (Phase 6F): evaluador determinístico que
  crea/actualiza/resuelve alerts (`upsertByAlertKey`, dedupe atómico
  `ON CONFLICT`) y tasks (`findActiveBySignatureTag` antes de crear) según
  tipo de incidente. Distingue explícitamente qué tipos de incidente crean
  task vs. solo alert.
- **Qué reutilizar en Phase 8A:** el patrón de idempotencyKey +
  constraint único, el patrón de `alert_key`/`signatureTag` determinístico
  para deduplicación, el patrón "el status es la fuente de verdad y el
  side effect es post-commit best-effort".
- **Qué NO mezclar:** `AutomationExecution` es runtime técnico de UN
  disparo hacia n8n (con `attempt`, `queuedAt`/`startedAt`/`completedAt`,
  reintentos por backoff). `CampaignActivation` es dominio de negocio (una
  campaña puede tener una activación que dura días, con canales manuales
  que nunca tocan n8n). Ver comparación detallada en §21.

### 1.D Tasks / Alerts

- `Task`: `organizationId`, `clientId | null`, `status: pending|
  in_progress|done|cancelled|blocked`, `priority`, `tags: string[]`
  (usadas para las firmas de deduplicación), `createdBy|updatedBy` (string,
  user id), soft-delete (`deletedAt`). `TaskRepository.create()` +
  `findActiveBySignatureTag()` ya existen (Phase 6F) — reutilizables tal
  cual para tareas de activación.
- `Alert`: `alertKey` (dedupe determinística), `alertType` (texto libre,
  ej. `automation.dispatch_failed`), `severity: critical|warning|info`,
  `status: active|acknowledged|snoozed|resolved`. `acknowledge`/`resolve`
  van por RPC (`acknowledge_alert`/`resolve_alert`) — un trigger DB bloquea
  `UPDATE` directo a campos de auditoría cuando `auth.uid() IS NOT NULL`;
  `upsertByAlertKey`/`resolveActiveByAlertKeyPrefixes` requieren
  `service_role` (usados hoy solo desde el callback del webhook n8n con
  `adminClient`, y desde los evaluadores best-effort que corren en el
  Server Action con el rol del propio actor autenticado — hay que verificar
  esto último caso por caso en 8A.2, no asumirlo).
- Firma de campaign (Phase 7F): `campaign:{orgId}:{campaignId}:{evento}`
  (`campaignReviewRequestedKey`, `campaignApprovedKey`,
  `campaignRejectedKey`, `campaignAiProviderFailureKey`). Phase 8A debe
  añadir un namespace paralelo `activation:{orgId}:{activationId}:{evento}`
  siguiendo exactamente el mismo `buildKey`/longitud máx 255/sin PII.

### 1.E n8n

- `n8n-local/`: `docker-compose.yml` + `.env(.example)` para entorno local,
  `workflows/phase6-local-runtime-test.json` (workflow de prueba del
  runtime Phase 6, no de publicación), `backups/workflows/W-05/W-06/W-07-*`
  (workflows de **generación y envío de reportes**, no de publicación de
  campañas — legacy de una fase de reporting anterior a Phase 6/7/8).
- Gateway actual: `N8nWebhookDispatcher` (infra) firma HMAC-SHA256 sobre
  `timestamp.rawBody`, secreto `AUTOMATION_WEBHOOK_SECRET` (≥32 chars,
  nunca logueado), timeout configurable, callback URL fija y
  server-resuelta (`/api/webhooks/n8n`). Es un **transporte genérico de
  ejecución de automatizaciones**, no específico de publicación de
  campañas — cualquier automatización definida en `automations` puede
  usarlo.
- **Decisión NO tomada aún (correcto, corresponde a 8B):** si el futuro
  publishing (Meta/Google) debe (1) reutilizar este mismo transporte n8n,
  (2) usar adapters directos a las APIs de proveedor, (3) una combinación,
  o (4) diferir la decisión. El audit no encuentra ninguna razón técnica
  que fuerce una decisión ahora — el `WorkflowDispatcherPort` actual está
  acoplado a la forma de `AutomationExecution` (execution log, retry
  policy de automation), no a `CampaignActivationTarget`. Si 8B decide
  reutilizar n8n, necesitará su propio puerto (`ChannelPublisherPort`, ver
  §22) que puede o no delegar internamente al mismo
  `N8nWebhookDispatcher` — eso es un detalle de implementación de 8B, no
  algo a resolver en 8A.

### 1.F Legacy / previous Meta / publishing material

Búsqueda ejecutada sobre `packages/` y `apps/` (excluyendo
`node_modules`) por: `facebook`, `instagram`, `business manager`,
`marketing api`, `ad account`/`adaccount`, `google ads`/`googleads`,
`meta ads`/`meta_ads`.

| Hallazgo | Clasificación | Detalle |
|---|---|---|
| `packages/integrations/src/contracts/advertising-platform.provider.ts` (`AdvertisingPlatformProvider`) | **Placeholder sin implementación, sin wiring** | Puerto de solo LECTURA (`getAccountMetrics`, `getCampaigns`) pensado para métricas, no para publicar. Comentario propio: "via n8n en Fase 1, direct en Fase 2+". Ningún adapter en `infrastructure` lo implementa (`grep` de `AdvertisingPlatformProvider` solo devuelve el propio contrato, el `index.ts` que lo reexporta y el `README.md` del paquete). **No reutilizar tal cual para publishing** — su forma es de lectura de métricas, no de ejecución de publicación; puede inspirar el naming de 8B pero no es un punto de partida funcional. |
| `packages/domain/src/entities/campaign-generated-content.ts` (`SUPPORTED_GENERATION_PLATFORMS = ['meta_ads','google_ads']`) | **Vigente** | Union discriminada de contenido generado por IA, ya persistido — candidato a snapshot (ver §14). No tiene relación con publicación real, solo con la forma del contenido creativo. |
| `packages/shared/src/constants/platforms.ts` (`AD_PLATFORMS`, `METRIC_PLATFORMS`) | **Vigente** | Dos enums YA existentes y NO idénticos: `AdPlatform` (14 valores, para `campaigns.platform`) vs. `MetricPlatform` (6 valores: `meta|google|tiktok|linkedin|twitter|other`, para `client_metrics.platform`/`alerts.platform`). Phase 8A debe decidir explícitamente si el canal de activación reutiliza uno de estos dos, o define un tercer enum propio — ver §7 (recomendación: tercer enum propio, más granular que ambos, porque "canal de activación" no es lo mismo que "plataforma de anuncio" ni "plataforma de métrica" — ej. `instagram_organic` no es un `AdPlatform` ni un `MetricPlatform`). |
| `n8n-local/backups/workflows/W-05/06/07-*.json` | **Legacy, no relacionado** | Workflows de generación/envío de reportes (reporting), de una fase anterior. No tocar, no reutilizar para publishing. |
| `.agencia-ai/.claude/skills/{meta-ads,google-ads,youtube-ads}-campaign-builder/` | **Docs/prompt templates, no código de aplicación** | Son skills de Claude Code para ASISTIR en la creación de contenido de campaña (prompts/plantillas), fuera del árbol de `packages`/`apps`. No son parte del dominio ni tienen relación con publicación real. Fuera de scope de Phase 8A — no auditados en profundidad, no se tocan. |
| RPCs `approve_campaign`/`reject_campaign` | **Vigente — patrón de referencia** | No son "legacy Meta/Google" pero son el precedente arquitectónico más importante para el diseño de transiciones críticas de Phase 8A (ver §1.A). |

**Conclusión del audit de legacy:** no existe código de publicación real
(ni Meta ni Google) en ningún estado — ni vigente, ni legacy, ni dead code
completo. Lo único parcialmente relacionado es un puerto de lectura de
métricas sin implementar. Phase 8A parte de una pizarra limpia en cuanto a
publicación — el riesgo de "reutilización automática incorrecta" que pedía
el encargo verificar es bajo, porque no hay nada tentador que reutilizar
mal.

---

## 2. Reusable architecture (resumen transversal)

1. **RPC `SECURITY DEFINER` para transiciones críticas**, revalidando rol +
   estado dentro de la misma transacción que escribe el audit trail
   (`approve_campaign`/`reject_campaign`). Aplicar a `mark_target_published`,
   `schedule_activation`, `cancel_activation` (ver §16).
2. **Best-effort post-commit side effects** vía un helper "silently" (nunca
   revierte el commit principal, siempre logueado si falla) —
   `evalCampaignAutomationSilently` / `evalIncidentSilently`.
3. **Firma determinística de deduplicación** (`alert_key`/`signatureTag`)
   con prefijo por dominio, `≤255` chars, sin PII/timestamps aleatorios.
4. **Idempotencia real vía constraint único + recuperación en `CONFLICT`**,
   nunca solo deshabilitar un botón en UI (`startAutomationExecution`,
   `retryAutomationExecution`).
5. **Metadata sanitizada** con lista explícita de claves prohibidas antes
   de persistir cualquier jsonb "libre" (`FORBIDDEN_METADATA_KEYS`).
6. **Server Actions delgadas** que resuelven `organizationId`/`actorUserId`
   SIEMPRE desde la sesión server-side, nunca del cliente (patrón repetido
   en `approveCampaign`/`startAutomationExecution`).
7. **`hasMinimumRole` sobre la jerarquía `viewer < operator < strategist <
   admin < owner`** para autorización server-side, independiente de RLS.

---

## 3. Legacy / dead-code findings

Ver tabla en §1.F. Resumen: sin dead code relevante a activación/publishing
más allá del puerto `AdvertisingPlatformProvider` (no implementado, no
dead — simplemente no usado todavía; se puede conservar o deprecar en 8B
sin impacto porque nada depende de él).

---

## 4. Recommended activation aggregate

**Entidades mínimas necesarias (evaluadas contra el árbol de decisión del
encargo):**

- **`CampaignActivation`** — obligatoria. Es el aggregate root: representa
  "esta campaña aprobada se está preparando/ejecutando para distribución".
- **`CampaignActivationTarget`** — obligatoria. Una campaña puede terminar
  en 0..N canales (§7 del encargo); sin esta entidad no se puede modelar
  "falla en un canal y no en otro" (principio central, §2 del encargo) ni
  el camino manual como primera clase (§8).
- **`CampaignActivationEvent`** — obligatoria pero mínima. Es el log de
  auditoría append-only requerido por §10 del encargo (quién/cuándo/qué
  cambió). Alternativa descartada: "status history" implícito en columnas
  de timestamp únicamente — insuficiente porque no captura acciones que no
  cambian el status final (ej. "canal agregado y luego quitado antes de
  publicar", "nota de cancelación").
- **`CampaignActivationPublicationJob` / `CampaignExecutionJob`** —
  **NO se crea en 8A.** No aporta valor todavía: no hay publicación real
  que ejecutar, y el único canal operativo en el MVP (manual) no necesita
  cola de jobs — el operador transiciona el target directamente vía RPC.
  Se reserva explícitamente para 8B, cuando exista al menos un proveedor
  con ejecución asíncrona real (Meta/Google) que sí necesite reintentos,
  estado de job independiente del target, y posible múltiples intentos de
  publicación sobre el mismo target.

**Aggregate boundary:** `CampaignActivation` es el root; `Target` y `Event`
son hijos gobernados por su `activation_id`. `Campaign` y
`CampaignApproval` son aggregates externos referenciados por id — Phase 8A
NUNCA escribe en `campaigns` ni en `campaign_approvals` (frontera dura,
ver §13).

---

## 5. Campaign Activation entity — respuestas a las preguntas obligatorias

| Pregunta | Respuesta recomendada | Justificación |
|---|---|---|
| ¿Una campaign puede tener múltiples activations? | **Sí, en el tiempo — pero como máximo UNA activation no-terminal por campaign a la vez.** | Cubre "reactivar una campaña aprobada" (ej. una campaña `active`→`paused`→se decide relanzar con nuevo presupuesto/canal) sin permitir dos activaciones concurrentes descoordinadas del mismo approved snapshot. Se aplica con un índice único parcial (§15). |
| ¿Una activation representa una ejecución completa o una versión? | **Una ejecución completa sobre UN snapshot aprobado.** No es "una versión editable" — es inmutable una vez creada (salvo transiciones de status/targets). | Consistente con el principio "approval != publication" y con que el snapshot se congela en creación (§14). |
| ¿Se puede reactivar una campaña aprobada después de una activation completada? | **Sí — se crea una NUEVA activation.** Nunca se reabre una `completed`/`cancelled`/`failed`. | Mantiene inmutabilidad y auditabilidad: cada intento de distribución es una fila propia con su propio snapshot y su propio log de eventos. |
| ¿Qué pasa si cambia la campaña después de aprobación? | **No afecta activations existentes** (operan sobre el snapshot). Si se necesita reflejar el cambio, se crea una nueva activation con snapshot actualizado — requiere una nueva aprobación si el cambio altera contenido/presupuesto, según el grafo de `CampaignStatus` ya existente (que no modela "approved → draft"; fuera de alcance de 8A modificarlo). | Evita que una edición silenciosa de campaign después de aprobar cambie lo que ya se activó — exactamente el riesgo que el encargo pide prevenir explícitamente en §14. |
| ¿Approved campaign debe ser inmutable? | **Fuera de alcance de 8A modificar esto** — hoy `UpdateCampaignInput` ya solo permite status `draft`/`review` desde el use case genérico; no hay ningún use case que edite una campaign `approved`. El dominio YA es de facto inmutable post-aprobación. Phase 8A no necesita añadir ninguna restricción nueva aquí. | Verificado en el audit de `campaign.ts`/`edit-campaign-draft.use-case.ts` — el gap no existe. |
| ¿Activation debe snapshotear el contenido aprobado? | **Sí, obligatorio.** | Es la única forma de cumplir "nunca permitir que una futura edición de campaign cambie silenciosamente lo activado" (§14 del encargo) dado que hoy no hay inmutabilidad a nivel de fila de `campaigns` (no hay versión ni tabla de historial de campaign). |
| ¿Activation referencia generated_content o copia un snapshot? | **Copia un snapshot (jsonb) en el momento de creación.** | Referenciar (FK a `campaigns.generated_content` implícito vía `campaign_id`) reintroduce el riesgo de "stale snapshot" que el risk register debe registrar como mitigado, no como aceptado. |
| ¿Budget debe snapshotearse? | **Sí**, dentro del mismo snapshot jsonb. | Mismo argumento — presupuesto es dato crítico de negocio y de compliance. |
| ¿Audience debe snapshotearse? | **Sí** — la audiencia vive dentro de `generatedContent`/`metadata` hoy (no hay columna dedicada); se snapshotea como parte del mismo jsonb, no se modela aparte. | No hay concepto de "audience" normalizado en el dominio actual — inventar una tabla nueva para esto en 8A sería sobre-modelar sin evidencia de necesidad. |
| ¿Campaign name/goal/channel deben snapshotearse? | **Sí** — `name`, `objective`, `platform` (el `AdPlatform` original de campaign) se incluyen en el snapshot para trazabilidad histórica, aunque `channel`/`provider` de la activation en sí son conceptos NUEVOS y separados (ver §7) — no confundir "platform de la campaña" con "channel de la activation": una campaña `platform: meta_ads` puede terminar con targets `meta_ads` + `instagram_organic` + `manual`. | Evita ambigüedad entre el `AdPlatform` heredado de campaign y el nuevo `ActivationChannel`. |

**Conclusión:** se confirma la preferencia conceptual del usuario — la
activation opera sobre un **snapshot inmutable**, no sobre datos mutables
futuros de `campaigns`.

---

## 6. Status machine

Tres niveles distintos, explícitamente NO fusionados (para no duplicar
conceptos, pero también para no perder granularidad — un target puede
fallar sin que la activation entera falle):

### A. Activation-level status

```
pending → preparing → ready → scheduled → executing → completed
                                                      → partially_completed
   ↓            ↓          ↓         ↓          ↓
cancelled    cancelled  cancelled  cancelled  (no cancelable una vez
                                               executing avanzó — ver nota)
                                    failed ← (todos los targets fallan/cancelan
                                              sin ninguno publicado)
```

- `pending`: activation creada, sin targets o con targets sin preparar.
- `preparing`: al menos un target en preparación (checklist/asset en curso).
- `ready`: todos los targets activos están `ready` — la activation puede
  ejecutarse (manualmente o programada).
- `scheduled`: tiene `scheduled_at` futuro — no aplica a canales
  puramente manuales sin fecha (opcional, se permite `ready` sin pasar por
  `scheduled`).
- `executing`: al menos un target pasó a `publishing`/está siendo
  procesado. Es el único estado donde `cancel` deja de ser una simple
  transición de UI y requiere confirmar qué targets ya no son cancelables
  (ver §9 idempotencia).
- `completed`: todos los targets terminaron en `published` (ninguno en
  `failed`/`cancelled` — si algunos fueron `cancelled` intencionalmente
  antes de ejecutar, no cuentan contra "completed" total, ver nota abajo).
- `partially_completed`: al menos un target `published` y al menos un
  target `failed` (nunca oculta un fallo parcial como éxito — cumple el
  principio central §2).
- `failed`: ningún target llegó a `published` y al menos uno está `failed`.
- `cancelled`: cancelada explícitamente antes de completar — terminal.

Nota: el status de la activation se **deriva** de los status de sus
targets (función pura, igual que `canTransitionCampaign`), no se setea
libremente — evita inconsistencia entre "lo que dicen los targets" y "lo
que dice la activation". Las únicas transiciones *comandadas* directamente
sobre la activation son `cancel` (antes de completar) y el avance
`pending→preparing→ready→scheduled` que resulta de acciones sobre targets.

### B. Channel-target-level status

```
pending → preparing → ready → scheduled → publishing → published
   ↓           ↓          ↓         ↓
cancelled   cancelled  cancelled  cancelled
                                    ↓
                                  failed
```

- Para el canal `manual` (MVP real, Phase 8D), `publishing`/`scheduled`
  son opcionales — el operador puede ir directo de `ready` a `published`
  (marca manual con timestamp+actor+referencia externa opcional). Ver §8.
- `failed` solo alcanzable desde `publishing` (canales automatizados
  futuros) — un canal manual no "falla" técnicamente, el operador lo
  marcaría `cancelled` con nota si decide no publicar.

### C. Execution-job-level status

**No modelado en 8A** (ver §4 — se difiere a 8B). Cuando exista, vivirá
por-intento-de-publicación dentro de un target (N jobs pueden intentar
publicar el mismo target), con su propio `queued|running|succeeded|failed|
cancelled|retrying` — deliberadamente calcado del `AutomationExecutionStatus`
existente para reutilizar el mismo vocabulario mental, pero como tabla
separada (ver §21).

### Transiciones inválidas explícitas

- `completed|cancelled|failed → *`: ninguna (terminales).
- `pending → scheduled|executing|completed` directo: inválido — debe pasar
  por `preparing`/`ready` (evita "activation lista para publicar" sin
  checklist).
- Target: `pending → published` directo: inválido — debe pasar por
  `ready` como mínimo (fuerza que exista una confirmación explícita de
  "listo para publicar" incluso en manual, cumpliendo §8 "no debe ser un
  fallback informal").

---

## 7. Multi-channel model

**Cerrado, con extensibilidad controlada** (mismo criterio que `AdPlatform`/
`MetricPlatform`: union de string literals en `@bop-agency/shared`, no un
`text` libre de UI):

```ts
export const ACTIVATION_CHANNELS = [
  'manual',
  'meta_ads',
  'instagram_organic',
  'facebook_organic',
  'google_ads',
  'linkedin_ads',
  'email',
] as const;
export type ActivationChannel = (typeof ACTIVATION_CHANNELS)[number];

export const ACTIVATION_PROVIDERS = ['manual', 'meta', 'google', 'linkedin', 'email'] as const;
export type ActivationProvider = (typeof ACTIVATION_PROVIDERS)[number];
```

- **`channel`**: qué se está distribuyendo (paid social, organic post,
  email). Determina la UI y las reglas de negocio (ej. `email` no necesita
  `client_integration_id` de ads).
- **`provider`**: quién ejecuta técnicamente (`meta` sirve tanto
  `meta_ads` como `instagram_organic`/`facebook_organic`). Coincide
  deliberadamente con el vocabulario de `MetricPlatform` donde se
  superponen (`meta`, `google`, `linkedin`) para minimizar términos nuevos,
  pero es un enum PROPIO — no se reutiliza el tipo `MetricPlatform` para no
  acoplar activación a métricas.
- **`placement`**: texto libre pero **acotado por longitud y por lista
  documentada en comentario** (ej. `instagram_feed`, `instagram_stories`,
  `facebook_feed`), NUNCA una URL ni un ID arbitrario enviado desde el
  browser — es descriptivo, no una referencia a un recurso externo. La
  referencia real a un recurso externo (post id, ad id) vive en
  `external_reference` del target, poblada por el operador (manual) o por
  el futuro adapter de proveedor (8E/8F), nunca por el browser sin
  validación.

**No sobre-modelar en MVP:** no se crea una tabla `channels` separada ni
`providers` separada — son enums cerrados en `@bop-agency/shared`, igual
que `AdPlatform`. Se revisará si necesitan pasar a tabla configurable solo
si Phase 8E/8F lo demandan (más proveedores, canales por-cliente
habilitables, etc.) — no hay evidencia de esa necesidad hoy.

---

## 8. Manual activation as first-class path

Diseño concreto (sin implementar):

1. Operador abre una `campaign` en `approved` → botón "Crear activación".
2. `createCampaignActivation` (use case) crea `CampaignActivation` en
   `pending` con snapshot congelado.
3. Operador agrega un target `channel: 'manual'` (sin `client_integration_id`
   — el CHECK conceptual es: `client_integration_id` es NULL siempre que
   `channel = 'manual'`, y se espera no-NULL para canales con proveedor
   real una vez existan escritores de `client_integrations`, ver §11).
4. Operador completa un checklist de preparación (freeform en MVP,
   `readiness_checklist: jsonb`) → transición `pending → preparing → ready`
   sobre el target (use case `prepareActivationTarget`/`markTargetReady`,
   revalida rol `operator+`).
5. Operador ejecuta la distribución FUERA del sistema (ej. publica
   manualmente en Meta Business Suite) y vuelve a marcarla:
   `markManualTargetPublished(targetId, { externalReference?, note? })` —
   RPC que fuerza `published_at = now()`, `published_by = auth.uid()`,
   valida transición `ready → published` (nunca `pending → published`
   directo).
6. El status de la activation se recalcula automáticamente (§6.A).

Esto es una implementación real del mismo state machine que usarán los
canales automatizados — el canal `manual` simplemente no tiene un job de
ejecución asíncrono entre `ready` y `published`; el "ejecutor" es el
propio operador. No hay bifurcación de código ni tabla paralela para
manual — es el MISMO modelo con `channel = 'manual'` y `provider =
'manual'`.

---

## 9. Idempotency

| Riesgo | Mitigación propuesta |
|---|---|
| Crear activation dos veces por doble click | Índice único parcial `(campaign_id) WHERE status NOT IN ('completed','cancelled','failed')` — la segunda request falla con `CONFLICT` y el use case recupera y devuelve la activation existente (mismo patrón que `startAutomationExecution`). |
| Crear target duplicado | `UNIQUE (activation_id, channel, provider, COALESCE(placement, ''))` — segunda request recupera el existente. |
| Ejecutar publicación dos veces (futuro, 8B) | Diferido — cuando exista `execution_job`, usar `idempotencyKey` igual que `AutomationExecution`. |
| Reintentar un job (futuro, 8B) | Diferido — mismo patrón `retryAutomationExecution` (nueva fila, nunca sobrescribe). |
| Webhook duplicado (futuro, 8B/8E/8F) | Diferido — reutilizar HMAC + verificación de firma ya existente en `/api/webhooks/n8n`, con su propia idempotencyKey por evento de proveedor. |
| Operador marca `published` dos veces | La RPC `mark_target_published` valida `status = 'ready'` (o `'scheduled'`) ANTES de escribir — una segunda invocación falla con `INVALID_STATUS` (mismo criterio que `canTransitionExecution` bloqueando `succeeded → running`). No depender solo de deshabilitar el botón en UI. |

**Principio explícito:** ninguna transición crítica confía únicamente en
que el frontend deshabilite un control — todas están respaldadas por una
constraint DB o una revalidación de estado dentro de la RPC/use case.

---

## 10. Auditability

Estrategia: **`campaign_activation_events` (event log append-only) +
timestamps/actor en la fila principal para el "estado actual"**. Se
descarta:

- **Solo timestamps** (`prepared_at`, `ready_at`, etc. sin log): no captura
  acciones que no avanzan el status final (canal agregado y luego
  quitado, notas de cancelación con detalle, error sanitizado por
  intento). Insuficiente para "qué falló" cuando hay reintentos futuros.
- **Solo status history genérico** (tabla `(entity_id, from, to, at)` sin
  contexto): pierde el `note`/`metadata` por evento, y no distingue
  eventos que no son transiciones de status (ej. `target_added`).

El event log responde exactamente a la lista de preguntas del encargo:
quién creó (`created_by` en la fila + evento `activation_created`), cuándo
(`created_at`), qué campaign approved originó la activación
(`campaign_id`+`campaign_approval_id`, FK obligatoria), qué contenido
exacto (`approved_snapshot`), qué canales (`campaign_activation_targets`),
qué actor preparó (evento `target_ready` con `actor_user_id`), quién
ejecutó (evento `target_published`/`target_failed` con `actor_user_id`,
`NULL` si es sistema), qué salió bien/mal (`to_status`+`note`+
`metadata.errorCode` sanitizado), cuándo (`created_at` del evento), si fue
manual o automático (`is_system` boolean + `channel`), referencia externa
si existe (`metadata.externalReference`, espejo del campo del target al
momento del evento), error sanitizado si falla (mismo criterio que
`errorMessage` de `AutomationExecution` — nunca stack traces ni secretos).

No se crea un sistema de eventos genérico/pub-sub — es una tabla simple,
igual de simple que `campaign_approvals`.

---

## 11. Security / tenancy

**Invariantes (a validar por trigger `BEFORE INSERT/UPDATE`, mismo patrón
que `manage_client_write`):**

- `campaign_activations.organization_id = campaigns.organization_id` de la
  campaign referenciada (verificado en el trigger, no confiado al caller).
- `campaign_activations.client_id = campaigns.client_id`.
- `campaign_activation_targets.organization_id` heredado de la activation
  (denormalizado para RLS simple, verificado contra el padre).
- `campaign_activation_targets.client_integration_id`, cuando no-NULL,
  debe pertenecer al mismo `client_id`/`organization_id` — cruzar
  organización aquí sería la vía más directa de fuga de credenciales
  ajenas cuando 8E/8F exista un escritor real de `client_integrations`.
- `actor_user_id`/`created_by`/`published_by` **siempre** `auth.uid()`
  server-side (o `service_role` explícito para el futuro callback de
  proveedor) — nunca un valor aceptado del browser. Mismo criterio que
  `manage_client_write`/las RPCs de campaign.
- No se propone `service_role` para el flujo normal de operador — solo
  para el futuro callback HMAC-verificado de proveedores externos (8E/8F),
  igual que hoy solo el webhook n8n usa `adminClient`.
- Rol server-side reforzado con `hasMinimumRole` en cada use case, más
  RLS a nivel DB como segunda capa (defensa en profundidad, mismo patrón
  que `approveCampaign` revalida antes de llamar a la RPC que también
  revalida).

**Gaps actuales documentados (no corregidos en 8A, solo señalados):**

- `client_integrations` no tiene ningún escritor — cuando 8E/8F lo añadan,
  deberá reutilizar exactamente este mismo patrón de trigger +
  `service_role` solo para refresh de tokens, nunca de escritura por
  usuario final con secretos en claro.
- No existe hoy estrategia de refresh de token documentada en el código
  (no hay tabla de tokens, solo `configuration: jsonb` con el comentario
  "nunca secrets"). Phase 8A no resuelve esto — lo hereda como
  responsabilidad de 8E/8F, y lo registra en el risk register (§29).

---

## 12. Role matrix

Basada en `OrganizationRole = viewer < operator < strategist < admin <
owner` (`hasMinimumRole`) y coherente con Phase 7 (`admin+` aprueba/
rechaza campañas):

| Acción | Rol mínimo | Justificación |
|---|---|---|
| View activation | `viewer` | Lectura pura, mismo nivel que ver campaigns/tasks/alerts. |
| Create activation | `strategist` | Simétrico a quién puede crear/editar campaign drafts — no requiere `admin` porque no publica nada todavía. |
| Edit activation (metadata/notes) | `strategist` | Mismo nivel que create. |
| Add/remove channel target | `strategist` | Configuración de distribución, no ejecución. |
| Prepare activation / mark target ready | `operator` | Es trabajo operativo de checklist, coherente con que `operator` ya gestiona tasks/alerts en Phase 5/6. |
| Schedule activation | `operator` | Programar una fecha no es una decisión estratégica nueva, es logística. |
| Cancel activation | `strategist` | Cancelar es una decisión de negocio (similar a `reject_campaign` que ya es `admin+`, pero cancelar una activación ya aprobada es menos sensible que rechazar la aprobación en sí — se propone `strategist`, revisar con el usuario si se prefiere `admin+` dado que es irreversible). |
| Mark manual published | `operator` | Es la acción operativa central de Phase 8D — coherente con que `operator` ya "opera" automatizaciones (`start`/`retry` execution en Phase 6 son accesibles a `operator`, verificar en 8A.2 el nivel exacto usado ahí para mantener paridad). |
| Execute external publishing (futuro) | `operator` (con integración ya configurada por `admin+`) | Simétrico al patrón manual — configurar la integración es más sensible que dispararla una vez configurada. |
| Retry execution (futuro) | `operator` | Paridad con `retryAutomationExecution` (Phase 6), que no exige rol superior a `operator` en el use case (la exigencia real vendrá de la RLS de la Server Action que lo invoque — a confirmar en 8A.2/8B). |
| Inspect errors | `viewer` | Igual que hoy se puede ver `errorMessage` de una `AutomationExecution` sin rol elevado — es diagnóstico, no acción. |

**Nota:** esta matriz es una PROPUESTA para aprobación explícita — el
encargo pedía auditar roles actuales y justificar, no asumir la propuesta
inicial del usuario. Los puntos marcados "a revisar" (cancelar activation)
deben confirmarse antes de 8A.2.

---

## 13. Approval boundary

Reglas duras, para implementar como parte del trigger/RPC de creación de
activation en 8A.1/8A.2:

- `createCampaignActivation` **falla** si `campaign.status !== 'approved'`
  (verificado server-side en el use case, reforzado por CHECK/trigger en
  DB que valida contra el status ACTUAL de `campaigns` en el momento de
  insert — no confiar en que el caller ya lo verificó).
- La activation **almacena `campaign_approval_id`** (FK a la fila de
  `campaign_approvals` con `action = 'approved'` más reciente en el
  momento de creación) — ambos se verifican: el `status` actual de
  campaign Y la existencia de un registro de aprobación real. Responde
  directamente a la pregunta abierta del encargo §13: **se verifican
  ambos**, porque el status por sí solo es mutable en teoría futura
  (aunque hoy no lo sea, ver §5) mientras que el `campaign_approval_id`
  ata la activation a un evento de auditoría concreto e inmutable —
  defensa en profundidad barata.
- Crear una activation **nunca** escribe en `campaigns` ni en
  `campaign_approvals` — es estrictamente de solo lectura sobre esos
  aggregates.
- Ninguna transición de activation (`ready`, `scheduled`, `published`)
  puede, directa o indirectamente, cambiar `campaigns.status` — la única
  vía para que una campaign pase a `active` sería una decisión de negocio
  EXPLÍCITA y separada (fuera de alcance de 8A definir si eso ocurre
  alguna vez; hoy `canTransitionCampaign('approved','active')` ya es
  válido en el grafo puro pero sin caller — 8A no le da un caller. Se dej
  documentado como pregunta abierta para 8A.2/8B: ¿la primera
  publicación exitosa de un target dispara `campaign.status = 'active'`
  automáticamente, o permanece una acción manual separada? Recomendación
  preliminar: mantenerlo desacoplado — la campaign puede quedarse en
  `approved` indefinidamente incluso con activaciones publicadas, salvo
  que el usuario decida explícitamente que quiere ese acoplamiento).
- El futuro publishing externo (8B+) **nunca** bypassea esta frontera —
  cualquier adapter de proveedor solo puede transicionar
  `campaign_activation_targets`, nunca `campaigns` directamente.

---

## 14. Snapshot strategy

**Recomendación: Opción B — snapshot JSON embebido**, con las siguientes
precisiones (evaluado explícitamente contra las 4 opciones del encargo):

| Opción | Evaluación |
|---|---|
| A. Activation guarda `campaign_id` y usa valores actuales | **Descartada.** Viola directamente el principio "nunca permitir que una edición futura de campaign cambie silenciosamente lo activado" — es la opción más simple pero la única que rompe inmutabilidad/reproducibilidad. |
| **B. Activation guarda JSON snapshot** | **Recomendada.** Reutiliza el patrón YA validado de `campaigns.generated_content`/`metadata` (jsonb con `schemaVersion`). Inmutable por diseño (una vez escrito, ningún use case de 8A lo actualiza). Reproducible (el snapshot es autocontenido). Auditable (queda ligado a `campaign_approval_id`). Evoluciona vía `snapshot_schema_version`, igual que `GENERATED_CONTENT_SCHEMA_VERSION`. Queryability limitada (no se puede indexar/filtrar por campos internos del snapshot sin expresiones jsonb) — aceptable porque el snapshot es para reproducción/auditoría, no para listados (los listados usan las columnas propias de `campaign_activations`: `status`, `campaign_id`, fechas). |
| C. Tablas normalizadas snapshot | **Descartada para MVP.** Sobre-modela: requeriría espejar `campaign_ad_sets_snapshot`, `campaign_creatives_snapshot`, etc. — no hay evidencia de necesidad de queryability granular sobre contenido histórico snapshoteado. Revisar si 8B/8C lo demandan. |
| D. Versioning explícito (tabla de versiones de campaign) | **Descartada — fuera de alcance de 8A.** Cambiaría el modelo de `campaigns` mismo (fuera de la frontera de escritura de Phase 8A, §13) y es una solución a un problema distinto (versionar campaign en sí, no activarla). |

**Contenido exacto del snapshot (`approved_snapshot: jsonb`):**

```
{
  "schemaVersion": "activation-snapshot-v1",
  "campaign": {
    "name": string, "objective": string, "platform": AdPlatform,
    "budget": number, "currency": string,
    "startDate": string|null, "endDate": string|null
  },
  "generatedContent": CampaignGeneratedContent | null,   // copia literal
  "metadata": Record<string, unknown>,                    // copia sanitizada
  "approval": { "campaignApprovalId": string, "approvedAt": string, "approvedBy": string }
}
```

Poblado por el use case `createCampaignActivation` en una sola
transacción de lectura de `campaigns`+`campaign_approvals`, nunca editado
después.

---

## 15. Database design (propuesta — SIN migración)

### `campaign_activations`

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `organization_id` | `uuid` | NO | — | FK `organizations`, ON DELETE CASCADE |
| `client_id` | `uuid` | NO | — | FK `clients`, ON DELETE CASCADE |
| `campaign_id` | `uuid` | NO | — | FK `campaigns`, ON DELETE RESTRICT (nunca borrar una campaign con activaciones) |
| `campaign_approval_id` | `uuid` | NO | — | FK `campaign_approvals`, ON DELETE RESTRICT |
| `status` | `activation_status` (enum) | NO | `'pending'` | `pending\|preparing\|ready\|scheduled\|executing\|completed\|partially_completed\|failed\|cancelled` |
| `approved_snapshot` | `jsonb` | NO | — | CHECK `jsonb_typeof = 'object'` |
| `snapshot_schema_version` | `text` | NO | `'activation-snapshot-v1'` | |
| `scheduled_at` | `timestamptz` | YES | `NULL` | |
| `prepared_at` / `ready_at` / `started_at` / `completed_at` | `timestamptz` | YES | `NULL` | derivados, escritos por trigger al recalcular status |
| `cancelled_at` | `timestamptz` | YES | `NULL` | |
| `cancelled_by` | `uuid` | YES | `NULL` | |
| `cancellation_reason` | `text` | YES | `NULL` | CHECK: NOT NULL/no-blank si `status = 'cancelled'` (mismo patrón que `isValidRejectionNote`) |
| `notes` | `text` | YES | `NULL` | |
| `metadata` | `jsonb` | NO | `'{}'` | sanitizada, mismas claves prohibidas que Phase 6F |
| `created_by` | `uuid` | NO | `auth.uid()` (trigger) | |
| `updated_by` | `uuid` | YES | `NULL` | |
| `created_at` / `updated_at` | `timestamptz` | NO | `now()` | |

Constraints: `UNIQUE INDEX uq_campaign_activations_active_per_campaign ON (campaign_id) WHERE status NOT IN ('completed','cancelled','failed')`.
Índices: `(organization_id)`, `(client_id)`, `(campaign_id)`, `(status)`.

### `campaign_activation_targets`

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `organization_id` | `uuid` | NO | — | denormalizado del padre, verificado por trigger |
| `activation_id` | `uuid` | NO | — | FK `campaign_activations` ON DELETE CASCADE |
| `channel` | `activation_channel` (enum) | NO | — | ver §7 |
| `provider` | `activation_provider` (enum) | NO | — | ver §7 |
| `placement` | `text` | YES | `NULL` | CHECK longitud ≤ 100 |
| `client_integration_id` | `uuid` | YES | `NULL` | FK `client_integrations` ON DELETE RESTRICT; CHECK conceptual: NULL si `channel='manual'` |
| `status` | `activation_target_status` (enum) | NO | `'pending'` | `pending\|preparing\|ready\|scheduled\|publishing\|published\|failed\|cancelled` |
| `readiness_checklist` | `jsonb` | NO | `'{}'` | freeform MVP |
| `scheduled_at` | `timestamptz` | YES | `NULL` | |
| `published_at` | `timestamptz` | YES | `NULL` | |
| `published_by` | `uuid` | YES | `NULL` | |
| `external_reference` | `text` | YES | `NULL` | CHECK longitud ≤ 300; nunca una URL de credenciales |
| `failed_at` | `timestamptz` | YES | `NULL` | |
| `failure_code` | `text` | YES | `NULL` | ver taxonomía §24 |
| `failure_message` | `text` | YES | `NULL` | sanitizado, ≤500 chars recomendado |
| `cancelled_at` / `cancelled_by` | `timestamptz`/`uuid` | YES | `NULL` | |
| `metadata` | `jsonb` | NO | `'{}'` | |
| `created_at` / `updated_at` | `timestamptz` | NO | `now()` | |

Constraints: `UNIQUE (activation_id, channel, provider, COALESCE(placement,''))`.
Índices: `(activation_id)`, `(organization_id)`, `(status)`, `(client_integration_id)`.

### `campaign_activation_events`

| Columna | Tipo | Null | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `organization_id` | `uuid` | NO | — | |
| `activation_id` | `uuid` | NO | — | FK CASCADE |
| `target_id` | `uuid` | YES | `NULL` | FK `campaign_activation_targets`, NULL = evento a nivel activation |
| `event_type` | `text` | NO | — | enum cerrado en dominio (no en DB, para no requerir migración de tipo en cada evento nuevo — CHECK contra lista fija en DB sí, igual que `alertType` hoy es `text` con validación de aplicación) |
| `actor_user_id` | `uuid` | YES | `NULL` | NULL si `is_system = true` |
| `is_system` | `boolean` | NO | `false` | |
| `from_status` / `to_status` | `text` | YES | `NULL` | |
| `note` | `text` | YES | `NULL` | |
| `metadata` | `jsonb` | NO | `'{}'` | sanitizada |
| `created_at` | `timestamptz` | NO | `now()` | única columna temporal — append-only, sin `updated_at` |

Índices: `(activation_id, created_at)`, `(organization_id)`.

**No se crea `campaign_activation_publication_jobs`** en 8A (ver §4/§21).

---

## 16. RLS design (conceptual)

Mismo patrón de tres capas usado en `clients`/`campaigns`:

- **SELECT**: cualquier miembro de la organización (`organization_id =
  auth membership`) — igual que `campaigns`/`tasks`/`alerts` hoy.
- **INSERT** (`campaign_activations`): rol mínimo `strategist`
  (`has_organization_role(org, 'strategist')`), y trigger valida
  `campaign.status = 'approved'` + coherencia `organization_id`/`client_id`
  contra la campaign referenciada, más el índice único parcial (§15) hace
  el resto.
- **INSERT** (`campaign_activation_targets`): rol mínimo `strategist`,
  trigger valida que `activation.status` no sea terminal.
- **UPDATE genérico** (metadata/notes): rol mínimo `strategist`, trigger
  bloquea cambios a `status`/timestamps de transición vía UPDATE directo
  — igual que `manage_client_write` protege campos inmutables.
- **Transiciones críticas → RPC-only, `SECURITY DEFINER`** (no vía
  `UPDATE` directo, ni siquiera con rol suficiente):
  - `mark_target_published(target_id, external_reference?, note?)` —
    rol mínimo `operator`.
  - `mark_target_failed(target_id, failure_code, failure_message?)` —
    reservado para 8B (canales automatizados; en 8A el manual no "falla",
    se cancela).
  - `schedule_activation(activation_id, scheduled_at)` — rol `operator`.
  - `cancel_activation(activation_id, reason)` — rol `strategist` (ver
    nota de revisión en §12).
  - `prepare_activation_target(target_id, checklist)` /
    `mark_target_ready(target_id)` — rol `operator`.

  Cada RPC replica el patrón de `approve_campaign`: revalida rol +
  status ACTUAL dentro de la transacción, escribe la fila de
  `campaign_activation_events` atómicamente con la transición, y nunca
  confía en que el use case ya lo validó (defensa en profundidad).
- **DELETE**: **no se expone** — se prefiere lifecycle explícito
  (`cancelled`) sobre borrado físico, igual que `clients`/`tasks` usan
  soft-delete y `campaign_approvals` no tiene DELETE en absoluto. Única
  excepción: `campaign_activation_targets` podría permitir DELETE físico
  SOLO mientras la activation entera sigue en `pending` (agregar/quitar
  canales antes de empezar a prepararlos) — a confirmar en 8A.2, con
  fallback seguro de "no DELETE en absoluto, usar `cancelled` en el
  target" si se prefiere simplicidad.
- **`campaign_activation_events`**: INSERT solo vía las RPCs anteriores
  (nunca INSERT directo de aplicación), SELECT para cualquier miembro,
  sin UPDATE ni DELETE expuestos (append-only real).

---

## 17. Application layer — use cases (MVP)

| Use case | Input clave | Rol mínimo | Nota |
|---|---|---|---|
| `createCampaignActivation` | `campaignId`, `organizationId` (sesión), `actorUserId` (sesión) | `strategist` | Verifica `approved`, congela snapshot, crea evento `activation_created`. |
| `getCampaignActivation` | `activationId` | `viewer` | Incluye targets + últimos eventos (paginados). |
| `listCampaignActivations` | `campaignId` o `organizationId`+filtros | `viewer` | |
| `addActivationTarget` | `activationId`, `channel`, `provider`, `placement?`, `clientIntegrationId?` | `strategist` | Valida `client_integration_id` pertenece a mismo client/org si no-NULL. |
| `removeActivationTarget` | `targetId` | `strategist` | Solo si activation `pending`/`preparing` y target no-terminal (ver nota DELETE §16). |
| `prepareActivationTarget` | `targetId`, `checklist` | `operator` | Transición `pending→preparing`. |
| `markActivationTargetReady` | `targetId` | `operator` | Transición `preparing→ready`, valida checklist mínimo si se define uno obligatorio (MVP: sin reglas duras, solo transición). |
| `scheduleActivation` | `activationId`, `scheduledAt` | `operator` | Vía RPC. |
| `cancelActivation` | `activationId`, `reason` | `strategist` | Vía RPC; nota obligatoria no-vacía. |
| `markManualTargetPublished` | `targetId`, `externalReference?`, `note?` | `operator` | Vía RPC `mark_target_published`; solo `channel='manual'` en 8A (canales automáticos se habilitan en 8E/8F). |

**Reducido deliberadamente:** no se incluyen `markActivationReady`
(a nivel activation) como comando explícito porque el status de
activation se DERIVA de targets (§6.A) — evita duplicar la misma decisión
en dos lugares. No se incluye ningún use case de "publish" automático —
eso es 8B.

---

## 18. Domain ports / repositories

```ts
interface CampaignActivationRepository {
  findById(id: CampaignActivationId, organizationId: OrganizationId): Promise<Result<CampaignActivation>>;
  findActiveByCampaign(campaignId: CampaignId, organizationId: OrganizationId): Promise<Result<CampaignActivation | null>>;
  findByOrganization(filter: CampaignActivationFilter, pagination: PaginationParams): Promise<PaginatedResult<CampaignActivation>>;
  create(input: CreateCampaignActivationInput): Promise<Result<CampaignActivation>>;
  cancel(id, organizationId, actorUserId, reason): Promise<Result<CampaignActivation>>;      // RPC
  schedule(id, organizationId, actorUserId, scheduledAt): Promise<Result<CampaignActivation>>; // RPC
}

interface CampaignActivationTargetRepository {
  findById(id, organizationId): Promise<Result<CampaignActivationTarget>>;
  findByActivation(activationId, organizationId): Promise<Result<CampaignActivationTarget[]>>;
  create(input: CreateActivationTargetInput): Promise<Result<CampaignActivationTarget>>;
  remove(id, organizationId): Promise<Result<void>>;
  markReady(id, organizationId, actorUserId): Promise<Result<CampaignActivationTarget>>;        // RPC
  markPublished(id, organizationId, actorUserId, externalReference?, note?): Promise<Result<CampaignActivationTarget>>; // RPC
}

interface CampaignActivationEventRepository {
  findByActivation(activationId, organizationId, pagination): Promise<PaginatedResult<CampaignActivationEvent>>;
  // sin create() público — los eventos se escriben dentro de las RPCs/use cases anteriores, nunca sueltos.
}
```

**Aggregate boundary / evitar repository explosion:** se proponen 3
repositorios (uno por tabla), NO uno agregado — es simétrico al patrón ya
usado (`CampaignRepository`, `CampaignApprovalRepository` separados
aunque relacionados 1:N). Un repositorio único que mezcle activation+
targets+events sería más grande que cualquier repositorio existente en el
código base y rompería el principio de "un repositorio por tabla/aggregate
raíz" ya establecido.

---

## 19. UI / UX architecture

**Recomendación: opción D (ambos) con jerarquía clara**, no A-solo ni
C-solo:

- **Dentro de `campaign detail`** (`/campaigns/[id]`): sección nueva
  "Activación" quearece SOLO si `campaign.status === 'approved'` (o
  superior), con:
  - Si no hay activation activa: botón "Preparar activación" (evoca
    directamente el texto de la task de Phase 7F).
  - Si hay una: resumen compacto (status badge, canales, próxima acción)
    con link a la vista detallada.
- **Ruta dedicada `/campaigns/[id]/activation/[activationId]`** (opción B
  del encargo) para la vista completa: snapshot aprobado (solo lectura),
  lista de targets con su status individual, checklist por target,
  botones de transición según rol, activity/history (reutilizando el
  mismo patrón visual que `CampaignAutomationActivity`).
- **No se crea un módulo `/activations` global en 8A** (opción C) — no
  hay evidencia de necesidad de una vista cross-campaign todavía; se
  revisa en 8G (Activation Monitoring) si el volumen lo justifica.

Reutilización directa: `CampaignStatusBadge` (patrón de badge por enum de
status) se replica como `ActivationStatusBadge`/`ActivationTargetStatusBadge`;
`CampaignAutomationActivity` se replica como
`ActivationActivityLog` sobre `campaign_activation_events`.

No se diseña ninguna UI de conexión con Meta/Google (fuera de alcance,
pertenece a 8E/8F).

---

## 20. Phase 7 automation integration

Preguntas del encargo, respondidas:

- **¿El link de la task debería apuntar a activation?** Sí, pero de forma
  no rompiente: la task de Phase 7F (`campaign_approved` →
  "Preparar activación de campaña") ya se crea con `tags` que incluyen
  `campaign-id:{id}` (vía `buildCampaignTaskTags`). En 8A.2 se puede
  enriquecer el `metadata`/`description` de esa task para incluir un link
  a `/campaigns/[id]#activation` (la sección dentro del detail, §19) —
  esto NO requiere que la task conozca un `activationId` (que aún no
  existe en el momento de crear la task, ya que la activation se crea
  DESPUÉS y manualmente). No se propone modificar el esquema de `tasks`
  para esto en 8A.
- **¿Activation se crea automáticamente al aprobar?** **No — confirmado
  como recomendación final**, coincide con la inclinación del usuario.
  Razones: (1) mantiene el principio "approval != publication" también a
  nivel de UX — aprobar no dispara ninguna fila nueva relacionada con
  distribución; (2) evita el índice único parcial de activation activa
  quedando ocupado por una activation "fantasma" `pending` que nadie pidió,
  bloqueando una futura creación intencional si el flujo automático
  tuviera un bug; (3) es coherente con que HOY nada en el código crea
  entidades automáticamente al aprobar salvo la task informativa — crear
  una activation automáticamente sería la primera vez que `approveCampaign`
  escribe en una tabla de negocio nueva además de su propia transición,
  aumentando el blast radius de ese use case sin necesidad.
- **¿La task debería seguir existiendo antes de activation?** Sí, sin
  cambios — sigue siendo el disparador humano.
- **¿Creación manual vs automática?** Manual, confirmado.

---

## 21. Relation with automation runtime (`AutomationExecution`)

| | `CampaignActivation` | `AutomationExecution` |
|---|---|---|
| Naturaleza | Dominio de negocio (una distribución de campaña) | Runtime técnico (un disparo hacia n8n) |
| Duración típica | Horas a semanas (incluye preparación manual) | Segundos a minutos (un dispatch) |
| Quién lo crea | Un operador/estratega, explícitamente | El sistema, en respuesta a un trigger (`schedule|webhook|event|manual`) |
| Reintentos | No aplica al nivel de activation (targets individuales se resuelven manualmente o, en 8B, vía execution-job) | Central al modelo (`attempt`, backoff) |
| Relación con `automations`/n8n | Ninguna en 8A. En 8B, un target automatizado PODRÍA, al ejecutar, disparar internamente un `startAutomationExecution`-like flow — pero esa integración es una decisión de 8B, no una tabla compartida. | Es el modelo de ese flujo. |

**Conclusión (confirma la expectativa del usuario):** no se reutiliza
`automation_executions` para representar activaciones ni targets. Son
capas distintas. Si 8B decide que la publicación a un proveedor via n8n
debe dejar rastro también como `AutomationExecution` (para reutilizar
dashboards de monitoreo de Phase 6), la relación correcta es una FK
opcional `campaign_activation_targets.automation_execution_id` añadida en
8B — nunca fusionar las tablas ni los state machines.

---

## 22. Future Publishing Gateway (arquitectura, sin implementar)

**Naming recomendado: `ChannelPublisherPort`**, no
`CampaignPublisherPort`/`PublishingGatewayPort`/`CampaignDistributionPort`:

- `CampaignPublisherPort` sugiere que publica "campañas" — impreciso, lo
  que se publica es un `CampaignActivationTarget` (un canal específico).
- `PublishingGatewayPort` mezcla el concepto de "puerto" (un contrato por
  proveedor, como `AdvertisingPlatformProvider`/`EmailProvider` ya
  existentes en `@bop-agency/integrations`) con "gateway" (que sugiere un
  único punto de entrada orquestador). Se separan ambos roles:
  - **`ChannelPublisherPort`** (uno por proveedor, en
    `@bop-agency/integrations`, mismo paquete que
    `AdvertisingPlatformProvider`/`EmailProvider` — consistencia de
    ubicación): `publish(target: ActivationTargetSnapshot): Promise<Result<PublishReceipt>>`.
  - **Un orquestador de aplicación** (nombre propuesto:
    `PublishActivationTargetService` o un use case
    `executeActivationTarget`) que resuelve QUÉ `ChannelPublisherPort`
    usar según `target.provider`, siguiendo el mismo patrón de
    "resolución de provider" que `campaign-ai-provider.factory.ts` (Phase
    7D) ya usa para elegir entre Claude/Gemini/OpenAI — es un precedente
    directo y reutilizable conceptualmente.
- `CampaignDistributionPort`: descartado, term nuevo sin precedente en el
  código, y "distribution" es ambiguo con "distribución de presupuesto".

Contrato propuesto (solo diseño, Phase 8B implementa):

```ts
type PublishActivationTargetInput = {
  activationId: CampaignActivationId;
  targetId: CampaignActivationTargetId;
  snapshot: ApprovedActivationSnapshot;  // el jsonb de §14
  credentialsRef: ClientIntegrationId;    // NUNCA credenciales en claro
};
interface ChannelPublisherPort {
  publish(input: PublishActivationTargetInput): Promise<Result<PublishReceipt>>;
}
```

Deliberadamente NO se decide en 8A si `ChannelPublisherPort` internamente
usa n8n o llamadas directas — eso es 8B (§1.E).

---

## 23. Credential / integration security

Documentado como arquitectura a seguir (gaps ya señalados en §11):

- Credenciales NUNCA se almacenan client-side ni se devuelven al browser
  — `client_integrations.configuration` ya tiene el comentario explícito
  de "nunca secrets/tokens en texto plano"; Phase 8A hereda esa regla sin
  modificarla.
- `campaign_activation_targets` referencia `client_integration_id` (un
  id opaco), nunca copia `configuration` dentro del snapshot ni del
  target — el snapshot de §14 es exclusivamente de CONTENIDO de campaña,
  nunca de credenciales.
- Logs (`campaign_activation_events.metadata`,
  `failure_message`) siguen la misma sanitización que
  `AutomationExecution.errorMessage`/`FORBIDDEN_METADATA_KEYS`.
- Refresh token strategy: no existe hoy, no se diseña en 8A — riesgo
  registrado (§29) para 8E/8F.
- `service_role` reservado exclusivamente para el futuro callback
  HMAC-verificado de proveedor (simétrico al webhook n8n actual), nunca
  para el flujo normal de creación/gestión de activation por un usuario
  autenticado.

---

## 24. Failure model

Taxonomía cerrada, separando categorías (ninguna se implementa en 8A —
solo se documenta para que 8B/8E/8F la usen sin inventar códigos nuevos
ad-hoc):

| Código | Categoría | Retryable |
|---|---|---|
| `ACTIVATION_NOT_READY` | Domain | No (error de secuencia, corregible por el usuario) |
| `CHANNEL_NOT_CONFIGURED` | Domain | No |
| `INTEGRATION_NOT_AVAILABLE` | Integration | Sí (posible caída temporal del proveedor) |
| `AUTH_EXPIRED` | Integration | No automáticamente (requiere refresh/reconexión humana) |
| `RATE_LIMITED` | Integration | Sí (con backoff) |
| `PROVIDER_REJECTED` | Integration | No (rechazo de contenido/política del proveedor) |
| `PUBLISHING_TIMEOUT` | Integration | Sí |
| `INVALID_ASSET` | Domain | No |
| `BUDGET_INVALID` | Domain | No |
| `DISPATCH_FAILED` | Integration | Sí (mismo código ya usado por `AutomationExecution`, reutilizado por coherencia si 8B decide dispatch vía n8n) |

`domain errors` = corregibles editando la activation/target;
`integration errors` = dependen del proveedor externo;
`retryable` vs `terminal` determina si 8B habilita un botón de retry sobre
el target/job correspondiente.

---

## 25. Observability

- **Tasks**: reutilizar `TaskRepository.create`/`findActiveBySignatureTag`
  tal cual — ej. tarea "Publicación manual pendiente hace más de N días"
  (futuro watch, no en 8A) con firma `activation:{org}:{activationId}:
  stale-manual-pending`.
- **Alerts**: reutilizar `AlertRepository.upsertByAlertKey` — ej.
  `activation failed` → alert `warning` con `alert_key =
  activation:{org}:{activationId}:failed`; `provider auth expired` (8E/8F)
  → alert `warning` con prefijo `integration:{org}:{clientIntegrationId}:
  auth-expired`.
- **Activity**: el event log de §10 ES la fuente de "activity" — no se
  crea una tabla de logging adicional.
- **Evitar alert spam**: mismo criterio que Phase 6F/7F — deduplicación
  por `alert_key` determinística, `upsertByAlertKey` en vez de `INSERT`
  repetido, y **no crear alert por cada evento** (solo por incidentes:
  falla, staleness) — los eventos normales de progreso (`ready`,
  `scheduled`) NO generan alert, solo entrada en el event log.

Nada de esto se implementa en 8A — es el diseño que 8A.2/8G ejecutarán.

---

## 26. MVP boundary

**Phase 8A MVP = dominio + persistencia + aplicación + seguridad,
CERO publicación real:**

Incluye (para 8A.1/8A.2/8A.3, a implementar en subfases posteriores, no en
esta ronda):
- Entidades de dominio: `CampaignActivation`, `CampaignActivationTarget`,
  `CampaignActivationEvent` + funciones puras de transición (§6).
- Migración aditiva de las 3 tablas + 3 RPCs de transición crítica (§15/§16).
- Repositorios (§18) + use cases (§17).
- RLS completa (§16).
- UI de creación/gestión/marcado manual (§19) — esto es lo que Phase 8D
  llamaba "Manual Activation"; ver resolución del solapamiento en §27.
- Tests (unit de dominio, integración de repositorio, RLS).

Explícitamente FUERA incluso de 8A.3:
- Cualquier llamada real a Meta/Google/YouTube/email marketing.
- Cualquier proveedor de `ChannelPublisherPort` implementado.
- Cualquier escritor de `client_integrations`.
- Calendario de contenido (8C).
- Monitoreo cross-activation (8G).

---

## 27. Recommended Phase 8 subphases (roadmap ajustado)

**Solapamiento detectado y resuelto:** 8A.3 ("Activation UI / Manual
Preparation") y 8D ("Manual Activation") cubrían, tal como estaban
descritas en el plan original, la MISMA superficie — crear/gestionar una
activation y marcarla publicada manualmente es, según el diseño de §8,
UNA sola implementación del modelo (no dos). Mantenerlas separadas
llevaría a construir la UI de creación en 8A.3 y luego "activation
manual" otra vez en 8D, duplicando trabajo o dejando 8D vacía.

**Resolución:** 8A.3 absorbe la implementación funcional completa del
camino manual (crear activation, agregar targets, checklist, marcar
publicado) — es decir, Phase 8D tal como estaba planteada se cierra
DENTRO de 8A.3. 8D se redefine con un alcance más angosto y se reubica
después de 8B/8C, para evitar numeración vacía y мismo tiempo dar
espacio a que el camino manual madure con datos reales antes de
"endurecerlo":

- **8A.0** Branding & Theming Foundation — ✅ COMPLETA (sin cambios).
- **8A.1** Activation Domain + Persistence — entidades de dominio,
  migración de las 3 tablas, RLS, repositorios.
- **8A.2** Activation Application Layer + Security — use cases, RPCs de
  transición, tests de integración/RLS, matriz de roles final.
- **8A.3** Activation UI / Manual Activation (fusiona el antiguo 8D) —
  UI completa de creación/gestión + camino manual end-to-end
  (crear → preparar → marcar publicado), tal como se diseñó en §8/§19.
- **8B** Publishing Gateway — `ChannelPublisherPort`, sin proveedor real
  conectado.
- **8C** Content / Asset Calendar.
- **8D (redefinida)** Manual Activation Hardening — SLA/alertas de
  "publicación manual pendiente hace demasiado tiempo" (§25), checklist
  estructurado por tipo de cliente/canal (reemplazando el
  `readiness_checklist: jsonb` freeform del MVP), acciones en bulk. Se
  ubica después de 8B/8C porque puede reutilizar patrones de
  observabilidad más maduros y porque no bloquea a 8E/8F.
- **8E** Meta Integration.
- **8F** Google Integration.
- **8G** Activation Monitoring.
- **8H** E2E + Security + Closure.

Esto preserva las letras existentes (evita renumeración disruptiva en
documentación ya escrita) y dejar explícito, en el propio nombre de 8D,
que ya no es "el primer camino manual" (eso pasó a 8A.3) sino su
endurecimiento operativo posterior.

---

## 28. Risks

Ver `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md` (creado en
esta misma ronda) para el registro completo con severidad/probabilidad/
mitigación. Resumen de los riesgos más altos identificados durante este
audit:

- **Approval bypass implícito**: si 8A.2 no revalida `campaign.status`
  dentro de la RPC de creación (confiando solo en el use case), una
  condición de carrera podría crear una activation sobre una campaign que
  cambió de estado entre la lectura y el insert. Mitigado por el diseño
  de §13/§16 (trigger revalida, no solo el use case).
- **Stale snapshot / falsa sensación de reproducibilidad**: si en el
  futuro alguien agrega un método `updateSnapshot` "por conveniencia", se
  rompe la garantía central de §5/§14. Mitigar con un comentario de
  dominio explícito (mismo estilo que `campaign-approval.ts`) prohibiendo
  ese método, y sin exponerlo en el repositorio (§18 no lo incluye).
- **Cross-org integration reference**: si `client_integration_id` no se
  valida contra `organization_id`/`client_id` del target en el trigger,
  es la vía más directa de fuga de credenciales de otro cliente/org. Ver
  mitigación en §11.
- **Alert spam** si 8A.2 no reutiliza `upsertByAlertKey` y en su lugar
  hace `INSERT` directo por cada evento de progreso.

---

## 29. Files reviewed (no modificados)

Dominio: `campaign.ts`, `campaign-approval.ts`, `campaign-generated-content.ts`,
`client.ts`, `automation.ts`, `automation-execution.ts`, `task.ts`, `alert.ts`,
`organization.ts`, repositorios correspondientes.
Aplicación: todos los use cases de `campaigns/` y `automations/` relevantes
(`approve-campaign`, `campaign-automation-*`, `start-execution`,
`retry-execution`, `evaluate-automation-incident`), `task.repository.ts`,
`alert.repository.ts`.
Infraestructura: `n8n-dispatcher-adapter.ts`, `n8n-webhook-dispatcher.ts`.
Integrations: `advertising-platform.provider.ts`, `index.ts`, `README.md`.
Shared: `constants/platforms.ts`, `constants/status.ts`.
Migraciones: `20260730120000_phase3_clients.sql`,
`20260816140000_phase7c_campaign_approval_workflow.sql` (extractos).
UI: listado de rutas/componentes de `campaigns/` (sin abrir cada archivo
línea por línea — suficiente para confirmar ausencia de rutas/acciones de
activación).
n8n: `n8n-local/` (listado, sin abrir los workflows de reporting legacy en
detalle — no relevantes al scope).

**Ningún archivo fue creado, editado, ni movido durante este audit**, salvo
los tres documentos entregables descritos en §30/§31, que son
documentación pura.
