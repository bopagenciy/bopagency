# Phase 7D — AI Campaign Builder — Reporte de Implementación

**Fecha:** 2026-08-16
**Rama:** `feat/phase-7-campaign-studio`
**Base:** `6d3623d feat(phase-7): add campaign approval and compliance workflow` (Phase 7C)
**Estado:** ✅ IMPLEMENTADO (pendiente de revisión/aprobación — sin `git add`/commit, sin migración, sin tocar producción)

---

## 0. Precheck / recuperación de estado

- Branch confirmado: `feat/phase-7-campaign-studio`.
- `HEAD` confirmado: `6d3623d feat(phase-7): add campaign approval and compliance workflow`.
- `git status --short` antes de empezar 7D: limpio salvo `?? .agencia-ai/.claude/commands/new-client.md` (archivo ajeno, fuera de alcance, no tocado en ningún momento).
- Recuperación de estado a mitad de sesión (tras un límite de contexto): se re-ejecutó `git branch --show-current` / `git log -1 --oneline` / `git status --short` / `git diff --stat` contra el working tree real del dispositivo del usuario, en vez de confiar en la memoria de la sesión anterior. El resultado coincidió exactamente con lo que la sesión creía haber hecho — no se encontró ningún archivo faltante, duplicado, ni inconsistente. Ver §20 para el `git status --short` final.
- **Nota de entorno:** durante `git status`/`git diff` se observó un warning `unable to unlink '.git/index.lock': Operation not permitted`. Es una restricción conocida del bridge al dispositivo del usuario (no puede hacer `unlink` sobre archivos en la carpeta montada) — no bloqueó ni corrompió ninguna operación de git en esta sesión (se verificó ejecutando varios `git status`/`git diff` consecutivos, todos con resultado correcto), pero se documenta como riesgo operativo de entorno, no de código.

---

## 1. Auditoría de arquitectura de IA (antes de escribir código)

| Componente | Existe | Estado (pre-7D) | Reutilizar/Extender/Crear | Riesgo |
|---|---|---|---|---|
| `AIProvider`/`AIRequest`/`AIResponse`/`AIUsage` (contratos) | Sí | 100% contratos, cero implementación (`packages/ai-engine`) | **Extender** — implementar el contrato, no rediseñarlo | Bajo — contrato ya estable, usado tal cual |
| Provider real (Claude/OpenAI/etc.) | No | No existía ninguna dependencia de SDK de IA en todo el repo (`grep` sin resultados) | **Crear** — `ClaudeAPIProvider` vía `fetch` nativo | Medio — mitigado con tests de mapeo de errores/timeouts |
| Prompt handling | No | `PromptReference`/`renderPrompt` (contratos) sin ningún caller real | **Crear** — prompt builder propio, versionado, no usa `renderPrompt` (ver §5) | Bajo |
| Salida estructurada / JSON schema | No | Nada | **Crear** — `campaignGeneratedContentSchema` (Zod, discriminated union) | Bajo — validación estricta antes de persistir |
| Token usage / costo / modelo | No | `AIUsage` es un tipo, nunca se persiste en ningún lado | **Crear** — `campaigns.metadata.ai.tokenUsage` por generación (sin tabla nueva) | Bajo — resuelve R-SEC-04, ver §14 |
| Tracing | No | Nada | **No creado** — fuera de alcance de 7D, deferido (ver §19) | — |
| Retry | No | Ningún adapter del proyecto reintenta automáticamente (`N8nWebhookDispatcher` confirmado: 1 intento + timeout) | **No creado** — mismo criterio que el resto del proyecto (ver §13) | Bajo — persistencia solo tras validar output, reintento es seguro desde el caller |
| Rate limiting | No | Nada | **No creado en el provider** — se mapea el 429 real de Anthropic a `RATE_LIMITED`, no se implementa un limitador propio | Bajo |
| Mock/in-memory provider para tests | No | Nada | **No fue necesario crear uno dedicado** — los tests usan un `AIProvider` fake inline (mismo patrón que otros tests de puertos del proyecto) | — |

**Conclusión de la auditoría:** `packages/ai-engine` seguía siendo 100% contratos antes de esta tarea — ninguna suposición de "ya hay un provider" resultó cierta. Todo lo listado como "Crear" se implementó en `packages/infrastructure/src/ai/` (nunca dentro de `ai-engine`, que permanece como solo-contratos, y nunca en `application`/`domain`).

---

## 2. Clasificación de skills legacy (`.agencia-ai/.claude/skills/*`)

Auditados como **material de referencia únicamente** — ninguno se ejecutó, ninguno se importó automáticamente, ningún texto de prompt se copió literalmente.

| Skill | Clasificación | Nota |
|---|---|---|
| `meta-ads-campaign-builder` | MIGRATE_PROMPT_STRUCTURE | Informó la estructura de `adSets`/`creatives`/`audienceType` del schema y el contrato de salida de Meta en el prompt builder — no se copió el prompt original. |
| `google-ads-campaign-builder` | MIGRATE_PROMPT_STRUCTURE | Informó `adGroups`/`headlines`(30 car.)/`descriptions`(90 car.) — límites reales de Responsive Search Ads, replicados como validación Zod real, no solo mencionados. |
| `youtube-ads-campaign-builder` | DEFER | Plataforma no implementada en 7D (ver §7) — el skill queda como referencia para cuando se implemente. |
| `meta-ads-compliance-review` | REUSE_AS_REFERENCE | Informó el tipo de lenguaje/instrucciones que debía llevar la sección de compliance del prompt (no inventar cumplimiento, marcar notas) — no se migró ninguna regla estructurada (`compliance_rules` sigue narrativo, ver §8). |
| `client-brand-profile` | REUSE_AS_REFERENCE | Es un cuestionario manual en markdown, NO una fuente de datos estructurada/consultable — informó qué campos de "perfil de marca" tiene sentido pedir, pero la fuente real de datos en 7D es `ClientRepository.getDocumentByKey` (repositorio real, Phase 3), no este skill. |
| `finance-marketing-compliance` | REUSE_AS_REFERENCE | Contexto de qué tipo de afirmaciones evitar en industria financiera — informó las reglas duras del prompt ("no prometer resultados", "no inventar tasas/condiciones"). |
| `health-marketing-compliance` | REUSE_AS_REFERENCE | Mismo criterio, industria salud — informó "no inventar certificaciones/testimonios". |
| `bilingual-campaign-builder` | REUSE_AS_REFERENCE | Confirmó que el patrón correcto es "un idioma por generación, explícito" (campo `language`), no generación bilingüe simultánea — 7D sigue ese criterio. |
| `local-business-campaign` | ARCHIVE | Sin generalización clara aplicable al 7D actual (negocio local es un caso particular de `meta_ads`/`google_ads`, no una plataforma nueva) — no informó ningún cambio de diseño. |
| `luxury-brand-campaign` | ARCHIVE | Mismo criterio — tono de marca específico, ya cubierto por el campo `brandProfile` genérico. |
| `campaign-performance-analysis` | ARCHIVE (fuera de alcance) | Es sobre análisis de performance post-publicación, no generación — no aplica a 7D. |

