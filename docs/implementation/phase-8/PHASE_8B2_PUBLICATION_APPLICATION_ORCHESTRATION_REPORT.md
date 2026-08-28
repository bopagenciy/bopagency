# Phase 8B.2 — Publication Application & Orchestration — Reporte

**Rama:** `feat/phase-8-campaign-operations`
**Fecha:** 2026-08-27
**Subfase:** capa de aplicación/orquestación para `CampaignPublicationJob`
(8B.1) — use cases, `ChannelPublisherPort` provider-neutral, flujo de
dispatch determinista. **SIN integración real de Meta/Google/OAuth/HTTP.**
**Precondición:** 8B.1 CERRADO — migraciones `20260825120000`,
`20260827090000` (hardening), `20260828100000` (retry-reset) aplicadas y
validadas contra Postgres local real (Run 6/Run 7 consecutivas sin
limpieza, Run 8 de auditoría de consistencia). Ninguna arquitectura de
8B.1 se reabre en esta fase salvo la única extensión aditiva documentada
en §1.

---

## 0. Alcance — qué SÍ y qué NO hace 8B.2

**SÍ:** use cases de aplicación que conectan
`CampaignActivationTarget -> CampaignPublicationJob -> orquestación ->
límite de publisher`; un puerto `ChannelPublisherPort` provider-neutral;
fakes deterministas para tests; un composition root consistente con
8A.2/8A.3; documentación del límite con n8n.

**NO:** Meta Graph API, Google Ads API, flujos OAuth, persistencia de
tokens/secrets de proveedor, publicación externa real, autoridad de n8n
sobre el estado del job, auto-activación de campañas, auto-publicación al
aprobar una campaña, alcance de producto no relacionado con orquestación
de publicación, infraestructura de producción, `supabase/config.toml`.

---

## 1. Auditoría previa a la implementación

### 1.1 Patrones de composición existentes

- `apps/web/src/lib/composition/activation.composition.ts` (8A.3) es el
  template exacto seguido aquí: una función `createXComposition(supabase)`
  que instancia repositorios Supabase con el cliente RECIBIDO (nunca creado
  internamente), arma un objeto `deps` compartido, y expone un objeto
  `useCases` de funciones ya bindeadas. Replicado 1:1 para
  `publication.composition.ts` — con una segunda factory adicional (ver
  §1.2) que 8A.3 no necesitaba.

### 1.2 Cómo se instancian los repositorios Supabase / cliente actual-user vs. service_role

- Todas las lecturas de `SupabaseCampaignPublicationRepository` usan el
  cliente recibido en el constructor (RLS activo si es el cliente de
  sesión). Las escrituras SIEMPRE invocan una RPC `SECURITY DEFINER` — el
  propio header del archivo (8B.1) ya documentaba explícitamente: *"las
  RPCs `service_role` requieren un cliente Supabase construido con la
  service role key — este repositorio no construye ese cliente por sí
  mismo"*. Confirmado por grants reales (8B.1 §31): 4 RPCs `authenticated`
  (create/cancel/reconcile/prepare_retry), 11 `service_role`
  (claim/start/attempt/record\*).
- Esto es la razón arquitectónica central de 8B.2: **NO existe una única
  composición posible** — se necesitan DOS factories con DOS clientes
  Supabase distintos (ver §1.1/§6 composition root). `apps/web/src/lib/
  supabase/server.ts` ya expone `createAdminClient()` (service_role, usado
  hoy por `app/api/webhooks/n8n/route.ts` para RPCs de sistema) — reutilizado
  aquí sin cambios.

### 1.3 Resolución de usuario/organización actual y enforcement de rol

