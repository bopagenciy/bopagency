# Phase 8 — Risk Register

**Creado en:** Phase 8A — Audit + Architecture
**Estado:** vivo — se actualiza en cada subfase de Phase 8.
**Formato:** mismo criterio que `PHASE_7_RISK_REGISTER.md` (severity /
likelihood / mitigation, sin implementar nada aquí).

| ID | Riesgo | Severity | Likelihood | Mitigation (diseño, a implementar en 8A.1+) |
|---|---|---|---|---|
| R-ACT-01 | **Duplicate publishing** — un target se marca `published` dos veces (doble click, retry manual, condición de carrera) | High | Medium | RPC `mark_target_published` revalida `status IN ('ready','scheduled')` dentro de la transacción antes de escribir; una segunda invocación falla con `INVALID_STATUS`, nunca solo deshabilitar el botón en UI. Ver PHASE_8A_ACTIVATION_AUDIT.md §9. |
| R-ACT-02 | **Approval bypass** — se crea una activation sobre una campaign que no está (o dejó de estar) `approved`, por condición de carrera entre lectura del use case y el INSERT | High | Low | Trigger `BEFORE INSERT` en `campaign_activations` revalida `campaigns.status = 'approved'` dentro de la misma transacción, no solo el use case de aplicación. Ver §13/§16. |
| R-ACT-03 | **Stale snapshot** — el snapshot de una activation queda desincronizado de la campaign real, o alguien introduce un método para "actualizar" el snapshot rompiendo inmutabilidad | High | Low (si se documenta explícitamente) | Snapshot escrito una sola vez en creación; el repositorio de dominio (§18) NO expone ningún método de update sobre `approved_snapshot`; comentario de dominio explícito prohibiendo esa operación (mismo estilo que `campaign-approval.ts`). |
| R-ACT-04 | **Cross-org integration reference** — un target referencia un `client_integration_id` de otra organización/cliente, filtrando la existencia/uso de credenciales ajenas | Critical | Low | Trigger valida `client_integrations.organization_id = target.organization_id` y `client_integrations.client_id = activation.client_id` antes de aceptar el INSERT/UPDATE del target. Ver §11. |
| R-ACT-05 | **Credential leakage** — credenciales de proveedor terminan en `approved_snapshot`, `metadata`, `failure_message` o logs | Critical | Low | El snapshot (§14) es exclusivamente contenido de campaña, nunca `client_integrations.configuration`. Sanitización de metadata con la misma lista `FORBIDDEN_METADATA_KEYS` ya usada en Phase 6F. `service_role` reservado solo para el futuro callback HMAC de proveedor (8E/8F). |
| R-ACT-06 | **Provider API drift** (futuro, 8E/8F) — un cambio en la API de Meta/Google rompe silenciosamente `ChannelPublisherPort` sin que se detecte | Medium | Medium (una vez existan integraciones reales) | Fuera de alcance de 8A implementar, pero el diseño de `ChannelPublisherPort` (§22) devuelve `Result<PublishReceipt>` tipado — cualquier fallo de forma de respuesta se captura como error tipado, no como excepción silenciosa. Monitoreo en 8G. |
| R-ACT-07 | **Partial multi-channel failure oculto como éxito** — la activation se muestra "completed" aunque un canal falló | High | Medium (si no se deriva correctamente el status agregado) | Status de activation es una función PURA derivada de los status de sus targets (§6.A) — existe el estado explícito `partially_completed`, nunca colapsa un fallo parcial en `completed`. |
| R-ACT-08 | **Retries causando duplicate external action** (futuro, 8B) — un retry de publicación ejecuta la acción externa dos veces porque el proveedor sí la procesó la primera vez pero la respuesta se perdió | High | Medium (una vez haya ejecución automática real) | Diferido a 8B: mismo patrón de `idempotencyKey` que `AutomationExecution`, más `external_reference` verificable antes de reintentar (si el target ya tiene una referencia externa, no reintentar sin confirmación humana). |
| R-ACT-09 | **Race conditions** en creación concurrente de activation para la misma campaign | Medium | Medium | Índice único parcial `(campaign_id) WHERE status NOT IN ('completed','cancelled','failed')` — la segunda request recibe `CONFLICT` y se recupera la existente (mismo patrón que `startAutomationExecution`). Ver §9/§15. |
| R-ACT-10 | **Cancellation during execution** — se cancela una activation mientras un target está `publishing` (futuro, canales automáticos) | Medium | Low (no aplica a canales manuales en 8A) | Documentado como pregunta abierta para 8B: la RPC `cancel_activation` debe rechazar la cancelación de targets ya en `publishing` (dejar que terminen) o soportar cancelación "best-effort" con reconciliación posterior — decisión de 8B, no de 8A. |
| R-ACT-11 | **Manual/external state divergence** — el operador marca `published` en el sistema pero la publicación real nunca ocurrió (o viceversa) | Medium | Medium (inherente al camino manual) | Mitigado parcialmente por requerir `actor_user_id` + timestamp + `external_reference` opcional en cada marca manual (auditable, atribuible); mitigación completa (verificación cruzada con el proveedor) solo es posible cuando exista integración real (8E/8F) — riesgo residual aceptado en 8D (Manual Activation Hardening). |
| R-ACT-12 | **Alert spam** — cada evento de progreso normal genera una alerta, saturando el dashboard de alertas | Low | Medium (si no se sigue el patrón de dedupe) | Reutilizar `upsertByAlertKey` con `alert_key` determinístico (§25); solo incidentes (fallo, staleness) generan alert — eventos de progreso normal solo entran al event log, nunca a `alerts`. |
| R-ACT-13 | **Accidental automatic publication** — un futuro cambio hace que `approveCampaign` o cualquier otro flujo cree/ejecute una activation automáticamente, violando "approval != publication" | Critical | Low (si se documenta la regla explícitamente) | Confirmado en §20: la creación de activation permanece 100% manual/explícita en 8A. Ningún use case de campaign escribe en `campaign_activations`. Cualquier PR futuro que lo haga debe tratarse como una regresión de producto, no una mejora — dejar esta regla como comentario de dominio explícito. |
| R-ACT-14 | **Refresh token strategy inexistente** (heredado, no de 8A) — `client_integrations` no tiene hoy ningún escritor ni estrategia de refresh de credenciales | Medium | N/A hasta 8E/8F | Gap heredado documentado en §11/§23 del audit. No se resuelve en Phase 8A — queda como precondición explícita para 8E/8F. |
| R-ACT-15 | **Placement como vector de inyección** — `placement` se usa como campo libre para construir URLs/paths en algún adapter futuro sin sanitizar | Low | Low | `placement` es descriptivo (texto acotado, documentado con lista de valores esperados), nunca se concatena directamente en una URL — cualquier construcción de URL de proveedor real (8E/8F) debe mapear `placement` a un valor server-side conocido, nunca interpolarlo crudo. |