Ningún comando legacy (`.agencia-ai/.claude/commands/*`) fue ejecutado ni leído más allá de la exclusión explícita de `new-client.md`.

---

## 3. Archivos creados/modificados

### Dominio (`packages/domain`)
- **Nuevo** `src/entities/campaign-generated-content.ts` — `CampaignGeneratedContent` (discriminated union `MetaAdsGeneratedContent | GoogleAdsGeneratedContent`), `SUPPORTED_GENERATION_PLATFORMS`/`isSupportedGenerationPlatform`, `AIGenerationMetadata`, `GENERATED_CONTENT_SCHEMA_VERSION`.
- **Modificado** `src/entities/campaign.ts` — `generatedContent?` añadido a `CreateCampaignInput`/`UpdateCampaignInput` (el resto de la entidad, sin cambios desde 7C).
- **Modificado** `src/errors/domain.errors.ts` — `clientInactive`, `unsupportedCampaignPlatform`, `campaignGenerationUnavailable`, `invalidAiOutput`, `aiProviderFailure`, `aiGenerationTimeout`, `aiRateLimited`, `campaignRegenerationNotAllowed`, `campaignBriefRequired`. Ningún `ErrorCode` nuevo — todos reutilizan el union existente (`VALIDATION_ERROR`/`EXTERNAL_SERVICE_ERROR`/`RATE_LIMITED`).
- **Modificado** `src/index.ts` — exports de lo anterior.
- **Nuevo** `src/__tests__/campaign-generated-content.test.ts` — 6 tests.

### Shared (`packages/shared`)
- **Nuevo** `src/schemas/campaign-generated-content.schema.ts` — `campaignGeneratedContentSchema` (Zod `discriminatedUnion`), espejo exacto del tipo de dominio.
- **Modificado** `src/schemas/campaign.schema.ts` — `generateCampaignDraftWithAiSchema`, `regenerateCampaignContentSchema`.
- **Modificado** `src/index.ts` — exports.
- **Nuevo** `src/schemas/__tests__/campaign-generated-content.schema.test.ts` — 14 tests.
- **Modificado** `src/schemas/__tests__/campaign.schema.test.ts` — +14 tests (los dos schemas nuevos).

### Application (`packages/application`)
- **Nuevo** `src/ports/campaign-generator.port.ts` — `CampaignGeneratorPort`, `GenerateCampaignInput`, `GeneratedCampaignResult`.
- **Nuevo** `src/use-cases/campaigns/generate-campaign-draft-with-ai.use-case.ts`.
- **Nuevo** `src/use-cases/campaigns/regenerate-campaign-content.use-case.ts`.
- **Modificado** `src/index.ts` — exports.
- **Nuevo** `src/use-cases/campaigns/__tests__/generate-campaign-draft-with-ai.use-case.test.ts` — 14 tests.
- **Nuevo** `src/use-cases/campaigns/__tests__/regenerate-campaign-content.use-case.test.ts` — 14 tests.

### Infrastructure (`packages/infrastructure`)
- **Nuevo** `src/ai/claude-api.provider.ts` — `ClaudeAPIProvider implements AIProvider`.
- **Nuevo** `src/ai/campaign-prompt-builder.ts` — `buildCampaignGenerationPrompt`, `CAMPAIGN_BUILDER_PROMPT_VERSION`.
- **Nuevo** `src/ai/campaign-generator.adapter.ts` — `CampaignGeneratorAdapter implements CampaignGeneratorPort`.
- **Modificado** `src/supabase/repositories/supabase-campaign.repository.ts` — fix de wiring de `generated_content` en `create()`/`update()` (ver §11).
- **Modificado** `src/index.ts` — exports.
- **Modificado** `package.json` — añade `"@bop-agency/ai-engine": "*"` a `dependencies` (único cambio de dependencias de todo 7D — ver §10 más abajo).
- **Nuevo** `src/ai/claude-api.provider.test.ts` — 11 tests.
- **Nuevo** `src/ai/campaign-prompt-builder.test.ts` — 14 tests.
- **Nuevo** `src/ai/campaign-generator.adapter.test.ts` — 10 tests.
- **Modificado** `src/supabase/repositories/__tests__/supabase-campaign.repository.test.ts` — +5 tests (wiring de `generated_content`, ver §11).

Ningún archivo de `apps/web` fue creado ni modificado (sin UI, per restricción explícita). `.agencia-ai/.claude/commands/new-client.md` permanece sin tocar (archivo ajeno preexistente en el working tree, no generado por esta tarea).

---

## 4. `CampaignGeneratorPort`

Puerto de aplicación (`packages/application/src/ports/campaign-generator.port.ts`), mismo patrón que `WorkflowDispatcherPort` (6D):

