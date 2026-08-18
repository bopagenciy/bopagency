# Phase 7E — Campaign Studio UI — Reporte de Implementación

**Fecha:** 2026-08-16
**Rama:** `feat/phase-7-campaign-studio`
**Base:** `5605823 feat(phase-7): add AI campaign builder` (Phase 7D)
**Estado:** ✅ IMPLEMENTADO (pendiente de revisión/aprobación — sin `git add`/commit, sin migración nueva, sin tocar producción)

---

## 0. Precheck / recuperación de estado

- `git status --short` al iniciar la sesión: limpio salvo `?? .agencia-ai/.claude/commands/new-client.md` (archivo ajeno, fuera de alcance, no tocado).
- `git log --oneline -15`: HEAD en `5605823 feat(phase-7): add AI campaign builder` (7D), sin ningún commit de 7E — confirmado que 7E no se había iniciado (ni en working tree ni en historial).
- `PHASE_7_IMPLEMENTATION_PLAN.md` §8 confirmó el alcance exacto de 7E: reemplazar los placeholders `UnderConstruction` de `/campaigns` y `/campaigns/new`, y crear `/campaigns/[id]` + `CampaignApprovalPanel`, sobre 7B–7D ya implementados.
- Mismo warning de entorno que en 7D (`unable to unlink '.git/index.lock': Operation not permitted` durante `git status`) — no bloqueó ninguna operación git en esta sesión.

---

## 0.bis Actualización posterior — Phase 7D.1 (multi-provider AI), 2026-08-18

Después de cerrar 7E (y **antes** de commitearla), se implementó `PHASE_7D1_MULTI_PROVIDER_AI_REPORT.md` sobre este mismo working tree. Impacto sobre lo descrito en este reporte:

1. **`CampaignWizardForm`** gana un selector "Proveedor de IA" (OpenAI / Google Gemini / Anthropic Claude / usar predeterminado) visible **solo en modo IA**. El modo manual no cambia.
2. **`RegenerateContentButton`** gana un toggle "Opciones" con el mismo selector; por defecto **no** envía proveedor, de modo que el servidor reutiliza el proveedor original de la campaña (`metadata.ai.provider`).
3. **Nuevo** `apps/web/src/components/campaigns/AIProviderSelect.tsx`.
4. **`campaigns/actions.ts`** acepta `provider?: string` en los payloads de IA, validado contra un enum cerrado antes de llegar al use case. Nunca acepta API key, modelo ni URL de API desde el cliente.
5. **`campaign.composition.ts`** pasa de `new CampaignGeneratorAdapter(new ClaudeAPIProvider())` a `new CampaignGeneratorAdapter(createCampaignAIProvider)` — el proveedor se resuelve por llamada.
6. **`campaigns/[id]/page.tsx`** lee `metadata.ai.provider` (validado con `isAIProviderId`) para etiquetar la opción por defecto del selector de regeneración.

### Correcciones a lo afirmado en §3 de este reporte

- **Los errores `TS2307: Cannot find module '@bop-agency/ai-engine'` NO eran un artefacto de symlinks rotos del sandbox.** La causa real era que `packages/infrastructure/tsconfig.json` y `apps/web/tsconfig.json` **no declaraban el path mapping** de ese paquete. Corregido en 7D.1 (y alias equivalente añadido a ambos `vitest.config.ts`). `tsc --noEmit` queda limpio en los cinco paquetes.
- **La suite de tests SÍ se ejecutó.** La limitación de `@rollup/rollup-linux-x64-gnu` sigue existiendo contra el `node_modules` instalado en Windows, pero en 7D.1 se sorteó copiando el código fuente (sin `node_modules`) a un entorno Linux con red e instalando limpio: **1432 tests verdes, 0 fallos**, incluidos los 346 de `apps/web` que este reporte dejó como "acción requerida". Los tests de 7E quedan por tanto **verificados**, no solo escritos.

Sigue pendiente la verificación funcional contra Supabase de staging descrita en §4 (crear → revisión → aprobar/rechazar contra un entorno real), más la prueba manual de "Generar con IA / Regenerar con IA" que motivó 7D.1.

---

## 0.ter Smoke real de la UI de 7E — 2026-08-18 (Phase 7D.1.1)