---

## Riesgos explícitamente fuera de alcance de Phase 8A (heredados a subfases futuras)

- Todo lo relacionado con llamadas de red reales a Meta/Google/YouTube
  (R-ACT-06 es el único que se pre-documenta; el resto se descubrirá en
  8E/8F).
- Seguridad de OAuth/token refresh de proveedores (R-ACT-14).
- Rate limiting real de proveedor (documentado como código de error en
  la taxonomía §24 del audit, sin lógica de mitigación en 8A).

Este registro se actualiza (nunca se sobreescribe silenciosamente) en cada
subfase — 8A.1/8A.2/8A.3 deben revisar cada fila marcada `Medium`/`Low`
para confirmar si la mitigación propuesta efectivamente se implementó tal
cual, y 8B en adelante añade filas nuevas específicas de publicación real.

## Actualización — Phase 8A.1 (Activation Domain + Persistence) — COMPLETE

Ver `PHASE_8A1_ACTIVATION_DOMAIN_PERSISTENCE_REPORT.md` (secciones 26–31)
para el detalle completo. Resumen de mitigaciones **implementadas Y
confirmadas en runtime real** contra Supabase LOCAL (Rounds A–E,
repetibilidad de 2 corridas consecutivas probada — ya no solo revisión
estática de texto/tests con mocks):

- **R-ACT-01** (duplicate publishing) — mitigado y **confirmado en
  runtime**: las 5 RPCs de transición revalidan status dentro de la
  transacción antes de escribir; 10.2/10.5 confirman transiciones
  inválidas rechazadas con el motivo semántico correcto.