- Patrón uniforme en TODOS los use cases de 8A.2 (`get-campaign-activation`,
  `mark-activation-target-ready`, `cancel-activation-target`, etc.):
  `organizationRepository.findMember(organizationId, actorUserId)` seguido
  de `hasMinimumRole(member.role, requiredRole)` — un chequeo de rol EN
  PROFUNDIDAD que nunca reemplaza la RPC (la RPC es la autoridad real vía
  `has_organization_role` server-side), solo da un error más rápido/claro
  y evita un roundtrip innecesario. **Replicado exactamente** para los 5
  use cases de escritura de 8B.2 (§3).
- Hallazgo relevante: `cancelActivationTarget` (8A.2) usa un rol FIJO
  (strategist+) porque la cancelación de un target no depende del estado.
  `cancelPublicationJob` (8B.2) NO puede usar ese mismo patrón —
  8B.0/8B.1 definieron una matriz de rol QUE DEPENDE DEL ESTADO
  (`operator+` para queued/claimed, `strategist+` para in_progress
  cooperativo). Esto exigió leer el job (`findJobById`) ANTES de decidir
  el rol mínimo — la única desviación real del template de 8A.2 (ver §5).

### 1.4 Patrones de dispatch reutilizables (Phase 6)

- `startAutomationExecution` (6D) es el template arquitectónico para
  "orquestar un side-effect externo tras una transición autoritativa de
  DB": valida, crea en estado inicial, despacha vía un PUERTO
  (`WorkflowDispatcherPort`), y en caso de fallo del dispatch marca un
  estado de error explícito — nunca deja el registro en un limbo
  silencioso. `dispatchPublicationJob` (8B.2, ver §4) sigue el mismo
  espíritu, adaptado a que aquí el "estado de error" tiene TRES salidas
  posibles (succeeded/failed/unknown_outcome) en vez de solo
  queued/failed, y a que las transiciones de estado YA están encapsuladas
  en RPCs atómicas de 8B.1 (6D no tenía ese lujo — `AutomationExecution`
  no tiene una migración con RPCs equivalentes, usa updates directos vía
  repositorio).

### 1.5 Puertos/interfaces existentes que ya se parecen a un "publisher"

- `WorkflowDispatcherPort` (6D/8B.0) y `CampaignGeneratorPort` (7D) son
  los dos precedentes directos: puerto en `packages/application/src/ports/`,
  tipos de input/output "seguros" (nunca raw HTTP/SDK), implementación
  concreta conectada SOLO en el composition root. `ChannelPublisherPort`
  (8B.2, ver §2) sigue el mismo molde — NO es una reutilización directa de
  `WorkflowDispatcherPort` (dominios distintos: automatizaciones vs.
  publicación; ver §6 decisión n8n) sino un puerto nuevo con la misma
  filosofía.

### 1.6 Patrones de queue/worker/reconciliación existentes

- No existe ningún worker/queue real en el código (ni para automations ni
  para activaciones) — `startAutomationExecution` despacha SINCRÓNICAMENTE
  dentro del mismo request/Server Action, delegando la ejecución real a
  n8n vía HTTP. `dispatchPublicationJob` (8B.2) sigue ese mismo modelo:
  es una función invocable sincrónicamente (por una Server Action, un cron
  job, o —a futuro— un consumer real) que NO asume ningún runtime de cola
  propio. Un runtime de cola/worker real queda expresamente fuera de
  8B.2 (candidato natural para 8B.3, junto con el adapter de proveedor).

### 1.7 Integración n8n existente (Phase 6)

- `packages/infrastructure/src/n8n/n8n-webhook-dispatcher.ts` implementa
  `WorkflowDispatcherPort` para **automatizaciones** — dispara un webhook
  HTTP hacia n8n y expone `dispatch()`/`cancel()`. Su contrato
  (`DispatchPayload`/`DispatchResult`) está modelado alrededor de
  `AutomationExecution`, no de `CampaignPublicationJob` — los campos
  (`triggerType`, `callbackUrl` resuelto server-side, etc.) no mapean 1:1
  a lo que necesitaría un adapter de publicación real (que necesitaría
  channel/provider/clientIntegrationId/idempotencyKey, campos que
  `WorkflowDispatcherPort` no modela). Ver decisión en §6.