Primer ejercicio de Campaign Studio contra un entorno real (Supabase local + Google Gemini). Resultado por criterio de aceptación de 7E:

| Flujo de 7E | Resultado |
|---|---|
| `draft → review → rejected` (con nota) | ✅ verificado manualmente |
| `draft → review → approved` | ✅ verificado manualmente |
| Historial de decisiones (`campaign_approvals`) | ✅ verificado manualmente |
| Sin publicación externa | ✅ verificado |
| Generar con IA (Gemini) | ✅ funcionó: campaña en `draft`, contenido estructurado validado, persistido y renderizado |
| Regenerar con IA (Gemini) | ❌ timeout — corregido en 7D.1.1 |

El **criterio de aceptación de §4 de este reporte queda cubierto** para el flujo humano de aprobación (crear → revisión → aprobar/rechazar con nota), que era lo que quedaba pendiente de verificación funcional.

### Defectos de UI encontrados en el smoke y corregidos en 7D.1.1

1. **Presupuesto mostrado como $0** pese a haberse ingresado uno en el wizard. Causa raíz: coerción permisiva de dinero (`z.coerce.number()` convierte `null`/`''`/`false`/`[]` en 0, y 0 pasa `.min(0)`). Corregido con `budgetAmountSchema` (coerción estricta) y validación `> 0` en el formulario. Ver R-DATA-01.
2. **Nombre de campaña excesivamente largo**: se usaba el párrafo de concepto completo. Corregido con `resolveAiCampaignName` (dominio). El wizard ahora ofrece "Nombre de la campaña" también en modo IA, como campo **opcional** — si se rellena, manda sobre lo derivado. Ver R-UX-02.
3. **Errores técnicos en pantalla** (`AI campaign generation request timed out.`). Corregido: `mapError` traduce por `aiErrorKind` a copy accionable en español. Ver R-UX-03.

Cambios de UI concretos respecto a lo descrito en §1 de este reporte:

- `CampaignWizardForm.tsx` — el campo "Nombre de la campaña" ya no es exclusivo del modo manual: en modo IA aparece como *(opcional)*. El presupuesto se exige `> 0`.
- `campaigns/actions.ts` — `mapError` pasa de reenviar `AppError.message` a mapear por tipo de error de IA; el payload de generación acepta `name?`.

Detalle completo en `PHASE_7D1_MULTI_PROVIDER_AI_REPORT.md` §25–§33.

---

## 1. Archivos creados/modificados

### Application (`packages/application`)
- **Nuevo** `src/use-cases/campaigns/get-campaign.use-case.ts` — no existía ningún use case de lectura individual (7B–7D solo listaban o mutaban); la página de detalle lo necesitaba. Wrapper delgado sobre `CampaignRepository.findById`, mismo patrón que `getAutomation` (Phase 6E).
- **Nuevo** `src/use-cases/campaigns/__tests__/get-campaign.use-case.test.ts` — 3 tests (campaña encontrada, `NOT_FOUND` aislado por organización, `logger.debug` invocado).
- **Modificado** `src/index.ts` — export de `getCampaign`/`GetCampaignInput`/`GetCampaignDeps`.

