# Phase 8A.2 — Activation Application Use Cases + Authorization/Signals Integration — Reporte de implementación

**Rama:** `feat/phase-8-campaign-operations`
**Base:** `4f5db15` (feat(phase-8): add campaign activation domain and persistence — 8A.1 COMPLETE)
**Estado:** ✅ **8A.2 COMPLETE**

Este documento cierra 8A.2. La capa de application fue entregada
inicialmente como scaffolding no commiteado por una sesión previa; esta
ronda la **revisó línea por línea contra el spec**, corrigió el único gap
sustantivo encontrado (`generatedContent` congelado siempre en `null` en
vez de reflejar el contenido real aprobado), amplió los tests para cubrir
ese fix, y corrió la regresión completa de los cuatro paquetes tocados o
dependientes.

## 1. Archivos cambiados/nuevos

Modificados (ya existían como cambios no commiteados de la sesión previa,
sin cambios adicionales de esta ronda salvo donde se indica):

- `packages/application/src/index.ts` — exports de los 11 use cases +
  helpers de señales de 8A.2.
- `packages/shared/src/index.ts` — exports de los 7 schemas Zod de input
  de use case de 8A.2.
- `packages/shared/src/schemas/campaign-activation.schema.ts` — schemas de
  input de los 7 use cases de escritura (ya existía el schema del snapshot
  desde 8A.1).

Nuevos (directorio completo, revisado y con un fix aplicado en esta
ronda):

- `packages/application/src/use-cases/activations/activation-signals.ts`
- `packages/application/src/use-cases/activations/add-campaign-activation-target.use-case.ts`
- `packages/application/src/use-cases/activations/cancel-activation-target.use-case.ts`
- `packages/application/src/use-cases/activations/cancel-campaign-activation.use-case.ts`
- `packages/application/src/use-cases/activations/create-campaign-activation.use-case.ts` **(fix aplicado en esta ronda — ver §4)**
- `packages/application/src/use-cases/activations/get-activation-with-targets-and-events.use-case.ts`
- `packages/application/src/use-cases/activations/get-campaign-activation.use-case.ts`
- `packages/application/src/use-cases/activations/list-campaign-activations-by-campaign.use-case.ts`
- `packages/application/src/use-cases/activations/list-campaign-activations-by-client.use-case.ts`
- `packages/application/src/use-cases/activations/mark-activation-target-published.use-case.ts`
- `packages/application/src/use-cases/activations/mark-activation-target-ready.use-case.ts`
- `packages/application/src/use-cases/activations/prepare-activation-target.use-case.ts`
- `packages/application/src/use-cases/activations/__tests__/activation-read-use-cases.test.ts`
- `packages/application/src/use-cases/activations/__tests__/activation-write-use-cases.role-matrix.test.ts`
- `packages/application/src/use-cases/activations/__tests__/create-campaign-activation.use-case.test.ts` **(3 tests reemplazados/añadidos en esta ronda — ver §5)**

Fuera de alcance, revertido en esta ronda:

- `supabase/config.toml` — el diff pre-existente (remapeo de puertos
  54321→54721 etc.) era limpieza local no relacionada con 8A.2; revertido
  con `git checkout -- supabase/config.toml` (ver §11 sobre la limitación
  del entorno para ejecutar esto).

No tocados intencionalmente (fuera de alcance del prompt, no relacionados
con 8A.2): `.agencia-ai/.claude/commands/new-client.md`,
`supabase/fixtures/phase8a1_runtime_output*.txt`.

## 2. Use cases implementados (A–G + 4 reads)

Los 11 archivos ya existían como scaffolding funcionalmente correcto casi
en su totalidad. Salvo donde se indica "FIX", cada uno se verificó línea
por línea contra el spec (rol correcto, sin fuga de Supabase, sin
acoplamiento a n8n/publishing/`AutomationExecution`, snapshot vía schema
compartido, RPC/trigger de BD preservado como defensa en profundidad, sin
side effects inventados) y ya cumplía:

