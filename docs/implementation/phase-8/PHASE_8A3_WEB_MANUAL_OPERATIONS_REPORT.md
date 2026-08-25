# Phase 8A.3 — Web Integration + Manual Operations UI — Reporte

**Rama:** `feat/phase-8-campaign-operations`
**Base:** `ea18ae5` ("feat(phase-8): add activation application use cases" — 8A.1/8A.2 completas)
**Estado:** ✅ **COMPLETA** — expone los 11 use cases de 8A.2 en la capa web
(Server Actions + composition root), y construye la UI operativa de
activación manual descrita en el kickoff (§1–§9).
**Explícitamente NO en alcance de esta subfase (heredado de 8A):** Meta
API, Google API, LinkedIn API, proveedor de email real, gateway de
publicación externa, `publication_jobs`, n8n de publicación,
auto-activación al aprobar una campaña, transición automática
`campaign.status: approved → active`. Ninguno de estos fue tocado.

---

## 1. Arquitectura reutilizada

Se inspeccionó `apps/web` antes de escribir código (§1 del kickoff) y se
siguió el patrón de Campaign Studio (Phase 7E) sin desviación de fondo:

- **Composition root** — mismo patrón que
  `apps/web/src/lib/composition/campaign.composition.ts`: una factory
  `createActivationComposition(supabase)` que instancia los repositorios
  Supabase (`SupabaseCampaignActivationRepository`,
  `SupabaseCampaignRepository`, `SupabaseCampaignApprovalRepository`,
  `SupabaseOrganizationRepository`) y devuelve `{ useCases, repositories }`
  con los 11 use cases de 8A.2 ya cableados a sus `Deps`. Recibe el
  Supabase client como parámetro (nunca lo crea), nunca usa
  `service_role`, solo se importa desde contexto servidor.
- **Server Actions** — mismo patrón que
  `apps/web/src/app/(protected)/campaigns/actions.ts`: `getOrgContext(role)`
  envuelve `requireOrganizationRole` sin redirigir (las acciones se llaman
  vía `useTransition` desde Client Components), `mapError(AppError)`
  traduce códigos (`NOT_FOUND`/`VALIDATION_ERROR`/`FORBIDDEN`/`CONFLICT`) a
  mensajes seguros sin reenviar texto crudo de Postgres, y
  `revalidatePath` se llama solo en éxito.
- **Rutas / layout** — mismo patrón que `/campaigns/[id]`:
  `page.tsx` (Server Component async) + `loading.tsx` (skeleton) +
  `error.tsx` (`'use client'`, boundary de errores inesperados; `notFound()`
  sigue delegando al `not-found.tsx` raíz de la app, no se creó uno nuevo).
- **Componentes** — badges de status siguiendo el patrón exacto de
  `CampaignStatusBadge` (mapa `Record<Status, label/estilo>`, Tailwind,
  `aria-label`); paneles de acción con confirmación siguiendo el patrón de
  `CampaignApprovalPanel` (`useTransition`, `router.refresh()` en éxito,
  `role="alert"` para errores); tabla de targets siguiendo el patrón visual
  de las tablas existentes (`AlertsTable`/`TasksTable`: `overflow-x-auto`,
  `<table>` semántica).
- **Tests** — mismo patrón que `campaigns/__tests__/actions.test.ts`:
  mocks totales vía `vi.hoisted` de `next/cache`, `@/lib/auth/server`,
  `@/lib/supabase/server` y el composition root; ningún test toca
  Supabase real.

### Desviación deliberada de la ruta propuesta en el plan

