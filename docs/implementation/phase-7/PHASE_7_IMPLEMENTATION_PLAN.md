# Phase 7 — Plan de Implementación (Campaign Studio)
**Fecha:** 2026-08-16
**Basado en:** `PHASE_7_AUDIT.md` (auditoría de solo lectura sobre commit `3fc9fee`, rama `main`)
**Estado:** propuesta pendiente de aprobación — **nada de lo aquí descrito se ha implementado todavía.**

---

## 7. Reconciliación del roadmap original

| # | Ítem del roadmap original | Clasificación | Evidencia |
|---|---|---|---|
| 7.1 | Crear tablas `campaigns`, `campaign_approvals`, `compliance_rules` | **NOT STARTED** | Ninguna de las tres existe en `supabase/migrations/*.sql` ni en `database.types.ts` (audit §2). |
| 7.2 | Implementar `CampaignRepository` (interfaz + Supabase) | **PARTIAL** | Interfaz completa y ya usada por `listCampaigns` (audit §1.4). Implementación Supabase: 0%. Además, la interfaz actual usa `delete()` físico en vez de soft-delete, inconsistente con el resto del proyecto — requiere ajuste, no solo implementación directa. |
| 7.3 | Use case `createCampaignWithAI` (agente + compliance) | **NOT STARTED**, y es el de mayor riesgo | Solo existe el stub `createCampaignDraft` que retorna `notImplemented` (audit §1.5). El AI Engine que lo soportaría es solo contratos, sin provider implementado (audit §6). |
| 7.4 | Use case `approveCampaign` con audit trail | **NOT STARTED** | No existe el use case. `CampaignStatus` ya tiene `approved`/`rejected`, lo cual ayuda, pero no hay tabla `campaign_approvals` ni columnas de auditoría (`approved_by`, `approved_at`, `rejection_reason`). |
| 7.5 | Use case `rejectCampaign` con nota | **NOT STARTED** | Mismo estado que 7.4. |
| 7.6 | `app/(dashboard)/campaigns/page.tsx` — lista por cliente | **OBSOLETE / REQUIRES REDESIGN** (ruta) + **NOT STARTED** (funcionalidad) | La página existe pero es un placeholder `UnderConstruction` (audit §3), y vive en `app/(protected)/campaigns/page.tsx`, no `app/(dashboard)/...` — el route group correcto en este proyecto es `(protected)`. El ítem del roadmap debe reescribirse con la ruta real antes de implementar. |
| 7.7 | `app/(dashboard)/campaigns/new/page.tsx` — wizard de creación | **OBSOLETE / REQUIRES REDESIGN** (ruta) + **NOT STARTED** (funcionalidad) | Mismo caso: existe como placeholder en `(protected)/campaigns/new/page.tsx`. |
| 7.8 | `app/(dashboard)/campaigns/[id]/page.tsx` — detalle + aprobación | **NOT STARTED** | La ruta `[id]` no existe en absoluto (audit §1.7, §3). Corregir también a `(protected)`. |
| 7.9 | Componente `CampaignApprovalPanel` | **NOT STARTED** | No existe en ningún lugar del código (audit §1.7, §3). |
| 7.10 | Importar reglas de compliance desde `compliance-master-guide.md` a tabla | **NOT STARTED**, pero con diseño más claro de lo que el roadmap original asumía | La guía existe y es rica (422 líneas), pero el roadmap original no contempla que también hay 5 archivos de compliance **por cliente** que se solapan y a veces sobrescriben las reglas globales (audit §5). El ítem debe reescribirse como "importar reglas globales + reglas por cliente con scope diferenciado", no solo la guía maestra. |
| 7.11 | Inngest function `on-campaign-created` — notificación de revisión | **OBSOLETE / REQUIRES REDESIGN** | **El proyecto no usa Inngest en ningún lugar** (`grep -rli inngest` sobre todo el repo, excluyendo node_modules, no arroja resultados). Phase 6 completo se construyó sobre un patrón propio: `automations` + `automation_executions` + gateway n8n + `alerts`/`tasks` para notificación operativa (Phase 6C–6F). La notificación de "campaña creada, pendiente de revisión" debe modelarse con ese mismo patrón (crear una `alert` o `task` al insertar una fila en `campaign_approvals` con estado pendiente, vía trigger de DB o vía el use case `createCampaignWithAI`/`submitCampaignForReview`), no con Inngest. |
| 7.12 | Tests E2E: flujo creación → aprobación | **NOT STARTED** | No hay ningún test de campaigns hoy, ni unitario ni E2E (audit §1.11). No se encontró configuración de Playwright para E2E en este audit (fuera del alcance verificar exhaustivamente el runner de E2E del proyecto; se recomienda confirmarlo al iniciar 7G). |

### Resumen de discrepancias entre roadmap y estado real