| Use case | Rol mínimo | Qué hace | Estado tras revisión |
|---|---|---|---|
| A) `createCampaignActivation` | strategist+ | Carga `Campaign` real, verifica `status === 'approved'` en application, resuelve la ÚLTIMA `CampaignApproval` real (nunca fabricada), construye `CampaignActivationSnapshot` vía `campaignActivationSnapshotSchema`, llama `activationRepository.create` (INSERT directo protegido por RLS + trigger `check_activation_source`), dispara señal best-effort post-commit | **FIX aplicado** — ver §4 |
| B) `addCampaignActivationTarget` | strategist+ | Carga la activation real, rechaza si está en estado terminal, valida channel/provider con `validateCreateActivationTargetInput` (dominio, enum cerrado — nunca un string arbitrario), llama `activationRepository.addTarget` | Ya correcto |
| C) `prepareActivationTarget` | operator+ | Wrapper sobre RPC `prepare_activation_target` (pending→preparing) | Ya correcto |
| D) `markActivationTargetReady` | operator+ | Wrapper sobre RPC `mark_activation_target_ready` (preparing→ready) | Ya correcto |
| E) `markActivationTargetPublished` | operator+ | Wrapper sobre RPC `mark_activation_target_published` (camino manual de primera clase: ready\|scheduled→published) — nunca publica en un proveedor real, solo registra que el operador ya lo hizo manualmente | Ya correcto |
| F) `cancelActivationTarget` | strategist+ | Wrapper sobre RPC `cancel_activation_target` — requiere `reason` no vacía | Ya correcto |
| G) `cancelCampaignActivation` | strategist+ | Wrapper sobre RPC `cancel_campaign_activation` (cascada a targets no-terminales) — requiere `reason` no vacía | Ya correcto |
| `getCampaignActivation` | cualquier miembro | Lectura pura por id, aislada por org | Ya correcto |
| `listCampaignActivationsByCampaign` | cualquier miembro | Lectura paginada por campaña | Ya correcto |
| `listCampaignActivationsByClient` | cualquier miembro | Lectura paginada por cliente, filtro de status opcional | Ya correcto |
| `getActivationWithTargetsAndEvents` | cualquier miembro | Agregado: activation+targets (`findByIdWithTargets`) + página de eventos (`listEvents`) | Ya correcto |

`removeActivationTarget`, mencionado como posible use case en la versión
anterior del plan de Phase 8, **no se implementó** — no está en la lista
A–G del spec de esta ronda; el método de repositorio (`removeTarget`) ya
existe desde 8A.1 y queda disponible para 8A.3/8D si se decide necesario.
No es una omisión de esta ronda, es alcance explícitamente no pedido.

Todos los 7 use cases de escritura: (a) resuelven el actor vía
`organizationRepository.findMember` (nunca confían en un rol pasado por el
caller), (b) validan input con Zod (`@bop-agency/shared`) antes de tocar
cualquier repositorio, (c) delegan la transición real a
`CampaignActivationRepository` (que a su vez llama RPCs `SECURITY DEFINER`
para toda transición de status — nunca un UPDATE directo desde
application), (d) devuelven `Result<T>` tipado con los errores de dominio
ya definidos en 8A.1 (`activationInvalidStatus`,
`activationTargetInvalidStatus`, `campaignNotApprovedForActivation`,
`activationApprovalMismatch`, `activationAlreadyActiveForCampaign`, etc. —
ninguno inventado en esta ronda, todos ya existían en
`packages/domain/src/errors/domain.errors.ts` desde 8A.1).

## 3. Matriz de roles — dónde se aplica cada regla

Implementada con `hasMinimumRole(role, required)` (jerarquía `viewer <
operator < strategist < admin < owner`, `packages/domain/src/entities/organization.ts`),
llamada al inicio de cada use case de escritura, ANTES de tocar cualquier
repositorio de activation:

- **viewer** — sin `hasMinimumRole` check en los 4 use cases de lectura
  (solo se exige membresía activa); denegado (`FORBIDDEN`) en los 7 de
  escritura.
- **operator** — denegado en `createCampaignActivation`,
  `addCampaignActivationTarget`, `cancelActivationTarget`,
  `cancelCampaignActivation` (`hasMinimumRole(role, 'strategist')` falla);
  permitido en `prepareActivationTarget`, `markActivationTargetReady`,
  `markActivationTargetPublished` (`hasMinimumRole(role, 'operator')`).