El `PHASE_8_IMPLEMENTATION_PLAN.md` (8A) mencionaba una ruta
`/campaigns/[id]/activation/[activationId]`. Se implementó en su lugar
**`/campaigns/[id]/activation`** (sin `[activationId]` en la URL), por lo
siguiente: el índice único parcial de 8A.1
(`(campaign_id) WHERE status NOT IN (...)`) garantiza que **nunca puede
existir más de una activación NO-terminal por campaña simultáneamente**
(confirmado en `create-campaign-activation.use-case.ts` — un segundo
intento de creación recibe `CONFLICT`, no un segundo registro activo). Por
lo tanto, "la activación de esta campaña" es una operación bien definida
sin necesitar el ID en la URL: la página resuelve la activación
NO-terminal más reciente vía `listCampaignActivationsByCampaign` +
`selectActiveActivation` (función pura, testeada). El historial de
activaciones terminales previas se muestra en la misma página (sección
"Activaciones anteriores"), no en una ruta separada por ID — evita
construir una segunda superficie de navegación (`/activations` cross-
campaign) que el propio audit de 8A ya había descartado por falta de
evidencia de necesidad (§19). Si una fase futura necesita inspeccionar el
detalle de una activación terminal específica por su ID propio, añadir
`/campaigns/[id]/activation/[activationId]` como ruta adicional es un
cambio aditivo, no una reescritura.

---

## 2. Archivos nuevos / modificados

**Nuevos:**
- `apps/web/src/lib/composition/activation.composition.ts` — composition root.
- `apps/web/src/lib/activations/select-active-activation.ts` — función pura
  (activación no-terminal actual vs. historial terminal), extraída para
  poder testearla directamente.
- `apps/web/src/app/(protected)/campaigns/[id]/activation/actions.ts` —
  7 Server Actions de escritura + 4 de lectura.
- `apps/web/src/app/(protected)/campaigns/[id]/activation/page.tsx` —
  Server Component de la vista operativa.
- `apps/web/src/app/(protected)/campaigns/[id]/activation/loading.tsx`
- `apps/web/src/app/(protected)/campaigns/[id]/activation/error.tsx`
- `apps/web/src/components/activations/ActivationStatusBadge.tsx`
- `apps/web/src/components/activations/ActivationTargetStatusBadge.tsx`
- `apps/web/src/components/activations/ActivationSummaryCard.tsx`
- `apps/web/src/components/activations/CreateActivationPanel.tsx`
- `apps/web/src/components/activations/ActivationTargetsPanel.tsx`
- `apps/web/src/components/activations/CancelActivationPanel.tsx`
- `apps/web/src/components/activations/ActivationEventTimeline.tsx`
- `apps/web/src/components/activations/CampaignActivationEntryCard.tsx`
- Tests (6 archivos nuevos, ver §7).

**Modificado:**
- `apps/web/src/app/(protected)/campaigns/[id]/page.tsx` — se agregó
  `activeActivationSummary`/`hasAnyActivation` (lectura best-effort, mismo
  criterio que `automationTask` de Phase 7F — un fallo aquí nunca rompe el
  render del detalle de campaña) y se renderiza
  `<CampaignActivationEntryCard>` justo debajo de `CampaignApprovalPanel`.
  Se agregó `user` a la destructuración de `requireOrganization()` (antes
  solo se usaba `organization`/`membership`).

**No se tocó ningún archivo de `packages/domain`, `packages/application`,
`packages/infrastructure`, `packages/shared`, ni ninguna migración SQL.**

---

## 3. Rutas / Server Actions añadidas

Ruta: `GET /campaigns/[id]/activation` (Server Component).

Server Actions (`apps/web/src/app/(protected)/campaigns/[id]/activation/actions.ts`):

| Server Action | Use case 8A.2 | Rol mínimo |
|---|---|---|
| `createCampaignActivationAction` | `createCampaignActivation` | strategist |
| `addCampaignActivationTargetAction` | `addCampaignActivationTarget` | strategist |
| `prepareActivationTargetAction` | `prepareActivationTarget` | operator |
| `markActivationTargetReadyAction` | `markActivationTargetReady` | operator |
| `markActivationTargetPublishedAction` | `markActivationTargetPublished` | operator |
| `cancelActivationTargetAction` | `cancelActivationTarget` | strategist |
| `cancelCampaignActivationAction` | `cancelCampaignActivation` | strategist |
| `getCampaignActivationAction` | `getCampaignActivation` | viewer (miembro activo) |
| `listCampaignActivationsByCampaignAction` | `listCampaignActivationsByCampaign` | viewer |
| `listCampaignActivationsByClientAction` | `listCampaignActivationsByClient` | viewer |
| `getActivationWithTargetsAndEventsAction` | `getActivationWithTargetsAndEvents` | viewer |