### 1.8 ¿Existía ya un use case de aplicación para publication jobs?

- **No.** 8B.1 dejó el `CampaignPublicationRepository` completamente sin
  consumidor de aplicación — ningún use case, ninguna Server Action, solo
  el contrato de dominio + la implementación Supabase + los 218 tests
  estáticos/de mapper. 8B.2 es la primera capa que efectivamente USA ese
  repositorio desde `application`.

---

## 2. Extensión aditiva al contrato de 8B.1 (única, documentada)

`CampaignPublicationRepository.listJobsByTarget(targetId, organizationId,
pagination)` — lectura nueva (SELECT directo, mismo patrón exacto que
`listJobsByActivation`), agregada porque el contrato original de 8B.1
solo exponía `findActiveJobByTarget` (el único job NO-terminal). 8B.2
necesita el HISTORIAL completo (terminal + no-terminal) de un target para
`listPublicationJobsByTarget`. **No agrega ninguna RPC, no toca ninguna
migración aplicada, no cambia RLS ni grants** — mismo nivel de seguridad
que cualquier otra lectura ya existente en el repositorio. Implementado en
`packages/domain/src/repositories/campaign-publication.repository.ts` (la
interfaz) y `packages/infrastructure/.../supabase-campaign-publication.repository.ts`
(la implementación).

---

## 3. Superficie de use cases elegida (mínima y coherente)

Evaluados TODOS los candidatos del kickoff; elegidos 10, deferidos 3 (ver
§7 "Deferred scope").

**Lectura (4):**

| Use case | Rol mínimo | Nota |
|---|---|---|
| `getPublicationJob` | membresía (viewer+) | agregado job+attempts |
| `listPublicationJobsByActivation` | membresía | usa `listJobsByActivation` (8B.1, sin cambio) |
| `listPublicationJobsByTarget` | membresía | usa `listJobsByTarget` (NUEVO, §2) |
| `getPublicationTimeline` | membresía | eventos append-only (`listEvents`, 8B.1, sin cambio) |

**Escritura / orquestación (6):**

| Use case | Rol mínimo | RPC/flujo subyacente |
|---|---|---|
| `queuePublication` | operator+ | RPC `create_publication_job` |
| `dispatchPublicationJob` | N/A (worker, service_role) | claim→start→attempt→publish→record\* (ver §4) |
| `cancelPublicationJob` | operator+ (queued/claimed) / strategist+ (in_progress) — depende del estado | RPC `cancel_publication_job` |
| `preparePublicationRetry` | strategist+ | RPC `prepare_publication_retry` |
| `retryPublication` | strategist+ (implícito por el paso 1) | composición: `preparePublicationRetry` + `queuePublication` |
| `reconcilePublicationOutcome` | strategist+ | RPC `reconcile_publication_job` |

**Deliberadamente NO implementados como use cases separados:**
`ListJobsNeedingReconciliation` (requiere una lectura organization-wide
por status que el contrato de 8B.1 no expone — implementarla exigiría
otra extensión de repositorio no estrictamente necesaria para el flujo
core de 8B.2; diferido a 8B.3 junto con el worker de reconciliación real
que la consumiría). `Claim`/`Start` como use cases standalone (folded
dentro de `dispatchPublicationJob` — exponerlos sueltos permitiría a un
caller "olvidar" crear el attempt, rompiendo la garantía de que TODO
intento de publicación real queda auditado). `RecordPublicationReceipt`/
outcome callback boundary como endpoint HTTP (no existe ruta HTTP en
8B.2 — el "receipt" en 8B.2 es siempre el retorno directo, en memoria, de
`ChannelPublisherPort.publish()` dentro de `dispatchPublicationJob`; un
callback HTTP asíncrono real de un proveedor es exactamente el
`/api/webhooks/*` que 8B.1 ya modeló a nivel de persistencia
(`recordWebhookReceipt`/`markWebhookEventProcessed`) pero cuya ruta HTTP
queda diferida a 8B.3, igual que en el audit original).