1. **Rutas:** el roadmap asume `app/(dashboard)/...`; el proyecto real usa `app/(protected)/...`. Corregir en todos los ítems de UI (7.6–7.9).
2. **Notificaciones:** el roadmap asume Inngest; el proyecto usa un patrón propio de automations + n8n + alerts/tasks construido en Phase 6. 7.11 debe rediseñarse sobre ese patrón, no sobre Inngest.
3. **Compliance:** el roadmap asume una sola fuente (`compliance-master-guide.md`); en la práctica hay reglas globales **y** reglas específicas por cliente que deben coexistir con prioridad clara (cliente > global).
4. **Multi-tenancy:** el roadmap no menciona `organization_id` en absoluto para `campaigns`/`campaign_approvals`/`compliance_rules`, pero es un requisito no negociable en este proyecto (todas las tablas operativas lo tienen, con RLS dependiente de esa columna) — ver §9.
5. **Alcance de "Campaign Studio" vs. campañas externas:** el roadmap no distingue explícitamente entre las campañas que gestiona Campaign Studio (nuevas, con aprobación) y las campañas externas cuyas métricas ya se ingieren en `client_metrics.campaigns` JSONB. Deben quedar como sistemas relacionados pero separados: Phase 7 no reemplaza ni migra el JSONB de métricas.
6. **Delete físico en `CampaignRepository`:** el roadmap no lo menciona, pero la interfaz actual tiene `delete()` físico, inconsistente con el patrón de soft-delete (`deleted_at`) del resto del proyecto — debe corregirse en 7B.

---

## 8. Phase 7 propuesta (subfases 7A–7G)

### 7A — Audit & reconciliation
**Ya completada por esta tarea.** Se documenta aquí solo para que quede como subfase formal del roadmap, igual que Phase 6 tuvo su `PHASE_6_CURRENT_STATE_AUDIT.md`.

- **Objetivo:** tener un inventario verificado del código real vs. el roadmap original antes de escribir una sola línea de implementación.
- **Archivos principales:** `PHASE_7_AUDIT.md`, `PHASE_7_IMPLEMENTATION_PLAN.md`, `PHASE_7_RISK_REGISTER.md` (este set de tres documentos).
- **Dependencias:** ninguna (Phase 6 cerrada).
- **Riesgos:** ninguno — es de solo lectura.
- **Criterios de aceptación:** los tres documentos existen, están basados en evidencia citable (rutas de archivo, líneas), y el usuario aprueba explícitamente antes de avanzar a 7B.

### 7B — Persistence — ✅ IMPLEMENTADO (pendiente de revisión/aprobación — sin commit)
- **Objetivo:** crear el esquema real (`campaigns`, `campaign_approvals`, `compliance_rules`) con multi-tenancy desde el día uno, e implementar `CampaignRepository` sobre Supabase con mapper y tests.
- **Estado:** implementado en la rama `feat/phase-7-campaign-studio` sobre `1955ad0`. Detalle completo (schema exacto, decisiones de diseño, RLS/grants, deuda técnica) en `PHASE_7B_PERSISTENCE_REPORT.md`. **No se aplicó la migración a ningún Supabase (local ni remoto), no se ejecutó `git add`/`commit`** — los cambios quedan en el working tree para revisión, conforme a las restricciones de la tarea.
- **Archivos/tablas creados:**
  - `supabase/migrations/20260816130000_phase7b_campaign_studio_persistence.sql` — `campaigns`, `campaign_approvals`, `compliance_rules` + 4 enums + índices + RLS + triggers (reutiliza `check_client_organization_match`, `protect_child_immutable_fields`, `set_updated_at`; añade `manage_campaign_write` y `check_campaign_organization_match`, ambos siguiendo el patrón existente).
  - `packages/domain/src/entities/campaign.ts` — `organizationId` añadido (obligatorio), más `brief`, `generatedContent`, `metadata`, `createdBy`/`updatedBy`, `submittedForReviewAt`/`approvedAt`/`rejectedAt`; `budget`/`currency`/`startDate`/`endDate` conservados de Phase 1. `canTransitionCampaign`/`getCampaignNextStates`/`isCampaignStatusTerminal` (invariante pura, patrón `canTransitionTask`).
  - `packages/domain/src/entities/campaign-approval.ts`, `compliance-rule.ts` — tipos de dominio, sin repositorio (ver deuda técnica en el reporte).
  - `packages/domain/src/repositories/campaign.repository.ts` — `delete()` retirado del contrato (sin concepto de borrado en las reglas de negocio fijadas); `findById`/`update` ahora requieren `organizationId` explícito (patrón `TaskRepository`/`ClientRepository`).
  - `packages/infrastructure/src/supabase/repositories/supabase-campaign.repository.ts` + `packages/infrastructure/src/supabase/mappers/campaign.mapper.ts`, sobre el patrón de `supabase-task.repository.ts`/`task.mapper.ts`.
  - `packages/shared/src/schemas/campaign.schema.ts` (Zod) — `organizationId`/`createdBy` nunca aceptados del schema.
  - `apps/web/src/lib/supabase/types.ts` (el realmente usado por `server.ts`/`browser.ts`) y `database.types.ts` (orphaned, actualizado igualmente por completitud) — tipos `Campaign*`/`ComplianceRule*` añadidos a mano; **pendiente reemplazar por codegen real una vez aplicada la migración** (comando exacto en el reporte).
  - Tests: dominio (20), schema Zod (19), mapper (12), repositorio (14), use case (8) — 73 tests nuevos, todos verdes. Detalle de ejecución (lint/typecheck/test por paquete) en el reporte.