- **strategist** — permitido en los 7 use cases de escritura (cumple tanto
  el piso `strategist` como el piso `operator`, por jerarquía).
- **admin/owner** — permitido en los 7, por jerarquía (nunca hay un techo,
  solo un piso mínimo — decisión ya vigente en el resto del proyecto,
  `approveCampaign` Phase 7C usa el mismo patrón).

Cada regla de rol tiene un test dedicado en
`activation-write-use-cases.role-matrix.test.ts`
(`create-campaign-activation.use-case.test.ts` cubre `createCampaignActivation`
por separado) — ver §5.

La RPC de BD es la autoridad final en todos los casos (mismos guards de
rol confirmados en runtime en 8A.1, Rounds B–E): la verificación de
application es defensa en profundidad para fallar rápido con un error
tipado amigable, no el único punto de enforcement.

## 4. Fix aplicado — `generatedContent` en el snapshot de `createCampaignActivation`

**Encontrado durante la revisión línea por línea, no reportado por la
sesión previa como pendiente.** El scaffolding original congelaba
`approvedSnapshot.generatedContent` en `null` **incondicionalmente**,
incluso cuando `campaign.generatedContent` (Phase 7D) existía. El propio
comentario de dominio en `campaign-activation.ts` documenta la semántica
esperada: *"null hasta que exista contenido generado por IA — congelado
tal cual estaba aprobado, nunca regenerado después del snapshot"* — es
decir, cuando SÍ existe, debe congelarse, no descartarse. El test que
acompañaba al scaffold (`'el snapshot generado usa generatedContent: null
por diseño explícito'`) documentaba el comportamiento incorrecto como si
fuera intencional, en vez de señalar el gap.

**Fix:** antes de construir el snapshot, se intenta
`campaignGeneratedContentSchema.safeParse(campaign.generatedContent)`
(mismo schema que ya usa `generateCampaignDraftWithAI`, Phase 7D). Si
matchea, el contenido real y validado se congela en el snapshot. Si
`campaign.generatedContent` es `null`, o no matchea el schema (dato
corrupto/legacy de otro subsistema), se congela como `null` con un
`logger.warn` — nunca se falla la creación de la activation por un
problema ajeno a este use case, y nunca se persiste contenido no validado.

Esto NO introduce acoplamiento nuevo a Phase 7D: el import
(`campaignGeneratedContentSchema`) ya estaba disponible en
`@bop-agency/shared` (reexportado desde antes de 8A.2) y el propio schema
del snapshot (`campaignActivationSnapshotSchema`, 8A.1) ya tipaba
`generatedContent` como `CampaignGeneratedContent | null` — el fix alinea
la implementación con un contrato que ya existía, no agrega uno nuevo.

## 5. Tests añadidos/fijados

**Ya presentes en el scaffold (verificados como reales, no placeholders,
y ejecutados) — sin cambios de esta ronda:**

- `create-campaign-activation.use-case.test.ts` (antes del fix, 17 de 20
  tests): campaign aprobada → éxito (strategist, y `it.each` admin/owner);
  viewer/operator rechazados con `FORBIDDEN` sin persistir; `it.each`
  draft/review/rejected rechazados con `VALIDATION_ERROR` antes de
  persistir; actor no-miembro → `FORBIDDEN`; campaña inexistente/otra org
  → `NOT_FOUND`; sin aprobación real → falla sin fabricar
  `campaignApprovalId`; última aprobación con `action !== 'approved'` →
  falla; nunca llama `campaignRepository.update`/`.approve` (sin
  transición a `active`); conflicto de activation no-terminal duplicada
  propagado como `CONFLICT`; sin ningún adapter de publishing en deps;
  señal best-effort: skip logueado sin `taskRepository`, creación +
  dedupe con `taskRepository`, no-doble-creación si ya existe una activa,
  fallo del signal no revierte la persistencia ya confirmada.