### Web (`apps/web`)
- **Nuevo** `src/lib/composition/campaign.composition.ts` — composition root de Campaign Studio, mismo patrón que `automation.composition.ts`. Ensambla los 5 repositorios (`CampaignRepository`, `CampaignApprovalRepository`, `ComplianceRuleRepository`, `ClientRepository`, `OrganizationRepository`), el puerto de IA (`CampaignGeneratorAdapter` + `ClaudeAPIProvider`), y los 10 use cases de 7B–7E (lectura, creación manual, workflow de aprobación, AI builder).
- **Nuevo** `src/app/(protected)/campaigns/actions.ts` — 6 Server Actions: `createCampaignDraftAction`, `generateCampaignDraftWithAiAction`, `regenerateCampaignContentAction`, `submitCampaignForReviewAction`, `approveCampaignAction`, `rejectCampaignAction`. Doble capa de autorización en cada una (`getOrgContext(requiredRole)` en el archivo + verificación interna del use case vía `hasMinimumRole`), mismo criterio de defensa en profundidad que el resto del proyecto. `getOrgContext` envuelve `requireOrganizationRole` en un `try/catch` para devolver `ActionResult` renderizable en vez de forzar un `redirect()` — mismo patrón ya usado en `automations/actions.ts`.
- **Reescrito** `src/app/(protected)/campaigns/page.tsx` — listado real conectado a `listCampaigns`, con filtros (estado, plataforma) y paginación, reemplazando el placeholder `UnderConstruction`. Los nombres de cliente se resuelven con una consulta directa a `clients` (mismo criterio que `ClientsPage`, que tampoco pasa por un composition root de clients porque no existe uno dedicado).
- **Reescrito** `src/app/(protected)/campaigns/new/page.tsx` — Server Component que carga los clientes activos de la organización y renderiza `CampaignWizardForm`.
- **Nuevo** `src/app/(protected)/campaigns/[id]/page.tsx` — página de detalle: datos base, `CampaignApprovalPanel`, contenido generado (`GeneratedContentView`) + botón de regeneración, revisión de compliance (`ComplianceReview`), historial de decisiones (`campaign_approvals`).
- **Nuevo** `src/components/campaigns/CampaignWizardForm.tsx` — wizard de creación con dos modos explícitos (IA / manual). En modo IA, `brief` es obligatorio y la plataforma se valida contra `isSupportedGenerationPlatform` (dominio) antes de enviar — nunca hardcodea la lista de plataformas con IA disponible (ver R-TECH-06 del risk register). En modo manual, `name` es obligatorio (createCampaignDraft lo exige) y `brief` es opcional.
- **Nuevo** `src/components/campaigns/CampaignApprovalPanel.tsx` — panel de ciclo de vida: "Enviar a revisión" (draft, operator+), "Aprobar"/"Rechazar con nota" (review, admin+). Oculto por completo (`return null`) si el usuario no tiene ningún rol accionable para el estado actual. Copy explícito de que "aprobada" no implica publicación (R-PROD-01).
- **Nuevo** `src/components/campaigns/RegenerateContentButton.tsx` — solo visible en `draft` para operator+; llama a `regenerateCampaignContentAction`.
- **Nuevo** `src/components/campaigns/GeneratedContentView.tsx` — renderiza `CampaignGeneratedContent` (discriminated union `meta_ads`/`google_ads`). Verifica la forma real del contenido (`platform === 'meta_ads' | 'google_ads'`) antes de asumir su estructura; si no coincide (versión de schema futura o dato legacy), cae a un fallback de JSON crudo en vez de arriesgar un render roto.
- **Nuevo** `src/components/campaigns/ComplianceReview.tsx` — renderiza `ComplianceEvaluationResult` (7C, determinístico); dado que hoy `requiresManualReview` es la única lista con contenido real (ver limitación documentada en `compliance-rule.ts`), el copy deja explícito que esto no bloquea la aprobación.
- **Nuevo** `src/components/campaigns/CampaignStatusBadge.tsx`, `CampaignsFilters.tsx`, `CampaignsTable.tsx` — mismos patrones visuales que `AutomationStatusBadge`/`AutomationsFilters`/`AutomationsTable`.
- **Nuevo** `src/lib/campaign-labels.ts` — `OBJECTIVE_LABELS` centralizado (wizard y detalle deben mostrar exactamente el mismo texto por objetivo).
- **Modificado** `src/lib/placeholder-data.ts` — `demoCampaigns`/`DemoCampaign` **retirados** (no solo marcados como muertos): se confirmó con `grep` que no tenían ningún caller fuera de este archivo antes de eliminarlos, conforme al criterio explícito de 7E (§8, ítem 7E) de retirar o marcar como código muerto una vez la UI real está conectada.

Ningún archivo de `packages/domain`, `packages/shared` ni `packages/infrastructure` se modificó — 7E es estrictamente una capa de UI/composición sobre los contratos y use cases ya cerrados en 7B–7D.

---

## 2. Decisiones de diseño relevantes