- **`createCampaignDraft`:** implementado de verdad (ya no es un stub `notImplemented`) — valida input, verifica que el cliente exista y pertenezca a la organización, crea la campaña en `draft` vía `CampaignRepository`. No llama IA, no llama n8n, no publica nada.
- **Dependencias:** ninguna externa; solo dependía de que 7A estuviera aprobada.
- **Riesgos:** ver `PHASE_7_RISK_REGISTER.md` (R-DOM-01, R-DOM-02 — ambos resueltos en esta subfase) y la sección "Cambios de estado sensibles" del reporte (mitigación de RLS para approved/rejected, deuda formal para la RPC dedicada de 7C).
- **Criterios de aceptación:** migración re-ejecutable (idempotente); `CampaignRepository` implementado con tests pasando; `lint`/`typecheck`/`test` verdes en `domain`, `shared`, `application`, `infrastructure` y `apps/web` (typecheck); ningún dato de producción tocado, migración no aplicada a ningún Supabase — pendiente de que el usuario apruebe y aplique manualmente.

### 7C — Approval + Compliance — ✅ IMPLEMENTADO (pendiente de revisión/aprobación — sin commit)
- **Objetivo:** flujo `draft → review → approved/rejected` con audit trail, y lectura/evaluación determinística (no IA) de `compliance_rules`.
- **Estado:** implementado en la rama `feat/phase-7-campaign-studio` sobre `ba64c09` (7B). Detalle completo (diseño de RPC, hardening SECURITY DEFINER, decisión de retirar el INSERT directo en `campaign_approvals`, limitación documentada del evaluador de compliance) en `PHASE_7C_APPROVAL_COMPLIANCE_REPORT.md`. **No se aplicó la migración a ningún Supabase (local ni remoto), no se ejecutó `git add`/`commit`.**
- **Archivos/tablas creados:**
  - `supabase/migrations/20260816140000_phase7c_campaign_approval_workflow.sql` — RPCs `SECURITY DEFINER` `approve_campaign(p_campaign_id)`/`reject_campaign(p_campaign_id, p_note)` (auth.uid() obligatorio, `FOR UPDATE`, verificación de rol `admin`+ y de status `review` dentro de la RPC, INSERT atómico en `campaign_approvals`); retira la policy `campaign_approvals_insert` y el `GRANT INSERT` directo a `authenticated` (la única escritura válida del audit trail pasa a ser exclusivamente vía RPC); `GRANT EXECUTE` solo a `authenticated`, `REVOKE` de `PUBLIC`/`anon`. No modifica ni la tabla `campaigns` (`ALTER`) ni la migración 7B — es puramente aditiva.
  - `packages/domain/src/repositories/campaign-approval.repository.ts`, `compliance-rule.repository.ts` — contratos nuevos (solo lectura; ver justificación de por qué `CampaignApprovalRepository` no tiene `create` en el reporte).
  - `packages/domain/src/entities/campaign-approval.ts` — `isValidRejectionNote`. `compliance-rule.ts` — `ComplianceRuleFilter`, `resolveComplianceRulePrecedence` (cliente > organización > global), `evaluateCampaignCompliance` (determinístico, NO IA — ver limitación documentada en el reporte).
  - `packages/domain/src/repositories/campaign.repository.ts` — `approve`/`reject` añadidos al contrato (mismo patrón que `AlertRepository.acknowledge`/`resolve`).
  - `packages/infrastructure/src/supabase/repositories/supabase-campaign-approval.repository.ts`, `supabase-compliance-rule.repository.ts` + mappers — `SupabaseCampaignRepository.approve`/`reject` llaman a las RPCs (nunca `UPDATE` directo).
  - Use cases: `submit-campaign-for-review.use-case.ts` (sin RPC — la policy `campaigns_update` de 7B ya cubre draft→review), `approve-campaign.use-case.ts`, `reject-campaign.use-case.ts`, `list-campaign-approvals.use-case.ts`, `get-applicable-compliance-rules.use-case.ts`, `evaluate-campaign-compliance.use-case.ts`.
  - `packages/shared/src/schemas/campaign.schema.ts` — `submitCampaignForReviewSchema`, `approveCampaignSchema`, `rejectCampaignSchema` (nota obligatoria no vacía), `complianceRuleFilterSchema`.
  - `apps/web/src/lib/supabase/types.ts`/`database.types.ts` — RPCs `approve_campaign`/`reject_campaign` documentadas en `Functions`; nota sobre el `GRANT INSERT` retirado en `campaign_approvals`.
  - Tests: dominio (+22: invariantes de rechazo, precedencia/evaluación de compliance), aplicación (+54 en `campaigns`: submit/approve/reject/list/compliance), infraestructura (+74: mappers, repositorios, y 16 tests estáticos de seguridad de la migración) — todos verdes. Detalle de ejecución en el reporte.