- `activation-write-use-cases.role-matrix.test.ts` (36 tests): matriz de
  roles completa para los 6 use cases restantes (`addCampaignActivationTarget`,
  `prepareActivationTarget`, `markActivationTargetReady`,
  `markActivationTargetPublished`, `cancelActivationTarget`,
  `cancelCampaignActivation`) — cada rol permitido/denegado según §3,
  transición de activation terminal rechazada antes de agregar target,
  provider fuera del enum cerrado rechazado, par channel/provider
  inválido rechazado, guard de estado terminal propagado desde el
  repositorio en `cancelCampaignActivation`, `reason` vacía rechazada
  antes de llamar al repositorio.
- `activation-read-use-cases.test.ts` (8 tests): los 4 reads no exponen
  `alertRepository`/`taskRepository` en sus `Deps` (pureza estructural);
  viewer puede leer; actor no-miembro rechazado sin llamar al repositorio;
  paginación de campaña/cliente (con filtro de status); agregado
  activation+targets+eventos; `NOT_FOUND` propagado sin llamar
  `listEvents`.

**Añadidos/reemplazados en esta ronda** (en
`create-campaign-activation.use-case.test.ts`, acompañando el fix de §4):

- *"el snapshot congela generatedContent: null cuando la campaña no tiene
  contenido generado"* — reemplaza el test que documentaba el bug como
  comportamiento intencional; cubre el caso `campaign.generatedContent ===
  null`.
- *"el snapshot congela el generatedContent REAL de la campaña cuando
  existe y matchea el schema (Phase 7D)"* — construye un
  `CampaignGeneratedContent` válido de `meta_ads` (mismo shape exigido por
  `campaignGeneratedContentSchema`) y verifica que se persiste tal cual en
  `approvedSnapshot.generatedContent`, no como `null`.
- *"el snapshot congela generatedContent: null (con warning logueado) si
  el contenido de la campaña no matchea el schema"* — contenido corrupto/
  no válido (`{ garbage: true }`) → snapshot con `null` + `logger.warn`
  invocado.

## 6. Totales de tests por paquete (ejecutados en esta ronda)

| Paquete | Test files | Tests | Resultado |
|---|---|---|---|
| `packages/application` | 36 | 429 | ✅ todos pasan |
| `packages/domain` | 15 | 332 | ✅ todos pasan |
| `packages/infrastructure` | 34 | 574 | ✅ todos pasan |
| `packages/shared` | 7 | 106 | ✅ todos pasan |

De los 429 tests de `packages/application`, 65 corresponden a
`use-cases/activations/` (3 archivos: 20 de creación, 36 de matriz de
roles de escritura, 8 de lectura + 1 de pureza estructural — ver §5 para
el desglose exacto tras el fix).

Los mensajes `stderr` visibles al correr `packages/infrastructure` (logs
de `[ai-provider] Provider returned an error` / `Timeout contacting
provider` / etc. en `claude-api.provider.test.ts`) son salida esperada de
tests que ejercitan rutas de error deliberadamente (reintentos,
timeouts) — no son fallos; los 574 tests del paquete pasan.

## 7. Typecheck / lint por paquete

| Paquete | `tsc --noEmit` | `eslint src --ext .ts` |
|---|---|---|
| `packages/application` | ✅ limpio | ✅ limpio |
| `packages/shared` | ✅ limpio | ✅ limpio |
| `packages/domain` | ✅ limpio | ✅ limpio |
| `packages/infrastructure` | ✅ limpio | ✅ limpio |

## 8. Revisión de seguridad

- **Actor id spoofing:** ningún use case acepta `actorUserId` del caller
  para usarlo como el actor autorizante sin antes resolverlo vía
  `organizationRepository.findMember(organizationId, actorUserId)` — el
  rol usado para la decisión de autorización siempre viene de esa consulta
  (nunca de un campo del input). El comentario en cada `*Input` type es
  explícito: *"Actor autenticado — obtenido de la sesión del servidor,
  nunca del cliente."* Esto es responsabilidad del caller de la Server
  Action (fuera de 8A.2, no implementada en esta ronda) — el use case en
  sí no puede prevenir que un caller le pase un id falso, pero no hace
  nada que empeore ese riesgo respecto al patrón ya establecido en Phase 7.