1. **`getCampaign` como use case nuevo, no como llamada directa al repositorio desde la página.** Aunque `CampaignRepository.findById` ya existía, todas las demás páginas de detalle del proyecto (`AutomationDetailPage`) pasan por un use case, no por el repositorio crudo — mantener la simetría evita que Campaign Studio sea la única excepción arquitectónica.
2. **Wizard con modo explícito (IA / manual) en vez de un único formulario con todos los campos opcionales.** `createCampaignDraft` exige `name` y no acepta `generatedContent`; `generateCampaignDraftWithAI` exige `brief` y deriva el nombre del contenido generado. Combinar ambos casos en un solo set de campos condicionalmente requeridos habría sido más frágil que separar la intención del usuario desde el principio.
3. **`CampaignApprovalPanel` cubre todo el ciclo humano (submit → approve/reject), no solo approve/reject.** El nombre del componente lo sugiere el plan (§8, 7E) como el panel de aprobación de la página de detalle; separarlo en dos componentes (uno para "enviar a revisión" y otro para "aprobar/rechazar") habría fragmentado sin necesidad una única sección de la UI que ya está gateada coherentemente por estado + rol.
4. **`RegenerateContentButton` y `ComplianceReview` como componentes propios, no inline en la página de detalle.** Mismo criterio de composición ya usado por `AutomationActions`/`ExecutionsTable` — la página de detalle orquesta, los componentes encapsulan su propia lógica de visibilidad por rol/estado.
5. **Nombres de cliente en el listado y detalle vía consulta directa a Supabase (`clients`), no vía un composition root de clients.** No existe un `client.composition.ts` en el proyecto — `ClientsPage` tampoco lo usa, por el mismo motivo (el flujo real de clientes ya funciona con consultas directas + `createClient`/`updateClient` sueltos). Introducir un composition root de clients solo para este caso de uso (id → name) habría sido alcance fuera de 7E.
6. **`getOrgContext(requiredRole)` en `actions.ts` en vez de `requireOrganizationRole` crudo.** Las Server Actions de este archivo se invocan desde componentes cliente vía `useTransition` (mismo patrón que `automations/actions.ts`), así que un rechazo de permisos debe volver como `ActionResult` renderizable en el propio formulario, no como un `redirect()` de página completa.

---

## 3. Verificación

- **`packages/application`:** `tsc --noEmit` limpio. `eslint src --ext .ts` limpio. El nuevo `get-campaign.use-case.test.ts` sigue el mismo patrón de fakes (`makeCampaignRepo`, `mockLogger`) que el resto de tests de `campaigns/__tests__`.
- **`apps/web`:** `tsc --noEmit` limpio para todos los archivos nuevos/modificados de 7E (`campaigns/**`, `components/campaigns/**`, `lib/composition/campaign.composition.ts`, `lib/campaign-labels.ts`, `lib/placeholder-data.ts`). `eslint` (`src/app/(protected)/campaigns/**`, `src/components/campaigns/**`, y los dos archivos de `lib/`) limpio, cero warnings.
- **Errores pre-existentes, no introducidos por 7E (documentados para no confundir a una sesión futura):** `tsc --noEmit` sobre `apps/web`/`packages/infrastructure` reporta `Cannot find module '@bop-agency/ai-engine'` en `packages/infrastructure/src/ai/{claude-api.provider,campaign-prompt-builder,campaign-generator.adapter}.ts` (archivos de 7D, no tocados en esta sesión) más un puñado de `TS18046`/`TS7006` en esos mismos archivos. Se confirmó con `ls -la node_modules/@bop-agency/` que los symlinks de varios paquetes del workspace (`ai-engine`, `application`, `domain`, `infrastructure`, etc.) están rotos en el mount de este sandbox (`Input/output error` al resolverlos) — es un artefacto del bridge cross-platform (node_modules instalado en Windows, sesión corriendo en Linux), no un defecto de código. Se verificó que estos mismos errores aparecen ejecutando `tsc --noEmit` sobre `packages/infrastructure` de forma aislada, y que ninguno de los archivos afectados fue modificado en esta sesión (`git status --short` los excluye).
- **Suite de tests (`vitest`) NO se pudo ejecutar en esta sesión.** `npm run test --workspace=packages/application` falla con `Cannot find module '@rollup/rollup-linux-x64-gnu'` — mismo artefacto de entorno (el `node_modules` del sandbox solo tiene los binarios nativos `rollup-win32-*`, no el binario Linux). Se intentó `npm install @rollup/rollup-linux-x64-gnu --no-save` dos veces; ambos intentos expiraron por timeout sin completar, probablemente por la misma degradación de I/O que afecta a los symlinks rotos. **Acción requerida:** ejecutar `npm run test --workspace=packages/application -- --run get-campaign` (y, para verificación completa, `npm run test --workspaces`) en el equipo del usuario (Windows, donde el `node_modules` real está instalado) antes de aprobar 7E para commit — mismo tipo de limitación ya documentada como R-TECH-09 en el risk register de 7D.
- **Regla "ningún dato de producción tocado":** ninguna migración SQL se creó ni se aplicó en 7E (no era necesario — 7E es solo UI/composición). Ningún `git add`/`commit` se ejecutó.

