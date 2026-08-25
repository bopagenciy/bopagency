# PHASE 8B — Publishing Gateway — Audit + Architecture (8B.0)

**Rama:** `feat/phase-8-campaign-operations`
**HEAD auditado:** `d0dc25c` (`feat(phase-8): add activation web and manual operations`)
**Subfase:** AUDIT + ARCHITECTURE ONLY — sin implementación de código, sin migración SQL.
**Fecha:** 2026-08-25

> Este documento diseña la arquitectura de Phase 8B — el `ChannelPublisherPort`
> y su orquestación — que permitirá en el futuro que `CampaignActivationTarget`
> publique de verdad hacia Meta/Google/LinkedIn/email, sin acoplar el dominio
> de campaña a ninguna API de proveedor concreta, y sin implementar todavía
> ningún proveedor real. Construye directamente sobre las decisiones YA
> aprobadas en `PHASE_8A_ACTIVATION_AUDIT.md` (particularmente §6, §9, §14,
> §15, §16, §18, §21, §22, §24, §25) — este documento no reabre esas
> decisiones, las profundiza donde 8A las dejó deliberadamente diferidas a
> 8B. Ningún archivo de `packages/domain`, `packages/application`,
> `packages/infrastructure`, `apps/web` ni ninguna migración fue creado o
> modificado durante esta ronda.

---

## 1. Current-state audit

### 1.1 Phase 8A — Campaign Activation domain (ya implementado, base de 8B)

- **`CampaignActivation`** (`packages/domain/src/entities/campaign-activation.ts`,
  243 líneas): aggregate root inmutable salvo transición de `status`.
  Snapshot `approvedSnapshot: CampaignActivationSnapshot` congelado en
  creación, **sin ningún método de actualización expuesto** — invariante
  central que 8B debe respetar sin excepción (ningún adapter de proveedor
  puede escribir en `approved_snapshot`). `deriveActivationStatus` es una
  función PURA que deriva el status de activation de los status de sus
  targets — 8B no puede introducir un `status` de activation seteado
  directamente por un job/adapter; solo puede cambiar targets, y el
  recomputo del nivel activation sigue viviendo en
  `recompute_campaign_activation_status_trigger()` (trigger DB, ver §1.1
  más abajo).