- **¿Compliance bloquea approve?** NO — no existe una regla de negocio fijada que lo exija (ver §10 del reporte); `evaluateCampaignCompliance` es puramente informativo en 7C, expuesto para que 7D/UI lo consuman.
- **Dependencias:** 7B (tablas y repositorio ya existían).
- **Riesgos:** R-SEC-02 (roles de aprobación mal definidos) y R-TECH-01 (validador de transición ausente) — **ambos resueltos en esta subfase**, ver `PHASE_7_RISK_REGISTER.md`.
- **Criterios de aceptación:** una campaña en `review` puede pasar a `approved`/`rejected` solo por `admin`/`owner` (verificado en la RPC y en el use case, defensa en profundidad); cada decisión queda registrada en `campaign_approvals` con actor (`auth.uid()`, nunca del cliente) y timestamp server-side; `operator`/`strategist`/`viewer` no pueden aprobar/rechazar (test cubierto); rechazo sin nota (o solo espacios) rechazado en tres capas (Zod, dominio, RPC/CHECK); `lint`/`typecheck`/`test` verdes en `domain`, `shared`, `application`, `infrastructure` y `apps/web` (typecheck); ningún dato de producción tocado, migración no aplicada a ningún Supabase — pendiente de que el usuario apruebe y aplique manualmente.

### 7D — AI Campaign Builder — ✅ IMPLEMENTADO (pendiente de revisión/aprobación — sin commit)
- **Objetivo:** implementar `generateCampaignDraftWithAI` end-to-end: recibe brief mínimo (cliente, objetivo, plataforma, presupuesto), inyecta contexto (brand profile del cliente si existe, reglas de compliance activas), genera estructura de campaña + copy con salida estructurada validada, y crea la campaña **siempre en estado `draft`** (nunca `review`/`approved`/`active`, ni publicación externa — corrección respecto a la formulación original de este ítem, que asumía estado `review`; mover a `review` sigue siendo una acción explícita y separada del usuario vía `submitCampaignForReview`, ya implementado en 7C).
- **Estado:** implementado en la rama `feat/phase-7-campaign-studio` sobre `6d3623d` (7C). Detalle completo (arquitectura de IA, elección de provider/SDK, prompt builder versionado, schema de `generated_content`, integración con compliance, fix de persistencia, mapeo de errores, revisión de seguridad, tests reales por paquete) en `PHASE_7D_AI_CAMPAIGN_BUILDER_REPORT.md`. **No se aplicó ninguna migración (no fue necesaria — se reutilizan las columnas `campaigns.generated_content`/`campaigns.metadata` ya creadas en 7B), no se ejecutó `git add`/`commit`.**
- **Archivos/tablas creados:**
  - `packages/domain/src/entities/campaign-generated-content.ts` — `CampaignGeneratedContent` (unión discriminada `meta_ads`/`google_ads`), `GENERATED_CONTENT_SCHEMA_VERSION = 'campaign-content-v1'`, `SUPPORTED_GENERATION_PLATFORMS`, `isSupportedGenerationPlatform()`, `AIGenerationMetadata`.
  - `packages/domain/src/errors/domain.errors.ts` — nuevos errores `clientInactive`, `unsupportedCampaignPlatform`, `campaignGenerationUnavailable`, `invalidAiOutput`, `aiProviderFailure`, `aiGenerationTimeout`, `aiRateLimited`, `campaignRegenerationNotAllowed`, `campaignBriefRequired`.
  - `packages/shared/src/schemas/campaign-generated-content.schema.ts` — validación Zod (`discriminatedUnion('platform', ...)`) de la salida de IA, con límites de plataforma reales (p.ej. Google RSA: 3–15 headlines de máx. 30 caracteres, 1–4 descriptions de máx. 90).
  - `packages/shared/src/schemas/campaign.schema.ts` — `generateCampaignDraftWithAiSchema`, `regenerateCampaignContentSchema`.
  - `packages/application/src/ports/campaign-generator.port.ts` — `CampaignGeneratorPort` (patrón idéntico a `WorkflowDispatcherPort`), implementado en infraestructura.
  - `packages/application/src/use-cases/campaigns/generate-campaign-draft-with-ai.use-case.ts` — reemplaza/extiende el stub `createCampaignDraft`. Un único `campaignRepository.create()`; la campaña generada queda **siempre en `draft`**.
  - `packages/application/src/use-cases/campaigns/regenerate-campaign-content.use-case.ts` — regeneración de contenido para una campaña propia existente (solo `draft`, mismo org, `operator`+); un único `campaignRepository.update()`; falla de IA no destruye el `generated_content` previamente persistido ni crea una campaña nueva.
  - `packages/infrastructure/src/ai/claude-api.provider.ts` — `ClaudeAPIProvider implements AIProvider` (contrato ya definido en `packages/ai-engine`). SDK: **ninguno** — `fetch` nativo con `AbortController` a la Messages API de Anthropic, siguiendo el mismo patrón ya usado por `n8n-webhook-dispatcher.ts` ("no instalar axios"). Variables de entorno: `ANTHROPIC_API_KEY` (obligatoria; sin llamar a `fetch` si falta), `ANTHROPIC_MODEL` (default `claude-3-5-sonnet-20241022`), `ANTHROPIC_API_VERSION`, `CAMPAIGN_AI_TIMEOUT_MS` (default 30000ms).
  - `packages/infrastructure/src/ai/campaign-prompt-builder.ts` — prompt builder separado y versionado (`CAMPAIGN_BUILDER_PROMPT_VERSION = 'campaign-builder-v1'`), con secciones de política de sistema, contexto de cliente, brief, contexto de compliance y contrato de salida específico por plataforma; prohíbe explícitamente inventar precios/certificaciones/testimonios/garantías.
  - `packages/infrastructure/src/ai/campaign-generator.adapter.ts` — `CampaignGeneratorAdapter implements CampaignGeneratorPort`; valida la salida del modelo con `campaignGeneratedContentSchema.safeParse` (nunca `as CampaignGeneratedContent` sin parseo) antes de retornarla a application; salida inválida nunca se persiste.
  - `packages/infrastructure/src/supabase/repositories/supabase-campaign.repository.ts` — **fix de regresión de 7B**: `create()`/`update()` no forwardeaban `generated_content` a Supabase pese a existir la columna desde 7B; corregido (con `update()` condicional para no pisar con `null` actualizaciones de 7B/7C que no tocan `generatedContent`).
  - `packages/infrastructure/package.json` — única dependencia nueva en todo el repo: `@bop-agency/ai-engine` (sin cambios de lockfile — ya estaba symlinkeado por npm workspaces).
  - Tests nuevos/ampliados (ver conteo real por paquete en `PHASE_7D_AI_CAMPAIGN_BUILDER_REPORT.md` §15): dominio, schemas Zod, puerto/use cases de aplicación (generate + regenerate), provider Claude, prompt builder, adapter, y regresión de persistencia del repositorio Supabase — todos verdes en los paquetes que pudieron ejecutarse dentro del límite de tiempo de la herramienta (ver limitación documentada de `apps/web` en el reporte).