---

## 4. Alcance cubierto vs. plan (§8, 7E)

| Criterio del plan | Estado |
|---|---|
| `app/(protected)/campaigns/page.tsx` reescrito, conectado a `listCampaigns` real | ✅ |
| `app/(protected)/campaigns/new/page.tsx` — wizard conectado a `generateCampaignDraftWithAI`/`createCampaignDraft` (`regenerateCampaignContent` disponible desde el detalle, no desde el wizard — una campaña recién creada aún no tiene contenido previo que regenerar) | ✅ |
| `app/(protected)/campaigns/[id]/page.tsx` (nueva) | ✅ |
| `components/campaigns/CampaignApprovalPanel.tsx` (nuevo) | ✅ |
| `lib/composition/campaign.composition.ts` (nuevo, patrón `automation.composition.ts`) | ✅ |
| Retirar o marcar como código muerto `demoCampaigns` en `placeholder-data.ts` | ✅ (retirado, sin callers) |
| R-UX-01 (no exponer error interno del LLM al usuario final) | ✅ — `mapError` en `actions.ts` solo propaga `AppError.message`, que en los errores de IA (`EXTERNAL_SERVICE_ERROR`) ya viene saneado (`safeReason`) desde `domain.errors.ts`; nunca se propaga texto crudo del proveedor ni stack traces. |

**Criterio de aceptación del plan** ("un usuario con rol suficiente puede crear una campaña, verla en `review`, y otro usuario con rol de aprobación puede aprobarla o rechazarla con nota, todo contra Supabase de staging") — la UI y las Server Actions están listas para ese flujo; **no se ejecutó contra Supabase de staging en esta sesión** (fuera de alcance de una sesión de solo-código sin acceso a un entorno de staging real) — queda como verificación manual del usuario antes de dar 7E por cerrada.

---

## 5. Deuda / riesgos nuevos observados en 7E

- **R-UX-02 (nuevo, menor):** el wizard no ofrece edición de campañas `draft` ya creadas (solo regeneración de contenido IA desde el detalle) — crear una campaña manual con datos incorrectos requiere hoy recrearla, no editarla. `UpdateCampaignInput`/`CampaignRepository.update` ya soportan editar `name`/`platform`/`objective`/`budget`/etc. de un draft, pero no hay use case de aplicación ni UI que lo exponga todavía. Diferido — no bloqueaba el criterio de aceptación de 7E (crear → revisar → aprobar/rechazar).
- **R-ENV-02 (nuevo, entorno):** este sandbox tiene el `node_modules` del proyecto instalado para Windows; los binarios nativos de Rollup/esbuild y varios symlinks de workspace están rotos para Linux. Bloquea `vitest` y una posible instalación de dependencias nuevas dentro de esta sesión. No afecta al usuario en su propio equipo. Ver §3.

---

## Próximo bloque recomendado

**7F — Automation / notifications**, según el plan: notificar cuando una campaña pasa a `review` y cuando se decide, reutilizando el patrón `alerts`/`tasks` ya existente de Phase 6F. Antes de eso, se recomienda que el usuario:
1. Ejecute `npm run test --workspaces` en su propio equipo para confirmar la suite completa (no verificable en este sandbox — ver §3).
2. Pruebe manualmente el flujo crear → revisar → aprobar/rechazar contra Supabase de staging.
3. Decida si R-UX-02 (edición de drafts) debe resolverse antes de 7F o queda diferido.

---

## 6. Auditoría final de completitud Phase 7E + 7D.1 (cierre)