```ts
interface CampaignGeneratorPort {
  generate(input: GenerateCampaignInput): Promise<Result<GeneratedCampaignResult>>;
}
```

- `GenerateCampaignInput`: `platform`, `objective`, `brief`, `budget`, `currency`, `startDate`/`endDate`, `language`, `market?`, `clientContext` (`name`/`industry`/`website`/`brandProfile`), `complianceRules[]` (`ruleKey`/`title`/`description`/`severity` — nunca el registro completo de `ComplianceRule`).
- `GeneratedCampaignResult`: `content` (ya validado, `CampaignGeneratedContent`), `metadata` (`provider`/`model`/`promptVersion`/`schemaVersion`/`generatedAt`/`tokenUsage?`/`latencyMs?` — **sin** `complianceReview`, que se calcula en el use case, no en el adapter).
- `application`/`domain` no importan `fetch`, `process.env`, ni ningún SDK — solo el tipo `AIProvider` fluye por tipos, la implementación concreta vive en `infrastructure`.

---

## 5. Provider / SDK elegido

**SDK elegido:** ninguno. `ClaudeAPIProvider` (`packages/infrastructure/src/ai/claude-api.provider.ts`) llama a la Messages API de Anthropic (`POST https://api.anthropic.com/v1/messages`) vía `fetch` nativo de Node + `AbortController`.

**Razón:** convención ya establecida en el proyecto — `n8n-webhook-dispatcher.ts` tiene el comentario explícito `"NO instalar axios — se usa fetch nativo con AbortController"`. Añadir `@anthropic-ai/sdk` habría sido la primera dependencia de SDK de IA en todo el repo, contradiciendo tanto esa convención como la instrucción explícita de la tarea de "NO implementar una abstracción multi-provider sobredimensionada si no hay necesidad actual". Un solo provider, sin dependencia externa nueva.

**Package/versión exacto:** ninguno instalado — `package.json` de `infrastructure` no gana ninguna dependencia npm nueva (solo la dependencia interna del workspace `@bop-agency/ai-engine`, ver §10).

**Dónde se importa:** únicamente `packages/infrastructure/src/ai/claude-api.provider.ts`. `campaign-generator.adapter.ts` recibe el `AIProvider` por inyección de dependencia (constructor), nunca instancia `ClaudeAPIProvider` directamente — el composition root (fuera de alcance de 7D, sin UI) sería quien lo conecte.

**Variables de entorno:**
| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Sí | — | Si falta, `complete()` retorna `err(EXTERNAL_SERVICE_ERROR, details.reason='not_configured')` sin lanzar excepción y **sin llamar a `fetch`** — no bloquea la carga del adapter (test A5). |
| `ANTHROPIC_MODEL` | No | `claude-3-5-sonnet-20241022` | Configurable sin cambiar código. |
| `ANTHROPIC_API_VERSION` | No | `2023-06-01` | Header `anthropic-version` requerido por la Messages API. |
| `CAMPAIGN_AI_TIMEOUT_MS` | No | `30000` (min 5000, max 120000) | Timeout de la llamada, vía `AbortController` — mismo patrón que `N8N_DISPATCH_TIMEOUT_MS`. |

**Modelo configurable:** sí — `ANTHROPIC_MODEL`, o `AIRequest.model` explícito (tiene prioridad sobre el env var — test A11).

**Structured output:** la Messages API de Anthropic no tiene un modo "JSON mode" nativo forzado en este flujo (no se usó tool-use/function-calling para mantener el adapter simple, mismo criterio de "no sobrediseñar" de la tarea) — en su lugar, el prompt instruye explícitamente "responde solo JSON" y el adapter tolera que el modelo lo envuelva en markdown (extrae el primer objeto `{...}` balanceado del texto) antes de `JSON.parse` + validación Zod estricta. Si el texto no contiene un JSON reconocible o no pasa el schema, se rechaza — nunca se intenta "reparar" JSON malformado.

**Error mapping:** ver tabla completa en §13.

**Comportamiento sin API key:** implementado como caso de primera clase, no como excepción — `err(EXTERNAL_SERVICE_ERROR)` con `details.reason='not_configured'`, que el adapter traduce a `campaignGenerationUnavailable(...)`. Los tests de infraestructura corren enteramente con un `AIProvider` fake o con `ANTHROPIC_API_KEY` mockeada (`vi.stubEnv`) — **cero llamadas reales a Anthropic en ningún test**.

**Sin abstracción multi-provider:** no existe ningún registro/factory de providers, ni un tipo `AIProviderName` con múltiples ramas — `CampaignGeneratorAdapter` recibe un único `AIProvider` por constructor, igual que `N8nDispatcherAdapter` recibe un único dispatcher.

---

## 6. `generated_content` — fuente de verdad del schema

**Fuente de verdad única para la FORMA (shape):** `campaignGeneratedContentSchema` en `packages/shared/src/schemas/campaign-generated-content.schema.ts` (Zod `discriminatedUnion('platform', [metaAdsGeneratedContentSchema, googleAdsGeneratedContentSchema])`) — es el único punto donde se valida el JSON crudo del proveedor de IA, dentro de `CampaignGeneratorAdapter.generate()`, ANTES de construir `GeneratedCampaignResult`. Ningún `as CampaignGeneratedContent` sin `safeParse` precede a la persistencia — el flujo real es: `JSON.parse` → `campaignGeneratedContentSchema.safeParse` → si falla, `err(invalidAiOutput(...))` sin persistir nada; si pasa, `validation.data` (ya tipado y validado) es lo único que llega a `GeneratedCampaignResult.content`.