- **Auth bypass:** los 7 use cases de escritura fallan ANTES de tocar el
  repositorio si `hasMinimumRole` es falso — verificado con tests
  (`expect(activationRepository.X).not.toHaveBeenCalled()` en cada caso
  denegado). La RPC de BD revalida el mismo piso de rol de forma
  independiente (8A.1, confirmado en runtime) — dos capas, ninguna
  reemplaza a la otra.
- **Supabase leakage:** ningún archivo de `packages/application/src/use-cases/activations/`
  importa `@supabase/*` ni ningún cliente de infraestructura —
  confirmado por inspección de imports de los 12 archivos (todos importan
  únicamente de `@bop-agency/domain`, `@bop-agency/shared`, y el
  `LoggerPort` local de application). Toda persistencia pasa por las
  interfaces de dominio inyectadas.
- **Fuga de credenciales/secretos:** el snapshot nunca incluye
  `client_integrations.configuration` ni ningún campo de credencial —
  `CampaignActivationSnapshotCampaign`/`CampaignActivationSnapshotApproval`
  son tipos cerrados sin espacio para eso; `markActivationTargetPublished`
  solo acepta `externalReference`/`note` como texto libre acotado (300/2000
  chars), nunca un objeto de configuración.
- **n8n/publishing/AutomationExecution:** cero imports/menciones de n8n,
  Meta API, Google API, `publication_jobs` o `AutomationExecution` en todo
  el directorio `use-cases/activations/` — confirmado por `grep`.
- **String arbitrario en channel/provider:** `addCampaignActivationTarget`
  valida con `activationChannelSchema`/`activationProviderSchema` (enums
  Zod cerrados) primero, y además con `validateCreateActivationTargetInput`
  (dominio) para el par channel/provider — un provider fuera del enum, o
  un par channel/provider inválido (ej. `meta_ads` + `google`), se rechaza
  antes de llegar al repositorio — cubierto por tests.

**Sin hallazgos de seguridad nuevos** en esta ronda.

## 9. Documentación actualizada

- `docs/implementation/phase-8/PHASE_8_IMPLEMENTATION_PLAN.md` — sección
  8A.2 marcada ✅ COMPLETE con el alcance real entregado (reemplaza la
  descripción de alcance planeado de la versión anterior); nota explícita
  sobre `removeActivationTarget` no implementado.
- `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md` — nueva sección
  "Actualización — Phase 8A.2" con el estado de R-ACT-02/03/09/11/12/13
  reforzados o cerrados en application, y los residuales heredados de
  8A.1 que siguen sin resolver (sin código nuevo necesario en 8A.2).
- Este documento (`PHASE_8A2_APPLICATION_USE_CASES_REPORT.md`) — nuevo.

## 10. Riesgos abiertos / seguimientos para revisión humana

- **`removeActivationTarget` no tiene use case de application** — el
  método de repositorio existe (8A.1, DELETE físico solo mientras la
  activation padre está `pending`), pero nadie lo invoca todavía. No
  bloquea 8A.2 (no estaba en el alcance A–G), pero 8A.3 (UI) lo va a
  necesitar si el flujo de creación de activation permite quitar un target
  agregado por error antes de avanzar el pipeline.
- **Rol `operator` no puede cancelar — solo verificado con mocks.** Igual
  que el residual ya documentado al cierre de 8A.1: la matriz de roles de
  application está 100% cubierta por tests unitarios con `OrganizationRepository`
  mockeado, pero no se ejercitó contra Postgres/RLS real con un usuario
  `operator` de verdad en esta ronda (8A.2 es application pura, no tocó la
  migración ni corrió runtime contra Supabase local). Sigue siendo un
  candidato razonable para 8A.3/8D si se decide necesario.
- **`getCampaignActivation` no valida la forma de `activationId` con Zod**
  antes de castearlo — mismo patrón que `getCampaign` (Phase 7E, que
  tampoco valida `campaignId`); un id malformado termina como error de
  BD/mapper en vez de un `VALIDATION_ERROR` limpio de application. No es
  una regresión de 8A.2 (replica un patrón ya existente en el proyecto),
  pero es un gap consistente en ambos que un futuro barrido de
  consistencia podría cerrar.
