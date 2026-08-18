# Phase 7D.1 — Multi-provider AI foundation (Campaign Studio) — Reporte de Implementación

**Fecha:** 2026-08-18
**Rama:** `feat/phase-7-campaign-studio`
**HEAD al iniciar y al terminar:** `5605823 feat(phase-7): add AI campaign builder` (Phase 7D)
**Estado:** ✅ IMPLEMENTADO — sin `git add`, sin commit, sin push, sin migraciones, sin tocar producción / Supabase cloud / n8n / publicación externa.

---

## 1. Precheck

```
git branch --show-current  → feat/phase-7-campaign-studio
git log -1 --oneline       → 5605823 feat(phase-7): add AI campaign builder
git status --short         → cambios de 7E presentes y unstaged
```

Confirmado al iniciar:

- Rama correcta.
- HEAD en `5605823` (7D). **7E sigue sin commitear**, en el working tree.
- Archivos 7E intactos: `campaigns/page.tsx`, `campaigns/new/page.tsx`, `campaigns/[id]/page.tsx`, `campaigns/actions.ts`, `components/campaigns/*`, `lib/composition/campaign.composition.ts`, `lib/campaign-labels.ts`, `lib/placeholder-data.ts`, `get-campaign.use-case.ts`.
- Archivo ajeno fuera de alcance, **no tocado**: `.agencia-ai/.claude/commands/new-client.md`.

### Hallazgos del precheck que NO estaban en el enunciado

1. **`supabase-local-before-gateway-restart.dump`** (1.3 MB) aparece como untracked en la raíz. No es de 7D.1 y no se tocó. Recomendación: moverlo fuera del repo o añadirlo a `.gitignore` antes del commit de 7E.
2. **`Api Gemini key.txt`** apareció como archivo untracked en la raíz del repo durante esta sesión (creado 2026-08-18 02:14). **NO está en `.gitignore`**, así que un `git add -A` lo commitearía. Su contenido **no se leyó** en esta sesión. **Acción requerida por el usuario antes de cualquier commit** — ver §16.

---

## 2. Auditoría del estado previo (7D/7E) antes de escribir código

| Pieza | Estado en 7D/7E | Consecuencia para 7D.1 |
|---|---|---|
| `CampaignGeneratorPort` (`packages/application/src/ports/campaign-generator.port.ts`) | `generate(input): Promise<Result<GeneratedCampaignResult>>`. `GenerateCampaignInput` sin noción de proveedor. `GeneratedCampaignMetadata.provider: string`. | La **interfaz no cambia**; solo se amplía el input con `provider?: AIProviderId` (opcional) y se tipa `provider` como `AIProviderId`. |
| `CampaignGeneratorAdapter` | Constructor `(aiProvider: AIProvider)`; proveedor **fijo** en construcción; `PROVIDER_NAME = 'anthropic'` hardcodeado en metadata. | Se pasa a resolver el proveedor **por llamada**; se conserva la forma antigua del constructor por compatibilidad. |
| `ClaudeAPIProvider` | `fetch` nativo + `AbortController`, lectura propia de `ANTHROPIC_*`, factorías de error inline. | Se conserva (no se borra, no se renombra). Se refactoriza para compartir config y factorías de error; comportamiento observable idéntico. |
| `campaign-prompt-builder` | Builder único versionado (`campaign-builder-v1`), emite `model: ''` para que el provider resuelva el modelo. | **Se conserva tal cual, sin tocar** — un solo prompt lógico para los tres proveedores. |
| `campaignGeneratedContentSchema` (shared) | Discriminated union `meta_ads`/`google_ads`, `GENERATED_CONTENT_SCHEMA_VERSION = 'campaign-content-v1'`. | **Sin cambios** — mismo schema para los tres proveedores. |
| `AIGenerationMetadata` (domain) | `provider: string`, `model`, `promptVersion`, `schemaVersion`, `generatedAt`, `tokenUsage?`, `latencyMs?`, `language`, `market?`, `complianceReview`. | Ya cabía todo lo que pide §13; solo se tipó `provider` como `AIProviderId`. **Ninguna migración necesaria.** |
| UI 7E | `CampaignWizardForm` (modo IA/manual), `RegenerateContentButton`, detalle `[id]/page.tsx`. | Se añade el selector solo en modo IA y en el detalle; el resto de 7E queda intacto. |
| Server Actions 7E | `generateCampaignDraftWithAiAction` / `regenerateCampaignContentAction`, doble capa de autorización, `mapError` saneado. | Se añade `provider?: string` validado contra enum antes de llegar al use case. |
| `campaign.composition.ts` | `new CampaignGeneratorAdapter(new ClaudeAPIProvider())`. | Pasa a `new CampaignGeneratorAdapter(createCampaignAIProvider)`. |

### Defecto pre-existente encontrado y corregido

`packages/infrastructure/tsconfig.json` y `apps/web/tsconfig.json` **no tenían path mapping para `@bop-agency/ai-engine`**, lo que producía los errores `TS2307: Cannot find module '@bop-agency/ai-engine'` + una cascada de `TS18046`/`TS7006` documentados como "pre-existentes, no introducidos por 7E" en `PHASE_7E_CAMPAIGN_STUDIO_UI_REPORT.md` §3. **No era un artefacto del sandbox: era configuración faltante.** Se añadió el mapping en ambos tsconfig (y el alias equivalente en `vitest.config.ts` de `packages/infrastructure` y `apps/web`). Con eso, `tsc --noEmit` queda limpio en los cinco paquetes.

---

## 3. Arquitectura de proveedores

```
apps/web (Server Action)                      ← valida provider contra enum cerrado
   └── campaign.composition.ts                ← inyecta la FACTORÍA, no una instancia
        └── CampaignGeneratorAdapter          ← resuelve el proveedor POR LLAMADA
             ├── createCampaignAIProvider()   ← ÚNICO switch por proveedor de todo el repo
             │    ├── OpenAIAPIProvider  ─┐
             │    ├── GeminiAPIProvider  ─┼── todos implementan el MISMO `AIProvider`
             │    └── ClaudeAPIProvider  ─┘
             ├── buildCampaignGenerationPrompt()   ← UN SOLO prompt builder
             └── campaignGeneratedContentSchema.safeParse()  ← UNA SOLA validación
```

Reglas de capas respetadas:

- `domain` / `application` **no** importan SDKs, `fetch`, ni `process.env`.
- Los use cases **no tienen if/else por proveedor**: solo propagan un `AIProviderId` opcional.
- La decisión de "qué clase construir" vive exclusivamente en `campaign-ai-provider.factory.ts`.

---

## 4. Provider IDs

`packages/shared/src/constants/ai-providers.ts` — fuente única:

```ts
AI_PROVIDER_IDS = ['openai', 'gemini', 'anthropic'] as const
type AIProviderId = 'openai' | 'gemini' | 'anthropic'
AI_PROVIDER_LABELS = { openai: 'OpenAI', gemini: 'Google Gemini', anthropic: 'Anthropic Claude' }
isAIProviderId(value): value is AIProviderId
DEFAULT_AI_PROVIDER_ID = 'anthropic'
```

- Vive en `shared` (no en `domain` ni `infrastructure`) por el mismo criterio que `AD_PLATFORMS`/`PLATFORM_LABELS`: lo consumen domain, application, infrastructure y apps/web a la vez.
- **No hay strings sueltos** `'openai'`/`'gemini'`/`'anthropic'` repetidos: los únicos literales fuera de este archivo son las constantes `PROVIDER_ID` internas de cada provider (una por archivo, tipada con `as const` contra el union) y las claves de los `Record<AIProviderId, …>`, que TypeScript obliga a mantener exhaustivos.
- **"Claude Code" no aparece como proveedor en ningún punto** — es tooling de desarrollo. El proveedor de runtime es la Messages API de Anthropic. Hay un test de UI que verifica explícitamente que la cadena "Claude Code" no aparece en el selector.

---

## 5. Configuración de modelos

`packages/infrastructure/src/ai/ai-provider-config.ts` — **único archivo del repo que lee env de proveedores de IA**.

| Variable | Requerida | Default |
|---|---|---|
| `CAMPAIGN_AI_DEFAULT_PROVIDER` | no | `anthropic` (`DEFAULT_AI_PROVIDER_ID`) |
| `OPENAI_API_KEY` | sí (para usar OpenAI) | — |
| `OPENAI_MODEL` | no | `gpt-4o-mini` |
| `GEMINI_API_KEY` | sí (para usar Gemini) | — |
| `GEMINI_MODEL` | no | `gemini-1.5-flash` |
| `ANTHROPIC_API_KEY` | sí (para usar Anthropic) | — |
| `ANTHROPIC_MODEL` | no | `claude-3-5-sonnet-20241022` |
| `ANTHROPIC_API_VERSION` | no | `2023-06-01` |
| `CAMPAIGN_AI_TIMEOUT_MS` | no | `30000` (rango 5000–120000) |

- Ninguna usa `NEXT_PUBLIC_`.
- `AIProviderConfig = { provider: AIProviderId; model: string }` — **nunca incluye la API key**: cada provider la lee de `process.env` en el instante de la llamada (mismo patrón que `N8nWebhookDispatcher`), de modo que la key no viaja por el grafo de objetos ni puede acabar en un log de composición.
- **Default por defecto = `anthropic`, no `gemini`.** El `.env.example` sí trae `CAMPAIGN_AI_DEFAULT_PROVIDER=gemini` como sugiere §20, pero el default **de código** (cuando la variable no existe) es `anthropic`: es el único proveedor ya verificado en 7D, así que un entorno existente que solo tiene `ANTHROPIC_API_KEY` sigue comportándose exactamente igual tras 7D.1. Cambiar ese default de código a `gemini` habría roto en silencio cualquier `.env.local` existente.

---

## 6. Factoría

`packages/infrastructure/src/ai/campaign-ai-provider.factory.ts`

```ts
createCampaignAIProvider(providerId?: AIProviderId): Result<ResolvedCampaignAIProvider>
ResolvedCampaignAIProvider = { providerId: AIProviderId; model: string; provider: AIProvider }
```

- `providerId === undefined` → `resolveDefaultProviderId()` (env → default documentado).
- `providerId` no reconocido → `aiUnsupportedProvider` (`VALIDATION_ERROR`).
- proveedor válido sin API key → `campaignGenerationUnavailable` (`EXTERNAL_SERVICE_ERROR`).
- `PROVIDER_CONSTRUCTORS: Record<AIProviderId, () => AIProvider>` — mapa exhaustivo verificado por el compilador: añadir un id nuevo a `AI_PROVIDER_IDS` sin implementarlo **no compila**.

---

## 7. Provider Anthropic (regresión)

`ClaudeAPIProvider` **se conserva**: mismo nombre de clase, mismo export, misma suite de tests (11/11 verdes, sin editar el archivo de tests). Cambios internos:

- Lectura de env delegada a `ai-provider-config.ts` (mismas variables, mismos defaults, mismo rango de timeout).
- Factorías de error delegadas a `provider-http.ts` (mismos `code` y `details.reason` que 7D: `not_configured`, `timeout`).
- Se añadió el alias `export const AnthropicAPIProvider = ClaudeAPIProvider` (misma clase, no una segunda implementación) para quien prefiera el nombre alineado al provider id. **No se hizo un rename**, porque tocar composition root, barrel, tests y el reporte de 7D era churn puro sin cambio de comportamiento — la desambiguación real ya la da `AIProviderId = 'anthropic'`.

---

## 8. Provider Gemini

`packages/infrastructure/src/ai/gemini-api.provider.ts` — `fetch` nativo, **sin SDK**.

- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
- API key en el header **`x-goog-api-key`**, nunca como query param `?key=` (un query param acaba en logs de proxy). Hay un test que falla si la key aparece en la URL.
- `model` interpolado con `encodeURIComponent`.
- Traducción de forma (en el provider, **no** en el prompt builder): `system` → `systemInstruction`; roles `user`/`assistant` → `user`/`model`; `maxTokens` → `generationConfig.maxOutputTokens`; `stopSequences` → `generationConfig.stopSequences`.
- Salida estructurada: `generationConfig.responseMimeType = 'application/json'`.
- Usage: `promptTokenCount`/`candidatesTokenCount`/`totalTokenCount` → `AIUsage`.
- `finishReason`: `STOP` → `stop`, `MAX_TOKENS` → `max_tokens`, resto → `error`.
- Timeout con `AbortController` (`CAMPAIGN_AI_TIMEOUT_MS`).

## 9. Provider OpenAI

`packages/infrastructure/src/ai/openai-api.provider.ts` — `fetch` nativo, **sin SDK**. API pública de OpenAI, **no ChatGPT web**.

- `POST https://api.openai.com/v1/chat/completions`, header `Authorization: Bearer …`.
- `messages` 1:1 (OpenAI sí acepta `role: 'system'` inline).
- Salida estructurada: `response_format: { type: 'json_object' }` (el prompt ya exige explícitamente "un único objeto JSON válido", requisito de ese modo).
- Usage: `prompt_tokens`/`completion_tokens`/`total_tokens` → `AIUsage`.
- `finishReason`: `stop` → `stop`, `length` → `max_tokens`, resto → `error`.
- Timeout con `AbortController`.

---

## 10. Contrato común

Los tres implementan el **mismo** `AIProvider` de `@bop-agency/ai-engine` (`complete(AIRequest): Promise<Result<AIResponse>>`). No se creó ningún contrato alternativo. `AIResponse` (`content` / `model` / `usage` / `finishReason`) es idéntico para los tres.