- **R-ACT-02** (approval bypass) — mitigado y **confirmado en runtime**:
  trigger `check_activation_source()` revalida `campaigns.status =
  'approved'` + linkage real de la aprobación, `BEFORE INSERT` — 5
  aserciones negativas distintas en runtime (5.2–5.6), cada una validando
  el motivo exacto de rechazo, no solo "hubo un error".
- **R-ACT-03** (stale snapshot) — mitigado y **confirmado en runtime**:
  snapshot inmutable, persistido con forma estructurada (9.1), sin claves
  de secretos (9.2), rechazo real de forma no-objeto con `SQLSTATE 23514`
  (9.3).
- **R-ACT-04** (cross-org integration reference) — mitigado y
  **confirmado en runtime**: trigger `check_activation_target_match()`
  rechazó en runtime real un `client_integration_id` cross-org (6.5) —
  este es el riesgo `Critical` del registro, y es el que tiene la
  evidencia runtime más directa de las 15 filas.
- **R-ACT-05** (credential leakage) — mitigado y **confirmado en
  runtime**: 9.2 verificó en runtime que el snapshot persistido no
  contiene claves de secretos/tokens/credenciales; `service_role` no se
  usa en ningún GRANT ni en el repositorio de infraestructura (revisión
  de código, sección 30 del reporte).
- **R-ACT-07** (partial multi-channel failure oculto) — mitigado:
  `deriveActivationStatus` tiene el estado explícito `partially_completed`
  (test unitario dedicado); la derivación automática a `completed` se
  confirmó en runtime real (10.4b) — el caso `partially_completed`
  específico no se ejercitó en runtime (requeriría un target fallido, no
  cubierto por el fixture actual de un solo target manual) — queda como
  gap de cobertura runtime, no de mitigación (la lógica pura ya está
  100% testeada con mocks).
- **R-ACT-09** (race conditions en creación concurrente) — mitigado y
  **confirmado en runtime**: índice único parcial
  `uq_campaign_activations_active_per_campaign` rechazó en runtime real
  una segunda activation no-terminal para la misma campaña con `SQLSTATE
  23505` (7.1) — la condición de carrera bajo dos sesiones concurrentes
  reales específicamente no se ejercitó (un solo script `psql -f`, no dos
  conexiones simultáneas) — ver limitación explícita en el reporte §22.
- **R-ACT-13** (accidental automatic publication) — mitigado por diseño y
  **confirmado en runtime**: ningún use case de `campaign` fue tocado en
  8A.1; 10.4c confirmó en runtime que `campaign.status` permanece
  `approved` tras completar una activation — sin transición automática a
  `active`. El gap se cierra completamente en 8A.2 cuando exista el use
  case real, que deberá mantener esta misma invariante.

**Sin cambio de estado** (correctamente diferidos, sin código en 8A.1):
R-ACT-06, R-ACT-08, R-ACT-10, R-ACT-11 (mitigación parcial vía
`actor_user_id`/timestamp/`external_reference` ya en el modelo de datos,
pero la verificación cruzada real queda para 8E/8F), R-ACT-12, R-ACT-14,
R-ACT-15.

**Riesgo residual anterior, CERRADO:** la migración fue aplicada
exitosamente contra Supabase LOCAL y validada en runtime real (Rounds
A–E) — el residual "solo revisión estática, sin comportamiento real de
RLS/triggers/RPCs" queda cerrado. Residuales nuevos, ambos no bloqueantes
y documentados en el reporte (§22): (a) la condición de carrera de dos
sesiones concurrentes reales no se ejercitó (un solo script secuencial),
y (b) 11.3 (piso de rol `operator` no puede cancelar) permanece
estructural por falta de un `auth.users` desechable en el fixture local
disponible — ninguno de los dos bloquea 8A.1 COMPLETE; ambos son
candidatos a cerrar en 8A.2/8D si se decide necesario.

## Actualización — Phase 8A.2 (Activation Application Use Cases + Authorization/Signals Integration) — COMPLETE

Ver `PHASE_8A2_APPLICATION_USE_CASES_REPORT.md` para el detalle completo
de use cases, tests y revisión de seguridad. Resumen de mitigaciones
reforzadas en la capa de **application** (defensa en profundidad sobre lo
ya confirmado en runtime real por 8A.1 — la RPC/trigger de BD sigue
siendo la autoridad final en todos los casos):