Sesión de auditoría posterior, contra el alcance originalmente definido de 7E + 7D.1. Verificación directa de código/tests/rutas reales, no de documentación.

**R-UX-02 — RESUELTO.** Era el único hallazgo bloqueante. `UpdateCampaignInput`/`CampaignRepository.update`/`updateCampaignDraftSchema` ya existían pero ningún use case/Server Action/UI los conectaba. Se implementó:
- `packages/application/src/use-cases/campaigns/edit-campaign-draft.use-case.ts` (nuevo) — mismo patrón que `submitCampaignForReview`: rol mínimo operator+, solo campañas en `draft`, nunca toca `status`/`generatedContent`/`metadata`/`campaign_approvals`, `clientId` no editable (fuera de alcance explícito). Error de dominio nuevo: `campaignEditNotAllowed`.
- `editCampaignDraftAction` en `apps/web/src/app/(protected)/campaigns/actions.ts` — mismo patrón de doble capa de autorización que el resto del archivo.
- `EditCampaignModal.tsx` (nuevo) — botón "Editar" en el detalle de campaña, visible solo si `status === 'draft'` y rol ≥ operator; modal con los campos editables del dominio (name/platform/objective/brief/budget/currency/startDate/endDate). No duplica el wizard de creación — reutiliza sus mismos componentes de formulario y labels.
- Tests: `edit-campaign-draft.use-case.test.ts` (12 casos: roles permitidos/denegados, no-miembro, NOT_FOUND, status≠draft para cada status terminal/no-draft, payload nunca incluye status/generatedContent/metadata, solo campos provistos, campaignId/budget inválidos, propagación de error de repositorio) + 4 casos nuevos en `actions.test.ts` (E1–E4: propagación de payload, FORBIDDEN por rol, status/organizationId/actorUserId del cliente ignorados, mensaje de error de dominio).

**Loading/Error UX — completado.** `/campaigns` y `/campaigns/[id]` no tenían `loading.tsx`/`error.tsx` pese a que rutas hermanas (`automations`, `alerts`, `dashboard`, `metrics`, `tasks`) sí los tienen — inconsistencia de convención del proyecto, no un caso ya cubierto por defaults de Next. Se añadieron los 4 archivos siguiendo el mismo patrón (skeleton con `animate-pulse` + boundary con botón "Intentar de nuevo", sin exponer `error.message`). `not-found.tsx` ya existía a nivel de app y ya lo usa `[id]/page.tsx` vía `notFound()` — no se dupicó.

**Resto de la auditoría (roles, detail route, list, create manual/AI, regenerate, approval UI, compliance, env, default models, security sweep, dead code):** verificado contra código real, sin hallazgos nuevos — ver tabla de entrega de la auditoría (fuera de este documento, reportada directamente al usuario) para el detalle PASS/FIXED NOW por requisito.

**Smoke manual reportado por el usuario (Campaign Studio, runtime local), previo a esta auditoría:**
- Manual: draft → review → rejected ✅; nota de rechazo persistida ✅; historial de aprobación ✅; draft → review → approved ✅; sin publicación externa ✅.
- Gemini: generación inicial con IA ✅; contenido estructurado generado ✅; persistencia del draft ✅; regeneración ✅; fix de retry/timeout ✅; presupuesto 150000 COP preservado ✅; nombre de campaña del usuario preservado ✅; regeneración preserva draft/nombre/presupuesto ✅; sin campaña duplicada ✅; sin publicación externa ✅.
- Suite reportada al momento de este smoke: 1501 tests verdes, 0 fallos, typecheck/lint limpios.

**Validación tras el fix:** suite completa 1517/1517 verdes (1501 previos + 16 nuevos), `typecheck`/`lint` limpios en los 9 workspaces (`shared`, `domain`, `application`, `infrastructure`, `ai-engine`, `automation-engine`, `integrations`, `ui`, `apps/web`). Ejecutado en un contenedor efímero (fuente copiada desde el equipo del usuario, `npm ci` con red disponible) porque el `node_modules` de Windows montado en este sandbox tiene binarios nativos de Rollup rotos para Linux (mismo R-ENV-02 de §5) — no se tocó el `node_modules` real del usuario ni se hizo ningún commit/push.