`provider-http.ts` (nuevo) centraliza las factorías de error para que los tres devuelvan **exactamente la misma forma** de `AppError` — si cada provider las construyera a mano, un typo en un `reason` haría que un timeout de Gemini se reportara como fallo genérico. También centraliza `readSafeErrorType()`, que extrae solo un `type`/`code`/`status` corto (≤64 caracteres) del body de error y **nunca** `error.message` (que puede ecoar el prompt y, con él, el brief del cliente).

---

## 11. Validación de generated content

Sin cambios de schema. `CampaignGeneratorAdapter` sigue siendo el **único** punto de validación: `extractJsonObject` → `JSON.parse` → `campaignGeneratedContentSchema.safeParse`. Vale igual para OpenAI, Gemini y Anthropic; **no hay ningún cast específico por proveedor** y ningún output inválido se persiste (la persistencia ocurre en el use case, después de la validación). Test `M7` recorre los tres proveedores con el mismo payload inválido.

---

## 12. Prompt builder

**Un solo prompt builder**, sin tocar: `campaign-prompt-builder.ts`, `CAMPAIGN_BUILDER_PROMPT_VERSION = 'campaign-builder-v1'`. No se crearon `openai-prompt-builder` / `gemini-prompt-builder` / `claude-prompt-builder`. Lo único que el adapter inyecta encima del prompt común es el `model` resuelto server-side. Cada provider traduce el `AIRequest` común al formato de su API.

---

## 13. Selección de proveedor en los use cases

- `generateCampaignDraftWithAI`: input gana `provider?: AIProviderId` (opcional). Validado por `generateCampaignDraftWithAiSchema` (`z.enum(AI_PROVIDER_IDS).optional()`). Se propaga al puerto solo si viene definido.
- `regenerateCampaignContent`: mismo campo opcional. Si no se especifica, **reutiliza el proveedor de la generación anterior** leyendo `campaign.metadata.ai.provider` con `isAIProviderId` (nunca un cast: la metadata es JSON libre en BD y podría estar corrupta). Si tampoco hay uno válido, se omite y decide el servidor.
- **Ningún if/else por proveedor** en los use cases: no conocen `OpenAIAPIProvider` ni las env vars.
- **El modelo no se acepta desde el input** en ninguno de los dos — se resuelve server-side por proveedor.

---

## 14. Metadata persistida

`campaigns.metadata.ai` (JSONB, columna ya existente desde 7B) guarda siempre:

| Campo | Origen |
|---|---|
| `provider` | `AIProviderId` realmente usado (lo reporta el adapter, no el cliente) |
| `model` | modelo devuelto por el proveedor (fallback: el resuelto server-side) |
| `promptVersion` | `campaign-builder-v1` |
| `schemaVersion` | `campaign-content-v1` |
| `generatedAt` | ISO 8601, estampado por el adapter |
| `tokenUsage?` | `inputTokens` / `outputTokens` / `totalTokens` |
| `latencyMs?` | medido en el adapter alrededor de `provider.complete()` |
| `language`, `market?` | efectivos de esa generación (7D) |
| `complianceReview` | evaluación determinística de 7C (7D) |

**Nunca** se persiste API key, header de autorización, URL de proveedor ni el body crudo de la respuesta. Test `P4` verifica los campos y que el JSON serializado no contenga `api_key` ni `authorization`.

---

## 15. UI

- **Nuevo** `apps/web/src/components/campaigns/AIProviderSelect.tsx` — opciones derivadas de `AI_PROVIDER_IDS` (nunca hardcodeadas), así que la UI **no puede ofrecer un proveedor sin implementación**. Opción por defecto con `value=''` = "usar el predeterminado del servidor". **No hay selector de modelo ni campo de API key** (verificado por test `U4`).
- **Wizard** (`CampaignWizardForm`): el selector aparece **solo en modo IA**; en modo manual no se renderiza y no se envía `provider` (tests `U5`–`U8`).
- **Detalle** (`RegenerateContentButton`): por defecto **no envía `provider`**, lo que hace que el servidor reutilice el proveedor original de la campaña. La opción por defecto se etiqueta con el proveedor actual (`Mismo proveedor (OpenAI)`) cuando `metadata.ai.provider` existe. El selector va detrás de un toggle "Opciones" para no añadir ruido al caso común de "regenerar igual" — cambiar de proveedor es siempre deliberado.
- El detalle lee `metadata.ai.provider` con `isAIProviderId`; un valor corrupto se trata como "sin proveedor conocido" y no rompe el render.

---

## 16. Seguridad

Sweep ejecutado sobre `packages/*/src` y `apps/web/src`:

| Búsqueda | Resultado |
|---|---|
| `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Único acceso real a `process.env` en `ai-provider-config.ts`. En los providers solo aparece el **nombre** de la variable dentro del mensaje de error "not configured". |
| `process.env` en `src/ai/**` | Solo `ai-provider-config.ts` (2 ocurrencias). |
| `NEXT_PUBLIC_` + IA | Cero. Las únicas coincidencias son comentarios que documentan que **no** se usa. |
| `Authorization` | Solo `openai-api.provider.ts` (construcción del header). El resto son listas de redacción ya existentes (n8n, execution log). |
| `service_role` | Cero usos nuevos. Todas las coincidencias en el flujo de campaigns son **comentarios** que afirman que no se usa. Ningún flujo de 7D.1 lo requiere. |
| `console.log` | Cero en `src/ai/**`, componentes de campaigns, actions de campaigns, composition y use cases de campaigns. Solo `console.error` con metadata no sensible (provider, statusCode, timeoutMs, errorName). |
| `fetch(` | 3 en `src/ai/**` (uno por proveedor) + 2 pre-existentes de n8n. Ninguno en Client Components. |
| Hosts de proveedores | Solo en los 3 archivos de provider, como constantes. **No se acepta ninguna URL de API desde el cliente.** |
| Client Components que importen `@bop-agency/infrastructure` o un host de proveedor | Cero. `AIProviderSelect` y `RegenerateContentButton` solo importan de `@bop-agency/shared` y de la Server Action. |
| Publicación externa (`graph.facebook`, `googleads.googleapis`, …) | Cero. 7D.1 no añade ninguna escritura a plataformas externas. |
| Respuestas crudas del proveedor persistidas | Ninguna: solo `validation.data` (el objeto ya parseado por Zod) llega a `CampaignRepository`. |

**Acción pendiente del usuario (no es código):** el archivo `Api Gemini key.txt` está en la raíz del repo, **untracked y no ignorado**. Su contenido no se leyó en esta sesión. Antes de cualquier `git add`: moverlo fuera del repo (o al `.gitignore`) y poner el valor en `.env.local` como `GEMINI_API_KEY`. Si la key ya estuvo en disco compartido, conviene rotarla.

---

## 17. Errores normalizados

`ErrorCode` (`@bop-agency/shared`) es un union cerrado usado por todo el proyecto; ampliarlo con códigos de IA obligaría a revisar cada consumidor de `AppError.code` de Phases 1–7 y rompería contratos ya verificados de 7C/7D/7E. En su lugar, 7D.1 normaliza el fallo en una dimensión **aditiva**: `AppError.details.aiErrorKind`, leída con `getAiErrorKind()`.

| `AIErrorKind` | `ErrorCode` (sin cambios respecto a 7D) | Factoría |
|---|---|---|
| `AI_PROVIDER_NOT_CONFIGURED` | `EXTERNAL_SERVICE_ERROR` | `campaignGenerationUnavailable` |
| `AI_RATE_LIMITED` | `RATE_LIMITED` | `aiRateLimited` |
| `AI_TIMEOUT` | `EXTERNAL_SERVICE_ERROR` | `aiGenerationTimeout` |
| `AI_EXTERNAL_SERVICE_ERROR` | `EXTERNAL_SERVICE_ERROR` | `aiProviderFailure` |
| `AI_INVALID_OUTPUT` | `EXTERNAL_SERVICE_ERROR` | `invalidAiOutput` |
| `AI_UNSUPPORTED_PROVIDER` | `VALIDATION_ERROR` | `aiUnsupportedProvider` (nueva) |

`details` nunca contiene API keys, body crudo del proveedor, headers ni stack traces — como máximo el `providerId` (que no es secreto) y el `statusCode`.

---

## 18. Dependencias

**Cero dependencias nuevas.** Ni `openai`, ni `@google/generative-ai`, ni `@anthropic-ai/sdk`, ni `axios`. Los tres proveedores usan `fetch` nativo + `AbortController`, igual que `N8nWebhookDispatcher` y que el `ClaudeAPIProvider` de 7D. `package.json` y `package-lock.json` **no se modificaron**.

## 19. Migraciones

**Ninguna.** `campaigns.metadata` es JSONB y ya alojaba `metadata.ai` completo desde 7B/7D; `provider` y `model` ya eran campos existentes de `AIGenerationMetadata`. Los datos ya persistidos por 7D tienen `provider: 'anthropic'`, que sigue siendo un `AIProviderId` válido — **no hay backfill ni migración de datos**. No se creó, ni aplicó, ningún archivo en `supabase/migrations/`.

---

## 20. Tests

Ejecutados **realmente** (ver §21 sobre cómo). Resultado global: **1432 tests, 0 fallos.**

| Paquete | Test files | Tests |
|---|---|---|
| `packages/shared` | 6 | 93 |
| `packages/domain` | 11 | 217 |
| `packages/application` | 29 | 302 |
| `packages/infrastructure` | 29 | 474 |
| `apps/web` | 29 | 346 |

### Tests nuevos de 7D.1 (49)

| Archivo | Tests | Cobertura |
|---|---|---|
| `packages/infrastructure/src/ai/campaign-ai-provider.factory.test.ts` | 11 | F1–F3 construcción por proveedor · F4 provider no soportado · F5 falta config · F6 default desde env · F7 default documentado · F8 default inválido no cae al fallback · F9 resolución de modelo · F10 sin filtración de key · F11 sin fallback automático |
| `packages/infrastructure/src/ai/openai-api.provider.test.ts` | 12 | O1 success · O2 respuesta malformada · O3 401 saneado · O4 403 · O5 429 · O6 5xx · O7 timeout · O8 error de red · O9 sin key sin `fetch` · O10 sin filtración de secretos · O11 modelo + JSON estructurado · O12 prioridad de `request.model` |
| `packages/infrastructure/src/ai/gemini-api.provider.test.ts` | 12 | E1–E9 equivalentes a OpenAI · E10 key en header y **nunca** en URL · E11 traducción al formato Gemini · E12 modelo en la URL |
| `packages/infrastructure/src/ai/campaign-generator.adapter.multi-provider.test.ts` | 8 | M1/M2 mismo schema y `metadata.provider` correcto con los 3 · M3 default · M4 provider seleccionado · M5 provider inválido sin llamar al proveedor · M6 no configurado · M7 output inválido con los 3 · M8 modelo server-side inyectado · M9 sin fallback automático |
| `packages/application/…/campaign-ai-provider-selection.use-case.test.ts` | 8 | P1 propagación · P2 sin provider · P3 provider fuera del enum (sin puerto, sin persistencia) · P4/P5 metadata persistida por proveedor · P6 regenerate reutiliza el previo · P7 override explícito · P8 metadata corrupta ignorada |
| `apps/web/…/campaigns/__tests__/actions.test.ts` | 10 | S1 provider válido · S2 omitido · S3 `''` · S4 arbitrario → `VALIDATION_ERROR` sin invocar el use case · S5 apiKey/model/apiUrl del cliente descartados · S6/S7/S10 regenerate · S8 rol insuficiente · S9 error de configuración saneado |
| `apps/web/…/campaigns/__tests__/AIProviderSelect.test.tsx` | 8 | U1 solo proveedores implementados (y "Claude Code" ausente) · U2 opción default con value `''` · U3 emite id, no etiqueta · U4 sin selector de modelo ni API key · U5 visible en modo IA · U6 oculto en modo manual · U7 manual no envía provider · U8 IA envía el provider elegido |

### Regresión verificada (sin editar los archivos de test)

- `claude-api.provider.test.ts` — 11/11 ✅ (A1–A11 de 7D, incluidos los que dependen de `ANTHROPIC_MODEL`/`ANTHROPIC_API_VERSION` y del `reason` de los errores).
- `campaign-generator.adapter.test.ts` — 10/10 ✅ (G1–G10 de 7D, con la forma antigua del constructor y `metadata.provider === 'anthropic'`).
- `campaign-prompt-builder.test.ts` — 14/14 ✅.
- `generate-campaign-draft-with-ai.use-case.test.ts` 14/14, `regenerate-campaign-content.use-case.test.ts` 14/14, y toda la suite de 7C (`approve` 10, `reject` 11, `submit` 9, compliance 6+5, approvals 5) ✅.
- `phase7c-migration-security.test.ts` 16/16 ✅.
- Suites de UI de 7E (346 tests en `apps/web`) ✅.

### `typecheck` y `lint`

`tsc --noEmit` limpio en `packages/shared`, `packages/domain`, `packages/application`, `packages/infrastructure` y `apps/web` — incluyendo la desaparición de los `TS2307/TS18046/TS7006` pre-existentes descritos en §2.
`eslint` limpio (cero errores, cero warnings) sobre todos los archivos nuevos y modificados.

---

## 21. Nota de entorno — cómo se ejecutaron los tests

`PHASE_7E_CAMPAIGN_STUDIO_UI_REPORT.md` §3 y el risk register (R-TECH-09) documentan que `vitest` **no puede ejecutarse** contra el `node_modules` del proyecto desde un sandbox Linux, porque ese `node_modules` fue instalado en Windows y solo contiene los binarios nativos `@rollup/rollup-win32-*`. Se confirmó que el problema persiste (`Cannot find module '@rollup/rollup-linux-x64-gnu'`) y que no es un defecto de código.

Para no volver a entregar 7D.1 con la suite sin ejecutar, se usó este procedimiento (solo lectura sobre el repo del usuario):

1. `tar` del código fuente **excluyendo** `node_modules`, `.git`, `.next`, `backups`, `migration-output`, `tmp` y `*.dump` (2.4 MB).
2. Copia del tarball a una máquina Linux con red, `npm install` limpio (que sí instala el binario nativo correcto) y ejecución de las cinco suites.
3. Los resultados de §20 provienen de esa ejecución, sobre **exactamente el mismo código** que quedó en el working tree.

**Verificación recomendada del usuario en Windows** (donde el `node_modules` real está instalado):

```
npm run typecheck
npm run lint
npm run test --workspaces
```

**Residuo a limpiar:** el tarball intermedio quedó en `tmp/7d1-verify/bopia-src.tgz` (más un `tmp/.__rmtest` vacío). `tmp/` está en `.gitignore`, así que no afecta a `git status`, pero conviene borrar esa carpeta manualmente — la herramienta usada en esta sesión no puede eliminar archivos en el disco del usuario.

---

## 22. Diferido explícitamente

### Fallback automático (§16 de la especificación) — NO implementado

No hay ningún camino "Gemini falla → OpenAI → Claude". Un proveedor mal configurado o caído produce un error explícito, no un cambio silencioso de proveedor. Verificado por los tests `F11` y `M9`. Motivo: observabilidad y comportamiento predecible; un fallback silencioso haría que `metadata.ai.provider` dejara de explicar por qué una campaña salió como salió, y ocultaría un problema de configuración.

Si en el futuro se decide implementarlo, el punto de extensión natural es un decorador sobre `CampaignAIProviderResolver` o un envoltorio del `CampaignGeneratorPort` — **ninguna de las capas actuales tendría que reescribirse**, y debería registrarse en `metadata.ai` el proveedor efectivamente usado y el/los que fallaron.

### Modo comparar proveedores (§17) — NO implementado, arquitectura preparada

"Comparar proveedores" (ejecutar el mismo brief en varios proveedores y mostrar los resultados lado a lado) es viable **sin reescritura** porque:

- el proveedor se resuelve **por llamada** (`input.provider`), no en el constructor del adapter;
- `CampaignGeneratorPort.generate()` es puro respecto a la persistencia (quien persiste es el use case);
- `metadata.ai.provider` ya identifica cada resultado.

Un futuro `compareCampaignGeneration` sería un use case nuevo que llama `generate()` N veces con distinto `provider` y **no persiste** (o persiste N drafts explícitos). Decisiones pendientes: coste (N llamadas por brief), UI de comparación y si se persiste algo. No se tocó nada de esto en 7D.1.

### Otros diferidos heredados

- Historial de regeneraciones (R-TECH-07 de 7D): sigue sin existir — regenerar sobrescribe `generated_content` y `metadata.ai` sin dejar rastro. Con multi-provider esto pesa algo más (se pierde el resultado del proveedor anterior al probar otro); documentado como riesgo, no resuelto aquí.
- Selector de modelo en UI: fuera de alcance por decisión explícita (§14).
- Plataformas de generación: siguen siendo `meta_ads`/`google_ads` (`SUPPORTED_GENERATION_PLATFORMS`), sin cambios.

---

## 23. Archivos nuevos / modificados

### Nuevos (10 de producción + 6 de test + 1 doc)

```
packages/shared/src/constants/ai-providers.ts
packages/infrastructure/src/ai/ai-provider-config.ts
packages/infrastructure/src/ai/provider-http.ts
packages/infrastructure/src/ai/openai-api.provider.ts
packages/infrastructure/src/ai/gemini-api.provider.ts
packages/infrastructure/src/ai/campaign-ai-provider.factory.ts
apps/web/src/components/campaigns/AIProviderSelect.tsx
packages/infrastructure/src/ai/campaign-ai-provider.factory.test.ts
packages/infrastructure/src/ai/openai-api.provider.test.ts
packages/infrastructure/src/ai/gemini-api.provider.test.ts
packages/infrastructure/src/ai/campaign-generator.adapter.multi-provider.test.ts
packages/application/src/use-cases/campaigns/__tests__/campaign-ai-provider-selection.use-case.test.ts
apps/web/src/app/(protected)/campaigns/__tests__/actions.test.ts
apps/web/src/components/campaigns/__tests__/AIProviderSelect.test.tsx
docs/implementation/phase-7/PHASE_7D1_MULTI_PROVIDER_AI_REPORT.md
```

### Modificados

```
packages/shared/src/index.ts                                   (export de ai-providers)
packages/shared/src/schemas/campaign.schema.ts                 (provider en los 2 schemas de IA)
packages/domain/src/errors/domain.errors.ts                    (AIErrorKind, getAiErrorKind, aiUnsupportedProvider, details en errores de IA)
packages/domain/src/entities/campaign-generated-content.ts     (AIGenerationMetadata.provider: AIProviderId)
packages/application/src/ports/campaign-generator.port.ts      (provider? en el input; metadata.provider tipado)
packages/application/src/use-cases/campaigns/generate-campaign-draft-with-ai.use-case.ts
packages/application/src/use-cases/campaigns/regenerate-campaign-content.use-case.ts
packages/infrastructure/src/ai/claude-api.provider.ts          (refactor a config/errores compartidos + alias)
packages/infrastructure/src/ai/campaign-generator.adapter.ts   (resolución por llamada, compat 7D)
packages/infrastructure/src/index.ts                           (barrel 7D.1)
packages/infrastructure/tsconfig.json                          (path @bop-agency/ai-engine — fix pre-existente)
packages/infrastructure/vitest.config.ts                       (alias @bop-agency/ai-engine)
apps/web/tsconfig.json                                         (path @bop-agency/ai-engine — fix pre-existente)
apps/web/vitest.config.ts                                      (alias @bop-agency/ai-engine)
apps/web/src/lib/composition/campaign.composition.ts           (factoría en vez de instancia fija)
apps/web/src/app/(protected)/campaigns/actions.ts              (provider validado por enum)
apps/web/src/app/(protected)/campaigns/[id]/page.tsx           (lee metadata.ai.provider)
apps/web/src/components/campaigns/CampaignWizardForm.tsx       (selector en modo IA)
apps/web/src/components/campaigns/RegenerateContentButton.tsx  (selector opcional al regenerar)
apps/web/.env.example                                          (bloque 7D.1)
.env.example                                                   (bloque 7D.1 resumido)
```

**No modificados a propósito:** `campaign-prompt-builder.ts`, `campaign-generated-content.schema.ts`, `claude-api.provider.test.ts`, `campaign-generator.adapter.test.ts`, `package.json`, `package-lock.json`, `supabase/migrations/**`, `.agencia-ai/**`.

---

## 24. Restricciones cumplidas

| Restricción | Estado |
|---|---|
| NO producción | ✅ nada se desplegó ni se ejecutó contra un entorno real |
| NO Supabase cloud | ✅ ninguna conexión ni migración |
| NO n8n | ✅ no se tocó |
| NO publishing externo | ✅ cero endpoints de Meta/Google/YouTube |
| NO service_role | ✅ cero usos nuevos |
| NO `git add` / commit / push | ✅ working tree intacto en cuanto a staging |
| NO borrar el Claude provider | ✅ conservado, con su suite original verde |
| NO cambiar el schema de generated content | ✅ sin cambios |
| NO romper 7E | ✅ 346 tests de `apps/web` verdes; UI 7E funcionando con el selector añadido |
| Archivo ajeno fuera de alcance | ✅ `.agencia-ai/.claude/commands/new-client.md` no tocado |

---
---

# Phase 7D.1.1 — Correcciones tras el smoke real con Google Gemini

**Fecha:** 2026-08-18
**Rama:** `feat/phase-7-campaign-studio` · **HEAD:** `5605823` (sin commit, igual que 7D.1)
**Estado:** ✅ IMPLEMENTADO — sin `git add`, sin commit, sin push, sin migraciones, sin producción / Supabase cloud / n8n / publicación externa.

## 25. Resultado del smoke real (Google Gemini)

Configuración usada: `CAMPAIGN_AI_DEFAULT_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.6-flash`, `CAMPAIGN_AI_TIMEOUT_MS=30000`.

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Generación inicial con Gemini | ✅ **PASÓ** — primera generación end-to-end real de Campaign Studio |
| 2 | Campaña creada en `draft` | ✅ PASÓ — nunca `review`/`approved`, sin publicación externa |
| 3 | Contenido estructurado validado, persistido y renderizado | ✅ PASÓ — `campaignGeneratedContentSchema` + `GeneratedContentView` |
| 4 | Regeneración con Gemini | ❌ **FALLÓ**: `AI campaign generation request timed out.` |
| 5 | Tras el fallo, la campaña siguió en `draft` conservando el contenido previo | ✅ PASÓ — el diseño de "no persistir si la generación falla" (7D) se comportó como se esperaba |
| 6a | Presupuesto mostrado | ❌ **$0** pese a haberse ingresado presupuesto en el formulario |
| 6b | Nombre de la campaña | ❌ frase generada excesivamente larga (párrafo de concepto completo) |

Los cuatro defectos (4, 6a, 6b y el copy técnico que vio el usuario) se corrigen en esta subfase.

---

## 26. Timeout y reintentos

### 26.1 Auditoría previa

`provider-http.ts` de 7D.1 solo aportaba factorías de error; el bucle de red vivía en cada provider: un único `fetch` con `AbortController`, **sin reintentos**. Cualquier hipo transitorio del proveedor (429, 5xx, corte de socket, pico de latencia) se propagaba directo al usuario como fallo definitivo. Es exactamente lo que ocurrió en el punto 4 del smoke.

### 26.2 Diseño implementado

Se movió TODO el ciclo de red a `fetchProviderJson()` en `provider-http.ts`; los tres providers ahora solo construyen el body y mapean la respuesta. Un único sitio define la política, imposible de divergir entre proveedores.

**Se reintenta** (transitorio): HTTP `429`, `500`, `502`, `503`, `504`; errores de red/fetch; y **timeout** (`AbortError`).

**No se reintenta**: `400`, `401`, `403`, `404` y cualquier otro 4xx distinto de 429; proveedor no configurado (ni siquiera se llama a `fetch`); body 200 no-JSON; y la validación de schema del contenido generado (ocurre aguas arriba, en el adapter).

- **Máximo 3 intentos totales** (1 + 2 reintentos), configurable a la baja con `CAMPAIGN_AI_MAX_ATTEMPTS` y **acotado por arriba a 3** — un valor mayor en el entorno se ignora.
- **Backoff exponencial determinístico** (sin jitter, para que los tests sean reproducibles): 500 ms, 1000 ms. Configurable con `CAMPAIGN_AI_RETRY_BASE_DELAY_MS`.
- **`AbortController` nuevo por intento** — reutilizarlo dejaría el segundo intento abortado desde el inicio. Verificado por el test R12, que comprueba que los tres `signal` son objetos distintos.
- **Sin fallback automático entre proveedores**: los reintentos van siempre al mismo proveedor y a la misma URL (test R16). La decisión de §16 sigue en pie.

### 26.3 ¿Es seguro reintentar un timeout?

Sí en este flujo concreto: `complete()` es una llamada de solo generación. No escribe en nuestra BD (la persistencia ocurre en el use case, **después** de validar el output) y no dispara ninguna acción externa. El único coste de un intento duplicado es que el proveedor podría facturar la llamada abortada. Se acepta ese coste a cambio de no perder la generación — y por eso existe la cota de presupuesto total.

### 26.4 Cota de tiempo total

Tres intentos de 60 s encadenados mantendrían una Server Action viva ~3 minutos. Antes de programar cada reintento se comprueba que `transcurrido + backoff + otro intento completo` quepa en `CAMPAIGN_AI_TOTAL_BUDGET_MS` (default: el doble del timeout por intento, tope 240 000 ms). Si no cabe, se abandona con el error del último intento.

Es un guard de **tiempo**, no de conteo: un 503 que falla en 5 ms deja presupuesto de sobra y sí se reintenta; una cadena de timeouts de 60 s se corta tras el primero. El test R14 lo verifica avanzando el reloj.

## 27. Timeout por defecto: 30 000 → 60 000 ms

`DEFAULT_CAMPAIGN_AI_TIMEOUT_MS` pasa de 30 000 a **60 000 ms**. La generación de una campaña completa (concepto + audiencia + mensajes + ad sets + creatividades) es una respuesta larga; 30 s era un presupuesto optimista para un modelo grande bajo carga, y el smoke lo demostró.

Rango de seguridad **sin cambios: 5 000–120 000 ms** — por debajo de 5 s no cabe ninguna generación real, y por encima de 120 s la Server Action queda colgada más de lo que tolera cualquier proxy/hosting razonable. Un valor fuera de rango o no numérico cae al default (es configuración operativa, no una decisión de negocio como `CAMPAIGN_AI_DEFAULT_PROVIDER`, que sí falla explícitamente).

> ⚠️ **Acción requerida:** tu `apps/web/.env.local` tiene `CAMPAIGN_AI_TIMEOUT_MS=30000`, que **prevalece sobre el default de código**. Súbelo a `60000` (o elimina la línea) para que el cambio surta efecto en tu entorno.

`.env.example` (raíz y `apps/web`) documenta las cuatro variables nuevas/actualizadas, sin secretos.

## 28. Mensajes de error orientados al usuario

Antes, `mapError` propagaba `AppError.message` tal cual para `EXTERNAL_SERVICE_ERROR`. Estaba saneado (sin keys ni body crudo), pero lo que el usuario leía era `AI campaign generation request timed out.` — técnico, en inglés y sin indicar qué hacer.

Ahora el mapeo se hace por **`aiErrorKind`** (la dimensión normalizada que 7D.1 añadió a `details`), no por el texto del mensaje, de modo que el copy no depende de cómo redacte el error una capa interna:

| `aiErrorKind` | Mensaje mostrado |
|---|---|
| `AI_TIMEOUT` | La generación con IA tardó más de lo esperado. Intenta nuevamente. |
| `AI_RATE_LIMITED` | El proveedor de IA está temporalmente limitado. Intenta nuevamente en unos momentos. |
| `AI_EXTERNAL_SERVICE_ERROR` (5xx) | El proveedor de IA no está disponible temporalmente. Intenta nuevamente. |
| `AI_PROVIDER_NOT_CONFIGURED` | El proveedor de IA seleccionado no está configurado en el servidor. Elige otro proveedor o avisa a un administrador. |
| `AI_INVALID_OUTPUT` | La IA devolvió un resultado que no pudimos interpretar. Intenta nuevamente o ajusta el brief. |
| `AI_UNSUPPORTED_PROVIDER` | El proveedor de IA seleccionado no está disponible. |

Los `VALIDATION_ERROR` normales **sí** conservan su mensaje: son accionables por el usuario ("El brief es requerido…"). Los `details` internos (`provider`, `statusCode`, `attempts`, `aiErrorKind`) siguen disponibles en logs y tests, pero **nunca** viajan al cliente: `ActionFailure` solo lleva `{ ok, error, code }` (test T6).

## 29. Bug de presupuesto ($0) — causa raíz y corrección

### 29.1 Traza completa

Se recorrió el flujo entero: `CampaignWizardForm` → Server Action → `generateCampaignDraftWithAiSchema` → `generateCampaignDraftWithAI` → `CampaignRepository.create()` → `campaign.mapper` → columna `campaigns.budget numeric(14,2) NOT NULL CHECK (budget >= 0)` → `formatBudget` en UI.

Resultados de la traza:

- La columna **no tiene DEFAULT**, así que un INSERT sin `budget` habría fallado, no puesto 0 ⇒ el 0 **se envió** explícitamente.
- El trigger `manage_campaign_write` solo toca `created_by`/`updated_by` ⇒ no reescribe el importe.
- Repositorio, mapper (`parseBudget`, tolerante a `numeric` como string) y `formatBudget` están correctos ⇒ el 0 no nace en persistencia ni en presentación.

### 29.2 Causa raíz

`budget: z.coerce.number().min(0)`.

`z.coerce.number()` es un footgun para dinero: **`Number(null)`, `Number('')`, `Number(false)` y `Number([])` valen todos `0`**, y `0` pasa `.min(0)` sin objeción. Es decir: **cualquier** forma en que el presupuesto no llegara como número real al servidor (campo vacío, valor perdido al construir el payload, `null` explícito) se convertía **silenciosamente** en un presupuesto de 0 y se persistía como legítimo, en vez de fallar con un error de validación visible. Exactamente el síntoma reportado: "$0 aunque se había ingresado presupuesto".

A esto se sumaba que el formulario aceptaba `budgetNumber === 0` como válido (`budgetNumber < 0` era la única cota), de modo que un 0 nunca se detenía en cliente.

### 29.3 Corrección

1. **`budgetAmountSchema`** (nuevo, `packages/shared/src/schemas/campaign.schema.ts`) sustituye a `z.coerce.number()` en los tres schemas de campaña. Acepta un número finito o una cadena estrictamente numérica (tolerando espacios/NBSP y separadores de miles al pegar un valor) y **rechaza** `null`, `undefined`, `''`, booleanos, arrays, objetos, `NaN` e `Infinity` con el mensaje "El presupuesto es requerido y debe ser un número válido". `parseBudgetAmount()` se exporta para testear la regla aislada.
2. **Formulario**: se exige `budget > 0` ("Ingresa un presupuesto válido mayor a 0."), porque un 0 es indistinguible de "no se ingresó nada" y era justo el síntoma.
3. **El importe nunca proviene de la IA**: el formulario es la única fuente de verdad. `generated_content` no aporta ni puede aportar el presupuesto (test D2).

### 29.4 Honestidad sobre el alcance de la corrección

No fue posible reproducir el INSERT exacto que produjo el 0 (habría requerido consultar el Supabase local del usuario, fuera del alcance de esta sesión). Lo que sí está probado es que **la única vía por la que un valor no numérico podía convertirse en un presupuesto de 0 persistido está ahora cerrada**, y que un presupuesto legítimo sobrevive intacto de extremo a extremo de la capa de aplicación (tests D1–D5, D9). Si tras aplicar esto reapareciera un $0, el flujo ya no lo aceptaría en silencio: fallaría con un error de validación visible que identifica el campo.

## 30. Nombre de campaña

**Causa:** `deriveCampaignName()` usaba el `campaignConcept` **completo** — un párrafo narrativo — truncado a 200 caracteres (el límite de BD), no a algo legible en una tabla.

**Regla nueva** (en dominio, `packages/domain/src/entities/campaign.ts`, porque es una invariante de la entidad y no del caso de uso):

1. **Si el usuario proporcionó un nombre, ese es el nombre.** El wizard ahora ofrece el campo "Nombre de la campaña" también en modo IA, marcado como *(opcional)*; `generateCampaignDraftWithAiSchema` acepta `name?` (máx. 200).
2. Si no, `deriveCampaignNameFromConcept()` deriva un titular: corta en el primer límite de oración/cláusula (`.`, `!`, `?`, `;`, `:`, salto de línea, raya), colapsa espacios y acota a **`AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH = 80`** cortando en frontera de palabra y marcando con `…`.
3. Si no queda nada usable, fallback determinístico `${platform} — AI draft`.

`CAMPAIGN_NAME_MAX_LENGTH = 200` sigue siendo el límite duro (alineado con `CHECK (char_length(name) BETWEEN 1 AND 200)`) y se aplica también al nombre del usuario.

**No se tocó el schema de `generated_content`**: el título se deriva del `campaignConcept` que ya existía.

## 31. Modelo por defecto de Gemini

`DEFAULT_MODELS.gemini` pasa de `gemini-1.5-flash` (obsoleto) a **`gemini-3.6-flash`**.

No es una conjetura: es exactamente el identificador con el que **funcionó la generación inicial del smoke real** de este proyecto (`GEMINI_MODEL=gemini-3.6-flash` en `apps/web/.env.local`), y es un modelo vigente de la Generative Language API. Existen modelos más recientes (familia 3.7); cambiar a uno de ellos exige repetir el smoke, no editar la constante a ciegas.

> ⚠️ `DEFAULT_MODELS.anthropic` sigue siendo `claude-3-5-sonnet-20241022`, heredado de 7D y **no verificado en ningún smoke** — muy probablemente también obsoleto. No se cambió precisamente por la regla de "no adivinar". Registrado como **R-TECH-13**: antes de usar el proveedor `anthropic` en serio, fijar `ANTHROPIC_MODEL` en el entorno y verificar. Lo mismo aplica, en menor medida, a `gpt-4o-mini` para OpenAI.

## 32. Tests

Ejecución completa (mismo procedimiento de §21 — código fuente sin `node_modules` copiado a Linux con red e instalado limpio). **1501 tests, 0 fallos.**

| Paquete | Antes (7D.1) | Ahora | Δ |
|---|---|---|---|
| `packages/shared` | 93 | **106** | +13 |
| `packages/domain` | 217 | **229** | +12 |
| `packages/application` | 302 | **312** | +10 |
| `packages/infrastructure` | 474 | **502** | +28 |
| `apps/web` | 346 | **352** | +6 |
| **Total** | **1432** | **1501** | **+69** |

### Archivos de test nuevos de 7D.1.1

| Archivo | Tests | Cobertura |
|---|---|---|
| `packages/infrastructure/src/ai/provider-http-retry.test.ts` | 18 | R1 429 reintentado · R2 500/502/503/504 · R3–R6 400/401/403/404 **sin** reintento · R7 timeout reintentado · R8 error de red · R9 éxito en el 2.º intento · R10 último error preservado · R11 `attempts` real · R12 un `AbortController` por intento · R13 `MAX_ATTEMPTS=1` desactiva · R14 corte por presupuesto · R15 body no-JSON sin reintento · R16 sin fallback de proveedor · R17 sin fuga de key/body · R18 camino feliz · R2a lista de statuses |
| `packages/infrastructure/src/ai/ai-provider-config.test.ts` | 10 | C1 default 60 000 · C2 rango 5 000–120 000 · C3 fuera de rango → default · C4 intentos 3 (tope duro) · C5 backoff 500 · C6/C7 presupuesto total · C8 default de Gemini ya no obsoleto · C9 default = modelo del smoke · C10 prioridad del env |
| `packages/shared/src/schemas/__tests__/campaign-budget.schema.test.ts` | 13 | B1–B3 números/cadenas/separadores · **B4–B8 `null`/`''`/`undefined`/`false`/`[]` ya NO valen 0** · B9 NaN/Infinity · B10 texto · B11 negativo · B12 0 explícito válido a nivel schema · B13 misma regla en los schemas manual y de IA |
| `packages/domain/src/__tests__/campaign-name.test.ts` | 12 | N1–N3 el nombre del usuario manda · N4–N6 corte por oración/`;`/`:`/salto/raya · N7 límite 80 · N8 frontera de palabra + `…` · N9 fallback · N10 palabra larguísima · N11 límite duro 200 · N12 sin saltos de línea |
| `packages/application/…/campaign-budget-and-name.use-case.test.ts` | 10 | D1 presupuesto intacto hasta el INSERT · D2 viene del formulario, no de la IA · D3 decimales/montos grandes · **D4 budget nulo/vacío rechazado en vez de 0** · D5 llega correcto al puerto · D6 nombre del usuario preservado · D7/D8 título conciso, nunca el párrafo · D9 moneda preservada |
| `apps/web/…/campaigns/__tests__/actions.test.ts` (ampliado) | +6 | T1 `AI_TIMEOUT` · T2 `AI_RATE_LIMITED` · T3 5xx sin status ni jerga · T4 `AI_INVALID_OUTPUT` sin rutas de campo · T5 `VALIDATION_ERROR` conserva su mensaje · T6 los `details` internos nunca llegan al cliente |

### Tests existentes ajustados (cambio de comportamiento deliberado)

`openai-api.provider.test.ts`, `gemini-api.provider.test.ts` y `claude-api.provider.test.ts`: los casos de 429/5xx/timeout/red usaban `mockResolvedValueOnce`, que asumía **un solo intento**. Se cambiaron a mocks persistentes y se fija `CAMPAIGN_AI_RETRY_BASE_DELAY_MS=0` para que la suite no duerma. Las aserciones de contenido (códigos, saneado, cabeceras) **no se relajaron**.

### `typecheck` y `lint`

`tsc --noEmit` limpio en los cinco paquetes (verificado tanto en el entorno de ejecución como sobre el working tree real del usuario). `eslint` limpio, cero warnings, en todo el código nuevo y modificado.

## 33. Archivos tocados en 7D.1.1

**Nuevos (5):**

```
packages/shared/src/schemas/__tests__/campaign-budget.schema.test.ts
packages/domain/src/__tests__/campaign-name.test.ts
packages/application/src/use-cases/campaigns/__tests__/campaign-budget-and-name.use-case.test.ts
packages/infrastructure/src/ai/provider-http-retry.test.ts
packages/infrastructure/src/ai/ai-provider-config.test.ts
```

**Modificados (18):**

```
packages/infrastructure/src/ai/provider-http.ts            (motor de retry/backoff/presupuesto)
packages/infrastructure/src/ai/ai-provider-config.ts       (timeout 60s, intentos, backoff, presupuesto, modelo Gemini)
packages/infrastructure/src/ai/openai-api.provider.ts      (delega la red en fetchProviderJson)
packages/infrastructure/src/ai/gemini-api.provider.ts      (idem)
packages/infrastructure/src/ai/claude-api.provider.ts      (idem)
packages/infrastructure/src/ai/{openai,gemini,claude}-api.provider.test.ts  (mocks persistentes + backoff 0)
packages/shared/src/schemas/campaign.schema.ts             (budgetAmountSchema, name opcional en IA)
packages/shared/src/index.ts                               (export de budgetAmountSchema/parseBudgetAmount)
packages/domain/src/entities/campaign.ts                   (reglas de nombre)
packages/domain/src/index.ts                               (exports de nombre)
packages/application/…/generate-campaign-draft-with-ai.use-case.ts  (name opcional + buildCampaignName)
apps/web/src/app/(protected)/campaigns/actions.ts          (mapError por aiErrorKind + name)
apps/web/src/app/(protected)/campaigns/__tests__/actions.test.ts
apps/web/src/components/campaigns/CampaignWizardForm.tsx   (nombre opcional en IA, budget > 0)
apps/web/.env.example                                      (timeout/reintentos/modelo Gemini)
.env.example                                               (idem, resumido)
```

**No tocados a propósito:** el schema de `generated_content`, el prompt builder, la factoría de proveedores, `campaign-generator.adapter.ts`, `supabase/migrations/**`, `supabase/config.toml`, `package.json`/`package-lock.json`, `.agencia-ai/**`.

**Migraciones:** ninguna. **Dependencias nuevas:** ninguna.