- **¿La IA aprueba/publica algo?** NO — la IA solo genera contenido en `draft`; la evaluación de compliance sigue siendo la función determinística de 7C (`evaluateCampaignCompliance`, no-IA); mover a `review`/`approved`/`active` sigue exigiendo los use cases humanos ya existentes de 7C; ninguna llamada a APIs externas de publicación (Meta/Google/YouTube).
- **Dependencias:** 7B (persistencia, columnas `generated_content`/`metadata` ya existentes) y 7C (compliance rules disponibles para inyectar como contexto).
- **Riesgos:** R-TECH-03, R-SEC-03, R-SEC-04 — **resueltos en esta subfase**, ver `PHASE_7_RISK_REGISTER.md`. Riesgos nuevos/diferidos para 7E/7F documentados también en el risk register (plataformas no soportadas más allá de `meta_ads`/`google_ads`, sin historial de regeneraciones, doble constante de versión de schema, suite de tests de `apps/web` no verificada end-to-end en esta sesión).
- **Criterios de aceptación:** dado un brief válido, el use case produce una campaña **en estado `draft`** con `generated_content` validado por Zod, sin llamar nunca a ninguna API externa de publicación; errores del proveedor de IA se manejan como `Result` de error, no excepciones sin capturar (mapeados a errores de dominio específicos: rate limit, timeout, no configurado, salida inválida); todos los tests usan el `AIProvider`/`CampaignGeneratorPort` mockeado o fake (nunca golpear la API real).