---

## 4. `ChannelPublisherPort` — diseño

`packages/application/src/ports/channel-publisher.port.ts`:

```typescript
interface ChannelPublisherPort {
  supports(channel: ActivationChannel, provider: ActivationProvider): boolean;
  publish(input: PublishInput): Promise<Result<PublishReceipt>>;
}
```

`PublishReceipt` — provider-neutral, exactamente la forma sugerida en el
kickoff (`outcome: 'succeeded' | 'failed' | 'unknown_outcome'`,
`externalId?`, `externalUrl?`, `providerStatus?`, `httpStatus?`,
`providerErrorCode?`, `failureCategory?`, `durationMs?`, `metadata?`).
Ningún tipo de respuesta específico de Meta/Google puede filtrarse —
`PublishReceipt` es la ÚNICA superficie que `dispatchPublicationJob` lee.

`ChannelPublisherRegistry` — resuelve `(channel, provider) ->
ChannelPublisherPort | null` recorriendo una lista de publishers
inyectada (mismo rol que `campaign-ai-provider.factory.ts` para
`CampaignGeneratorPort`, pero sin selección por variable de entorno —
8B.2 no registra ningún publisher real).

**Fakes** (`channel-publisher.fakes.ts`, packages/application — NUNCA
infrastructure, ver nota de capas abajo): `FakeSuccessfulPublisher`,
`FakeFailedPublisher`, `FakeUnknownOutcomePublisher`,
`FakeThrowingPublisher` (lanza una excepción — simula un transporte que
se cae DESPUÉS de que la solicitud pudo enviarse), y
`FakeMalformedSuccessPublisher` (succeeded sin externalId — simula un
publisher con contrato roto).

**Nota de capas:** `packages/application/package.json` declara
dependencias ÚNICAMENTE a `@bop-agency/shared`/`@bop-agency/domain` —
NUNCA a `@bop-agency/infrastructure`. Por eso los fakes viven en
`application` (no en `infrastructure`, a diferencia de los providers de
IA reales de 7D.1) — son test doubles del propio puerto de `application`,
no un adapter de infraestructura.

---

## 5. Flujo de orquestación de `dispatchPublicationJob`

Auditada la atomicidad real de las 11 RPCs `service_role` de 8B.1 ANTES
de diseñar esto (ver §1.4) — cada paso invoca EXACTAMENTE una RPC, nunca
escribe la tabla directamente, nunca duplica una transición que la RPC ya
hace atómicamente:

```
1. claimJob        (queued -> claimed)                                  [RPC service_role]
2. startJob        (claimed -> in_progress; target -> publishing)       [RPC service_role]
3. createAttempt   (abre un CampaignPublicationAttempt)                 [RPC service_role]
4. registry.resolve(channel, provider)
   -> null: recordFailure(DISPATCH_FAILED)  — certeza total, nunca se intentó nada
5. publisher.publish(input)   — SIEMPRE dentro de try/catch
6. Mapeo receipt.outcome -> RPC de cierre:
     succeeded (con externalId)  -> recordSuccess
     succeeded (SIN externalId)  -> recordUnknownOutcome  (guarda defensiva, contrato roto)
     failed                      -> recordFailure
     unknown_outcome              -> recordUnknownOutcome
     Result.err del publisher     -> recordUnknownOutcome  (conservador)
     excepción no capturada       -> recordUnknownOutcome  (REGLA DE SEGURIDAD)
```