- **R-ACT-02** (approval bypass) — reforzado en application:
  `createCampaignActivation` reverifica `campaign.status === 'approved'`
  Y resuelve la última decisión REAL de `campaign_approvals`
  (`findLatestByCampaignId`) antes de construir el snapshot — nunca
  fabrica un `campaignApprovalId`. Cubierto por tests unitarios
  (draft/review/rejected rechazados antes de persistir; aprobación
  inexistente o con `action !== 'approved'` rechazada).
- **R-ACT-03** (stale snapshot) — reforzado: el use case de creación es el
  ÚNICO punto de application autorizado a construir un
  `CampaignActivationSnapshot`; se valida con
  `campaignActivationSnapshotSchema` (Zod) antes de llamar al
  repositorio. Corrección hecha en esta ronda: el `generatedContent` REAL
  de la campaña (Phase 7D) ahora se congela en el snapshot cuando existe y
  matchea el schema esperado (el scaffold original lo dejaba siempre en
  `null`, perdiendo contenido real de campañas con IA generada — ver
  reporte 8A.2 para el detalle y los tests que lo cubren). Un
  `generatedContent` presente pero que no matchea el schema (dato
  corrupto/legacy) se congela como `null` con warning logueado, en vez de
  fallar la creación de la activation por un problema de otro subsistema.
- **R-ACT-09** (race conditions en creación concurrente) — la ruta de
  application no intenta "adivinar" el resultado de una carrera: el error
  `CONFLICT` (`activationAlreadyActiveForCampaign`) que puede devolver el
  índice único parcial de 8A.1 se propaga tal cual al caller, sin
  reintento automático — cubierto por test unitario dedicado.