**Duplicación documentada (riesgo aceptado):** existe además un tipo espejo en dominio (`CampaignGeneratedContent` en `packages/domain/src/entities/campaign-generated-content.ts`) — necesario porque `domain` debe permanecer libre de Zod (regla de capas del proyecto) pero necesita el tipo para `AIGenerationMetadata`/`Campaign.generatedContent` en su propia capa. Ambos módulos exportan también una constante `GENERATED_CONTENT_SCHEMA_VERSION` (`'campaign-content-v1'`) que **debe** coincidir — se agregó un test dedicado (`campaign-generated-content.test.ts`, dominio) que falla si alguna vez divergen. Ver riesgo nuevo en `PHASE_7_RISK_REGISTER.md`.

**Cobertura de plataformas:** solo `meta_ads`/`google_ads` (ver §7) — no existe rama `youtube_ads` ni ninguna otra en el discriminated union; agregar una nueva plataforma requiere una nueva variante Zod + domain type + sección del prompt builder, no un cambio genérico.

**Output inválido:**
- `generate-campaign-draft-with-ai.use-case.ts`: si `campaignGeneratorPort.generate()` retorna error (incluyendo `invalidAiOutput`), el use case retorna ese error de inmediato — `CampaignRepository.create()` nunca se llama (tests: "propaga el fallo del proveedor... sin persistir nada", "rechaza output de IA con platform distinto... sin persistir").
- `regenerate-campaign-content.use-case.ts`: mismo criterio — `CampaignRepository.update()` nunca se llama si el output es inválido, así que el `generated_content` anterior de la campaña **nunca se sobrescribe** con un resultado fallido (tests: "NO llama a update() si el proveedor de IA falla", "NO llama a update() si el output tiene platform distinto").

---

## 7. Prompt builder

`packages/infrastructure/src/ai/campaign-prompt-builder.ts`, versión explícita `CAMPAIGN_BUILDER_PROMPT_VERSION = 'campaign-builder-v1'` (persistida en `campaigns.metadata.ai.promptVersion` en cada generación).

Secciones separadas (funciones puras, no un string gigante inline):
1. **SYSTEM/POLICY CONTEXT** (`buildSystemPolicySection`) — mensaje `system`: idioma obligatorio, formato de salida (solo JSON, sin markdown), prohibiciones explícitas (no inventar datos del cliente, no prometer resultados garantizados, no inventar precios/ofertas, no inventar certificaciones/testimonios), instrucción de no auto-declarar compliance.
2. **CLIENT CONTEXT** (`buildClientContextSection`) — nombre/industria/website reales del `Client`, más `brandProfile` (contenido de `ClientDocument`, key `brand-profile`) si existe; si no existe, lo dice explícitamente y pide marcar `assumptions`.
3. **CAMPAIGN BRIEF** (`buildCampaignBriefSection`) — plataforma/objetivo/presupuesto+moneda/fechas/mercado (si se proveyó)/brief textual, todo tal cual lo proveyó el caller — nunca inventado.
4. **COMPLIANCE CONTEXT** (`buildComplianceContextSection`) — reglas activas aplicables (`ruleKey`/`title`/`description`/`severity`); si no hay ninguna, lo dice explícitamente en vez de omitir la sección en silencio.
5. **OUTPUT CONTRACT** (`buildOutputContractSection`) — contrato JSON exacto, **específico por plataforma** (rama `meta_ads` con `adSets`/`creatives`; rama `google_ads` con `adGroups`/`keywordSuggestions`/`negativeKeywordSuggestions`), no un ejemplo genérico.

No incluye documentos completos arbitrarios (`brandProfile` es un único `ClientDocument.content` ya acotado por el propio repositorio, no una carga de archivos). No hace web scraping ni fetch de ningún tipo — el prompt builder es una función pura, sin I/O.

---

## 8. Compliance — integración con Phase 7C

- Antes de generar: `generate-campaign-draft-with-ai.use-case.ts`/`regenerate-campaign-content.use-case.ts` cargan `ComplianceRuleRepository.findApplicableRules({organizationId, clientId, platform})` (mismo repositorio/filtro que `evaluateCampaignCompliance` de 7C) y las pasan como **contexto** del prompt — nunca como aprobación.
- Después de generar (antes de persistir): se corre `evaluateCampaignCompliance` (función pura de dominio, **determinística, NO IA**, sin cambios respecto a 7C) contra las mismas reglas. El resultado (`passed`/`requiresManualReview`) se guarda en `campaigns.metadata.ai.complianceReview`.
- **Diferencia explícita entre las 4 capas** (para que quede sin ambigüedad):
  1. **Generation guidance:** las reglas se le muestran a la IA como contexto de redacción — puede evitar contenido obviamente problemático, pero **no es una verificación**.
  2. **Deterministic compliance evaluation:** `evaluateCampaignCompliance` (7C) — dado el schema narrativo actual de `compliance_rules` (sin condiciones estructuradas evaluables), siempre marca las reglas activas aplicables como `requiresManualReview` — nunca produce `violations` reales todavía (limitación heredada de 7C, no nueva de 7D).
  3. **Manual review required:** el campo `requiresManualReview` es la señal explícita de "un humano debe revisar esto contra la regla X" — se persiste, no se descarta.
  4. **Approval workflow:** exclusivamente `submitCampaignForReview`/`approveCampaign`/`rejectCampaign` (7C) — 7D nunca los invoca (ver §9).
- **Compliance NUNCA causa auto-approval, y tampoco bloquea la persistencia del draft** — no existe ninguna regla técnica determinística hoy que lo justifique (mismo criterio ya fijado en 7C, §10 de ese reporte); un `requiresManualReview` no vacío no impide que la campaña se cree en `draft`.

---

## 9. Flujo `generateCampaignDraftWithAI`