Si `claimJob`/`startJob`/`createAttempt` fallan (p.ej. concurrencia — otro
worker ya reclamó el job), el use case propaga el error de la RPC sin
reintentar ni forzar ningún estado — un job atascado en `claimed` porque
`startJob` falló es un residual operativo documentado (mismo criterio que
la "DEUDA TÉCNICA" ya aceptada de `startAutomationExecution`, Phase 6D).

**DEPS crítico:** `dispatchPublicationJob` recibe
`publicationRepository` — este DEBE construirse con un cliente
`service_role` (worker), NUNCA el cliente de sesión de un usuario. El
composition root (§6) separa esto en una factory distinta
(`createPublicationWorkerComposition`) para hacer este requisito
imposible de pasar por alto por accidente.

---

## 6. Manejo de `unknown_outcome` (regla de seguridad)

Invariante preservada 1:1 de 8B.1: **timeout, desconexión de transporte,
5xx ambiguo, o una excepción lanzada DESPUÉS de que la solicitud pudo
haber sido aceptada por el proveedor — NINGUNO de estos casos concluye
jamás en `failed` automáticamente.** `failed` solo se usa cuando hay
CERTEZA de que nada fue aceptado por el proveedor (rechazo explícito del
publisher — un `Result.ok({outcome:'failed', ...})` deliberado — o ningún
publisher registrado, que ocurre ANTES de invocar `publish()`).

Modelado sin ningún proveedor real, con test doubles deterministas (ver
§4/§8): `FakeUnknownOutcomePublisher` cubre el 5xx ambiguo,
`FakeThrowingPublisher` cubre la excepción post-envío,
`FakeMalformedSuccessPublisher` cubre el "éxito no verificable" (ninguna
de estas tres rutas jamás invoca `recordSuccess` ni `recordFailure`).

`unknown_outcome` sigue siendo NO-terminal — la única salida es
`reconcilePublicationOutcome` (strategist+), que 8B.2 expone como wrapper
delgado sobre `reconcile_publication_job` (8B.1 Run 4). Nunca hay retry
ciego, nunca auto-failure — invariante verificada estructuralmente:
ningún use case de 8B.2 llama a `queuePublication`/`retryPublication`
automáticamente tras un `unknown_outcome`; ese es siempre un acto
strategist+ explícito posterior.

---

## 7. Retry / cancelación / reconciliación — comportamiento final

**Retry:** preserva el modelo explícito de 8B.1 Run 4 sin colapsarlo —
`retryPublication` (8B.2) es una COMPOSICIÓN de dos llamadas
independientes y auditables (`preparePublicationRetry` +
`queuePublication`), nunca una RPC nueva ni una mutación del job
original. Si el paso 1 falla, el paso 2 NUNCA se ejecuta (verificado en
tests, §8). El job histórico permanece `failed`, inmutable, con su propio
`retry_prepared` event intacto — el job nuevo tiene su propio
`retryOfJobId`/`retryCount` incrementado.

**Cancelación:** matriz de rol/estado preservada EXACTAMENTE (ver §1.3):
`operator+` cancela directamente `queued`/`claimed`; `strategist+`
solicita cancelación cooperativa de `in_progress` (nunca transiciona el
estado — la RPC ya lo documenta así); `unknown_outcome` y estados
terminales quedan explícitamente rechazados por `cancelPublicationJob`
ANTES de siquiera intentar la RPC (mensaje claro: requiere reconciliación
o ya está cerrado). 8B.2 NO implementa ninguna compensación de
"unpublish" — si el proveedor ya aceptó la publicación, no hay reversión
automática (fuera de alcance, consistente con el kickoff).

**Reconciliación:** `reconcilePublicationOutcome` — strategist+
únicamente, sin excepción, sin importar el estado previo (la RPC ya lo
restringe a `unknown_outcome` exclusivamente).

---

## 8. Decisión n8n — Opción A elegida

**Elegida: Opción A — 8B.2 solo define el puerto de aplicación
(`ChannelPublisherPort`) y dispatchPublicationJob; el adapter n8n real
queda diferido a 8B.3.**