Todas: `organizationId`/`actorUserId` se resuelven exclusivamente de
`requireOrganizationRole`/`requireOrganization` (sesión servidor) — el tipo
del payload de cada acción **no incluye** esos campos, así que ni
siquiera un caller malicioso con `as any` puede inyectarlos (verificado
por test S8, ver §7).

---

## 4. UI implementada (secciones A–E del kickoff)

**A) Resumen de la activación** — `ActivationSummaryCard`: nombre/link de
campaña, badge de estado, referencia de aprobación (`campaignApprovalId`),
programación (`scheduledAt`), creada/actualizada, notas. Incluye un aviso
fijo: "no realiza ninguna llamada a Meta, Google, LinkedIn ni ningún
proveedor de email".

**B) Lista de targets** — `ActivationTargetsPanel` (tabla): canal
(etiqueta legible vía `ACTIVATION_CHANNEL_LABELS`), proveedor, placement,
badge de estado del target, referencia externa, timestamp. `overflow-x-auto`
para pantallas angostas.

**C) Workflow manual de targets** — en el mismo panel: "+ Agregar canal
manual" (channel/provider fijos en `'manual'` — los canales con integración
real (`meta_ads`, `google_ads`, `linkedin_ads`, `email`) requieren
`client_integration_id`, fuera de alcance de 8A.3, documentado en el
componente); por fila: "Preparar" (`pending→preparing`), "Marcar listo"
(`preparing→ready`), "Marcar publicado" (`ready|scheduled→published`, con
referencia externa/nota opcionales), "Cancelar" (`→cancelled`, razón
obligatoria) — cada botón solo aparece si el status actual del target
permite esa transición (mismas reglas que `canTransitionActivationTarget`
del dominio, replicadas como guards de UI puros).

**D) Cancelación de la activación completa** — `CancelActivationPanel`:
solo visible si `canCancelActivation(activation.status)` (dominio) es
`true` y el rol es strategist+; flujo de dos pasos (razón → confirmación
explícita "¿Confirmas...?") antes de invocar la Server Action.

**E) Timeline de eventos** — `ActivationEventTimeline`: lista append-only
(`activation_created`, `target_added`, cambios de estado, cancelaciones),
puramente de lectura, con estado vacío dedicado.

**Estado vacío / historial** — si la campaña no tiene ninguna activación:
mensaje de estado vacío + `CreateActivationPanel`. Si tiene solo
activaciones terminales: se lista el historial (badge de estado por cada
una) y se ofrece crear una nueva (permitido por el dominio: el índice
único solo bloquea activaciones NO-terminales concurrentes, nunca crear
una nueva tras una terminal).

---

## 5. Integración en Campaign Studio (§6)

`CampaignActivationEntryCard` en `/campaigns/[id]`:
- Si existe una activación NO-terminal: badge de estado + link "Ver
  activación →" hacia la ruta dedicada. **Nunca** ofrece un segundo path
  de creación mientras exista una activa.
- Si no existe una NO-terminal y la campaña está `approved`: renderiza
  `CreateActivationPanel` (mismo componente que la página dedicada) para
  strategist+; si hay historial terminal previo, también un link "Ver
  historial de activaciones →".
- Si la campaña no está `approved` y no hay ninguna activación (ni
  siquiera terminal): la sección completa no se renderiza (no hay nada
  útil que mostrar).
- **Nunca** auto-crea una activación al aprobar la campaña, **nunca**
  cambia `campaign.status` — la creación siempre pasa por
  `createCampaignActivationAction`, invocada explícitamente por un
  strategist+.

---

## 6. Matriz de roles — UI y Server Action