### 7D.1 — Multi-provider AI foundation — ✅ IMPLEMENTADO (pendiente de revisión/aprobación — sin commit)
- **Objetivo:** permitir que Campaign Studio genere/regenere con **OpenAI**, **Google Gemini** o **Anthropic Claude**, seleccionable por campaña/generación, sin cambiar `CampaignGeneratorPort`, el schema de `generated_content`, compliance, el workflow de aprobación ni el comportamiento de persistencia.
- **Estado:** implementado en la rama `feat/phase-7-campaign-studio` sobre `5605823` (7D), junto al working tree de 7E. Detalle completo en `PHASE_7D1_MULTI_PROVIDER_AI_REPORT.md`. **Sin migración (ninguna necesaria), sin `git add`/commit, sin dependencias nuevas.**
- **Piezas principales:**
  - `packages/shared/src/constants/ai-providers.ts` — fuente única de `AI_PROVIDER_IDS` / `AIProviderId` / `AI_PROVIDER_LABELS` / `isAIProviderId` / `DEFAULT_AI_PROVIDER_ID`.
  - `packages/infrastructure/src/ai/ai-provider-config.ts` — ÚNICO punto de lectura de env de IA (`CAMPAIGN_AI_DEFAULT_PROVIDER`, `*_API_KEY`, `*_MODEL`, `ANTHROPIC_API_VERSION`, `CAMPAIGN_AI_TIMEOUT_MS`). Ninguna variable con prefijo `NEXT_PUBLIC_`.
  - `packages/infrastructure/src/ai/campaign-ai-provider.factory.ts` — `createCampaignAIProvider(providerId?)`, ÚNICO switch por proveedor del repo.
  - `packages/infrastructure/src/ai/openai-api.provider.ts` y `gemini-api.provider.ts` — `fetch` nativo + `AbortController`, salida JSON estructurada, usage mapeado, errores saneados. **Cero SDKs nuevos.**
  - `packages/infrastructure/src/ai/provider-http.ts` — factorías de error compartidas por los tres proveedores (mismo `code`/`details.reason` que 7D).
  - `ClaudeAPIProvider` **conservado** (mismo nombre, misma suite de tests verde) + alias `AnthropicAPIProvider`.
  - `CampaignGeneratorAdapter` resuelve el proveedor **por llamada** y conserva la forma de constructor de 7D.
  - `GenerateCampaignInput.provider?: AIProviderId` (el puerto NO cambia de firma); `provider` opcional en `generateCampaignDraftWithAiSchema`/`regenerateCampaignContentSchema` (`z.enum` cerrado).
  - UI 7E: `AIProviderSelect` en el wizard (solo modo IA) y en el detalle al regenerar (default = proveedor original de la campaña). **Sin selector de modelo.**
  - Errores normalizados vía `AppError.details.aiErrorKind` (`AI_PROVIDER_NOT_CONFIGURED`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_EXTERNAL_SERVICE_ERROR`, `AI_INVALID_OUTPUT`, `AI_UNSUPPORTED_PROVIDER`) — sin ampliar el union cerrado `ErrorCode`.
- **Migraciones:** NINGUNA. `campaign.metadata.ai` (JSONB, desde 7B) ya alojaba `provider`/`model`; los datos de 7D tienen `provider: 'anthropic'`, válido como `AIProviderId`.
- **Sin fallback automático** entre proveedores y **sin compare mode** — ambos diferidos deliberadamente, con el punto de extensión documentado.
- **Tests:** 49 nuevos; suite completa ejecutada: 1432 tests verdes en `shared` (93), `domain` (217), `application` (302), `infrastructure` (474) y `apps/web` (346). `tsc --noEmit` y `eslint` limpios en los cinco paquetes.
- **Dependencias:** ninguna nueva (`package.json`/`package-lock.json` sin cambios).
- **Riesgos:** R-SEC-05, R-SEC-06, R-OPS-01, R-TECH-10, R-TECH-11 nuevos; R-TECH-12 resuelto. Ver `PHASE_7_RISK_REGISTER.md`.
- **Criterios de aceptación:** el usuario puede elegir OpenAI / Gemini / Anthropic al generar y al regenerar; el `generated_content` de los tres pasa por el mismo Zod antes de persistir; `metadata.ai` registra qué IA generó cada campaña; un proveedor sin configurar produce un error explícito (nunca un cambio silencioso de proveedor); ninguna key, modelo ni URL de API se acepta desde el browser.

### 7E — Campaign Studio UI — ✅ IMPLEMENTADO (pendiente de revisión/aprobación — sin commit)
- **Objetivo:** reemplazar los placeholders `UnderConstruction` con la experiencia real: listado por cliente, wizard de creación (brief → generación IA → revisión), página de detalle con `CampaignApprovalPanel`.
- **Estado:** implementado en la rama `feat/phase-7-campaign-studio` sobre `5605823` (7D). Detalle completo (archivos, decisiones de diseño, verificación tsc/eslint, limitaciones de entorno para correr `vitest` en esta sesión) en `PHASE_7E_CAMPAIGN_STUDIO_UI_REPORT.md`. No se creó ninguna migración (no era necesaria), no se ejecutó `git add`/`commit`.
- **Archivos/tablas principales:**
  - `apps/web/src/app/(protected)/campaigns/page.tsx` (reescribir, conectar a `listCampaigns` real vía composition root).
  - `apps/web/src/app/(protected)/campaigns/new/page.tsx` (wizard conectado a `generateCampaignDraftWithAI`/`regenerateCampaignContent`).
  - `apps/web/src/app/(protected)/campaigns/[id]/page.tsx` (nueva).
  - `apps/web/src/components/campaigns/CampaignApprovalPanel.tsx` (nuevo).
  - `apps/web/src/lib/composition/campaign.composition.ts` (nuevo, patrón `automation.composition.ts`).
  - Retirar o dejar explícitamente marcado como código muerto `demoCampaigns` en `placeholder-data.ts` una vez la UI real esté conectada.
- **Dependencias:** 7B, 7C, 7D (necesita datos reales y el flujo de aprobación funcionando).
- **Riesgos:** R-UX-01 (exponer error interno del LLM al usuario final).
- **Criterios de aceptación:** un usuario con rol suficiente puede crear una campaña, verla en `review`, y otro usuario con rol de aprobación puede aprobarla o rechazarla con nota, todo contra Supabase de staging (no producción).

### 7F — Automation / notifications — ✅ IMPLEMENTACIÓN + RUNTIME SMOKE COMPLETO (pendiente de revisión/aprobación — sin commit)
- **Objetivo:** notificar cuando una campaña pasa a `review` (creada) y cuando se decide (aprobada/rechazada), reutilizando exactamente el runtime de `tasks`/`alerts` de Phase 6 — sin n8n, sin Inngest, sin publicación externa.
- **Estado:** implementado en la rama `feat/phase-7-campaign-studio` sobre `8506790` (7E), con un bug real detectado y corregido en smoke (`created_by` no-UUID rompía la creación de task — ver `PHASE_7F_CAMPAIGN_AUTOMATION_REPORT.md` §18b), y **runtime smoke manual ejecutado y en PASS (4/4)** contra el fix (§18c del mismo reporte): `campaign_review_requested`, `campaign_rejected`, `campaign_approved`, `campaign_ai_provider_failure` — cada uno verificado con evidencia directa de BD (conteo exacto de filas, `created_by` UUID real, `alert_key` determinístico, sin duplicados en refresh). **1549 tests passed / 0 failed** ejecutados por el usuario en Windows (`shared` 106, `domain` 229, `application` 356, `infrastructure` 502, `apps/web` 356, `automation-engine` 0); `typecheck`/`lint` limpios en `packages/application`, `apps/web`, `packages/infrastructure` (Windows) y en los demás workspaces (verificado antes por Claude en el puente Linux). No se creó ninguna migración. No se ejecutó `git add`/`commit`. **Nota:** esto NO cierra Phase 7 — 7G (E2E/closure) sigue pendiente.
- **Archivos/tablas principales:**
  - `packages/application/src/use-cases/campaigns/campaign-automation-types.ts` (nuevo) — tipos cerrados de evento/automatización.
  - `packages/application/src/use-cases/campaigns/campaign-automation-signatures.ts` (nuevo) — idempotency keys / signature tags, espejo de `automation-incident-signatures.ts` (6F).
  - `packages/application/src/use-cases/campaigns/evaluate-campaign-automation.use-case.ts` (nuevo) — evaluador determinístico, espejo de `evaluate-automation-incident.use-case.ts` (6F).
  - `packages/application/src/use-cases/campaigns/campaign-automation-dispatch.ts` (nuevo) — helper best-effort/post-commit (`evalCampaignAutomationSilently`), espejo de `evalIncidentSilently`.
  - `submit-campaign-for-review.use-case.ts` / `approve-campaign.use-case.ts` / `reject-campaign.use-case.ts` (modificados) — hook post-commit.
  - `generate-campaign-draft-with-ai.use-case.ts` / `regenerate-campaign-content.use-case.ts` (modificados) — alerta de fallo de proveedor de IA (vía `getAiErrorKind`, ya existente de 7D.1).
  - `apps/web/src/lib/composition/campaign.composition.ts` (modificado) — wiring de `SupabaseAlertRepository`/`SupabaseTaskRepository` (ya existentes, Phase 6) con el client de sesión del usuario (NO service_role).
  - `apps/web/src/components/campaigns/CampaignAutomationActivity.tsx` (nuevo) + `apps/web/src/app/(protected)/campaigns/[id]/page.tsx` (modificado) — sección "Actividad / Automatización" de solo lectura.
  - Ningún `CampaignAutomationRuntimeV2`/`CampaignTaskTable`/`CampaignAlertTable` nuevo — se reutilizan `tasks`/`alerts` tal cual.
- **Dependencias:** 7C (RPCs approve/reject), 7D.1 (`getAiErrorKind`).
- **Riesgos:** ver R-TECH-14, R-OPS-04, R-TECH-15 (bug de smoke, resuelto) en `PHASE_7_RISK_REGISTER.md`.
- **Criterios de aceptación:** enviar a revisión / rechazar / aprobar una campaña crea exactamente una tarea operativa la primera vez y ninguna en reintentos (idempotencia por `alert_key`/signature tag); un fallo del proveedor de IA crea/actualiza una alerta (nunca una tarea) sin bloquear la respuesta de error al usuario; ningún flujo llama a Meta/Google/YouTube/email/redes sociales/n8n.

### 7G — E2E / closure
- **Objetivo:** cubrir el flujo creación → revisión → aprobación/rechazo con un test E2E, y cerrar Phase 7 con el mismo estándar de documentación que Phase 6 (`PHASE_7_CLOSURE_REPORT.md`, checklist de producción, security model).
- **Archivos/tablas principales:** test E2E (confirmar runner real del proyecto al iniciar esta subfase — no asumido en esta auditoría); `docs/implementation/phase-7/PHASE_7_CLOSURE_REPORT.md`.
- **Dependencias:** 7B–7F completas.
- **Riesgos:** ninguno nuevo — es la subfase de verificación.
- **Criterios de aceptación:** test E2E verde en staging; checklist de producción documentado (sin ejecutarlo); ningún cambio en producción como parte de Phase 7 (la publicación real a Meta/Google/YouTube queda fuera, es fase posterior según el propio roadmap).

---

## 9. Seguridad / Multi-tenancy (diseño, no implementación)

Basado en el patrón ya consolidado en Phase 2–6 (`is_organization_member(organization_id)`, `has_organization_role(organization_id, role)`, `USER_ROLES = ['owner','admin','strategist','operator','viewer']`):

- **`organization_id` obligatorio:** las tres tablas nuevas (`campaigns`, `campaign_approvals`, `compliance_rules`) deben tener `organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE`, indexado, igual que `tasks`/`client_metrics`. Esto corrige el gap detectado en la entidad `Campaign` actual (audit §1.1), que no lo tiene.
- **`client_id`:** `campaigns.client_id` sigue el patrón de `tasks.client_id` — `NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT` (una campaña siempre pertenece a un cliente; no se permite borrado físico del cliente mientras tenga campañas). `compliance_rules.client_id` debe ser **nullable** (`NULL` = regla global, no-`NULL` = regla específica de cliente, con precedencia de cliente sobre global — ver audit §5).
- **RLS:** replicar el patrón exacto de `clients`/`client_contacts`: `SELECT` para cualquier `is_organization_member(organization_id)` con `deleted_at IS NULL`; `INSERT`/`UPDATE` con `has_organization_role(organization_id, <rol mínimo>)`; sin `DELETE` físico expuesto a `authenticated` (soft-delete vía `UPDATE` o RPC dedicada, como `soft_delete_client`).
- **Roles permitidos para crear** (`campaigns` en `draft`, y disparar `createCampaignWithAI`): propuesta `operator` o superior (mismo mínimo que `clients_insert_operator`) — **a confirmar con el usuario**, ya que es una decisión de negocio, no solo técnica.
- **Roles permitidos para aprobar/rechazar** (`campaign_approvals`): propuesta `admin` o superior — más restrictivo que crear, porque aprobar mueve una campaña hacia publicación eventual (fase posterior) y compromete presupuesto/reputación del cliente. **A confirmar con el usuario** antes de escribir la migración de RLS.
- **Audit trail:** `created_by`/`updated_by` en `campaigns` (patrón `tasks`), y `campaign_approvals` como tabla de eventos append-only (`decided_by`, `decided_at`, `decision`, `note`) en vez de solo sobrescribir un campo `status` — así se preserva el historial completo de decisiones, no solo la última.
- **`service_role` solo donde sea necesario:** ningún flujo de Campaign Studio en 7B–7E requiere `service_role` — todas las mutaciones pasan por `requireOrganizationRole` + RLS con el usuario autenticado, igual que `automations/actions.ts`. Si 7F termina enrutando notificaciones por el webhook de n8n existente, el uso de `service_role` debe quedar limitado exactamente al mismo punto ya auditado y probado en Phase 6C (`apps/web/src/app/api/webhooks/n8n/route.ts`, después de verificar HMAC) — no se abre ningún nuevo uso de `service_role`.
- **No publicar campañas externamente en Phase 7:** ninguna subfase de 7B–7G integra `AdvertisingPlatformProvider` para *escribir* en Meta/Google/YouTube — ese provider hoy solo tiene métodos de lectura (`getAccountMetrics`, `getCampaigns`) para ingesta de métricas (audit §2A), y así debe permanecer durante Phase 7. La publicación real es, tal como dice el propio roadmap, una fase posterior (ítem 11, "Publicación de Campañas").

---

## Primer bloque recomendado después de aprobar este plan

**7B — Persistence**, empezando específicamente por:
1. Decidir con el usuario los roles exactos de "crear" y "aprobar/rechazar" (única decisión de negocio pendiente antes de poder escribir la migración de RLS completa).
2. Escribir la migración `campaigns` + `campaign_approvals` + `compliance_rules` con `organization_id` obligatorio desde el diseño.
3. Actualizar la entidad `Campaign` en domain para incluir `organizationId`.
4. Implementar `SupabaseCampaignRepository` + mapper + tests, corrigiendo `delete()` a soft-delete.

Ningún paso de este bloque toca producción ni ejecuta migraciones — eso requiere aprobación explícita adicional del usuario en su momento, conforme a las restricciones de esta tarea.