Justificación (auditada en §1.7 antes de decidir): el `WorkflowDispatcherPort`/
`N8nWebhookDispatcher` existente (Phase 6) está modelado alrededor de
`AutomationExecution` — un dominio y un contrato de payload distintos
(`triggerType`/`callbackUrl` resuelto server-side/`inputMetadata`
sanitizada) que NO mapean a lo que un publisher de canal real necesitaría
(`channel`/`provider`/`clientIntegrationId`/`idempotencyKey` nativo del
proveedor). Reutilizarlo tal cual sería forzar dos dominios distintos a
compartir un contrato que no les queda bien a ninguno — el propio
`WorkflowDispatcherPort` documenta que su `DispatchPayload` es específico
de automatizaciones. Construir un adapter n8n real para publicación
ahora, sin saber todavía qué proveedor específico (Meta/Google/otro) se
integrará primero ni qué webhook de retorno usará, sería diseñar a
ciegas — exactamente lo que el kickoff pide evitar ("Prefer A unless
existing architecture strongly favors B"). La arquitectura actual NO
favorece fuertemente B.

---

## 9. Archivos creados / modificados

**Dominio (`packages/domain`) — modificado:**
- `src/repositories/campaign-publication.repository.ts` — método nuevo
  `listJobsByTarget` (§2).

**Infraestructura (`packages/infrastructure`) — modificado:**
- `src/supabase/repositories/supabase-campaign-publication.repository.ts`
  — implementación de `listJobsByTarget` (§2).

**Aplicación (`packages/application`) — nuevos:**
- `src/ports/channel-publisher.port.ts` — `ChannelPublisherPort`,
  `PublishInput`, `PublishReceipt`, `PublishOutcome`, `ChannelPublisherRegistry`.
- `src/ports/channel-publisher.fakes.ts` — 5 fakes (§4).
- `src/use-cases/publications/get-publication-job.use-case.ts`
- `src/use-cases/publications/list-publication-jobs-by-activation.use-case.ts`
- `src/use-cases/publications/list-publication-jobs-by-target.use-case.ts`
- `src/use-cases/publications/get-publication-timeline.use-case.ts`
- `src/use-cases/publications/queue-publication.use-case.ts`
- `src/use-cases/publications/dispatch-publication-job.use-case.ts`
- `src/use-cases/publications/cancel-publication-job.use-case.ts`
- `src/use-cases/publications/prepare-publication-retry.use-case.ts`
- `src/use-cases/publications/retry-publication.use-case.ts`
- `src/use-cases/publications/reconcile-publication-outcome.use-case.ts`
- `src/use-cases/publications/__tests__/fixtures.ts`
- `src/use-cases/publications/__tests__/queue-and-read.test.ts`
- `src/use-cases/publications/__tests__/dispatch-publication-job.test.ts`
- `src/use-cases/publications/__tests__/retry-cancel-reconcile.test.ts`

**Aplicación — modificado:**
- `src/index.ts` — exports nuevos (ports + fakes + 10 use cases + tipos).

**Web (`apps/web`) — nuevo:**
- `src/lib/composition/publication.composition.ts` — dos factories
  (`createPublicationComposition` interactivo,
  `createPublicationWorkerComposition` worker/service_role, §5/§6).

**Documentación — nuevo/modificado:**
- `docs/implementation/phase-8/PHASE_8B2_PUBLICATION_APPLICATION_ORCHESTRATION_REPORT.md` (este archivo).
- `docs/implementation/phase-8/PHASE_8_IMPLEMENTATION_PLAN.md` (§10).
- `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md` (§10).

**Ninguna migración nueva. Ningún archivo de 8B.1 (migraciones, RPCs,
grants) fue modificado.** `supabase/config.toml` no fue tocado.

---

## 10. Tests y validación

30 tests nuevos en `packages/application/src/use-cases/publications/__tests__/`
(3 archivos):
- `dispatch-publication-job.test.ts`: 7 tests
- `retry-cancel-reconcile.test.ts`: 14 tests
- `queue-and-read.test.ts`: 9 tests

Cubriendo TODOS los escenarios requeridos por el kickoff:
queue success/rechazo por rol/rechazo de no-elegible propagado desde la
RPC/aislamiento de tenant; dispatch happy-path→succeeded, fallo
explícito→failed, ambiguo→unknown_outcome, excepción→unknown_outcome,
publisher no soportado→failed(DISPATCH_FAILED) sin invocar publish(),
succeeded-sin-externalId→unknown_outcome, ningún tipo provider-specific
filtrado, propagación de error de claim sin efectos secundarios; retry
prepare role/state guards, retry crea job nuevo con linaje preservado, si
prepare falla nunca se crea el job nuevo; cancelación role/state completa
(operator+ queued, rechazo operator en in_progress, strategist+ coopera
in_progress, rechazo en unknown_outcome, rechazo en terminal); reconcile
role guard.

Regresión ejecutada (todo pasando):
- `packages/application`: 30 (publications, nuevos) + 95 (activations +
  publications) + 77 (raíz + alerts + tasks) + 132 (automations) = **334
  tests**, 0 fallos. (campaigns/reports no re-corridos — ningún archivo
  tocado esta ronda afecta sus dependencias.)
- `packages/domain`: 54 tests de `campaign-publication-job.test.ts`
  (smoke de regresión — sin cambios de lógica, solo un método de
  interfaz nuevo).
- `packages/shared`: 115 tests, 0 fallos.
- `packages/infrastructure`: 155 tests (migration-security + mapper de
  publication), 0 fallos.
- `typecheck`: limpio en `domain`, `shared`, `infrastructure`,
  `application`, `apps/web`.
- `lint`: limpio en `domain`, `shared`, `infrastructure`, `application`.
  `apps/web` tiene 1 error de lint PRE-EXISTENTE y NO relacionado
  (`ActivationTargetsPanel.test.tsx`, import `within` sin usar — de 8A.3,
  no tocado por 8B.2, confirmado con `eslint` aislado sobre el único
  archivo nuevo de esta ronda, que sale limpio).

Ningún test requirió Postgres real — 8B.2 es enteramente unitario con
fakes/mocks, como pide el kickoff. Ninguna validación runtime contra
Supabase local fue necesaria ni se ejecutó ningún reset destructivo de DB.

---

## 11. Riesgos / alcance diferido a 8B.3+

- Adapter real de `ChannelPublisherPort` para al menos un proveedor
  (Meta/Google), incluyendo manejo de credenciales vía `client_integrations`.
- Adapter n8n real para publicación (decisión §8 — Opción A).
- Endpoint HTTP de webhook de proveedor (`/api/webhooks/publication/...`),
  reutilizando `recordWebhookReceipt`/`markWebhookEventProcessed` (8B.1,
  ya persistidos, sin ruta HTTP todavía).
- `ListJobsNeedingReconciliation` (requiere lectura organization-wide por
  status — extensión de repositorio adicional no incluida en 8B.2).
- Runtime real de cola/worker que invoque `dispatchPublicationJob`
  periódicamente (cron, queue consumer, etc.) — 8B.2 solo expone la
  función invocable, no un scheduler.
- Sin registro real de `ChannelPublisherRegistry` en ningún composition
  root de producción — solo fakes, solo para tests/diagnóstico.
- El lint error pre-existente en `ActivationTargetsPanel.test.tsx` (§10)
  queda sin corregir — no es responsabilidad de 8B.2, se deja anotado
  para quien retome ese archivo.
- Sin surface de UI/Server Actions expuestas para estos use cases —
  8B.2 se detiene en `application` + composition root, consistente con la
  instrucción del kickoff de evitar UI salvo estrictamente necesario.