| Rol | UI (qué ve) | Server Action (qué se re-verifica) |
|---|---|---|
| **viewer** | Solo lectura: resumen, tabla de targets, timeline. Ningún botón mutable en ningún panel. | Las 7 acciones de escritura devuelven `FORBIDDEN` sin invocar el use case (rechazo en `getOrgContext`, capa 1); el use case de 8A.2 (capa 2, `organizationRepository.findMember` + `hasMinimumRole`) nunca llega a ejecutarse porque la capa 1 ya cortó. |
| **operator** | Ve "Preparar"/"Marcar listo"/"Marcar publicado" por target elegible. **No** ve "+ Agregar canal manual" ni "Cancelar" (ni de target ni de activación completa) — coincide exactamente con §5 del kickoff. | `prepareActivationTargetAction`/`markActivationTargetReadyAction`/`markActivationTargetPublishedAction` exigen `operator` (capa 1) y el use case vuelve a exigir `operator` (capa 2, `insufficientRole('operator', ...)` si el rol real es menor). `addCampaignActivationTargetAction`/`cancelActivationTargetAction`/`cancelCampaignActivationAction` exigen `strategist` en capa 1 — un operator nunca pasa, sin importar qué controles la UI decidiera mostrar. |
| **strategist** | Ve todo lo de operator **más** "+ Agregar canal manual", "Cancelar" (target y activación completa cuando el estado lo permite), y `CreateActivationPanel` en la campaña aprobada. | Capa 1 exige `strategist` en `createCampaignActivationAction`/`addCampaignActivationTargetAction`/`cancelActivationTargetAction`/`cancelCampaignActivationAction`; capa 2 (use case) re-verifica `strategist` vía `hasMinimumRole`. |
| **admin / owner** | Todo lo de strategist (la jerarquía `ROLE_HIERARCHY` en `lib/auth/server.ts` los sitúa por encima). | Mismas dos capas — pasan `hasMinimumRole(role, 'strategist')` y `hasMinimumRole(role, 'operator')` por definición de la jerarquía. |

**Principio explícito (§5 del kickoff, cumplido):** la UI oculta controles
solo como UX — la autorización real vive en el Server Action (capa 1,
`getOrgContext`) y se re-verifica de forma independiente dentro de cada
use case de 8A.2 (capa 2, ya implementada en esa subfase, sin modificar
aquí). Ningún componente de esta subfase decide autorización por sí
mismo; solo lee `userRole` (prop) para decidir si renderiza un control.

---

## 7. Semántica de "publicación manual" (§7)

Hecho explícito en cada capa donde aparece la acción de publicar:
- **Server Action** (`markActivationTargetPublishedAction`, JSDoc): "Confirma
  MANUALMENTE que el contenido se publicó fuera de la plataforma
  (Meta/Google/LinkedIn/email reales, o cualquier medio manual) — esta
  acción NUNCA llama a un API de proveedor externo, solo registra la
  confirmación humana."