1. Valida input (Zod, `generateCampaignDraftWithAiSchema`).
2. Verifica rol `operator`+ (`organizationRepository.findMember` + `hasMinimumRole`).
3. Verifica soporte de plataforma (`isSupportedGenerationPlatform`, dominio) — `youtube_ads` u otra retornan `unsupportedCampaignPlatform` **antes** de tocar cliente/IA.
4. Carga el cliente (`clientRepository.findById(clientId, organizationId)` — aísla cross-org automáticamente) y verifica `status === 'active'` (`clientInactive` si no).
5. Carga reglas de compliance aplicables.
6. Carga opcionalmente `ClientDocument` con `documentKey='brand-profile'` (repositorio real de Phase 3 — nunca filesystem, nunca web).
7. Llama a `CampaignGeneratorPort.generate()`.
8. Verifica en profundidad que `content.platform === data.platform` (defensa adicional al discriminated union).
9. Calcula `evaluateCampaignCompliance` **antes** de persistir (con un objeto `Campaign` construido en memoria, `id` placeholder descartado — ver comentario extenso en el código) para mantener **una sola** llamada a `CampaignRepository.create()`.
10. Persiste — `status` siempre `'draft'` (`CreateCampaignInput` no tiene parámetro `status`, así que la garantía es estructural, no solo una validación que se pueda olvidar).

**Nombre de campaña:** la especificación no incluye `name` como input de este flujo (a diferencia de `createCampaignDraft`, 7B); como el dominio lo requiere, se deriva de `content.campaignConcept` (truncado a 200 caracteres) — la fuente más significativa disponible una vez generado el contenido.

---

## 10. Flujo `regenerateCampaignContent`

Mismas verificaciones de rol/cliente/compliance/brand-profile que el flujo de generación, más:

- Solo campañas `status === 'draft'` — cualquier otro status retorna `campaignRegenerationNotAllowed` (nuevo error, no reutiliza `campaignInvalidStatus` porque no es una transición de dos estados, es una restricción de un solo estado).
- Misma organización (`campaignRepository.findById` aísla).
- Reutiliza `brief`/`objective`/`budget`/`currency`/`platform`/fechas **de la campaña ya persistida**, nunca del input del caller (el input solo acepta `campaignId` + overrides opcionales `language`/`market`).
- Si la campaña no tiene `brief` (posible en una campaña creada manualmente vía `createCampaignDraft`, 7B, que no lo exige) → `campaignBriefRequired`.
- `language`/`market`: si no se proveen, se reutilizan de `campaign.metadata.ai` de la generación anterior (lectura segura, sin asumir forma — `readPreviousAiMetadataField`).
- Persiste con **una sola** llamada a `CampaignRepository.update()` — nunca crea una campaña nueva.
- **`metadata.ai` se reemplaza junto con `generated_content`** (decisión de diseño documentada explícitamente en el código — ver nota extensa en `regenerate-campaign-content.use-case.ts`): la especificación decía "keep current generation metadata", interpretado como "mantener la forma de `AIGenerationMetadata`", no literalmente "no tocar los valores" — porque conservar metadata vieja (`generatedAt`/`model` de la generación anterior) junto a contenido nuevo sería activamente engañoso, y no existe (por decisión explícita del scope de 7D) una tabla de historial donde preservar la metadata previa por separado. Otras claves de `metadata` no relacionadas con `ai` se preservan (`{...campaign.metadata, ai: aiMetadata}`).
- Historial de regeneraciones: **deferido explícitamente** — cada regeneración sobrescribe la anterior sin dejar rastro. Ver riesgo nuevo en el risk register.

---

## 11. Persistencia — fix del gap de `generated_content`

**Gap confirmado:** `SupabaseCampaignRepository.create()`/`update()` (7B) nunca referenciaban `generated_content` en el payload de Supabase, pese a que la columna `jsonb` ya existía desde la migración de 7B y el mapper (`rowToCampaign`) ya la leía correctamente en sentido lectura. Sin el fix, cualquier `generatedContent` que un caller de 7D enviara se habría descartado silenciosamente.

**Fix aplicado:**
- `create()`: `generated_content: data.generatedContent ?? null` añadido al `.insert({...})`.
- `update()`: `if (data.generatedContent !== undefined) patch.generated_content = data.generatedContent;` añadido al builder de `patch` — **condicional**, para que un `update()` de 7B/7C que no toca `generatedContent` (ej. `submitCampaignForReview`, que solo cambia `status`) no incluya `generated_content` en el patch en absoluto, y así nunca lo pise con `null` accidentalmente.

**Sin migración nueva:** la columna `generated_content jsonb` y `metadata jsonb` ya existían desde `20260816130000_phase7b_campaign_studio_persistence.sql` — este era un gap de wiring en el repositorio de infraestructura, no un gap de schema. Ver §16.

**Tests obligatorios añadidos** (`supabase-campaign.repository.test.ts`, +5 sobre los 23 existentes):
- CREATE: `generatedContent` → `generated_content` cuando se provee; `generated_content: null` cuando no se provee (createCampaignDraft, 7B, sigue funcionando igual).
- UPDATE: `generatedContent` → `generated_content` cuando se provee (regenerateCampaignContent); **ausente del patch** cuando no se provee (edición 7B normal no debe borrar `generated_content` existente); permite explícitamente limpiar con `null`.
- `metadata` (incluyendo `metadata.ai`) se reenvía tal cual en ambos casos — cubierto en los mismos tests vía `expect.objectContaining`.

Todos los 28 tests de `supabase-campaign.repository.test.ts` (23 originales + 5 nuevos) pasan — **ningún test de 7B/7C se rompió**.

---

## 12. Metadata de IA persistida

`campaigns.metadata.ai` (dentro del `jsonb` existente, sin columna nueva — ver §16):

```json
{
  "provider": "anthropic",
  "model": "claude-3-5-sonnet-20241022",
  "promptVersion": "campaign-builder-v1",
  "schemaVersion": "campaign-content-v1",
  "generatedAt": "2026-08-16T00:00:00.000Z",
  "tokenUsage": { "inputTokens": 500, "outputTokens": 300, "totalTokens": 800 },
  "latencyMs": 1200,
  "language": "es",
  "market": "CO",
  "complianceReview": { "passed": true, "requiresManualReview": [ { "ruleId": "...", "ruleKey": "...", "title": "...", "severity": "high" } ] }
}
```