- **`CampaignActivationTarget`** (158 líneas): YA tiene los campos que 8B
  necesita — `channel: ActivationChannel`, `provider: ActivationProvider`,
  `clientIntegrationId: ClientIntegrationId | null`, `externalReference:
  string | null`, `failureCode`/`failureMessage`, y el state machine
  `pending → preparing → ready → scheduled → publishing → published /
  failed / cancelled` (`ACTIVATION_TARGET_TRANSITIONS`,
  `canTransitionActivationTarget`). El estado `publishing` YA EXISTE en el
  enum y en el grafo — fue diseñado en 8A.1 específicamente para que 8B lo
  ocupe (comentario del audit §6.B: "`failed` solo alcanzable desde
  `publishing` (canales automatizados futuros)"). **Esto es la primera
  decisión importante de 8B: `publishing` no es un estado nuevo que crear,
  es un estado del target ya modelado y sin caller** — el "job" o "intento
  de publicación" descrito en la sección 2 de este documento vive DEBAJO
  de esa transición `ready/scheduled → publishing → published|failed`, no
  la reemplaza.
- **`CampaignActivationEvent`** (`campaign-activation-event.ts`, 107
  líneas): event log append-only, `ACTIVATION_EVENT_TYPES` cerrado
  (`activation_created`, `target_added`, `target_removed`,
  `activation_status_changed`, `target_status_changed`,
  `activation_cancelled`). 8B necesita ampliar este enum (ver §2.3) — el
  comentario del propio archivo en `activation.ts` (shared) ya avisa: "NO
  ampliar estas listas sin actualizar la migración (ENUM de DB) y este
  archivo a la vez".
- **Enums cerrados** (`packages/shared/src/constants/activation.ts`):
  `ACTIVATION_CHANNELS` (`manual`, `meta_ads`, `instagram_organic`,
  `facebook_organic`, `google_ads`, `linkedin_ads`, `email`),
  `ACTIVATION_PROVIDERS` (`manual`, `meta`, `google`, `linkedin`, `email`),
  `ACTIVATION_CHANNEL_PROVIDER` (mapa fijo channel→provider),
  `isValidChannelProviderPair`. **Confirmado: 8A ya cerró el vocabulario de
  canal/proveedor que 8B necesita** — 8B no inventa un nuevo enum de
  proveedor, reutiliza `ActivationProvider` tal cual para resolver qué
  `ChannelPublisherPort` invocar.
- **`CampaignActivationRepository`**
  (`packages/domain/src/repositories/campaign-activation.repository.ts`,
  154 líneas) — interfaz de 3 repositorios (activation/target/event, ver
  §18 del audit 8A). Los métodos de transición de target
  (`markReady`/`markPublished`) delegan a RPCs `SECURITY DEFINER`. 8B
  necesita una transición nueva (`markPublishing`/`markFailed`, ver §3) que
  hoy NO existe en el repositorio — es el gap concreto que 8B.1 cierra.
- **Migración** `supabase/migrations/20260824180000_phase8a1_campaign_activation_domain.sql`
  (1200+ líneas): 3 tablas (`campaign_activations`,
  `campaign_activation_targets`, `campaign_activation_events`), 5 RPCs
  `SECURITY DEFINER` (`prepare_activation_target`,
  `mark_activation_target_ready`, `mark_activation_target_published`,
  `cancel_activation_target`, `cancel_campaign_activation`), triggers de
  invariantes (`check_activation_source`, `check_activation_target_match`
  — el trigger que cierra R-ACT-04 cross-org integration reference —,
  `recompute_campaign_activation_status_trigger`). Patrón exacto de cada
  RPC (verificado leyendo `mark_activation_target_published` completa):
  `auth.uid()` obligatorio → `SELECT ... FOR UPDATE` con lock de fila →
  `has_organization_role(org, role)` → revalidación de status ACTUAL →
  `UPDATE` → esto es la plantilla que las RPCs nuevas de 8B (§3, §15) deben
  copiar literalmente, no solo "inspirarse en".
- **Application** (`packages/application/src/use-cases/activations/`, 12
  archivos + `activation-signals.ts`): 7 use cases de escritura + 4 de
  lectura, todos wrappers delgados sobre el repositorio, matriz de roles
  reforzada en application (defensa en profundidad). `activation-signals.ts`
  implementa el patrón "best-effort post-commit, dedupe por
  `activationId`" — SOLO `createCampaignActivation` genera una tarea; el
  resto de transiciones deliberadamente NO generan señal, documentado
  explícitamente como decisión de producto (no un descuido). 8B debe
  seguir el mismo criterio de moderación al añadir señales de publicación
  externa (§13) — no generar una tarea/alerta por cada evento de progreso.
- **Web** (`apps/web/src/lib/composition/activation.composition.ts`,
  ruta `/campaigns/[id]/activation`, componentes en
  `components/activations/`): Server Actions delgadas, resuelven
  `organizationId`/`actorUserId` server-side. `ActivationTargetsPanel`
  replica como funciones puras (`canPrepare`/`canMarkReady`/
  `canMarkPublished`/`canCancel`) las reglas de dominio — riesgo ya
  documentado como **R-ACT-16** (UI guards desincronizados de dominio,
  severidad Low, aceptado). 8B.4 (Web Operations/Monitoring) hereda este
  mismo riesgo si añade botones de retry/cancel de publicación sin
  compartir la fuente de verdad.

### 1.2 Phase 6 — Automation runtime (precedente de job/retry/idempotencia)

- **`AutomationExecution`** (`packages/domain/src/entities/automation-execution.ts`):
  runtime técnico de UN disparo — `status: queued|running|succeeded|failed|
  cancelled|retrying`, `attempt`, `idempotencyKey` (branded type, único por
  `(organizationId, idempotencyKey)`), `triggeredBy`, `triggerType`,
  `inputMetadata`/`outputMetadata` sanitizados vía `FORBIDDEN_METADATA_KEYS`.
  `startAutomationExecution`: idempotencia real vía constraint DB único +
  recuperación en `CONFLICT` (SQLSTATE 23505) — nunca solo deshabilitar un
  botón. `retryAutomationExecution`: **nueva fila siempre** (nunca
  sobrescribe la anterior), backoff exponencial calculado ANTES de crear
  la fila (si hay backoff pendiente, no crea fila, devuelve
  `retryDeferred: true`), `idempotencyKey` determinística
  `previousKey:retry:N`. **Este es el patrón exacto que 8B reutiliza para
  `campaign_publication_attempts`** (§3, §4) — no se inventa un esquema de
  reintentos nuevo.
- **`evaluateAutomationIncident`** (Phase 6F): evaluador determinístico,
  `upsertByAlertKey` (dedupe atómico `ON CONFLICT`) y
  `findActiveBySignatureTag` antes de crear una task — el patrón de dedupe
  que 8B reutiliza para señales de publicación (§13).
- **n8n dispatcher**: `WorkflowDispatcherPort` (aplicación) →
  `N8nDispatcherAdapter` (infra) → `N8nWebhookDispatcher`
  (`packages/infrastructure/src/n8n/n8n-webhook-dispatcher.ts`, leído
  completo). Hallazgos concretos, verificados línea por línea:
  - HMAC-SHA256 sobre `timestamp.rawBody`, secreto
    `AUTOMATION_WEBHOOK_SECRET` (≥32 chars) leído de `process.env` en el
    momento exacto de la llamada — nunca viaja por el grafo de objetos.
  - `callbackUrl` **SIEMPRE** resuelto server-side desde
    `NEXT_PUBLIC_APP_URL` (`resolveCallbackUrl()`) — el payload del caller
    NUNCA puede fijar un callback URL. Cierre explícito de SSRF por
    callback arbitrario — **8B debe copiar exactamente este patrón** para
    cualquier callback/webhook de proveedor (§14).
  - `sanitizeMetadata` con listas `FORBIDDEN_SINGLE_WORDS`/
    `FORBIDDEN_COMPOUND_KEYS` (coincidencia de palabra completa, no
    substring) antes de enviar cualquier metadata a n8n.
  - Timeout configurable (`N8N_DISPATCH_TIMEOUT_MS`, 1s–60s, default
    10s) con `AbortController` — un timeout se traduce en
    `EXTERNAL_SERVICE_ERROR` con `reason: 'timeout'`, **nunca se asume
    éxito ni fallo** — esto es precisamente el caso "UNKNOWN OUTCOME" que
    §11 de este documento formaliza para publicación externa.
- **`/api/webhooks/n8n/route.ts`** (456 líneas, leída completa): callback
  inbound ya implementado con el flujo de seguridad exacto que 8B debe
  replicar para un futuro callback de proveedor: (1) leer raw body, (2)
  leer headers de firma, (3-5) verificar HMAC constant-time ANTES de crear
  cualquier cliente `service_role`, (6) crear admin client SOLO después
  del HMAC verificado, (7) deduplicar vía `automation_webhook_events`
  (insert atómico + captura de `23505`), (8) validar payload con Zod, (9)
  verificar coherencia (orgId/automationId/transición válida), (10-12)
  actualizar estado + log sanitizado + marcar evento procesado. **Esta
  ruta es el diseño de referencia completo para el futuro webhook de
  proveedor de 8B/8E/8F** (§14) — no hay que diseñarlo desde cero.
- **`automation_webhook_events`** (tabla, migración
  `20260804000000_phase6b_automation_runtime.sql`): `external_event_id`
  (≤255, nullable), `source` (default `'n8n'`), `event_type`,
  `payload_hash` (SHA-256, regex `^[0-9a-f]{64}$` — **nunca el raw body
  persistido**), `status: received|processed|failed`. Único acceso vía
  `service_role`; `authenticated` no tiene política RLS ni GRANT. Este es
  el modelo exacto de tabla de dedupe de webhook que 8B reutiliza (§14),
  generalizando `source` más allá de `'n8n'` a `'meta'`/`'google'`/etc.
- **`automation_secrets_metadata`** (misma migración, SECCIÓN F,
  **hallazgo importante no mencionado en el audit 8A**): tabla YA
  diseñada (pero sin repositorio/lector todavía, según su propio
  comentario) para referenciar secretos por **Supabase Vault** —
  `vault_reference: text NOT NULL` ("ID en `vault.secrets`"), `provider
  text NOT NULL DEFAULT 'supabase_vault'`, `status: active|expired|
  revoked`, `last_rotated_at`. Comentario explícito en la migración:
  "CRÍTICO: Esta tabla NO almacena secretos. [...] Nunca incluir:
  secret_value, token_value, password, api_key real." **Esto es
  directamente relevante para §7 de este documento** — BopIAgency YA
  tiene el patrón de infraestructura de secretos-por-referencia diseñado
  (aunque sin escritor real todavía), así que 8B no necesita inventar un
  mecanismo de "encrypted at rest" nuevo — necesita generalizar/reutilizar
  este mismo patrón (`vault_reference`) para credenciales de
  `client_integrations`, en vez de proponer una tabla nueva de secretos
  paralela.

### 1.3 Phase 7 — Campaign, approval, AI multi-provider factory (precedente de port+adapter)

- **`Campaign`/`CampaignApproval`**: `CampaignApproval` es append-only e
  inmutable, escrito exclusivamente dentro de RPCs `SECURITY DEFINER`
  (`approve_campaign`/`reject_campaign`) — el patrón arquitectónico que
  8A ya replicó para activation, y que 8B replica de nuevo para las
  transiciones de publicación (§3, §15).
- **`AIProvider`** (`packages/ai-engine/src/contracts/ai-provider.ts`,
  leído completo): puerto mínimo, una sola operación (`complete`),
  contrato de request/response neutral de proveedor (`AIRequest`,
  `AIResponse` con `usage`/`finishReason` normalizados — nunca campos
  específicos de OpenAI/Claude/Gemini).
- **`campaign-ai-provider.factory.ts`** (`packages/infrastructure/src/ai/`,
  leído completo) — **el precedente arquitectónico más fuerte y directo
  para 8B**: `createCampaignAIProvider(providerId?)` resuelve config +
  construye la instancia vía un `Record<AIProviderId, () => AIProvider>`
  (`PROVIDER_CONSTRUCTORS`) fijo, **sin fallback automático entre
  proveedores** ("si el proveedor solicitado no tiene API key, error de
  configuración explícito — nunca se intenta otro proveedor en
  silencio"), la API key se lee de `process.env` dentro de cada provider
  concreto (nunca en el objeto de configuración que viaja entre capas), y
  el comentario del propio archivo declara la regla arquitectónica: "ÚNICO
  punto del proyecto donde existe un switch por proveedor [...] los use
  cases NO conocen cómo se construye cada proveedor". **8B adopta este
  mismo patrón (registry/factory function, no una clase `Factory`, no un
  contenedor DI) para `ChannelPublisherPort`**, con una diferencia
  importante justificada en §6: la resolución de credenciales de
  publishing es dinámica por `clientIntegrationId` (multi-tenant), no
  estática por variable de entorno como en AI.
- **`AdvertisingPlatformProvider`**
  (`packages/integrations/src/contracts/advertising-platform.provider.ts`)
  — confirmado, leído: puerto de solo LECTURA (`getAccountMetrics`,
  `getCampaigns`), sin ningún adapter que lo implemente. Documentado en
  8A como "no reutilizar tal cual — su forma es de lectura de métricas, no
  de ejecución de publicación". **8B.0 confirma esta conclusión**: el
  nombre y la ubicación (`@bop-agency/integrations`) son un precedente de
  ubicación de paquete válido, pero el contrato en sí no se extiende ni se
  reutiliza — `ChannelPublisherPort` es un contrato nuevo, separado.
- **Campaign automation signals** (`campaign-automation-*.ts`, Phase 7F):
  mismo patrón "evento de negocio interno → task/alert best-effort" con
  firma `campaign:{orgId}:{campaignId}:{evento}` — 8A ya extendió esto a
  `activation:{orgId}:{activationId}:{evento}`; 8B extiende de nuevo con
  un namespace paralelo `publication:{orgId}:{targetId}:{evento}` (§13).

### 1.4 client_integrations (credenciales — estado actual)

- Tabla `client_integrations` (`supabase/migrations/20260730120000_phase3_clients.sql`,
  sección 5, leída completa): `provider text` (**texto libre, NO enum**),
  `external_account_id text`, `status: integration_status` (`active|
  inactive|error`), `configuration jsonb NOT NULL DEFAULT '{}'` con
  comentario explícito **"nunca secrets/tokens en texto plano"** y CHECK
  `jsonb_typeof(configuration) = 'object'`, `UNIQUE (client_id, provider,
  external_account_id)`.
- **`ClientRepository` solo expone `listIntegrations()` (lectura)** —
  confirmado, no hay `create`/`update`/`delete` de integraciones en
  `packages/application/src/use-cases/clients/`. **La tabla está vacía de
  facto — no hay ningún escritor en toda la aplicación.** Esto es el gap
  crítico ya documentado como **R-ACT-14** (refresh token strategy
  inexistente) en el risk register, heredado sin resolver por 8A.1/8A.2/
  8A.3.
- **Conclusión, confirmada por 8B.0 y no solo heredada de 8A**:
  `client_integrations` en su forma actual (`configuration: jsonb` texto
  libre, `provider: text` libre) **puede representar el hecho de que
  existe una conexión con un proveedor** (para mostrar en UI "Meta: no
  conectado"), pero **no puede representar credenciales reales de forma
  segura sin cambios de schema** — necesita (a) `provider` como enum
  cerrado (alineado con `ActivationProvider`, no un texto libre — un
  provider mal escrito hoy pasaría el CHECK de longitud sin problema), y
  (b) que `configuration` deje de ser el lugar de credenciales y en su
  lugar solo contenga `vault_reference`(s) apuntando a
  `automation_secrets_metadata`-como-patrón (§7). Ninguno de estos cambios
  se implementa en 8B.0 — se documentan como precondición de 8E/8F, igual
  que ya lo hacía R-ACT-14.

### 1.5 n8n gateway / webhook infra — resumen de decisión NO tomada aún

Confirmado (igual que 8A §1.E): no existe hoy ninguna decisión sobre si el
futuro publishing debe reutilizar el transporte n8n existente
(`WorkflowDispatcherPort`/`N8nWebhookDispatcher`) o usar llamadas HTTP
directas a Meta/Google. El `WorkflowDispatcherPort` actual está acoplado a
la FORMA de `AutomationExecution` (execution log de una automatización
definida por el usuario, con su propio `retryPolicy`), no a
`CampaignActivationTarget`. **8B.0 toma esta decisión explícitamente en
§8** (orquestación) — no la difiere de nuevo.

---

## 2. Reusable architecture identified (mapeo directo Phase 6/7 → 8B)

| Patrón Phase 6/7 | Elemento fuente | Reutilización en 8B |
|---|---|---|
| RPC `SECURITY DEFINER` de transición crítica, revalidando rol+status dentro de la transacción | `approve_campaign`, `mark_activation_target_published` | `mark_target_publishing`, `mark_target_publication_failed`, `mark_target_publication_reconciled` (§15) |
| Idempotencia real vía constraint único + recuperación en `CONFLICT` | `startAutomationExecution` (`(organizationId, idempotencyKey)`) | `campaign_publication_attempts` con `UNIQUE (target_id, idempotency_key)` (§4) |
| Retry = nueva fila, nunca sobrescribe; backoff calculado antes de insertar | `retryAutomationExecution` | Reintentar un target = nueva fila en `campaign_publication_attempts`, nunca reescribir la fallida (§3) |
| Metadata sanitizada, lista explícita de claves prohibidas | `FORBIDDEN_METADATA_KEYS` (n8n dispatcher) | Reutilizada tal cual para `campaign_publication_events.metadata`/`failure_message` (§7, §14) |
| Firma determinística de dedupe (`alert_key`/`signatureTag`) | `campaign:{org}:{id}:{evento}`, `activation:{org}:{id}:{evento}` | `publication:{org}:{targetId}:{evento}` (§13) |
| Callback URL siempre resuelto server-side, nunca aceptado del caller | `resolveCallbackUrl()` (n8n dispatcher) | Mismo patrón exacto para cualquier callback de proveedor (§14, cierre de SSRF) |
| Webhook inbound: HMAC constant-time ANTES de crear cliente `service_role`, dedupe atómico por tabla de eventos, payload hash (nunca raw body) | `/api/webhooks/n8n/route.ts` + `automation_webhook_events` | Diseño de referencia completo para el futuro `/api/webhooks/publishing/[provider]` (§14) |
| Provider resuelto por factory function (registry `Record<Id, () => Port>`), sin fallback automático, credencial leída en el momento de uso, nunca en el objeto de config | `campaign-ai-provider.factory.ts` | `ChannelPublisherPort` factory/registry (§6) — con una divergencia justificada (resolución dinámica por `clientIntegrationId`, no por env var) |
| Puerto neutral de proveedor con contrato normalizado (nunca campos específicos de un proveedor concreto en el tipo compartido) | `AIProvider.complete(AIRequest): AIResponse` | `ChannelPublisherPort` (§5) |
| Vault-reference para secretos (nunca el secreto en la tabla de dominio) | `automation_secrets_metadata.vault_reference` (Supabase Vault) | Mismo patrón para credenciales de `client_integrations` (§7) |
| Status derivado por función pura desde los hijos, nunca seteado libremente | `deriveActivationStatus` (activation ← targets) | El target NO deriva su status de sus intentos de publicación de la misma forma — ver §3 justificación de por qué diverge |

---

## 3. Publication data model

**Niveles y qué se persiste en cada uno — decisión explícita:**

| Nivel | Entidad | ¿Nueva tabla? | Justificación |
|---|---|---|---|
| Activación | `CampaignActivation` | No (8A.1) | Sin cambios. |
| Canal/target | `CampaignActivationTarget` | No (8A.1) — se AMPLÍA el repositorio con 2 transiciones nuevas | El target ya modela `publishing`/`published`/`failed` — es el nivel correcto para "¿este canal está publicado?". No se necesita una tabla nueva solo para responder esa pregunta. |
| Job de publicación (una intención de ejecutar publish para un target) | **`CampaignPublicationJob`** | **Sí — `campaign_publication_jobs`** | Necesario porque un target puede tener **como máximo un job activo a la vez** pero el job en sí necesita su propio ciclo de vida asíncrono (encolado, en progreso, esperando reconciliación) independiente del status binario del target — ver justificación detallada abajo. |
| Intento de proveedor (una llamada HTTP concreta a Meta/Google, con su propio resultado) | **`CampaignPublicationAttempt`** | **Sí — `campaign_publication_attempts`** | Necesario porque un job puede requerir N intentos (rate limit, timeout, retry manual) — cada intento es un hecho histórico inmutable con su propio `idempotencyKey`, igual que `AutomationExecution` necesitaba `attempt`. Colapsar job+attempt en una sola tabla (mutando la misma fila en cada retry) rompe la propiedad de "retry = nueva fila, nunca sobrescribe" que 8A copió deliberadamente de Phase 6 — un retry debe dejar rastro del intento anterior, no destruirlo. |
| Evento (auditoría de todo lo anterior) | **`CampaignPublicationEvent`** | **Sí — `campaign_publication_events`** | Extiende el mismo patrón append-only de `campaign_activation_events` (§10 del audit 8A), NO reutiliza esa tabla directamente — ver justificación de tabla separada abajo. |

### 3.1 ¿Por qué job Y attempt, y no solo uno de los dos?

Evaluado explícitamente (mismo criterio "no sobre-modelar" que 8A aplicó
en su propio §4):

- **Job (`campaign_publication_jobs`)** responde "¿qué se está intentando
  publicar ahora mismo, y en qué fase del ciclo de vida de alto nivel
  está?" — `queued → claimed → in_progress → succeeded|failed|
  cancelled|unknown_outcome`. Es el nivel al que el target apunta
  (`target.publishing` ⇔ existe un job `in_progress` para ese target) y
  al que la UI de retry/cancel apunta.
- **Attempt (`campaign_publication_attempts`)** responde "¿qué pasó
  exactamente en la llamada número N al proveedor?" — un job puede tener
  1..N attempts (rate limited → attempt 1 falla retryable → attempt 2 se
  crea). El attempt es donde vive el `providerStatus`/`providerErrorCode`/
  `httpStatus`/duración — datos de diagnóstico de UNA llamada de red, no
  del job en su conjunto.
- **Colapsar ambos en una tabla** (como si `campaign_publication_jobs`
  tuviera columnas `attempt_count`/`last_provider_error` mutadas in-place)
  se descarta explícitamente: perdería el historial completo de intentos
  (exactamente el mismo argumento por el que `AutomationExecution` no
  sobrescribe en retry, sino que crea una fila nueva con
  `idempotencyKey = previousKey:retry:N`). Con job+attempt separados, el
  job tiene una fila estable que la UI puede pollear/suscribirse sin que
  cambie de identidad en cada retry, y el historial de attempts queda
  íntegro para reconciliación (§11).
- **No crear NINGUNA tabla nueva** (job publicado directo como
  transición de target, sin capa intermedia) se descarta: el target ya
  tiene UN status (`publishing`), pero un canal automatizado real puede
  necesitar reintentar 3 veces antes de tener éxito, y cada intento debe
  quedar registrado con su propio `providerErrorCode`/timestamp — el
  target por sí solo no tiene espacio para eso sin volver a las columnas
  planas `failure_code`/`failure_message` (que 8A.1 ya reservó
  explícitamente para el ÚLTIMO fallo conocido del target, no para un
  historial).

### 3.2 ¿Por qué `campaign_publication_events` separado de `campaign_activation_events`?

Se evaluó reutilizar directamente `campaign_activation_events` (ya tiene
`target_id` nullable) añadiendo tipos de evento nuevos al enum existente.
**Descartado**, por dos razones concretas:

1. **Volumen y ruido**: un job de publicación automatizada puede generar
   múltiples eventos técnicos por intento (rate limited, reintentando,
   timeout) que son ruido para el timeline de negocio que ve un
   strategist en `/campaigns/[id]/activation` (que hoy muestra
   `activation_created`/`target_added`/`target_status_changed` — eventos
   de decisión humana). Mezclar eventos de "intento HTTP 3 de 5, rate
   limited" en la misma tabla que "el strategist canceló la activación
   con esta razón" degrada la UI existente sin ningún cambio de código en
   8A.3.
2. **Diferente owner de escritura**: `campaign_activation_events` se
   escribe EXCLUSIVAMENTE dentro de las RPCs `SECURITY DEFINER` de 8A.1
   (nunca INSERT directo de aplicación, ver §16 del audit 8A). Los
   eventos de publicación, en cambio, se originan tanto desde RPCs de
   transición de target (mismo patrón) como desde el propio runtime del
   `ChannelPublisherPort`/worker (§8) reportando progreso de attempt — un
   flujo de escritura distinto que no se quiere forzar a pasar por las
   mismas RPCs de activation ya cerradas.

`campaign_publication_events` es append-only, `FK job_id NOT NULL`
(siempre asociado a un job, a diferencia de `campaign_activation_events`
donde `target_id` es opcional), y el timeline de UI en `/activation`
puede unir ambas tablas ordenadas por `created_at` para una vista
combinada sin fusionar el modelo de escritura.

### 3.3 Resumen de niveles de persistencia

```
CampaignActivation (8A.1 — sin cambios)
  └─ CampaignActivationTarget (8A.1 — 2 transiciones nuevas: publishing, failed)
       └─ CampaignPublicationJob (8B — NUEVO, 0 o 1 activo por target)
            └─ CampaignPublicationAttempt (8B — NUEVO, 1..N por job)
       └─ CampaignPublicationEvent (8B — NUEVO, append-only, FK job_id)
```

---

## 4. Publication job state machine

### 4.1 Estados del job (deliberadamente NO copiados 1:1 de `AutomationExecutionStatus`)

```
queued → claimed → in_progress → succeeded
                                → failed
                                → unknown_outcome
                  → cancelled  (solo desde queued/claimed)
```

**Por qué no `pending|queued|processing|published|failed|retryable|
cancelled` (el set mencionado como ejemplo a NO adoptar ciegamente):**

- **`pending` se descarta** — el job nace directamente `queued` cuando se
  crea (nunca hay un estado "existe pero nadie sabe si se va a ejecutar");
  `pending` ya significa algo distinto y bien establecido a nivel de
  target (`ActivationTargetStatus.pending` = "canal recién agregado, sin
  preparar"). Reutilizar la palabra en un nivel distinto del modelo
  invita a confundir "target pending" con "job pending" en logs/UI.
- **`processing` se renombra a `in_progress`** para alinear con el
  vocabulario ya usado en `campaign_activation_targets.status =
  'publishing'` (el target dice "publishing", el job bajo él dice
  "in_progress" — deliberadamente NO ambos "publishing", para que un
  grep/log nunca confunda a qué nivel pertenece un estado).
- **`retryable` se descarta como ESTADO** — es una PROPIEDAD de un
  resultado `failed` (ver §11, taxonomía de fallos), no un estado propio
  del job. Un job "retryable" sigue siendo `failed`; lo que cambia es si
  la aplicación permite crear un job nuevo a partir de él. Modelar
  `retryable` como estado obligaría a una transición extra
  (`failed→retryable→queued`) sin aportar información que
  `failure_category` no dé ya.
- **`claimed` se AÑADE** (no estaba en el set sugerido) — necesario para
  concurrencia (§4.3): el momento en que un worker/adapter toma posesión
  del job (vía `SELECT ... FOR UPDATE SKIP LOCKED`, mismo patrón que
  cualquier cola basada en Postgres) es distinto de "ya se hizo la
  llamada HTTP al proveedor" (`in_progress`). Sin este estado intermedio,
  dos workers podrían creer ambos que el job está `queued` y disparar dos
  llamadas HTTP concurrentes al mismo proveedor para el mismo target —
  exactamente el escenario de duplicate publishing que R-ACT-01/R-ACT-08
  ya señalan como riesgo alto.
- **`unknown_outcome` se AÑADE** (no estaba en el set sugerido, y es la
  adición más importante de este documento) — ver §11. Es el estado que
  existe específicamente para el caso "timeout después de un posible
  éxito": el job NO puede marcarse `failed` (porque quizás sí publicó) NI
  `succeeded` (porque no hay confirmación) — colapsar este caso en
  `failed` es precisamente el bug que causaría un retry ciego y una
  publicación duplicada real en la cuenta de Meta/Google del cliente.

### 4.2 Terminal states

`succeeded`, `failed`, `cancelled` son terminales. **`unknown_outcome` NO
es terminal** — es un estado que requiere reconciliación humana o
automática (§11) antes de poder cerrarse como `succeeded`/`failed`. Un job
en `unknown_outcome` nunca se reintenta automáticamente ni se cierra
automáticamente sin que exista una consulta positiva al estado real del
proveedor (`getStatus`, §5) o una confirmación humana explícita.

### 4.3 Retry semantics

Igual que `retryAutomationExecution` (§2): **retry = nuevo job**, nunca
reabrir uno `failed`/`cancelled`. `campaign_publication_jobs.retry_of_job_id`
(FK nullable, auto-referencial) encadena el historial. Un retry:

1. Solo se permite si el job anterior es `failed` con
   `failure_category = 'retryable'` (§11), o `unknown_outcome` reconciliado
   explícitamente como "no publicó" (§11).
2. Crea un job nuevo `queued`, con `retry_count = previous.retry_count + 1`
   y un `idempotency_key` derivado determinísticamente (§4, ver formato
   en §4).
3. Backoff calculado ANTES de encolar (mismo patrón que
   `retryAutomationExecution`: si hay backoff pendiente, no se crea el
   job, se devuelve `retryDeferred: true` al caller).
4. El target vuelve a `publishing` cuando el job nuevo entra en
   `in_progress` (transición de target ya existente, ver §3), nunca antes.

### 4.4 Cancellation semantics

Cancelar un job solo es una transición directa desde `queued`/`claimed`
(antes de que exista una llamada HTTP real al proveedor). **Cancelar un
job `in_progress` NO es una transición del job** — es una intención que
se registra (`cancellation_requested_at`) pero el job solo puede
resolverse a `succeeded`/`failed`/`unknown_outcome` según lo que
efectivamente haya pasado con el proveedor; si termina en `unknown_outcome`
o `failed`, la cancelación solicitada simplemente evita que se cree un
retry automático. Esto responde directamente a **R-ACT-10** (cancellation
during execution, dejado explícitamente abierto por 8A para 8B) — la
resolución propuesta es: **nunca cancelación forzada de una llamada HTTP
en curso; siempre cancelación cooperativa que se resuelve en el próximo
`getStatus`/callback**.

### 4.5 Partial-success semantics

No aplica al nivel de job (un job publica UN target hacia UN proveedor —
es atómico por diseño, nunca "medio publicado"). El partial-success ya
vive correctamente en el nivel de activation (`partially_completed`,
§6.A del audit 8A) cuando algunos targets publican y otros no — 8B no
introduce una noción de partial-success a nivel de job/attempt.

### 4.6 Concurrency handling

- Un target tiene como máximo **un job no-terminal a la vez** — constraint
  DB: `UNIQUE (target_id) WHERE status NOT IN ('succeeded','failed','cancelled')`
  (mismo patrón exacto que el índice único parcial de activation activa
  por campaign, §15 del audit 8A / §9 idempotencia).
- Claim de job por worker: `SELECT ... FOR UPDATE SKIP LOCKED` sobre
  `queued`, mismo patrón que cualquier cola Postgres — evita que dos
  procesos reclamen el mismo job.
- La transición de TARGET a `publishing` ocurre atómicamente con el claim
  del job (misma transacción) — nunca dos pasos separados donde una
  condición de carrera pudiera dejar el target en `publishing` sin job
  activo asociado, o viceversa.

### 4.7 Invariante central: un job fallido nunca corrompe la activation

`deriveActivationStatus` (dominio, sin cambios) sigue derivando el status
de activation EXCLUSIVAMENTE de `ActivationTargetStatus[]` — nunca lee
`campaign_publication_jobs` directamente. Esto significa que **toda la
complejidad de jobs/attempts/unknown_outcome queda contenida por debajo
del target**, y el status de activation sigue siendo derivable de forma
segura con la misma función pura ya testeada en 8A.1, sin modificarla. Un
job en `unknown_outcome` se refleja hacia arriba únicamente cuando (y si)
el target correspondiente transiciona a `failed` — mientras el job está
en reconciliación, el target permanece en `publishing` (que ya es un
estado no-terminal válido en el grafo de target existente) y por lo tanto
la activation permanece en `executing` — nunca se muestra como
`completed`/`failed` prematuramente mientras hay ambigüedad real sobre el
resultado externo.

---

## 5. Idempotency architecture

### 5.1 Vectores de duplicación a cubrir (checklist explícito)

| Vector | Mitigación |
|---|---|
| Doble click en "Publicar" (UI) | Botón deshabilitado tras click (UX, no autoridad) + Server Action idempotente (ver abajo) — nunca la única defensa. |
| Retry de Server Action (React Server Actions pueden reintentarse por el framework/red) | La Server Action de "publicar" pasa un `idempotencyKey` determinístico calculado server-side a partir de `(targetId, retry_count_actual_en_DB)` — nunca generado client-side ni aleatorio por invocación. |
| Retry de browser (usuario recarga y reenvía) | Igual que arriba — mismo `idempotencyKey` para el mismo estado de target, constraint DB lo deduplica. |
| Timeout de red hacia el proveedor | El attempt queda `unknown_outcome` (nunca se asume fallo), reconciliación obligatoria antes de cualquier retry (§11). |
| Timeout del proveedor (proveedor tardó pero sí procesó) | Igual — la única fuente de verdad es `getStatus`/reconciliación, nunca "no hubo respuesta ⇒ no publicó". |
| Retry de worker (el propio orquestador reintenta un job que no confirmó) | El worker NUNCA reintenta automáticamente un job `unknown_outcome` — solo jobs `failed` con `failure_category = 'retryable'`. Reintentar un `unknown_outcome` requiere que la reconciliación lo resuelva primero a `failed`. |
| Retry de n8n (si 8B usa n8n como transporte, §8) | El `idempotencyKey` del attempt viaja en el payload firmado hacia n8n (mismo campo que `AutomationExecution.idempotencyKey` ya viaja hoy) — un reintento de n8n con la misma key debe ser rechazado/deduplicado por el adapter antes de generar un segundo attempt. |
| Replay de webhook (callback del proveedor reenviado, MITM replay, o el proveedor reintenta su propio webhook) | Tabla de dedupe `campaign_publication_webhook_events` (mismo patrón que `automation_webhook_events`, §14), `UNIQUE (provider, external_event_id)` + verificación de timestamp/tolerancia HMAC. |
| Requests concurrentes (dos operadores hacen click casi simultáneo) | Constraint DB `UNIQUE (target_id) WHERE status NOT IN (terminal)` en `campaign_publication_jobs` — la segunda request falla con `CONFLICT` y el use case recupera el job existente, mismo patrón que `startAutomationExecution`/creación de activation (§9 audit 8A). |

### 5.2 Formato de idempotency key

Determinístico, sin aleatoriedad, mismo criterio que
`AutomationExecution.idempotencyKey`:

```
publish:{organizationId}:{targetId}:{retryCount}
```

- `retryCount` (entero, empieza en 0) se lee del último job/attempt real
  en DB antes de construir la key — nunca un contador mantenido
  client-side. Un segundo intento de crear el job con el mismo
  `retryCount` (por doble-click o retry de red) colisiona con el
  `UNIQUE (target_id, idempotency_key)` de `campaign_publication_attempts`
  y el use case recupera el attempt existente en vez de crear uno nuevo.
- Para el proveedor externo (cuando el SDK/API del proveedor soporta
  idempotencia nativa, ej. `Idempotency-Key` header de algunas APIs REST),
  el adapter concreto (8E/8F) debe propagar la MISMA key hacia el
  proveedor cuando el proveedor lo soporte — evita que el propio
  proveedor cree un duplicado aunque BopIAgency ya haya deduplicado en su
  lado. Cuando el proveedor no soporte idempotencia nativa (verificar
  caso por caso en 8E/8F), la única defensa es `getStatus`/reconciliación
  antes de reintentar (§11) — nunca asumir que "reenviar con los mismos
  datos es seguro" solo porque BopIAgency lo considera el mismo intento.

### 5.3 Constraints DB propuestos (descritos, sin SQL — ver §15)

- `campaign_publication_jobs`: `UNIQUE (target_id) WHERE status NOT IN
  ('succeeded','failed','cancelled')` — un target no puede tener dos jobs
  activos.
- `campaign_publication_attempts`: `UNIQUE (job_id, idempotency_key)` —
  un job no puede tener dos attempts con la misma key (protege contra
  doble-submit dentro del mismo job, ej. un worker que se ejecuta dos
  veces por un bug de scheduling).
- `campaign_publication_webhook_events`: `UNIQUE (provider,
  external_event_id)` — dedupe de replay de webhook, igual que
  `automation_webhook_events` aunque esa tabla hoy permite
  `external_event_id NULL`; para publishing se recomienda **NOT NULL**
  (todo proveedor real de publishing relevante — Meta, Google — sí
  entrega un event id en sus webhooks; si un proveedor no lo hiciera,
  el adapter concreto de 8E/8F debe derivar uno determinístico antes de
  insertar, nunca dejarlo NULL y perder dedupe).

---

## 6. Publisher port design — `ChannelPublisherPort`

Nombre confirmado del audit 8A §22 (`ChannelPublisherPort`, no
`CampaignPublisherPort`/`PublishingGatewayPort`/`CampaignDistributionPort`
— razones ya documentadas ahí, no se reabren). 8B.0 completa el contrato
que 8A dejó como boceto de una sola operación (`publish`).

### 6.1 Operaciones — justificadas una por una, nada especulativo

```ts
interface ChannelPublisherPort {
  validateTarget(input: ValidateTargetInput): Promise<Result<TargetValidation>>;
  publish(input: PublishTargetInput): Promise<Result<PublishReceipt>>;
  getStatus(input: GetStatusInput): Promise<Result<ProviderPublicationStatus>>;
  cancel(input: CancelPublicationInput): Promise<Result<void>>;
}
```

- **`validateTarget`** — justificación: permite mover errores de dominio
  (`INVALID_ASSET`, `BUDGET_INVALID`, `CHANNEL_NOT_CONFIGURED` — ya en la
  taxonomía del audit 8A §24) ANTES de crear un job/attempt, evitando
  "gastar" un intento (y su idempotency key) en algo que iba a fallar por
  una razón puramente de dominio, no de proveedor. Se llama al pasar el
  target a `ready` o justo antes de encolar el job — decisión de UX de
  8B.3, no de este documento.
- **`publish`** — la operación central, ya definida en el boceto de 8A.
  Recibe el `snapshot` (contenido, nunca credenciales en claro) +
  `credentialsRef` (id opaco, resuelto server-side, §7) + el
  `idempotencyKey` del attempt actual.
- **`getStatus`** — justificación: **obligatoria para poder implementar
  §11 (reconciliación de unknown_outcome)**. Sin esta operación, un
  timeout no tiene forma de resolverse salvo esperar un webhook que puede
  no llegar (el proveedor pudo procesar y fallar al notificar). No es
  especulativa — es la única forma de cerrar el caso de fallo más
  peligroso del sistema (duplicate publishing por timeout).
- **`cancel`** — justificación: necesaria para que la semántica de
  cancelación cooperativa de §4.4 tenga un punto de entrada real hacia el
  proveedor quando el proveedor soporte cancelar una publicación en
  curso (ej. pausar un ad antes de que termine de procesarse). Cuando el
  proveedor NO soporte cancelar (muchos no lo hacen una vez aceptada la
  request), el adapter concreto retorna un error tipado
  `CANCELLATION_NOT_SUPPORTED` — el puerto sigue declarando la operación
  porque el orquestador (§8) necesita un punto de entrada uniforme, no
  porque todo proveedor la implemente de verdad.
- **Deliberadamente NO incluido**: `unpublish`/`delete` (no hay
  evidencia de necesidad — ni siquiera el flujo manual de 8A la tiene),
  `schedule` como operación de proveedor (la programación ya vive en
  `campaign_activation_targets.scheduled_at`/`activation.status =
  'scheduled'`, a nivel de dominio, no de proveedor — cuándo el
  orquestador decide llamar a `publish()` es una decisión de aplicación,
  no del puerto), `getMetrics`/`getInsights` (eso es el dominio de
  `AdvertisingPlatformProvider`, explícitamente fuera de este puerto —
  ver §1.3, no se fusionan).

### 6.2 Contratos de request/result — provider-neutral

```ts
type ActivationTargetSnapshot = {
  readonly activationId: CampaignActivationId;
  readonly targetId: CampaignActivationTargetId;
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  readonly placement: string | null;
  readonly approvedSnapshot: CampaignActivationSnapshot; // el jsonb de §14 del audit 8A, sin cambios
};

type PublishTargetInput = {
  readonly snapshot: ActivationTargetSnapshot;
  readonly credentialsRef: ClientIntegrationId;   // NUNCA credenciales en claro (§7)
  readonly idempotencyKey: string;                // formato §5.2
};

type PublishReceipt = {
  readonly externalId: string | null;         // id de la publicación en el proveedor (ad id, post id) — null si el proveedor confirma async
  readonly externalUrl: string | null;        // link visible, si aplica
  readonly providerStatus: string;            // status crudo del proveedor, NUNCA interpretado como uno de los status de dominio
  readonly publishedAt: string | null;        // ISO 8601, null si aún no confirmado
  readonly retryable: boolean;                // true si un fallo/timeout en esta llamada es candidato a retry automático
  readonly providerErrorCode: string | null;  // código crudo del proveedor, sanitizado de PII antes de persistir (§7)
  readonly outcome: 'confirmed' | 'unknown';  // 'unknown' fuerza al orquestador a crear un job unknown_outcome, nunca succeeded/failed directo
};

type ProviderPublicationStatus = {
  readonly externalId: string;
  readonly providerStatus: string;
  readonly publishedAt: string | null;
  readonly failureReason: string | null;      // sanitizado
};
```

**Por qué `outcome: 'confirmed' | 'unknown'` en vez de solo confiar en
`Result<PublishReceipt>` (ok/err)**: un `Result.err` ya cubre "el proveedor
rechazó explícitamente" o "error de red antes de enviar nada" — pero NO
cubre "se envió la request, se agotó el timeout, no sabemos si el
proveedor la procesó". Ese tercer caso NO es un `err` (sería incorrecto
tratarlo como fallo puro, induciría un retry ciego) ni es un `ok` con
`publishedAt` real (no hay confirmación). Por eso `PublishReceipt` en sí
mismo declara `outcome: 'unknown'` dentro de un `Result.ok` — el adapter
SÍ completó su trabajo (hizo la llamada, no crasheó), pero el resultado de
negocio es ambiguo. Esta es la pieza de contrato más importante de todo
el diseño de 8B — sin ella, ningún adapter futuro tiene una forma
tipada de expresar "no lo sé" en vez de forzar un sí/no binario.

### 6.3 No sobre-modelar

Se evaluó y se descarta explícitamente: `batchPublish` (no hay evidencia
de necesidad de publicar N targets en una sola llamada — cada target ya
es su propio job independiente, §4.6), `refreshCredentials` como parte de
este puerto (pertenece a un puerto de integración separado, futuro de
8E/8F, no al publisher), `validateCredentials` como parte de este puerto
(idem — es responsabilidad de la gestión de `client_integrations`, no de
publicar un target).

---

## 7. Provider adapter architecture

### 7.1 Resolución de adapter — factory/registry, mismo patrón que Phase 7D

```ts
const PUBLISHER_CONSTRUCTORS: Record<Exclude<ActivationProvider, 'manual'>, () => ChannelPublisherPort> = {
  meta:     () => new MetaChannelPublisherAdapter(),
  google:   () => new GoogleChannelPublisherAdapter(),
  linkedin: () => new LinkedInChannelPublisherAdapter(),
  email:    () => new EmailChannelPublisherAdapter(),
};

function resolveChannelPublisher(provider: Exclude<ActivationProvider, 'manual'>): Result<ChannelPublisherPort> {
  const construct = PUBLISHER_CONSTRUCTORS[provider];
  if (!construct) return err(createError('CHANNEL_NOT_CONFIGURED', `No hay adapter registrado para provider "${provider}"`));
  return ok(construct());
}
```

- Vive en `packages/infrastructure` (mismo paquete que
  `campaign-ai-provider.factory.ts`), consumido por un único orquestador
  de aplicación — **ningún use case hace `if (provider === 'meta')`**,
  exactamente la misma regla que el comentario de 7D declara ("único
  punto del proyecto donde existe un switch por proveedor").
- **`provider: 'manual'` nunca llega a esta factory** — el canal manual
  ya tiene su propio camino completo (RPC `mark_activation_target_published`
  de 8A.1, sin job/attempt de por medio, ver §9) y el orquestador de 8B
  ni siquiera intenta resolver un `ChannelPublisherPort` para él (short-circuit
  explícito en el use case, no un adapter "no-op").

### 7.2 Divergencia deliberada respecto al patrón Phase 7D (justificada)

| Aspecto | Phase 7D (AI) | Phase 8B (Publishing) | Por qué diverge |
|---|---|---|---|
| Selección de credencial | Variable de entorno global por proveedor (`OPENAI_API_KEY`, etc.) | `clientIntegrationId` resuelto dinámicamente por target — multi-tenant real | AI usa las credenciales DE LA AGENCIA (una key de OpenAI sirve para todos los clientes); publishing usa las credenciales DEL CLIENTE (cada cliente tiene su propia cuenta de Meta Ads) — no es una variable de entorno, es una fila de `client_integrations` resuelta en cada llamada. |
| Fallback automático | Explícitamente ausente en ambos | Explícitamente ausente en ambos | Sin divergencia — 8B mantiene "nunca fallback silencioso a otro proveedor" (publicar en Meta no puede fallar-y-caer-a-Google, sería una acción de negocio completamente distinta, no una alternativa técnica). |
| Dónde vive la key en runtime | Leída de `process.env` dentro del provider concreto | Leída de `client_integrations` (vía `vault_reference`, §7.3) dentro del adapter concreto, JAMÁS en el objeto `PublishTargetInput` que cruza capas | Mismo principio ("la credencial nunca viaja como dato explícito entre capas"), aplicado a una fuente distinta (DB con vault reference, no env var) porque hay N credenciales (una por cliente) en vez de 1 credencial global por proveedor. |
| ¿Compare mode? | Mencionado como extensión futura diferida (7D §17) | **No aplica** — no tiene sentido "comparar" publicar el mismo anuncio en dos proveedores simultáneamente como si fueran alternativas; cada target YA especifica su provider de forma cerrada. |

### 7.3 Resolución de credenciales — el paso que Phase 7D no necesita

```ts
async function resolveCredentials(
  clientIntegrationId: ClientIntegrationId,
  organizationId: OrganizationId,
): Promise<Result<ProviderCredentials>> {
  const integration = await clientIntegrationRepository.findById(clientIntegrationId, organizationId);
  // valida: integration.organizationId === organizationId (defensa en profundidad,
  // el trigger check_activation_target_match ya lo valida en 8A.1, pero el
  // adapter NO confía únicamente en eso — mismo criterio "defensa en profundidad"
  // que el resto del código base)
  // integration.status === 'active' — si no, CHANNEL_NOT_CONFIGURED / AUTH_EXPIRED
  // lee vault_reference desde configuration, resuelve el secreto real vía
  // Supabase Vault SOLO en este punto — nunca antes, nunca lo persiste en
  // ningún objeto que se loguee o serialice más allá de esta función.
}
```

Este paso vive DENTRO de cada adapter concreto (o en un helper compartido
de infraestructura que los adapters llaman), nunca en application — el
use case de orquestación (§8) solo conoce `clientIntegrationId` (un id
opaco), nunca ve el secreto resuelto.

---

## 8. Orchestration recommendation

### 8.1 Comparación de las 4 opciones

| Opción | Descripción | Evaluación |
|---|---|---|
| **A. Directo (use case → adapter)** | El use case de aplicación llama `resolveChannelPublisher(provider).publish(...)` sincrónicamente dentro de la Server Action/request HTTP. | **Descartada como mecanismo único.** Llamadas a APIs de Meta/Google pueden tardar segundos y no deben bloquear una request HTTP de usuario ni acoplar la disponibilidad del sitio a la disponibilidad del proveedor externo. Además, sin una tabla de job intermedia, no hay forma de sobrevivir un crash del proceso Next.js a mitad de una llamada — el request simplemente se pierde y el sistema no sabe si publicó. |
| **B. Job + worker (interno, sin n8n)** | Un use case crea el `CampaignPublicationJob` (`queued`) y retorna inmediatamente; un worker separado (proceso Node long-running o cron/queue de Postgres) reclama jobs `queued` y llama al adapter. | **Viable, pero requiere infraestructura de worker que hoy NO existe en el repo** (no hay ningún proceso Node persistente fuera de Next.js/n8n en `apps/`) — introducir uno nuevo es la opción de mayor esfuerzo de infraestructura nueva. |
| **C. Job + n8n** | El job se crea igual que en B, pero el "worker" es n8n (reutilizando `WorkflowDispatcherPort`/`N8nWebhookDispatcher` ya existente) — n8n hace la llamada HTTP al proveedor y notifica el resultado vía el mismo patrón de callback ya implementado en `/api/webhooks/n8n`. | **Recomendada — ver justificación abajo.** |
| **D. Híbrida** | El job se crea siempre (como B/C); un cron/reconciliación periódica revisa jobs `in_progress` con `getStatus()` como red de seguridad, independientemente de si el dispatch original fue directo o vía n8n. | **Recomendada como complemento de C, no como opción separada** — ver §8.3. |

### 8.2 Recomendación: **C (job + n8n) + reconciliación periódica (elemento de D)**

Justificación, considerando explícitamente cada criterio del encargo:

- **Reliability/retries**: n8n YA tiene su propio motor de retry/backoff a
  nivel de workflow, y BopIAgency YA tiene el transporte firmado
  (HMAC, timeout, callback seguro) production-tested desde Phase 6. Reusar
  esto es estrictamente menos riesgo que escribir un worker Node nuevo
  desde cero para 8B.
- **Auditabilidad**: el callback de n8n ya deja rastro completo
  (`automation_webhook_events` — generalizable a
  `campaign_publication_webhook_events`, §14) con HMAC verificado y
  payload hash — mismo nivel de auditabilidad que 8A ya exige.
- **Rate limits**: n8n corre fuera del proceso web, así que un rate limit
  de Meta/Google (que puede requerir esperar minutos) no bloquea
  ningún recurso de `apps/web` — el job queda `in_progress` en DB
  mientras n8n reintenta según su propio workflow.
- **Async execution**: exactamente el propósito por el que n8n ya existe
  en el stack — no se está forzando una herramienta a un uso que no
  encaja.
- **Local dev**: `n8n-local/docker-compose.yml` YA existe y ya se usa
  para Phase 6 — el entorno de desarrollo no necesita infraestructura
  nueva, solo un workflow n8n nuevo (fuera de alcance de 8B.0 — se crea
  en 8B.3).
- **Production ops**: un worker Node nuevo (opción B) añadiría un
  proceso más que desplegar/monitorear/escalar independientemente de
  Next.js — coste operativo real sin beneficio claro dado que n8n ya
  cubre el mismo rol.
- **Future scaling**: si en el futuro un proveedor específico demanda
  latencia más baja que lo que n8n puede ofrecer, la opción A (directo)
  puede coexistir para ESE proveedor puntual sin invalidar el diseño
  general — el `ChannelPublisherPort` no impone CÓMO cada adapter hace la
  llamada, así que un adapter futuro podría llamar directo mientras otros
  siguen vía n8n, sin cambiar el contrato del puerto ni el modelo de
  datos de job/attempt.

**Divergencia respecto al patrón exacto de `AutomationExecution` — justificada:**
El dispatch NO reutiliza `WorkflowDispatcherPort` tal cual (que está
tipado para `AutomationRun`/`AutomationId`) — 8B define su propio puerto
de dispatch más angosto (o reutiliza `N8nWebhookDispatcher` como
implementación de infraestructura compartida bajo un contrato nuevo,
decisión de implementación de 8B.3), porque forzar que cada
`CampaignPublicationJob` finja ser una `AutomationExecution` reintroduce
exactamente la fusión de modelos que el audit 8A §21 ya rechazó
explícitamente ("nunca fusionar las tablas ni los state machines").

### 8.3 Regla no negociable: DB es la autoridad, n8n NUNCA lo es

Explícitamente, siguiendo el mandato del encargo:

- El **único** lugar donde el estado de un job/attempt es verdadero es
  `campaign_publication_jobs`/`campaign_publication_attempts` en Postgres.
  n8n es un **transporte de ejecución**, no una fuente de verdad — si n8n
  se cae, se reinicia, pierde su historial de ejecuciones, o cambia de
  proveedor de hosting, el estado de publicación de BopIAgency permanece
  íntegro porque nunca dependió de que n8n lo recordara.
- El callback de n8n (§14) solo puede **proponer** una transición
  (`in_progress → succeeded`, etc.) — la RPC `SECURITY DEFINER` que
  recibe esa propuesta revalida el estado ACTUAL en DB antes de aplicarla
  (mismo patrón que toda RPC crítica de 8A/8B), exactamente igual que
  `/api/webhooks/n8n/route.ts` ya hace hoy para `AutomationExecution`
  (paso 9: "verificar coherencia [...] transiciones").
- Si n8n nunca envía el callback (crash, bug, workflow mal configurado),
  el job queda `in_progress` indefinidamente hasta que la reconciliación
  periódica (§8.2, elemento D) lo detecte por timeout y lo mueva a
  `unknown_outcome` — **el sistema nunca asume éxito por silencio de
  n8n**.
- **Consecuencia de diseño explícita**: `getStatus()` del
  `ChannelPublisherPort` (§6.1) llama DIRECTAMENTE a la API del proveedor
  (Meta/Google), nunca a n8n — reconciliar preguntándole a n8n "¿qué
  pasó?" sería preguntarle al transporte en vez de a la fuente real, y
  reintroduciría exactamente el anti-patrón que el encargo pide rechazar
  explícitamente.

---

## 9. Manual vs external target coexistence model

**No hay dos modelos — hay un solo modelo de target con una rama corta.**
Confirmado y extendido desde el audit 8A §8:

- **Canal `manual`** (`provider: 'manual'`): el camino YA implementado en
  8A.3. `ready → published` vía la RPC `mark_activation_target_published`
  existente — **NUNCA pasa por `campaign_publication_jobs`**. No hay
  compromiso a agregar aquí — un target manual no tiene, ni necesitará,
  un job de publicación, porque no hay ninguna llamada asíncrona a un
  proveedor que orquestar. Forzar que el camino manual también cree un
  job "vacío" (por consistencia superficial) se descarta explícitamente:
  añadiría una fila sin ningún propósito operativo real, y expandiría
  innecesariamente la superficie de RLS/constraints que un target manual
  necesita satisfacer.
- **Canal automatizado** (`provider ∈ {meta, google, linkedin, email}`):
  `ready/scheduled → publishing` ahora SÍ requiere que exista un
  `CampaignPublicationJob` `in_progress` asociado (constraint a nivel de
  aplicación, no necesariamente un CHECK de DB — ver §15) — el target no
  puede estar `publishing` sin un job real detrás.
- **Punto de bifurcación único**: el orquestador de aplicación (nuevo use
  case `publishActivationTarget`, 8B.2) es el ÚNICO lugar que decide qué
  camino tomar, mirando `target.provider`:
  ```
  if (target.provider === 'manual') {
    // → RPC mark_activation_target_published (8A.1, sin cambios)
  } else {
    // → crear CampaignPublicationJob, encolar (8B.2/8B.3)
  }
  ```
  Esto reemplaza (no fusiona) los dos "modelos" — es una decisión de
  ENRUTAMIENTO dentro de un modelo de dominio único (`CampaignActivationTarget`
  sigue siendo la única entidad de canal), exactamente como el audit 8A
  ya diseñó el propio target ("es la MISMA entidad e implementación que un
  canal automatizado futuro").
- **UI**: `ActivationTargetsPanel` (8A.3, sin cambios estructurales)
  necesita en 8B.4 distinguir visualmente "Marcar publicado" (manual,
  acción humana confirmando algo que ya ocurrió fuera del sistema) de
  "Publicar" (automatizado, dispara el job) — son verbos distintos para
  el usuario aunque el target debajo sea la misma entidad. Esto es una
  decisión de 8B.4 (UI), no de este documento de arquitectura.

---

## 10. Authorization matrix

Extiende la matriz del audit 8A §12 (misma jerarquía `viewer < operator <
strategist < admin < owner`), sin debilitar ningún rol ya definido para
el camino manual:

| Acción | Rol mínimo | Justificación |
|---|---|---|
| Ver jobs/attempts/eventos de publicación | `viewer` | Paridad con "Inspect errors" ya establecido en 8A — diagnóstico, no acción. |
| Iniciar publicación externa (`publish`, target automatizado) | `operator` | Paridad exacta con "Execute external publishing (futuro)" ya propuesto en el audit 8A §12 ("con integración ya configurada por admin+") — no se debilita, se confirma. |
| Reintentar publicación fallida (crear job de retry) | `operator` | Paridad con `retryAutomationExecution` (Phase 6, accesible a `operator`) y con la propia propuesta del audit 8A §12 ("Retry execution (futuro) — operator"). |
| Cancelar job `queued`/`claimed` (antes de llamar al proveedor) | `operator` | Simétrico a iniciar — quien puede disparar puede detener antes de que tenga efecto externo. |
| Cancelar/solicitar cancelación de job `in_progress` (cooperativa, §4.4) | `strategist` | Más sensible que cancelar un job que ni siquiera llamó al proveedor — una vez hay una llamada HTTP en curso, decidir "queremos que esto no continúe" es una decisión de negocio más cercana a `cancelActivation` (ya `strategist` en 8A) que a la operación rutinaria de `operator`. |
| Reconciliar manualmente un job `unknown_outcome` (confirmar "sí publicó" / "no publicó" a partir de evidencia externa) | `strategist` | Es la decisión más delicada de todo 8B — una reconciliación incorrecta puede ocultar una publicación duplicada real o bloquear un retry legítimo. Se propone el mismo nivel que `cancelActivation` (irreversible, de negocio), NO `operator` — a confirmar/ajustar con el usuario antes de 8B.1, mismo criterio de "propuesta a aprobar explícitamente" que usó el audit 8A §12 para la cancelación de activation. |
| Configurar/conectar una `client_integration` (fuera de alcance de 8B en sí, pero define el techo de quién puede habilitar publicación real) | `admin+` | Hereda directamente la recomendación ya escrita en el audit 8A §12 ("configurar la integración es más sensible que dispararla una vez configurada") — no se modifica aquí, se re-confirma como precondición de 8E/8F. |
| Ver credenciales/configuración de integración (incluida su referencia a vault) | `admin+` | Nunca `viewer`/`operator` — evita que cualquier miembro con acceso de lectura básico vea siquiera la referencia opaca a un secreto; el valor real del secreto nunca es visible a NINGÚN rol vía UI/API (§7), pero la fila de metadata (`vault_reference`, `status`, `last_rotated_at`) ya es información sensible de superficie de ataque y se restringe igual. |

**Nota explícita, siguiendo el mismo criterio del audit 8A §12**: la fila
de reconciliación manual (`strategist`) es una PROPUESTA a confirmar antes
de 8B.1 — no una decisión cerrada, exactamente como el audit 8A dejó
abierta la cancelación de activation para revisión con el usuario.

---

## 11. Failure / reconciliation model

### 11.1 Taxonomía de fallos — extiende (no reemplaza) la del audit 8A §24

| Código | Categoría | Retryable | Requiere acción humana | Requiere reconciliación |
|---|---|---|---|---|
| `ACTIVATION_NOT_READY` | Domain | No | Sí (corregir secuencia) | No |
| `CHANNEL_NOT_CONFIGURED` | Domain | No | Sí (configurar integración, admin+) | No |
| `INTEGRATION_NOT_AVAILABLE` | Integration | Sí | No | No |
| `AUTH_EXPIRED` | Integration | No (automáticamente) | Sí (reconectar, admin+) | No |
| `RATE_LIMITED` | Integration | Sí (con backoff) | No | No |
| `PROVIDER_REJECTED` | Integration | No | Sí (corregir creative/config y crear nueva activation o target) | No |
| `PUBLISHING_TIMEOUT` | Integration | **Depende — ver `UNKNOWN_OUTCOME` abajo, nunca retryable ciego** | No (automático vía reconciliación) | **Sí, obligatoria** |
| `INVALID_ASSET` | Domain | No | Sí | No |
| `BUDGET_INVALID` | Domain | No | Sí | No |
| `DISPATCH_FAILED` | Integration | Sí | No | No |
| **`UNKNOWN_OUTCOME`** *(nuevo en 8B)* | Integration | **No — nunca retryable hasta reconciliar** | **Sí — reconciliación explícita (automática vía `getStatus` o manual por strategist+)** | **Sí, es la categoría que EXISTE para esto** |
| **`PROVIDER_OUTAGE`** *(nuevo en 8B — distingue de `INTEGRATION_NOT_AVAILABLE`)* | Integration | Sí (con backoff más largo) | No | No |

**Por qué `UNKNOWN_OUTCOME` es una categoría de fallo separada y no un
subtipo de `PUBLISHING_TIMEOUT`**: un timeout de red (`PUBLISHING_TIMEOUT`)
puede en algunos casos saberse con certeza que NO llegó a procesarse
(ej. el proveedor rechazó la conexión antes de aceptar el payload — ahí
sí es seguro reintentar). `UNKNOWN_OUTCOME` es específicamente el caso
donde la request SÍ pudo haber llegado al proveedor y no hay forma de
saberlo sin una consulta adicional — es un estado epistemológico distinto
("no sé"), no solo una variante de "tardó demasiado". Colapsarlos en el
mismo código perdería la distinción exacta que el encargo pide preservar
explícitamente.

### 11.2 Reconciliación — obligatoria antes de cualquier retry de un `unknown_outcome`

Flujo:

1. Job entra en `unknown_outcome` cuando: (a) el adapter retorna
   `PublishReceipt.outcome === 'unknown'` (timeout propio detectado por
   el adapter), o (b) la reconciliación periódica (§8.2) detecta un job
   `in_progress` sin transición ni webhook recibido más allá de un
   umbral configurable (ej. 15 minutos — valor exacto a definir en 8B.3,
   no en este documento).
2. El orquestador llama `ChannelPublisherPort.getStatus(externalIdIfKnown
   OR lookup-by-idempotency-key-if-provider-supports-it)`.
3. Si el proveedor confirma que SÍ existe la publicación (`externalId`
   resuelto, `providerStatus` = éxito conocido) → el job transiciona a
   `succeeded` con el `externalId`/`externalUrl` reales — **nunca se crea
   un segundo intento**, el job original simplemente se completa tarde.
4. Si el proveedor confirma que NO existe (búsqueda negativa, o el
   proveedor expone un endpoint de "buscar por idempotency key" que no
   encuentra nada) → el job transiciona a `failed` con
   `failure_category = 'unknown_outcome_resolved_not_published'` y AHORA
   sí es elegible para retry (§4.3).
5. Si `getStatus` en sí mismo falla o el proveedor no ofrece ninguna
   forma de consultar el resultado (algunos proveedores no lo permiten)
   → el job permanece `unknown_outcome` y se **escala a una tarea**
   (`Task`, no `Alert` — ver §13) para reconciliación MANUAL por
   `strategist+`: un humano revisa directamente en la plataforma del
   proveedor y usa la acción de reconciliación manual (§10) para resolver
   explícitamente el job a `succeeded` (con `externalReference` capturado
   a mano) o `failed` (habilitando retry).
6. **Ningún camino de este flujo permite que el sistema decida
   automáticamente "asumo que sí publicó" o "asumo que no publicó" sin
   evidencia positiva** — es la garantía central que cierra R-ACT-08 (que
   8A dejó explícitamente diferido a 8B) de forma completa, no parcial.

---

## 12. Signals / observability design

Extiende el patrón `activation:{org}:{activationId}:{evento}` (8A) con un
namespace paralelo, mismo criterio de moderación que `activation-signals.ts`
ya documentó explícitamente como decisión de producto (no generar señal
por cada evento de progreso):

| Evento | Task | Alert | Ninguna |
|---|---|---|---|
| Job creado (`queued`) | | | ✓ — progreso normal, solo event log |
| Job `in_progress` | | | ✓ |
| Job `succeeded` | | | ✓ — el target ya pasa a `published`, visible en la UI existente sin señal adicional |
| Job `failed` (categoría domain, ej. `INVALID_ASSET`) | | | ✓ — corregible por el mismo strategist que configuró el target, visible en el target directamente, no amerita interrumpir a nadie más |
| Job `failed` (categoría integration, retryable, ej. `RATE_LIMITED`, `DISPATCH_FAILED`) | | | ✓ — el retry automático (dentro del backoff normal) se encarga; solo escala si se agotan los retries (ver fila siguiente) |
| Job `failed` DEFINITIVAMENTE (retries agotados, o categoría no-retryable de integración, ej. `PROVIDER_REJECTED`, `AUTH_EXPIRED`) | ✓ `Task` ("Publicación falló — requiere acción: {targetId}") | | Alert se reserva para algo más urgente (ver abajo) — un fallo de un canal aislado es trabajo operativo, no un incidente. |
| Job `unknown_outcome` sin resolución tras reconciliación automática (escalado a humano, §11.2 paso 5) | ✓ `Task` ("Reconciliar publicación — resultado desconocido: {targetId}") | ✓ `Alert` (`warning`) | Este es el único caso que amerita AMBOS — es simultáneamente trabajo operativo urgente Y una señal de que el sistema tiene ambigüedad real sobre si duplicó una acción de negocio. |
| `AUTH_EXPIRED` en cualquier target de una integración | | ✓ `Alert` (`warning`, `alert_key` con prefijo `integration:{org}:{clientIntegrationId}:auth-expired` — **ya mencionado textualmente en el audit 8A §25**, 8B.0 solo lo confirma como el disparador real) | |

**Firmas de dedupe propuestas** (mismo formato `buildKey`, ≤255 chars,
sin PII, que `activation-signals.ts`/Phase 6F/7F ya usan):

- `publication:{orgId}:{targetId}:job-failed-final`
- `publication:{orgId}:{targetId}:unknown-outcome`
- `integration:{orgId}:{clientIntegrationId}:auth-expired`

**Reglas explícitas heredadas sin excepción**:

- `upsertByAlertKey`/`findActiveBySignatureTag` — nunca `INSERT`/`create`
  directo repetido.
- Best-effort, post-commit — un fallo al crear la task/alert de
  publicación NUNCA revierte ni bloquea la transición del job/target que
  la originó (mismo principio que `evalCampaignAutomationSilently`).
- Las señales **nunca** son la fuente de verdad del estado de
  publicación — son notificación, no autoridad. Revertir el estado de un
  job porque falló la creación de una alerta sería exactamente el
  anti-patrón que el encargo pide evitar explícitamente.

---

## 13. Webhook / reconciliation model (design only)

### 13.1 Webhook inbound — diseño, replicando `/api/webhooks/n8n/route.ts` verificado

Ruta propuesta: `/api/webhooks/publishing/[provider]/route.ts` (una ruta
parametrizada por provider, no N rutas hardcoded por proveedor — el
`[provider]` de la URL se valida contra `ACTIVATION_PROVIDERS` ANTES de
cualquier otro procesamiento, cerrando explícitamente el vector "arbitrary
provider names" del checklist de seguridad, §14).

Flujo (mismo orden obligatorio que el n8n existente, adaptado):

1. Leer raw body.
2. Validar `provider` del path contra el enum cerrado — 404/400 inmediato
   si no es uno de los providers soportados, **antes** de leer headers de
   firma (evita que un provider inventado alcance siquiera el paso de
   verificación).
3. Leer headers de firma — **el esquema de firma es específico de cada
   proveedor** (Meta usa `X-Hub-Signature-256` sobre HMAC-SHA256 con el
   app secret; Google/otros varían) — el verificador debe ser
   PROVIDER-AWARE, no un HMAC genérico único como el de n8n interno. Esta
   es una diferencia real respecto al webhook de n8n (que solo tiene que
   verificarse a sí mismo) — 8B.0 lo señala explícitamente para que 8E/8F
   no asuman que pueden reutilizar `verifyIncomingWebhook` tal cual sin
   adaptar el algoritmo por proveedor.
4. Verificar timestamp/tolerancia (replay protection) — igual que hoy.
5. Verificar firma — constant-time, específica del proveedor. **Ningún
   cliente `service_role` se crea antes de este paso**, igual que hoy.
6. Deduplicar vía `campaign_publication_webhook_events` (`UNIQUE
   (provider, external_event_id)`, insert atómico + captura de `23505`)
   — mismo patrón exacto que `automation_webhook_events`, generalizado.
7. Validar payload con Zod (schema por proveedor — cada proveedor tiene
   su propia forma de notificación).
8. Verificar coherencia: el `externalId`/`idempotencyKey` reportado debe
   corresponder a un `campaign_publication_attempt` real, cuyo
   `organization_id` se verifica contra cualquier claim de tenant que el
   payload traiga (nunca confiar en un `organizationId` del payload sin
   cruzarlo con la fila real en DB — cierra "actor spoofing"/"confused
   deputy", §14).
9. Aplicar la transición propuesta vía la RPC `SECURITY DEFINER`
   correspondiente (§15) — que revalida el estado ACTUAL antes de
   escribir, igual que toda RPC crítica ya existente.
10. Insertar `campaign_publication_events` sanitizado.
11. Marcar el webhook event `processed`.
12. Responder JSON mínimo — nunca ecoar el payload recibido, nunca
    revelar detalles internos en errores.

### 13.2 Qué debe existir en el modelo de datos para soportar esto (ya cubierto por §3/§15)

- `campaign_publication_attempts.idempotency_key` — el ancla que el
  webhook usa para encontrar qué attempt confirma/rechaza (nunca confía
  en un `target_id`/`job_id` que el proveedor "recuerde" — el proveedor
  solo conoce el `externalId`/idempotency key que se le envió).
- `campaign_publication_attempts.external_id` — poblado en el `publish()`
  inicial (si el proveedor lo retorna síncronamente) o en la
  reconciliación/webhook (si es async) — es la clave de correlación
  primaria para cualquier notificación posterior del proveedor.
- `campaign_publication_webhook_events` — tabla de dedupe descrita en
  §5.3/§15.

### 13.3 Polling / reconciliación periódica como complemento, no sustituto

Un job scheduled (n8n cron workflow, o Postgres `pg_cron` si se prefiere
mantenerlo dentro de la DB — decisión de implementación de 8B.3) recorre
`campaign_publication_jobs` en `in_progress` más allá de un umbral de
tiempo y ejecuta el flujo de reconciliación de §11.2. Esto es la red de
seguridad para cuando el webhook nunca llega (bug del proveedor,
misconfiguration, outage de red del lado de BopIAgency) — **no reemplaza
el webhook**, lo complementa, siguiendo el mismo espíritu que ya proponía
la opción "D híbrida" del encargo.

---

## 14. Security review

Cada vector del checklist del encargo, analizado explícitamente contra el
diseño de este documento:

1. **Tenant isolation** — `campaign_publication_jobs`/`attempts`/`events`
   heredan `organization_id` denormalizado del target padre (mismo patrón
   que `campaign_activation_targets.organization_id`), verificado por
   trigger contra el padre real, nunca confiado al caller — mismo
   mecanismo que ya cerró R-ACT-04 en 8A.1 (`check_activation_target_match`).
2. **Actor spoofing** — toda escritura de `actor_user_id`/`created_by`
   proviene de `auth.uid()` dentro de la RPC `SECURITY DEFINER`, nunca de
   un campo del payload del cliente — mismo patrón sin excepción. El
   único caso donde el actor es "el sistema" (webhook de proveedor,
   worker de reconciliación) usa `is_system = true`/`actor_user_id =
   NULL` explícito, nunca un uuid inventado.
3. **`service_role` usage** — reservado EXCLUSIVAMENTE para (a) el
   callback de webhook de proveedor (después de HMAC verificado, mismo
   punto exacto que n8n hoy) y (b) el worker de reconciliación periódica.
   Nunca para el flujo normal de un usuario autenticado iniciando/
   reintentando una publicación — eso pasa por RLS + RPC normal con la
   sesión del usuario.
4. **Credential leakage** — la credencial real NUNCA entra en:
   `approved_snapshot` (ya garantizado por diseño de 8A, sin cambios),
   `campaign_publication_attempts`/`events` (solo `credentialsRef` como
   id opaco, nunca el secreto ni siquiera el `vault_reference` en un
   campo logueable — el `vault_reference` vive únicamente en
   `client_integrations`/`automation_secrets_metadata`-como-patrón),
   `failure_message`/`providerErrorCode` (sanitizados con la misma lista
   `FORBIDDEN_METADATA_KEYS` antes de persistir — un error crudo de
   proveedor que incluya, por ejemplo, un token en el mensaje de error
   (algunos SDKs lo hacen) debe pasar por un sanitizador ANTES de tocar
   DB, responsabilidad explícita del adapter concreto en 8E/8F, señalada
   aquí para que no se omita), tasks/alerts (mismo sanitizador, §12).
5. **SSRF** — ningún callback/webhook URL es aceptado del caller en
   ningún punto del flujo — la URL de callback hacia n8n sigue
   resolviéndose server-side desde `NEXT_PUBLIC_APP_URL` (sin cambios,
   §1.2); las llamadas SALIENTES hacia proveedores (`publish`/`getStatus`)
   usan hosts fijos y conocidos por adapter (hardcoded o de config
   server-side, nunca construidos a partir de `placement`/metadata
   proveída por el usuario — cierra explícitamente el riesgo ya
   pre-documentado por 8A como R-ACT-15, "placement como vector de
   inyección").
6. **Arbitrary provider names** — `provider` en el path del webhook (§13.1)
   y en cualquier resolución de adapter (§7.1) se valida contra
   `ACTIVATION_PROVIDERS` (enum cerrado ya existente, sin extender el
   vocabulario) ANTES de cualquier lookup — un provider no reconocido
   nunca llega a construir una URL, resolver un secreto, ni tocar DB más
   allá de un 400 inmediato.
7. **Arbitrary callback URLs** — el sistema nunca acepta una URL de
   callback proveída por request externa para NADA — ni el dispatch hacia
   n8n (ya cerrado, §1.2) ni ninguna llamada nueva de 8B. Si algún
   proveedor de 8E/8F requiere registrar una URL de callback en su panel
   de configuración, esa URL es la MISMA fija (`/api/webhooks/publishing/
   {provider}`) para todos los clientes de esa organización — nunca
   una URL por-cliente ni por-request.
8. **Webhook spoofing** — verificación de firma específica de proveedor,
   obligatoria y previa a cualquier lectura de DB con privilegio elevado
   (§13.1 paso 5) — sin excepción, sin modo "trust" de desarrollo que
   pudiera colarse a producción (mismo criterio que hoy exige
   `AUTOMATION_WEBHOOK_SECRET` ≥32 chars sin default).
9. **Replay attacks** — tolerancia de timestamp (mismo patrón que HMAC de
   n8n) + dedupe por `(provider, external_event_id)` — un webhook
   reenviado (por el proveedor o por un atacante que capturó una request
   antigua) es rechazado en el paso de dedupe incluso si la firma sigue
   siendo técnicamente válida dentro de la ventana de tolerancia.
10. **Duplicate publication** — cubierto en profundidad por §4 (concurrency),
    §5 (idempotency), §11 (unknown outcome) — el hallazgo central de todo
    el documento, no un punto aislado de esta sección.
11. **Confused-deputy attacks** — el escenario relevante: un usuario de la
    Organización A intenta que el sistema publique usando la
    `client_integration` de la Organización B (por ejemplo, adivinando o
    enumerando un `clientIntegrationId` válido de otra org en el payload
    de una Server Action). Mitigado en DOS capas, igual que 8A: (a) el
    use case de aplicación resuelve `clientIntegrationId` SOLO a partir
    del `target` ya persistido (nunca acepta un `clientIntegrationId`
    suelto del caller para esta operación — el target ya fue validado
    cross-org en su creación, §3.2 del audit 8A / trigger
    `check_activation_target_match`), y (b) el `resolveCredentials` de
    §7.3 re-verifica `integration.organizationId === target.organizationId`
    como defensa en profundidad, nunca confiando en que el paso (a) baste.
12. **Cross-client integration references** — mismo trigger ya
    implementado en 8A.1 (`check_activation_target_match`, confirmado en
    runtime real, R-ACT-04) sigue siendo la autoridad — 8B no introduce
    ningún camino nuevo de escritura de `client_integration_id` en el
    target (ese campo ya existe y ya está protegido desde 8A.1; 8B solo
    LEE ese id para resolver credenciales, nunca lo reescribe).
13. **Privilege escalation** — cada RPC nueva (§15) sigue el patrón
    `has_organization_role` + revalidación de status dentro de la
    transacción — ningún endpoint/Server Action nuevo de 8B confía
    únicamente en la capa de aplicación para autorizar una transición
    crítica (RLS + RPC siguen siendo la autoridad final, igual que 8A).
    Particular atención: la acción de reconciliación manual (§10,
    propuesta `strategist+`) es la más sensible del set porque puede
    mover un job directamente a `succeeded` a partir de una afirmación
    humana no verificada automáticamente — su RPC debe registrar
    explícitamente `reconciled_by`/`reconciliation_note` como campos
    obligatorios (nunca una transición "silenciosa"), a diseñar en 8B.1.
14. **Provider error leakage** — `providerErrorCode`/`failure_message`
    sanitizados antes de persistir Y antes de mostrarse en cualquier UI
    (mismo criterio que `AutomationExecution.errorMessage` — nunca stack
    traces, nunca headers de request/response completos, nunca el body
    crudo de la respuesta del proveedor persistido tal cual). El
    `providerStatus`/`providerErrorCode` crudo puede persistirse en
    `campaign_publication_attempts` (útil para debugging por un
    admin/desarrollador), pero **la UI de operador (`viewer`/`operator`)
    solo debe mostrar una versión mapeada a la taxonomía cerrada de §11**,
    nunca el string crudo del proveedor sin pasar por el mapeo — decisión
    de UI a implementar en 8B.4, señalada aquí como requisito de
    seguridad, no solo de UX.

---

## 15. Proposed DB/RLS model (descripción — SIN migración SQL)

### 15.1 Tablas nuevas

**`campaign_publication_jobs`**

Columnas clave: `id` (PK), `organization_id`, `client_id`, `activation_id`,
`target_id` (FK `campaign_activation_targets`, ON DELETE RESTRICT — nunca
perder el historial de intentos de publicación borrando el target),
`provider` (`activation_provider` enum, excluye `manual` por CHECK —
`provider <> 'manual'`), `status` (`publication_job_status` enum: `queued|
claimed|in_progress|succeeded|failed|cancelled|unknown_outcome`),
`retry_of_job_id` (FK auto-referencial nullable), `retry_count` (int,
default 0), `claimed_at`/`claimed_by_worker` (texto, identifica el proceso
que reclamó, no un usuario), `cancellation_requested_at`/
`cancellation_requested_by` (uuid, nullable), `failure_category` (texto,
CHECK contra la taxonomía de §11 más `ACTIVATION_TARGET_TERMINAL_STATUSES`-
como-lista-cerrada-en-shared, mismo criterio que `event_type` en
`campaign_activation_events`: enum vivo en dominio, CHECK contra lista
fija en DB), `reconciled_by`/`reconciled_at`/`reconciliation_note`
(nullable — solo poblados cuando `status` sale de `unknown_outcome` por
acción humana), `metadata` (jsonb, sanitizada), `created_at`/`updated_at`.

Constraints: `UNIQUE (target_id) WHERE status NOT IN ('succeeded','failed','cancelled')`
(§4.6); `CHECK (provider <> 'manual')`; FK `target_id`, `activation_id`,
`organization_id`, `client_id` todas verificadas por trigger contra el
target padre real (mismo patrón `check_activation_target_match`).

**`campaign_publication_attempts`**

Columnas clave: `id` (PK), `job_id` (FK CASCADE), `organization_id`
(denormalizado, verificado por trigger), `attempt_number` (int, 1-based
dentro del job), `idempotency_key` (texto, formato §5.2), `external_id`
(texto, nullable — poblado cuando el proveedor lo retorna),
`provider_status` (texto, crudo del proveedor), `provider_error_code`
(texto, sanitizado antes de escribir — nunca el raw error object),
`outcome` (`confirmed|unknown`, espeja `PublishReceipt.outcome`),
`http_status`, `duration_ms`, `started_at`/`completed_at`, `created_at`.

Constraints: `UNIQUE (job_id, idempotency_key)` (§5.3); append-only real
— **sin `updated_at`**, un attempt es un hecho histórico inmutable una
vez completado (mismo criterio que `campaign_activation_events`).

**`campaign_publication_events`**

Mismo shape conceptual que `campaign_activation_events` (§10 del audit
8A), pero `job_id NOT NULL` (FK CASCADE) en vez de `target_id` nullable:
`id`, `organization_id`, `job_id`, `attempt_id` (nullable — NULL para
eventos a nivel job, ej. `job_cancelled`), `event_type` (texto, CHECK
contra lista cerrada — `job_queued|job_claimed|job_started|job_succeeded|
job_failed|job_cancelled|job_marked_unknown_outcome|job_reconciled|
webhook_received`), `actor_user_id` (nullable), `is_system` (boolean),
`note`, `metadata` (sanitizada), `created_at` — append-only, sin
`updated_at`, INSERT solo vía RPCs (nunca INSERT directo de aplicación,
mismo patrón exacto que 8A.1 §16).

**`campaign_publication_webhook_events`**

Generaliza `automation_webhook_events` (§5.3): `id`, `organization_id`
(nullable — puede no resolverse hasta después de la firma/dedupe, mismo
criterio que la tabla original), `provider` (enum cerrado, validado ANTES
de cualquier otra cosa — §14 punto 6), `external_event_id` (**NOT NULL**
para publishing, a diferencia del original — §5.3), `payload_hash`
(SHA-256, nunca el raw body), `status` (`received|processed|failed`),
`received_at`/`processed_at`/`error_code`/`created_at`.

Constraints: `UNIQUE (provider, external_event_id)`.

### 15.2 RLS

Mismo patrón de tres capas que 8A.1 (§16 del audit 8A), sin reinventar:

- **SELECT**: cualquier miembro de la organización — igual que
  `campaign_activation_events`.
- **INSERT/UPDATE directo**: **no expuesto en absoluto** para las 4 tablas
  — a diferencia de `campaign_activations` (que sí permite `UPDATE`
  acotado de metadata/notes vía RLS), las tablas de publicación son
  **RPC-only de punta a punta**, incluyendo la creación del job inicial
  (`create_publication_job(target_id)`, rol `operator+`, valida
  `target.provider <> 'manual'` y `target.status IN ('ready','scheduled')`
  antes de insertar) — no hay ningún campo "seguro" de metadata que un
  usuario deba poder tocar directamente en un job/attempt, así que no se
  ofrece ningún `UPDATE` parcial vía RLS, cerrando superficie
  innecesaria.
- **RPCs `SECURITY DEFINER` nuevas** (mismo patrón exacto que
  `mark_activation_target_published`, verificado línea por línea en
  §1.1): `create_publication_job`, `claim_publication_job` (rol interno/
  `service_role` — un worker/n8n, no un usuario final), `record_publication_attempt`,
  `mark_publication_job_succeeded`/`_failed`/`_unknown_outcome`
  (`service_role`, invocadas desde el callback de webhook o el
  orquestador tras `getStatus`), `cancel_publication_job` (`operator`/
  `strategist` según §10), `reconcile_publication_job` (`strategist+`,
  registra `reconciled_by`/`reconciliation_note` obligatoriamente).
- **Actor derivation**: `auth.uid()` dentro de cada RPC para toda
  operación iniciada por un usuario; `service_role` explícito (sin
  `auth.uid()`, `is_system = true`) SOLO para las RPCs invocadas desde el
  webhook de proveedor ya-HMAC-verificado o desde el worker de
  reconciliación periódica — nunca mezclado en la misma RPC (una RPC es
  para usuarios O para el sistema, nunca ambigua sobre cuál).
- **DELETE**: no se expone en ninguna de las 4 tablas — historial
  append-only real, igual que `campaign_activation_events`/
  `campaign_approvals`.
- **Tenant consistency**: `organization_id` denormalizado en las 4 tablas,
  verificado por trigger contra el `target`/`job` padre real en cada
  INSERT — nunca confiado al caller, mismo mecanismo que ya cerró
  R-ACT-04.

---

## 16. Recommended 8B subphase breakdown

Revisando el candidato `8B.1 Domain+Persistence / 8B.2 Application
Orchestration / 8B.3 Gateway Runtime / 8B.4 Web Operations` propuesto en
el encargo — **confirmado, con una precisión de alcance en cada
subfase** derivada de este audit:

- **8B.1 — Publication Domain + Persistence**: entidades de dominio
  (`CampaignPublicationJob`, `CampaignPublicationAttempt`,
  `CampaignPublicationEvent`) + funciones puras de transición (§4) +
  migración aditiva de las 4 tablas de §15 (3 + `webhook_events`) + RPCs
  `SECURITY DEFINER` de §15.2 + las 2 transiciones nuevas de
  `CampaignActivationTarget` (`markPublishing`/`markFailed`, extendiendo
  el repositorio de 8A.1 sin modificar su state machine ya cerrado) + RLS
  completa. **Explícitamente NO incluye**: ningún adapter de proveedor
  real, ningún `ChannelPublisherPort` implementado, ningún endpoint de
  webhook todavía activo (la tabla de dedupe se crea, la ruta HTTP no).
- **8B.2 — Publication Application Orchestration**: `ChannelPublisherPort`
  como contrato (interfaz, sin implementación real — un adapter
  `NullChannelPublisherAdapter`/de test es aceptable para poder testear
  el orquestador end-to-end sin tocar un proveedor real), factory/registry
  de §7, use case `publishActivationTarget` (el punto de bifurcación
  manual/automatizado de §9), use cases de retry/cancel/reconcile,
  integración de señales (§12) reutilizando `activation-signals.ts` como
  precedente directo (extensión, no reescritura). **Explícitamente NO
  incluye**: llamada de red real a ningún proveedor — el adapter de
  prueba usado en tests simula `succeeded`/`failed`/`unknown_outcome`
  determinísticamente.
- **8B.3 — Publishing Gateway Runtime**: implementación real del
  transporte hacia n8n para el dispatch de jobs (workflow n8n nuevo,
  fuera de `packages/`, en `n8n-local/workflows/`), endpoint
  `/api/webhooks/publishing/[provider]/route.ts` (§13, receptor genérico
  — el verificador de firma por-provider puede quedar con un solo
  proveedor real de prueba, o con un stub, hasta que 8E provea el
  primero real), worker/cron de reconciliación periódica (§8.2/§13.3).
  **Explícitamente NO incluye**: credenciales reales de ningún proveedor,
  ni el primer `MetaChannelPublisherAdapter`/`GoogleChannelPublisherAdapter`
  real — esos llegan en 8E/8F, consumiendo el runtime que 8B.3 deja listo.
- **8B.4 — Web Operations / Monitoring**: UI de jobs/attempts sobre
  `/campaigns/[id]/activation` (extensión de `ActivationTargetsPanel`,
  distinguiendo "Publicar" automatizado de "Marcar publicado" manual, §9),
  vista de reconciliación manual para `strategist+`, mapeo de
  `providerErrorCode` crudo → taxonomía visible (§14 punto 14). Reutiliza
  el patrón de Server Actions delgadas + composition root ya establecido
  en `activation.composition.ts`.

**Confirmado explícitamente, siguiendo la instrucción del encargo**: las
implementaciones reales de Meta/Google (8E/8F) permanecen fuera de 8B por
completo — no hay evidencia en esta auditoría que justifique adelantarlas.
La única razón para reconsiderar esta secuencia sería si 8B.3 descubre
que el runtime de n8n necesita ajustes específicos de un proveedor
concreto antes de poder generalizarse — no encontrado en esta ronda de
solo-lectura (no se probó ningún workflow n8n real de publishing, porque
no existe ninguno todavía).

---

## 17. Rejected alternatives (resumen consolidado)

| Decisión | Alternativa rechazada | Por qué |
|---|---|---|
| State machine de job | `pending\|queued\|processing\|published\|failed\|retryable\|cancelled` tal cual sugerido | `pending` colisiona semánticamente con el nivel de target; `retryable` es una propiedad de fallo, no un estado; faltaban `claimed` (concurrencia) y `unknown_outcome` (el caso más importante) — ver §4.1. |
| Orquestación | A: directo síncrono | Bloquea request HTTP, no sobrevive crash a mitad de llamada. |
| Orquestación | B: worker Node nuevo | Infraestructura de proceso nueva sin evidencia de necesidad frente a n8n ya existente y production-tested. |
| Orquestación | n8n como autoridad de estado | Rechazado explícitamente por mandato del encargo — DB permanece la única fuente de verdad, n8n es transporte (§8.3). |
| Tabla de publicación | Colapsar job+attempt en una sola tabla mutada in-place | Pierde historial de reintentos, rompe el patrón "retry = fila nueva" ya establecido por `AutomationExecution`. |
| Tabla de publicación | Reutilizar `campaign_activation_events` para eventos de publicación | Ruido/volumen distinto, distinto owner de escritura (RPC vs runtime de worker) — ver §3.2. |
| Tabla de publicación | Ninguna tabla nueva, solo columnas en el target | El target ya reserva sus columnas de fallo para el ÚLTIMO estado conocido, no para un historial de intentos. |
| Adapter plugin mechanism | Contenedor DI genérico | Sin precedente en el repo — Phase 7D ya estableció factory function + registry como el patrón, se reutiliza sin introducir un concepto nuevo. |
| Credenciales | Tabla de secretos nueva paralela a `automation_secrets_metadata` | Ya existe el patrón vault-reference sin escritor — generalizarlo es menos riesgo que duplicar el concepto. |
| Manual vs external | Dos entidades de target separadas | El audit 8A ya estableció (y 8B.0 confirma) que es una entidad con una rama de enrutamiento, no dos modelos. |
| Fase | Adelantar Meta/Google a 8B | Sin evidencia de necesidad; el encargo mismo instruye mantenerlos en fases posteriores salvo hallazgo fuerte — no encontrado. |

---

## 18. Open questions requiring explicit user confirmation before 8B.1

Siguiendo el mismo criterio que el audit 8A dejó preguntas abiertas
explícitas en vez de decidir unilateralmente sobre puntos sensibles:

1. **Rol mínimo para reconciliación manual de `unknown_outcome`**:
   propuesto `strategist+` (§10) — confirmar, dado que es la acción más
   sensible de todo el diseño (puede ocultar/exponer una duplicación
   real).
2. **Rol mínimo para cancelar un job `in_progress`** (cooperativo):
   propuesto `strategist+`, distinto del `operator` que puede cancelar
   `queued`/`claimed` — confirmar la asimetría.
3. **Umbral de tiempo para que la reconciliación periódica marque un job
   `in_progress` como candidato a revisión** (§13.3) — valor exacto no
   fijado en este documento (propuesta de referencia: 15 minutos, a
   ajustar por proveedor si 8E/8F lo justifica).
4. **¿El primer webhook real de proveedor se construye en 8B.3 con un
   proveedor de prueba/stub, o se difiere por completo hasta que 8E tenga
   credenciales reales?** — este documento asume que 8B.3 deja el runtime
   listo pero sin verificación de firma real de ningún proveedor concreto
   todavía (dado que ningún esquema de firma de Meta/Google fue auditado
   en esta ronda — fuera de alcance de lectura de código, ya que no
   existe ningún adapter todavía).

---

## 19. Files reviewed (no modificados)

Dominio: `campaign-activation.ts`, `campaign-activation-target.ts`,
`campaign-activation-event.ts`, `campaign-activation.repository.ts`
(completos). `automation-execution.ts` (referenciado vía audit 8A §21 y
confirmado por lectura del dispatcher/webhook route). `campaign.ts`,
`campaign-approval.ts` (sin re-lectura completa — ya auditados
exhaustivamente en 8A, sin cambios desde entonces confirmados por `git
log`).
Shared: `constants/activation.ts` (completo).
Aplicación: listado completo de `use-cases/activations/` (12 archivos +
`activation-signals.ts`), no reabiertos línea por línea (ya auditados en
8A2/8A3 reports) salvo para confirmar que ninguno referencia publicación
externa (grep negativo confirmado por los propios reportes 8A.2/8A.3, que
incluyen tests explícitos de ausencia de imports de proveedor).
Infraestructura: `n8n-webhook-dispatcher.ts` (completo, 300+ líneas),
`campaign-ai-provider.factory.ts` (completo), `ai-provider.ts` de
`ai-engine` (completo).
Integrations: `advertising-platform.provider.ts` (confirmado sin cambios
desde 8A).
Web: `apps/web/src/app/api/webhooks/n8n/route.ts` (completo, 456 líneas),
`payload.schema.ts` (listado, no reabierto línea por línea).
Migraciones: `20260824180000_phase8a1_campaign_activation_domain.sql`
(estructura completa vía grep de funciones + lectura completa de
`mark_activation_target_published`), `20260730120000_phase3_clients.sql`
(sección `client_integrations` completa), `20260804000000_phase6b_automation_runtime.sql`
(secciones `automation_webhook_events` y `automation_secrets_metadata`
completas — hallazgo del vault-reference pattern, no mencionado en el
audit 8A).
Docs: `PHASE_8_IMPLEMENTATION_PLAN.md`, `PHASE_8_RISK_REGISTER.md`,
`PHASE_8A_ACTIVATION_AUDIT.md` (los tres, íntegros).

**Ningún archivo de código/migración fue creado, editado ni movido
durante esta auditoría** — solo los tres documentos entregables descritos
en la tarea (este documento + actualización de plan + actualización de
risk register).