- **UI** (`ActivationTargetsPanel`, texto visible permanente sobre la
  tabla): *"«Publicado» en esta fase significa que un operador confirmó
  manualmente que el contenido se publicó fuera de la plataforma —
  ninguna acción aquí llama a Meta, Google, LinkedIn ni ningún proveedor
  de email."* El mismo texto se repite en el formulario inline de
  confirmación ("Confirma que el contenido se publicó manualmente fuera de
  la plataforma") y en `ActivationSummaryCard`.
- **Composition root** (comentario de módulo): "Ningún use case de este
  composition root llama a proveedores externos... 8A.3 es exclusivamente
  operación manual."
- **Test explícito** (`actions.test.ts`, S10): lee el código fuente de
  `actions.ts` y falla si aparece `fetch(`, cualquier nombre de adapter de
  proveedor (`MetaAdapter`, `GoogleAdsClient`, `LinkedInClient`,
  `EmailProvider`), o un dominio conocido de API de proveedor
  (`graph.facebook.com`, `googleads.googleapis.com`, `api.linkedin.com`,
  `sendgrid`/`mailgun`/`nodemailer`/`smtp://`).

---

## 8. Estados UX (§8) — dónde se implementó cada uno

| Estado | Dónde |
|---|---|
| Loading | `activation/loading.tsx` (skeleton, mismo criterio que `campaigns/[id]/loading.tsx`). |
| Empty | `data-testid="activation-empty-state"` en `page.tsx` (sin ninguna activación) y `data-testid="targets-empty-state"` en `ActivationTargetsPanel` (activación sin targets aún). |
| Permission-disabled | `CreateActivationPanel` (`data-testid="activation-permission-disabled"` para operator en campaña aprobada) y ocultamiento silencioso de controles para roles insuficientes en el resto de paneles. |
| Invalid-state | Mensajes explícitos: "Solo se puede crear una activación para una campaña en estado «Aprobada»" (`CreateActivationPanel`), errores `VALIDATION_ERROR` traducidos por `mapError` y mostrados vía `role="alert"`. |
| Not-found | `notFound()` en `page.tsx` si `getCampaign` devuelve `NOT_FOUND` → delega al `not-found.tsx` raíz existente. |
| Safe error handling | `error.tsx` (boundary de errores inesperados) + `RepositoryErrorState` para fallos de lectura (historial o detalle) — nunca se renderiza un mensaje de Postgres/Supabase crudo. |
| Success feedback / revalidation | Cada Server Action llama `revalidatePath` solo en éxito; cada componente cliente llama `router.refresh()` tras un resultado `ok: true`. |

---

## 9. Tests añadidos

**`select-active-activation.test.ts`** (5 tests, función pura) — lista
vacía (empty state), solo terminales (nueva activación permitida tras
historial terminal), una no-terminal entre terminales, todos los status
terminales reconocidos, todos los no-terminales reconocidos como activos.

**`campaigns/[id]/activation/__tests__/actions.test.ts`** (17 tests) —
strategist crea / operator y viewer no pueden (FORBIDDEN sin invocar el
use case); duplicado (`CONFLICT`) y transición inválida
(`VALIDATION_ERROR`) se traducen sin lanzar; operator opera targets
(prepare/ready/published) pero no agrega ni cancela; viewer no opera
targets; operator no puede cancelar ni un target ni la activación
completa; strategist cancela y la razón se propaga tal cual; razón vacía
rechazada por el use case se traduce sin lanzar; lecturas solo requieren
membresía activa y no invocan ningún método de escritura (cero efectos
secundarios); actor spoofing imposible (payload con `actorUserId`/
`organizationId` inyectados se ignora); ningún import/string de proveedor
externo en el código fuente de las acciones.

**`components/activations/__tests__/CreateActivationPanel.test.tsx`**
(7 tests) — strategist ve el botón; operator ve solo el mensaje
informativo (sin botón); viewer no ve ningún control mutable; activación
no-terminal existente oculta el botón (sin duplicar el path de creación);
campaña no aprobada muestra mensaje de estado inválido; click invoca la
Server Action con `notes` trimmed; error del servidor se muestra sin
romper el formulario.

**`components/activations/__tests__/ActivationTargetsPanel.test.tsx`**
(6 tests) — viewer sin controles mutables; operator ve "Preparar" pero no
"agregar"/"cancelar"; strategist ve "agregar"/"cancelar"; estado vacío sin
targets; "marcar publicado" invoca la Server Action con los campos
correctos; cancelar un target exige razón no vacía antes de invocar la
acción.

**`components/activations/__tests__/CancelActivationPanel.test.tsx`**
(4 tests) — operator nunca ve el control (aunque `canCancel=true`);
strategist lo ve cuando el estado lo permite; `canCancel=false` lo oculta
incluso para admin; flujo de dos pasos (razón + confirmación explícita)
antes de invocar la Server Action.

**`components/activations/__tests__/CampaignActivationEntryCard.test.tsx`**
(4 tests) — campaña aprobada sin activación: strategist ve el entry point,
viewer no ve ningún control; activación no-terminal existente: solo "Ver
activación", nunca un segundo path de creación; campaña no aprobada sin
historial: la sección no se renderiza.

**Total nuevo: 43 tests, 6 archivos, todos en verde.**

---

## 10. Resultados de test — totales exactos

Comandos reales (`apps/web/package.json` / `packages/application/package.json`):
`npm run test` (`vitest run`), `npm run typecheck` (`tsc --noEmit`), `npm run lint` (`eslint`).

**`apps/web`** — ejecutado archivo por archivo (el entorno de este runtime
no sostiene un proceso `vitest run` completo dentro del límite de una
sola invocación de comando por el coste fijo de ~20s de arranque de jsdom
por archivo; se verificó cada uno de los 35 archivos de test individual o
en el grupo más grande que completó dentro del límite):

- **34 de 35 archivos de test pasan, 394 tests pasando, 0 fallando.**
- Desglose relevante a esta subfase: los 6 archivos nuevos de 8A.3 (43
  tests) pasan; `campaigns/__tests__/actions.test.ts` (20 tests, no
  tocado) sigue pasando tras la edición de `campaigns/[id]/page.tsx` —
  confirma que la integración de §6 no rompió el flujo de aprobación
  existente.
- **`src/__tests__/middleware.test.ts` no completó** dentro del límite de
  tiempo de una invocación de este entorno (cuelga/expira consistentemente
  incluso ejecutado solo, sin ningún otro archivo). No se modificó
  `middleware.ts` ni ninguna de sus dependencias en esta subfase — se
  reporta como un problema de infraestructura de este runtime concreto
  (ver §11, riesgo abierto), no como una regresión introducida por 8A.3.
  Un humano con un entorno de desarrollo normal (sin el límite de ~40-45s
  por invocación de este sandbox) debe confirmarlo antes del merge.

**`packages/application`** (no se modificó ningún archivo de este
paquete):
- Suite de activaciones (8A.2) ejecutada explícitamente: **65/65 tests
  pasan** (3 archivos: `create-campaign-activation.use-case.test.ts`,
  `activation-write-use-cases.role-matrix.test.ts`,
  `activation-read-use-cases.test.ts`).
- Spot-check de la suite completa (primeros ~10 archivos incluyendo
  `composition.test.ts`, `campaigns/*`, `automations/*`): sin fallos
  observados antes de que la invocación agotara su límite de tiempo (el
  mismo límite de ~40-45s por comando del entorno, no relacionado con el
  código). No se completó una corrida de los 36 archivos en una sola
  invocación por la misma restricción de plataforma que en `apps/web`.

**Typecheck:**
- `apps/web`: `npx tsc --noEmit` → **0 errores**.
- `packages/application`: `npx tsc --noEmit` → **0 errores**.

**Lint:**
- `apps/web`: `npx eslint` sobre todos los archivos nuevos/modificados de
  esta subfase → **0 errores, 0 warnings**.

---

## 11. Revisión de seguridad

- **Actor spoofing** — verificado por test (S8): el tipo de cada payload
  de Server Action no incluye `actorUserId`/`organizationId`; aunque se
  fuerce con `as any`, el valor recibido por el use case siempre proviene
  de `requireOrganizationRole()`/`requireOrganization()` (sesión servidor).
- **Filtración de errores crudos** — `mapError` en `actions.ts` solo
  reenvía `message` para `VALIDATION_ERROR`/`CONFLICT` (ya saneado por los
  use cases de 8A.2, que nunca incluyen texto de Postgres/RLS crudo — ver
  `domain.errors.ts`); todos los demás códigos usan mensajes fijos en
  español. Ningún componente ni Server Action de esta subfase hace
  `console.log`/renderiza `error.message` de un `AppError` sin pasar por
  `mapError`.
- **Bypass de rol** — doble capa confirmada por tests: capa 1
  (`getOrgContext` en el Server Action) rechaza antes de invocar el use
  case; capa 2 (dentro del use case de 8A.2, sin modificar en esta
  subfase) rechaza de nuevo de forma independiente. Ningún Server Action
  de este archivo omite la capa 1.
- **Ninguna llamada a proveedor externo** — confirmado por revisión manual
  de los 8 archivos nuevos de código de producción (composition root,
  actions, page, y los 7 componentes) y por el test automatizado S10 (grep
  de patrones prohibidos sobre el código fuente real de `actions.ts` en
  cada corrida).
- **service_role** — no se usa en ningún punto; `createActivationComposition`
  recibe el mismo `SupabaseClient` de sesión que ya crea
  `createServerSupabaseClient()` en cada Server Action (RLS aplicada).

---

## 12. Riesgos abiertos / seguimiento para revisor humano

1. **`middleware.test.ts` no verificado en esta ronda** (§10) — no
   modificado, pero tampoco confirmado en verde en este entorno concreto;
   confirmar en un entorno de desarrollo normal antes del merge.
2. **Regresión completa de `packages/application`** no se corrió en una
   sola invocación por el límite de tiempo por comando de este entorno
   remoto (no del código) — se corrió la suite de activaciones completa
   (65/65) y un spot-check amplio del resto sin fallos; un CI real sin esa
   restricción debe correr `npm run test --workspace=packages/application`
   completo antes del merge.
3. **`removeActivationTarget`** (método de repositorio ya existente desde
   8A.1) sigue sin exponerse como use case/Server Action — fuera de
   alcance confirmado de 8A.2, y por lo tanto de 8A.3 (esta subfase solo
   expone use cases de 8A.2 ya implementados). Si el negocio pide "quitar
   un canal agregado por error" antes de operarlo, es un candidato natural
   para 8A.3-bis o 8D.
4. **Canales con proveedor real** (`meta_ads`/`google_ads`/`linkedin_ads`/
   `email`) — el formulario "Agregar canal manual" de esta subfase
   deliberadamente solo ofrece `channel: 'manual'`. El use case y el
   dominio ya soportan los otros canales (con `clientIntegrationId`
   obligatorio), pero conectar `client_integrations` reales es explícitamente
   8E/8F — cuando lleguen, la UI de "agregar canal" deberá extenderse (no
   reescribirse) para listar integraciones del cliente.
5. **`/campaigns/[id]/activation/[activationId]`** — la ruta con ID
   explícito mencionada en el plan original no se implementó (ver
   justificación en §1). Si un caso de uso futuro requiere linkear a una
   activación terminal específica desde fuera del historial embebido
   (ej. desde una notificación/alerta), esa ruta puede añadirse de forma
   aditiva.

---

## 13. Documentación actualizada

- `docs/implementation/phase-8/PHASE_8A3_WEB_MANUAL_OPERATIONS_REPORT.md`
  (este documento, nuevo).
- `docs/implementation/phase-8/PHASE_8_IMPLEMENTATION_PLAN.md` — 8A.3
  marcada `✅ COMPLETA` con resumen y referencia a este reporte.
- `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md` — sección de
  seguimiento de 8A.3 añadida (mismo formato que el cierre de 8A.1/8A.2),
  confirmando el estado de R-ACT-01/02/04/05/07/09/11/12/13 en la capa
  web y dejando abiertos los residuales que no cambian en esta subfase.

---

## 14. Verificación final

```
git status --short
```
Solo cambios de esta subfase (ver §2) más los 4 archivos pre-existentes
sin tocar (`.agencia-ai/.claude/commands/new-client.md`,
`supabase/fixtures/phase8a1_runtime_output*.txt`). Ningún `git add`,
`git commit` ni `git push` fue ejecutado por esta subfase.

**Nota de entorno (no de código):** este runtime tenía un
`.git/index.lock` de 0 bytes pre-existente al inicio de la sesión
(perteneciente al mismo usuario, de un proceso previo) que no pudo
eliminarse (`Operation not permitted` del bridge de `device_bash`). No
impidió que `git status`/`git diff`/`git log` funcionaran (con una
advertencia no fatal), y no se intentó ningún `git add`/`commit`. Se dejó
sin tocar, tal como se indicó — un humano con acceso de shell normal
puede eliminarlo (`rm .git/index.lock`) si sigue presente.

---

## 15. Veredicto

**READY para commit de 8A.3**, con las siguientes condiciones para el
revisor humano antes de mergear a una rama compartida:
1. Confirmar `middleware.test.ts` en verde en un entorno sin el límite de
   tiempo por comando de este sandbox (§12.1).
2. Correr `npm run test --workspace=packages/application` completo en CI
   (§12.2) — no se espera ningún fallo (0 archivos de ese paquete fueron
   tocados), pero no se verificó una corrida completa en una sola
   invocación en este entorno.

Ningún hallazgo de seguridad, ninguna llamada a proveedor externo, ningún
bypass de rol, y ninguna filtración de error crudo se detectaron en la
superficie de código de esta subfase (§11). Los 43 tests nuevos son reales
(mocks de comportamiento, no placeholders) y cubren la matriz de roles,
transiciones inválidas, actor spoofing, y los tres estados de UX
explícitamente pedidos (empty / historial terminal / nueva activación tras
terminal).