Nunca incluye: API keys, headers de autorización, texto crudo sin validar del proveedor, ni ningún dato que no sea metadata operacional segura — mismo criterio que `DispatchResult`/`sanitizeMetadata` en el gateway de n8n (6C/6D).

---

## 13. Mapeo de errores

| Origen | Código genérico (`ClaudeAPIProvider`) | Error de dominio (`CampaignGeneratorAdapter`/use case) | `ErrorCode` final |
|---|---|---|---|
| `ANTHROPIC_API_KEY` no configurada | `EXTERNAL_SERVICE_ERROR`, `details.reason='not_configured'` | `campaignGenerationUnavailable` | `EXTERNAL_SERVICE_ERROR` |
| HTTP 429 | `RATE_LIMITED` | `aiRateLimited` | `RATE_LIMITED` |
| Timeout (`AbortError`) | `EXTERNAL_SERVICE_ERROR`, `details.reason='timeout'` | `aiGenerationTimeout` | `EXTERNAL_SERVICE_ERROR` |
| HTTP 5xx / 4xx (no 429) | `EXTERNAL_SERVICE_ERROR` (mensaje saneado: solo status + `error.type`, nunca el body completo) | `aiProviderFailure` (reenvía el mensaje ya saneado) | `EXTERNAL_SERVICE_ERROR` |
| Error de red inesperado | `EXTERNAL_SERVICE_ERROR` | `aiProviderFailure` | `EXTERNAL_SERVICE_ERROR` |
| Respuesta sin JSON reconocible | — (nivel adapter) | `invalidAiOutput` | `EXTERNAL_SERVICE_ERROR` |
| JSON inválido (`JSON.parse` falla) | — (nivel adapter) | `invalidAiOutput` | `EXTERNAL_SERVICE_ERROR` |
| JSON válido pero no cumple `campaignGeneratedContentSchema` | — (nivel adapter) | `invalidAiOutput` (solo expone rutas de campo, nunca el contenido crudo) | `EXTERNAL_SERVICE_ERROR` |
| `content.platform` ≠ plataforma solicitada | — (nivel use case) | `invalidAiOutput` | `EXTERNAL_SERVICE_ERROR` |
| Plataforma sin builder (`youtube_ads`, etc.) | — (nivel use case) | `unsupportedCampaignPlatform` | `VALIDATION_ERROR` |
| Actor sin membresía | — (nivel use case) | `notOrganizationMember` | `FORBIDDEN` |
| Rol insuficiente (`viewer`) | — (nivel use case) | `insufficientRole` | `FORBIDDEN` |
| Cliente inexistente / otra organización | — (nivel use case) | `clientNotFound` | `NOT_FOUND` |
| Cliente inactivo | — (nivel use case) | `clientInactive` | `VALIDATION_ERROR` |
| Regeneración sobre campaña no-`draft` | — (nivel use case) | `campaignRegenerationNotAllowed` | `VALIDATION_ERROR` |
| Regeneración sobre campaña sin `brief` | — (nivel use case) | `campaignBriefRequired` | `VALIDATION_ERROR` |

Ningún mensaje expuesto al caller contiene: la API key, headers de autorización, el body crudo de la respuesta HTTP, ni el contenido generado sin validar. Verificado explícitamente con un test dedicado (`A4: NUNCA expone la API key en el resultado ni en errores`) y con la regla de "solo rutas de campo, nunca contenido" en la validación Zod fallida (`G5`).

---

## 14. Resiliencia — sin retry

Se auditó `N8nWebhookDispatcher` (única infraestructura HTTP existente en el proyecto antes de 7D) y se confirmó: un solo intento con timeout, sin retry automático en ningún adapter del proyecto. `ClaudeAPIProvider`/`CampaignGeneratorAdapter` siguen el mismo criterio — **sin retry**. Es seguro porque la persistencia (`CampaignRepository.create`/`update`) solo ocurre **después** de validar el output; un fallo de generación no deja ningún registro parcial ni duplicado, así que reintentar (re-invocar el use case) es responsabilidad segura del caller.

---

## 15. Tests — resultados reales (no estimados)

Ejecutado por paquete/chunk vía `mcp__remote-devices__device_bash` (límite de 45s por invocación) para evitar timeouts.

| Paquete | typecheck | eslint | tests nuevos de 7D | tests totales verificados (incluye regresión) |
|---|---|---|---|---|
| `domain` | ✅ limpio | ✅ limpio | 6 (`campaign-generated-content.test.ts`) | 6 nuevos + suite completa de dominio ya verde en sesión previa (sin cambios de comportamiento en entidades existentes) |
| `shared` | ✅ limpio | ✅ limpio | 14 + 14 = 28 | 66 totales en los 5 archivos de test ejecutados (incluye `campaign.schema.test.ts` con las +14 de 7D) |
| `ai-engine` | ✅ limpio | ✅ limpio | 0 (sin cambios — sigue 100% contratos) | 0 (`--passWithNoTests`, esperado) |
| `application` | ✅ limpio | ✅ limpio | 14 + 14 = 28 | 82 en `src/use-cases/campaigns` (9 archivos, incluye los 7 de 7B/7C sin regresión) |
| `infrastructure` | ✅ limpio | ✅ limpio | 11 + 14 + 10 = 35 (`src/ai`) + 5 (`generated_content` en `supabase-campaign.repository.test.ts`) = 40 | 391+ verificados en total: mappers (170), repositories (177, incluye las +5 de 7D), n8n (28), phase7c-migration-security (16), `src/ai` (35) |
| `apps/web` | ✅ limpio | ✅ limpio | — (sin UI en 7D) | **No ejecutado — ver limitación de entorno abajo** |