- **Server Actions / capa HTTP no existen todavía** — 8A.2 es
  exclusivamente application; ningún caller real (Server Action, ruta API)
  invoca estos use cases todavía. Eso es 8A.3.

## 11. Nota operativa — entorno de ejecución (`device_bash`)

El bridge de `device_bash` sobre este repo montado vía FUSE **rechaza
`unlink` de forma categórica** (`Operation not permitted`) en cualquier
archivo del árbol, incluidos archivos creados por este mismo proceso en
el mismo comando — confirmado con pruebas aisladas (crear+borrar un
archivo de prueba en la misma invocación de shell falla igual). Esto
afecta a cualquier operación de git que necesite reemplazar un archivo vía
unlink+write (`git checkout -- <file>`, que es como se pidió revertir
`supabase/config.toml`). La reversión de `supabase/config.toml` se logró
igual, pero por una vía distinta: sobrescribiendo el contenido del archivo
in-place (`open(..., 'wb').write(git show HEAD:<file>)`), sin invocar
`git checkout`. El resultado final es idéntico (`git diff
supabase/config.toml` vacío), pero se documenta la desviación del método
literal pedido por si el mismo bloqueo aparece en una ronda futura.

Dos archivos vacíos de prueba (`xx_test_delete.txt`, `yy_test.txt`) creados
durante el diagnóstico de este bloqueo **no pudieron eliminarse** por la
misma razón — quedan untracked (no afectan ningún `git add`/commit futuro
al no estar en el índice) y se dejan documentados aquí para que el usuario
los borre manualmente desde su propio dispositivo (donde el unlink sí
funciona normalmente, al no pasar por este bridge).

Por el mismo motivo, `device_bash` impone un techo duro de 45 segundos por
invocación y no preserva procesos en background entre invocaciones (un
`nohup ... &` se confirma vivo dentro de la misma llamada pero ya no
existe en la siguiente). La suite completa de `packages/application` no
cabía en una sola invocación con el reporter por defecto; se resolvió
corriendo cada paquete con `--pool=threads --poolOptions.threads.singleThread`
y `--reporter=dot`, que trae el tiempo de wall-clock de cada suite a
single dígitos de segundo, bien dentro del límite.

## 12. Verificación final

```
$ git status --short
 M packages/application/src/index.ts
 M packages/shared/src/index.ts
 M packages/shared/src/schemas/campaign-activation.schema.ts
?? .agencia-ai/.claude/commands/new-client.md
?? docs/implementation/phase-8/PHASE_8A2_APPLICATION_USE_CASES_REPORT.md
?? packages/application/src/use-cases/activations/
?? supabase/fixtures/phase8a1_runtime_output.txt
?? supabase/fixtures/phase8a1_runtime_output_run1.txt
?? supabase/fixtures/phase8a1_runtime_output_run2.txt
?? xx_test_delete.txt
?? yy_test.txt
 M docs/implementation/phase-8/PHASE_8_IMPLEMENTATION_PLAN.md
 M docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md
```

`supabase/config.toml` no aparece — confirmado limpio (reversión exitosa,
ver §11). Ningún `git add`/`commit`/`push` fue ejecutado en esta sesión,
consistente con las reglas de seguridad del protocolo de trabajo.

## Veredicto

**READY para commit.** Los 7 use cases de escritura (A–G) y los 4 de
lectura cumplen el spec de 8A.2: matriz de roles reforzada en application
con la misma jerarquía y los mismos pisos que las RPCs de 8A.1, ningún
snapshot fabricado, ninguna transición automática `approved`→`activation`
ni `campaign.status`→`active`, ninguna publicación externa, ninguna fuga
de Supabase, señal best-effort acotada a un único evento real (creación de
activation) con dedupe determinístico, sin infraestructura nueva de
alertas/tareas. El único gap sustantivo encontrado en la revisión
(`generatedContent` siempre `null`) fue corregido y cubierto con 3 tests
nuevos. 1441 tests pasando en total entre los 4 paquetes ejecutados
(429+332+574+106), typecheck y lint limpios en los 4. Los tres residuales
abiertos (§10) son candidatos razonables para 8A.3/8D, ninguno bloquea el
cierre de 8A.2.