- **R-ACT-11** (manual/external state divergence) — sin cambio de
  mitigación (sigue acotada a `actor_user_id`/timestamp/
  `external_reference` del modelo de datos de 8A.1); `markActivation
  TargetPublished` en application no publica en ningún proveedor externo,
  solo registra que el operador ya publicó manualmente — confirmado por
  revisión de código (sin imports de Meta/Google/n8n en ningún use case
  nuevo) y por test explícito ("no invoca ningún adapter de publishing
  externo").
- **R-ACT-12** (alert spam) — confirmado sin regresión: 8A.2 NO agrega
  ninguna alerta nueva. La única señal nueva es una tarea (no una alerta)
  en la creación de la activation, deduplicada por `activationId` vía
  `findActiveBySignatureTag` (mismo patrón que Phase 7F) — cancelaciones y
  transiciones de target no generan ni tareas ni alertas nuevas (decisión
  de producto documentada explícitamente en `activation-signals.ts`, para
  no inventar señales que el producto no pidió).
- **R-ACT-13** (accidental automatic publication) — **gap cerrado**: existe
  ahora el use case real (`createCampaignActivation`), y se confirmó (vía
  revisión de código + test unitario "nunca transiciona campaign.status a
  'active'") que ningún use case de 8A.2 llama a `CampaignRepository
  .update`/`.approve`, y que `approveCampaign` (Phase 7C/7F) no fue
  modificado ni llama a ningún use case de activation — la creación de una
  activation sigue siendo 100% explícita, iniciada por un actor humano con
  rol strategist+.

**Riesgos sin cambio de estado en 8A.2** (correctamente diferidos, sin
código nuevo en esta ronda): R-ACT-01/R-ACT-04/R-ACT-05/R-ACT-07 (sin
cambios porque ninguna de las RPCs/triggers que los mitigan fue tocada;
8A.2 solo agrega wrappers de application que las invocan tal cual),
R-ACT-06, R-ACT-08, R-ACT-10, R-ACT-14, R-ACT-15.

**Residuales heredados de 8A.1, sin resolver en 8A.2 (no bloqueantes,
mismo motivo que antes — ninguno requiere código de application):** (a)
la condición de carrera de dos sesiones concurrentes reales sigue sin
ejercitarse en runtime; (b) el piso de rol `operator` (no puede cancelar
activation/target) sigue verificado solo por revisión de código + tests
unitarios de application, no por un fixture de `auth.users` real
desechable en runtime local — ambos quedan como candidatos para 8A.3/8D
si se decide necesario.

---

## Seguimiento — Phase 8A.3 (Web Integration + Manual Operations UI)

Ver `PHASE_8A3_WEB_MANUAL_OPERATIONS_REPORT.md` para el detalle completo.
Ningún archivo de `packages/domain`/`packages/application`/
`packages/infrastructure`/`packages/shared` ni ninguna migración SQL se
tocó en esta subfase — los cambios son exclusivamente `apps/web` (Server
Actions + composition root + UI). Por lo tanto, la mitigación real de
todos los riesgos con "Mitigation" a nivel de RPC/trigger/schema (la
mayoría de R-ACT-01 a R-ACT-15) no cambió: 8A.3 solo añade una capa de UI
y una capa adicional (redundante, no nueva) de verificación de rol sobre
las RPCs que ya eran la autoridad final desde 8A.1.

- **R-ACT-01** (duplicate publishing) — sin cambio de mitigación (la RPC
  `mark_activation_target_published` sigue siendo la autoridad). La UI
  añade una mitigación de UX no crítica: el botón "Marcar publicado" solo
  se muestra cuando `status` es `ready`/`scheduled` (`canMarkPublished` en
  `ActivationTargetsPanel`), reduciendo el doble-click accidental, pero un
  segundo intento vía Server Action directo seguiría siendo rechazado por
  la RPC, no por la UI.
- **R-ACT-02** (approval bypass) — sin cambio; `createCampaignActivationAction`
  exige rol strategist+ en la Server Action (capa nueva, redundante con la
  capa de application ya existente) antes de siquiera invocar el use case,
  que a su vez revalida `campaign.status === 'approved'` antes del INSERT
  protegido por el trigger `check_activation_source`.
- **R-ACT-09** (race conditions en creación concurrente) — **verificado en
  la capa web**: test S4 (`actions.test.ts`) confirma que cuando el use
  case devuelve `CONFLICT` (el índice único parcial rechazó la segunda
  activación concurrente), la Server Action lo traduce a un `ActionResult`
  seguro sin lanzar excepción y sin llamar `revalidatePath` — la UI puede
  mostrar el error de forma controlada en vez de romper.
- **R-ACT-11** (manual/external state divergence) — sin cambio de
  mitigación de datos (`actorUserId`/timestamp/`externalReference` siguen
  siendo la única atribución posible en el camino manual); la UI hace
  explícito en tres lugares distintos (Server Action, componente,
  composition root — ver reporte §7) que "marcar publicado" es una
  confirmación humana, no una publicación real, reduciendo el riesgo de
  que un operador crea erróneamente que el sistema publicó por él.
- **R-ACT-12** (alert spam) — sin cambio: 8A.3 no agrega ninguna alerta ni
  tarea nueva — el composition root de esta subfase deliberadamente omite
  `alertRepository`/`taskRepository` en los Deps de creación (ver
  `activation.composition.ts`, comentario explícito), dejando la única
  señal existente (tarea en `createCampaignActivation`, ya implementada en
  8A.2) sin duplicar.
- **R-ACT-13** (accidental automatic publication) — **re-confirmado en la
  capa web**: `CampaignActivationEntryCard` (integración en Campaign
  Studio) nunca auto-crea una activación ni cambia `campaign.status` — la
  creación pasa exclusivamente por un click explícito de un strategist+ en
  `CreateActivationPanel`, verificado por test (U1/U3 de
  `CampaignActivationEntryCard.test.tsx` y `CreateActivationPanel.test.tsx`).
  `approveCampaignAction` (Phase 7C/7F, `campaigns/actions.ts`) no fue
  tocado por esta subfase.

**Nuevo riesgo de UI identificado en 8A.3 (bajo, aceptado):**

| ID | Riesgo | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| R-ACT-16 | **Guards de UI desincronizados de las reglas de dominio** — `ActivationTargetsPanel`/`CancelActivationPanel` replican como funciones puras (`canPrepare`/`canMarkReady`/`canMarkPublished`/`canCancel`) las mismas reglas que `canTransitionActivationTarget`/`canCancelActivation` de `packages/domain`; si el dominio cambia esas reglas en una fase futura sin actualizar la UI, un botón podría mostrarse (o esconderse) incorrectamente | Low | Low | Es solo UX — la autoridad real sigue siendo la RPC/use case (§5 del kickoff, "UI hiding is UX only"), así que el peor caso es un botón visible que el servidor rechaza con un error claro (`VALIDATION_ERROR`), nunca una transición inválida ejecutada. Mitigación completa (compartir la fuente de verdad en vez de duplicarla) queda como mejora futura no bloqueante — candidato para exportar las funciones `can*` de dominio hacia un paquete consumible por el cliente si se vuelve a duplicar en más componentes. |

**Riesgos sin cambio de estado en 8A.3** (correctamente diferidos, ningún
código de dominio/application/infraestructura tocado):
R-ACT-03/04/05/06/07/08/10/14/15.

## Actualización — Phase 8B.0 (Publishing Gateway — Audit + Architecture)

Ver `PHASE_8B_PUBLISHING_GATEWAY_AUDIT.md` para el detalle completo.
Ningún archivo de código/migración fue tocado en esta ronda — los riesgos
nuevos abajo son de **diseño** (a mitigar cuando 8B.1+ implemente), no
hallazgos de código existente. Se numeran R-PUB-01 en adelante para no
colisionar con el namespace R-ACT-* ya establecido, y porque describen
riesgos de un subsistema nuevo (publicación externa vía job/adapter), no
extensiones de los riesgos de activación ya registrados.

| ID | Riesgo | Severity | Likelihood | Mitigation (diseño, a implementar en 8B.1+) |
|---|---|---|---|---|
| R-PUB-01 | **Duplicate publishing por timeout no reconciliado** — un timeout de red hacia el proveedor deja ambigüedad sobre si la publicación ocurrió; un retry automático ciego publicaría dos veces en la cuenta real del cliente | Critical | Medium (una vez exista ejecución automática real, 8E/8F) | Estado dedicado `unknown_outcome` en el state machine de job (nunca colapsado en `failed`); ningún retry automático permitido desde `unknown_outcome` — requiere reconciliación positiva vía `ChannelPublisherPort.getStatus()` o confirmación manual `strategist+` antes de habilitar un retry. Ver audit 8B §4.1/§11. |
| R-PUB-02 | **Credential leakage vía error de proveedor** — un SDK de proveedor incluye un token/header sensible dentro de su propio mensaje de error, que termina persistido sin sanitizar en `failure_message`/`provider_error_code` | Critical | Medium (depende del SDK concreto de cada proveedor, no verificable hasta 8E/8F) | `providerErrorCode`/mensajes de error deben pasar por el mismo sanitizador `FORBIDDEN_METADATA_KEYS` ya usado por el n8n dispatcher ANTES de persistir — responsabilidad explícita de cada adapter concreto, señalada en el audit 8B §14 punto 4 para que 8E/8F no lo omitan. |
| R-PUB-03 | **n8n tratado como autoridad de estado** — un futuro cambio de implementación asume que si n8n "dice" que un job tuvo éxito, eso basta para marcarlo `succeeded` sin revalidar contra el estado real en DB/proveedor | Critical | Low (si se documenta la regla explícitamente antes de 8B.3) | Regla arquitectónica explícita: DB es la única fuente de verdad; cualquier callback de n8n solo PROPONE una transición, la RPC `SECURITY DEFINER` revalida el estado actual antes de aplicarla (mismo patrón que `/api/webhooks/n8n` ya hace hoy). Ver audit 8B §8.3. |
| R-PUB-04 | **Cross-org integration reference al resolver credenciales de publishing** — el adapter resuelve `clientIntegrationId` sin revalidar que pertenece a la misma organización del target, filtrando credenciales de otro cliente | Critical | Low | Doble capa: el target ya fue validado cross-org en su creación (trigger `check_activation_target_match`, 8A.1); `resolveCredentials` (8B.2) revalida de nuevo `integration.organizationId === target.organizationId` como defensa en profundidad, nunca confiando solo en la validación de 8A.1. Ver audit 8B §7.3/§14 punto 11. |
| R-PUB-05 | **Arbitrary provider name en webhook inbound** — un path de webhook con un `provider` no reconocido (`/api/webhooks/publishing/evil`) alcanza lógica de resolución de adapter/secreto antes de ser rechazado | High | Low | Validación de `provider` contra `ACTIVATION_PROVIDERS` (enum cerrado ya existente) como el PRIMER paso del handler, antes de leer headers de firma o crear cualquier cliente con privilegio — cierra el vector antes de que llegue a HMAC/DB. Ver audit 8B §13.1/§14 punto 6. |
| R-PUB-06 | **Job huérfano sin reconciliación** — un job queda `in_progress` indefinidamente porque el webhook nunca llega (bug del proveedor, outage, workflow n8n mal configurado) y nadie lo detecta | High | Medium | Reconciliación periódica obligatoria (cron/n8n workflow) que revisa jobs `in_progress` más allá de un umbral de tiempo y fuerza una consulta `getStatus()` — nunca depender exclusivamente del webhook. Ver audit 8B §8.2/§13.3. Umbral exacto es una pregunta abierta (audit 8B §18.3) a confirmar antes de 8B.1. |
| R-PUB-07 | **Reconciliación manual incorrecta** — un strategist+ resuelve un job `unknown_outcome` a `succeeded` sin verificación real contra el proveedor (o a `failed` cuando en realidad sí publicó), ocultando una duplicación o bloqueando indebidamente un retry | High | Medium (inherente a cualquier acción humana de reconciliación) | La RPC de reconciliación manual exige `reconciled_by`/`reconciliation_note` obligatorios (nunca una transición silenciosa) — auditable y atribuible, mismo criterio que `markManualTargetPublished` en el camino manual de 8A. Mitigación completa (verificación automática) solo posible cuando el proveedor ofrezca una consulta fiable por idempotency key. Ver audit 8B §10/§13. |
| R-PUB-08 | **Cancelación de job `in_progress` interpretada como cancelación real** — un operador cree que "cancelar" un job en curso detiene la llamada HTTP ya en vuelo, cuando en realidad es cooperativa y puede resolverse igual a `succeeded` | Medium | Medium | Semántica explícita: cancelar `in_progress` solo registra `cancellation_requested_at`, nunca aborta una llamada de red real; el job se resuelve según lo que efectivamente ocurrió con el proveedor. UI (8B.4) debe comunicar esto explícitamente, no solo el backend. Ver audit 8B §4.4. |
| R-PUB-09 | **`client_integrations.configuration` usado para credenciales reales sin cambio de schema** — un futuro PR de 8E/8F, bajo presión de tiempo, escribe un token real directamente en `configuration: jsonb` en vez de usar una referencia a vault, violando el comentario ya existente en la migración de Phase 3 | Critical | Medium (si no se bloquea explícitamente antes de que exista el primer escritor real) | Documentado como precondición dura para 8E/8F: `client_integrations` necesita `provider` como enum cerrado + que las credenciales vivan exclusivamente como `vault_reference` (generalizando el patrón ya diseñado en `automation_secrets_metadata`, Phase 6B, hoy sin escritor) — nunca en `configuration` directamente. Ver audit 8B §1.4/§7.3. Extiende (no reemplaza) R-ACT-14. |
| R-PUB-10 | **UI de retry/cancel de publicación duplica reglas de dominio sin compartir la fuente de verdad** — mismo patrón de riesgo que R-ACT-16 (8A.3), ahora aplicado a los botones nuevos de 8B.4 sobre jobs/attempts | Low | Low | Mismo criterio que R-ACT-16: la autoridad real es siempre la RPC, el peor caso es un botón visible que el servidor rechaza — no una transición inválida ejecutada. Candidato a resolver junto con R-ACT-16 si se decide compartir funciones `can*` de dominio hacia el cliente. Ver audit 8B §1.1 (herencia de R-ACT-16). |

**Riesgos de Phase 8A referenciados y extendidos por 8B.0 (sin cambio de
severidad, solo de alcance)**: R-ACT-01 (duplicate publishing — ahora con
mitigación concreta de job/idempotencyKey, ver R-PUB-01), R-ACT-04/R-ACT-05
(cross-org/credential leakage — extendidos a la superficie nueva de
publishing, ver R-PUB-04/R-PUB-02), R-ACT-08 (retries duplicando acción
externa — resuelto en diseño por R-PUB-01/la categoría `unknown_outcome`),
R-ACT-10 (cancelación durante ejecución — resuelto en diseño por §4.4/
R-PUB-08), R-ACT-12 (alert spam — el diseño de señales de 8B §12 sigue el
mismo criterio de moderación, sin filas nuevas necesarias), R-ACT-14
(refresh token / escritor de `client_integrations` inexistente — sigue sin
resolverse, ahora con precondición explícita adicional vía R-PUB-09).

**Sin cambio de estado** (correctamente diferidos a 8B.1+, sin código en
esta ronda): todos los riesgos anteriores permanecen exactamente como
estaban documentados hasta que exista implementación real que los
ejercite.