**Limitación de entorno (transparencia total):** el comando `device_bash` tiene un límite duro de 45s por invocación en este entorno. `packages/domain`/`shared`/`application`/`infrastructure` corren cómodamente dentro de ese límite (incluso el paquete más pesado, `infrastructure`, completa en ~30-38s por chunk). `apps/web` (Next.js + Vitest con entorno jsdom) **no completó ni siquiera un solo archivo de test** dentro de 45s en múltiples intentos (incluyendo un solo archivo aislado) — es un costo de arranque del entorno, no un hang ni un error de test. `typecheck` y `eslint` de `apps/web` sí completaron limpios. Dado que **ningún archivo de `apps/web` fue tocado por 7D** (sin UI, restricción explícita), el riesgo de regresión real es mínimo, pero se documenta honestamente que la suite de tests de `apps/web` no se ejecutó de punta a punta en esta sesión — queda como acción pendiente para quien continúe (correr `npm run test` completo desde una terminal sin el límite de 45s del bridge).

**Regresión Phase 7B/7C:** confirmada explícitamente — los 82 tests de `application/src/use-cases/campaigns` (incluye `create-campaign-draft`, `submit-campaign-for-review`, `approve-campaign`, `reject-campaign`, `list-campaign-approvals`, `get-applicable-compliance-rules`, `evaluate-campaign-compliance`) y los 28 tests de `supabase-campaign.repository.test.ts` (incluye `approve`/`reject` vía RPC) pasan en verde tras los cambios de 7D.

---

## 16. Migraciones

**Ninguna migración nueva fue creada ni aplicada.** `campaigns.generated_content` (jsonb, nullable) y `campaigns.metadata` (jsonb) ya existían desde `supabase/migrations/20260816130000_phase7b_campaign_studio_persistence.sql` (7B) — suficientes para todo lo que 7D necesita persistir (`generated_content` estructurado + `metadata.ai`). El único gap era de wiring en `SupabaseCampaignRepository` (§11), no de schema. No hay ningún comando de aplicación de migración que ofrecer para esta subfase.

---

## 17. Revisión de seguridad / alcance

Barrido explícito (`grep`) sobre **todos** los archivos tocados por 7D en busca de: `API_KEY`, `SECRET`, `Authorization`, `service_role`, `fetch(`, `openai`, `anthropic`, `google`, `gemini`, `console.log`, `process.env`.

- `process.env` — aparece **únicamente** en `claude-api.provider.ts` (4 variables documentadas en §5). Ningún otro archivo de `application`/`domain`/`shared` ni siquiera del resto de `infrastructure` lo toca.
- `fetch(` — aparece **únicamente** en `claude-api.provider.ts` (llamada real) y en los tests que lo mockean (`vi.stubGlobal('fetch', ...)`). `campaign-generator.adapter.ts` y `campaign-prompt-builder.ts` no hacen ningún I/O.
- `console.log` — **cero ocurrencias** en todo 7D. Solo `console.error` (4 llamadas, todas en `claude-api.provider.ts`), y cada una loguea únicamente `status`/`statusCode`/`timeoutMs`/`errorName` — nunca el body de la request/response, nunca la API key, nunca el brief del cliente.
- `Authorization` — cero ocurrencias (Anthropic usa el header `x-api-key`, no `Authorization`).
- `service_role` — cero ocurrencias de uso real; solo aparece en un comentario preexistente de `supabase-campaign.repository.ts` ("nunca service_role en esta capa") que 7D no modificó.
- `SECRET` — cero ocurrencias (no hay ningún secreto compartido/HMAC en el flujo de IA, a diferencia del webhook de n8n).
- `openai`/`gemini` — cero ocurrencias (confirma que no se introdujo ningún proveedor adicional).
- `google`/`anthropic` — todas las ocurrencias son o bien el literal de plataforma `'google_ads'` (sin relación con Google AI SDK) o referencias esperadas al proveedor Anthropic sancionado.

**Confirmado:**
- Secretos solo server-side (`process.env`, nunca expuestos a ningún Client Component — `apps/web` no fue tocado, así que no hay ningún riesgo de import accidental en cliente).
- Ningún `service_role` nuevo.
- Ninguna credencial hardcodeada (el único literal parecido a una API key, `'sk-ant-test-key-1234567890'` en `claude-api.provider.test.ts`, es un fixture de test falso, verificado explícitamente para no aparecer en ningún resultado — test A4).
- Ninguna llamada de red en `domain`/`application` — solo en `infrastructure/src/ai/claude-api.provider.ts`.
- Ninguna llamada de publicación externa (Meta/Google/YouTube Ads APIs) — no existe ningún código que las invoque.

---

## 18. Entregables (§21 — resumen ejecutivo)

1. **Precheck:** ver §0.
2. **Auditoría de arquitectura de IA:** ver §1.
3. **Clasificación de skills legacy:** ver §2.
4. **Archivos creados/modificados:** ver §3.
5. **`CampaignGeneratorPort`:** ver §4.
6. **Provider/adapter elegido:** ver §5 — `ClaudeAPIProvider` (Anthropic Messages API, `fetch` nativo, sin SDK).
7. **Prompt/versión:** ver §7 — `campaign-builder-v1`.
8. **Schema de `generated_content`:** ver §6.
9. **Plataformas soportadas:** `meta_ads`, `google_ads` únicamente (`youtube_ads` y el resto de `AdPlatform` deferidos explícitamente — ver §19).
10. **Integración de compliance:** ver §8.
11. **Comportamiento de persistencia:** ver §11 — una sola llamada a `create()`/`update()`, nunca antes de validar output, nunca auto-aprobado.
12. **Mapeo de errores:** ver §13.
13. **Tests/resultados:** ver §15.
14. **Migración nueva:** ninguna (ver §16).
15. **`git status --short` final:** ver §20.
16. **Riesgos/deferidos para 7E/7F:** ver §19.

---

## 19. Riesgos / deferido para 7E/7F

- **`youtube_ads` y el resto de `AdPlatform` sin builder de generación.** Deferido explícitamente — agregar soporte requiere una nueva variante Zod/domain + sección del prompt, no un cambio trivial.
- **Sin historial de regeneraciones.** Cada `regenerateCampaignContent` sobrescribe `generated_content`/`metadata.ai` sin dejar rastro de generaciones anteriores — aceptable para 7D per instrucción explícita de no crear una tabla de auditoría sin necesidad clara, pero es una pérdida de información real si en el futuro se quiere mostrar "versiones anteriores" en la UI (7E).
- **Duplicación de `GENERATED_CONTENT_SCHEMA_VERSION`** entre `domain` y `shared` (necesaria por la regla de capas del proyecto) — mitigada con un test de consistencia, pero sigue siendo un punto de mantenimiento manual si algún día cambia.
- **Sin tracing/observabilidad de generación** más allá de `console.error` + `logger` inyectado — ninguna integración con un sistema de tracing externo (fuera de alcance, no existía antes tampoco).
- **`apps/web` test suite no verificada de punta a punta en esta sesión** por el límite de 45s del bridge (ver §15) — recomendado re-ejecutar `npm run test` en `apps/web` desde una terminal normal antes de considerar 7D "cerrado" formalmente.
- **UI, n8n, publicación externa:** completamente fuera de alcance de 7D, como estaba especificado — quedan íntegros para 7E (UI)/7F (notificaciones)/fases posteriores (publicación real a Meta/Google/YouTube).
- **R-TECH-03/R-SEC-03/R-SEC-04** (risk register, definidos en 7A): marcados como resueltos — ver actualización en `PHASE_7_RISK_REGISTER.md`.

---

## 20. `git status --short` (estado final, verificado en el dispositivo real, sin staging)

Re-ejecutado directamente en el working tree del usuario (`git branch --show-current` / `git log -1 --oneline` / `git status --short` / `git diff --stat` / `git diff --check`), como verificación final de entrega (§14):

```
$ git branch --show-current
feat/phase-7-campaign-studio

$ git log -1 --oneline
6d3623d feat(phase-7): add campaign approval and compliance workflow

$ git status --short
 M docs/implementation/phase-7/PHASE_7_IMPLEMENTATION_PLAN.md
 M docs/implementation/phase-7/PHASE_7_RISK_REGISTER.md
 M packages/application/src/index.ts
 M packages/domain/src/entities/campaign.ts
 M packages/domain/src/errors/domain.errors.ts
 M packages/domain/src/index.ts
 M packages/infrastructure/package.json
 M packages/infrastructure/src/index.ts
 M packages/infrastructure/src/supabase/repositories/__tests__/supabase-campaign.repository.test.ts
 M packages/infrastructure/src/supabase/repositories/supabase-campaign.repository.ts
 M packages/shared/src/index.ts
 M packages/shared/src/schemas/__tests__/campaign.schema.test.ts
 M packages/shared/src/schemas/campaign.schema.ts
?? .agencia-ai/.claude/commands/new-client.md
?? docs/implementation/phase-7/PHASE_7D_AI_CAMPAIGN_BUILDER_REPORT.md
?? packages/application/src/ports/campaign-generator.port.ts
?? packages/application/src/use-cases/campaigns/__tests__/generate-campaign-draft-with-ai.use-case.test.ts
?? packages/application/src/use-cases/campaigns/__tests__/regenerate-campaign-content.use-case.test.ts
?? packages/application/src/use-cases/campaigns/generate-campaign-draft-with-ai.use-case.ts
?? packages/application/src/use-cases/campaigns/regenerate-campaign-content.use-case.ts
?? packages/domain/src/__tests__/campaign-generated-content.test.ts
?? packages/domain/src/entities/campaign-generated-content.ts
?? packages/infrastructure/src/ai/
?? packages/shared/src/schemas/__tests__/campaign-generated-content.schema.test.ts
?? packages/shared/src/schemas/campaign-generated-content.schema.ts

$ git diff --stat
 .../phase-7/PHASE_7_IMPLEMENTATION_PLAN.md         |  34 ++++---
 .../phase-7/PHASE_7_RISK_REGISTER.md               |  48 ++++++++-
 packages/application/src/index.ts                  |  26 +++++
 packages/domain/src/entities/campaign.ts           |  19 +++-
 packages/domain/src/errors/domain.errors.ts        |  63 ++++++++++++
 packages/domain/src/index.ts                       |  19 ++++
 packages/infrastructure/package.json               |   3 +-
 packages/infrastructure/src/index.ts               |   5 +
 .../__tests__/supabase-campaign.repository.test.ts |  92 +++++++++++++++++
 .../repositories/supabase-campaign.repository.ts   |   6 ++
 packages/shared/src/index.ts                       |  15 ++-
 .../src/schemas/__tests__/campaign.schema.test.ts  | 110 +++++++++++++++++++++
 packages/shared/src/schemas/campaign.schema.ts     |  50 ++++++++++
 13 files changed, 471 insertions(+), 19 deletions(-)

$ git diff --check
(sin salida — exit 0, sin conflict markers ni errores de whitespace; el único warning observado, CRLF en packages/infrastructure/package.json, es benigno y preexistente al line-ending de ese archivo, no un error)
```

Confirmado: `supabase-campaign.repository.test.ts` aparece como ` M` (modificación de un archivo Phase 7B/7C existente), no `??`, como se esperaba. `PHASE_7_IMPLEMENTATION_PLAN.md` y `PHASE_7_RISK_REGISTER.md` aparecen como ` M` porque este mismo reporte (§12 de la tarea) actualizó su sección 7D/riesgos — son cambios de documentación, no de código. `packages/infrastructure/src/ai/` aparece como directorio completo sin trackear (`claude-api.provider.ts`, `campaign-prompt-builder.ts`, `campaign-generator.adapter.ts` y sus `.test.ts`).

**Único archivo ajeno esperado:** `.agencia-ai/.claude/commands/new-client.md` — preexistente, no tocado por esta tarea.

**Sin `git add`. Sin commit. Sin push. Sin aplicar migraciones. Sin tocar producción. Sin tocar n8n. Sin UI. Sin publicar campañas.**
