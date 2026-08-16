# Phase 7 — Auditoría de Campaign Studio
**Fecha:** 2026-08-16
**Rama:** main
**Commit base:** `3fc9fee` (fix(phase-6): finalize automation runtime staging validation)
**Estado del working tree en el momento de la auditoría:** limpio, salvo un archivo no rastreado y ajeno a esta auditoría: `.agencia-ai/.claude/commands/new-client.md` (no se tocó).

Esta auditoría es de solo lectura. No se modificó código funcional, no se crearon migraciones, no se ejecutó Supabase ni n8n, y no se hizo commit.

---

## 1. Inventario del código actual de Campaigns

### 1.1 Entidad `Campaign` (`packages/domain/src/entities/campaign.ts`)

```ts
export type CampaignId = string & { readonly _brand: 'CampaignId' };

export type CampaignObjective =
  | 'brand_awareness' | 'reach' | 'traffic' | 'engagement'
  | 'lead_generation' | 'conversions' | 'catalog_sales';

export type Campaign = {
  readonly id: CampaignId;
  readonly clientId: ClientId;
  readonly name: string;
  readonly platform: AdPlatform;
  readonly objective: CampaignObjective;
  readonly status: CampaignStatus;
  readonly budget: number;
  readonly currency: string;
  readonly startDate?: Date;
  readonly endDate?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type CampaignFilter = {
  readonly clientId?: ClientId;
  readonly status?: CampaignStatus;
  readonly platform?: AdPlatform;
};
```

**Hallazgo importante:** `Campaign` **no tiene `organizationId`**. Todas las demás entidades operativas del proyecto (`Client`, `tasks`, `client_metrics`, `automations`, etc.) llevan `organizationId` explícito además de `clientId`, tanto en el dominio como en la tabla física, y las políticas RLS del proyecto (`is_organization_member(organization_id)`, `has_organization_role(organization_id, role)`) dependen de esa columna estando presente y directamente indexada. Esto es una brecha de diseño que Phase 7 debe cerrar — ver §9.

### 1.2 `CampaignStatus` (`packages/shared/src/constants/status.ts`)

```ts
export const CAMPAIGN_STATUSES = [
  'draft', 'review', 'approved', 'active', 'paused', 'completed', 'rejected',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
```

Ya incluye `review`, `approved` y `rejected`, es decir el enum **ya está diseñado para soportar un flujo de aprobación** (7.4/7.5 del roadmap), aunque ese flujo no existe todavía en ninguna capa.

### 1.3 `CampaignFilter`

Definido junto a la entidad (arriba): `clientId?`, `status?`, `platform?`. No incluye `organizationId` — mismo gap que 1.1.

### 1.4 Contrato `CampaignRepository` (`packages/domain/src/repositories/campaign.repository.ts`)

```ts
export interface CampaignRepository {
  findById(id: CampaignId): Promise<Result<Campaign>>;
  findAll(filter: CampaignFilter, pagination: PaginationParams): Promise<PaginatedResult<Campaign>>;
  create(data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Campaign>>;
  update(id: CampaignId, data: Partial<Campaign>): Promise<Result<Campaign>>;
  delete(id: CampaignId): Promise<Result<void>>;
}
```

Solo interfaz. **Cero implementaciones** (ni Supabase, ni in-memory, ni fake para tests). No hay mapper. `delete` es borrado físico, lo que rompe con el patrón de soft-delete (`deleted_at`) usado en el resto del proyecto (clients, tasks, automations).

### 1.5 Use cases existentes (`packages/application/src/use-cases/campaigns/`)

Solo dos, ambos exportados desde `packages/application/src/index.ts`:

- **`listCampaigns`** — funcional a nivel de use case: llama a `campaignRepository.findAll(filter, pagination)` y envuelve en `ok()`. Depende de `CampaignRepository`, que no tiene implementación real, así que **no puede ejecutarse contra datos reales** hoy.
- **`createCampaignDraft`** — **stub explícito**: `return err(notImplemented('createCampaignDraft'))`, con comentario `// Stub — Fase 2+: implementar con validación de presupuesto y configuración Meta API.`

No existen use cases para: `getCampaign`, `updateCampaign`, `approveCampaign`, `rejectCampaign`, `createCampaignWithAI`, ni nada de `compliance_rules` o `campaign_approvals`.

### 1.6 Infraestructura (`packages/infrastructure/src/`)

**No existe ningún archivo relacionado con campaigns** en infrastructure: ni repositorio Supabase, ni repositorio in-memory, ni mapper. Se buscó explícitamente `SupabaseCampaignRepository`, `campaign.mapper.ts` y variantes — no aparecen. Contrasta con `metrics`, que sí tiene `supabase-metrics.repository.ts` + `metric.mapper.ts` + tests.

### 1.7 Páginas / componentes (`apps/web/src/app/(protected)/campaigns/`)

Solo dos archivos, ambos placeholders puros (ver §3 para el detalle):

- `campaigns/page.tsx`
- `campaigns/new/page.tsx`

**No existe** `campaigns/[id]/page.tsx`. **No existe** ningún componente `CampaignApprovalPanel` en todo el repo (`apps/web/src/components`, ni en ningún otro lugar) — la única mención de ese nombre en todo el proyecto está en `docs/architecture/IMPLEMENTATION_ROADMAP.md`, como ítem pendiente.

### 1.8 `apps/web/src/lib/`

No hay `campaign.composition.ts`, ni Server Actions de campaigns (`campaigns/actions.ts` no existe), ni cliente de datos para campaigns. Sí existe `apps/web/src/lib/placeholder-data.ts` con datos demo (ver 1.10).

### 1.9 `packages/shared/`

- `CampaignStatus` vive aquí (§1.2).
- **No hay** `campaign.schema.ts` en `packages/shared/src/schemas/` (el directorio solo tiene `alert.schema.ts`, `automation.schema.ts`, `client.schema.ts`, `common.schema.ts`, `task.schema.ts`). Es decir: **cero schemas Zod para campaigns.**

### 1.10 Datos demo / placeholder

`apps/web/src/lib/placeholder-data.ts` define `DemoCampaign` y un array `demoCampaigns` (3 campañas ficticias, con comentario explícito `⚠️ DEMO: Ningún dato aquí es real` y `Fase 4+: reemplazar con datos reales de Supabase`). **Este array no se usa en ningún lado** — `campaigns/page.tsx` no lo importa, ninguna otra página lo importa. Es código muerto hoy, dejado de una fase anterior a la actual del proyecto (probablemente pre-Fase 6, cuando el placeholder era el plan a corto plazo).

### 1.11 Tests existentes

**Ninguno.** No existe ningún archivo de test para campaigns en ninguna capa (`*campaign*test*`, `*campaign*spec*` no devuelven resultados). Para comparación: `automations`, `clients`, `tasks`, `alerts` y `metrics` sí tienen suites de tests (`__tests__/`) en application, domain e infrastructure.

### Resumen tabular — inventario

| Pieza | Estado | Ubicación |
|---|---|---|
| Entidad `Campaign` | ✅ Definida (sin `organizationId`) | `packages/domain/src/entities/campaign.ts` |
| `CampaignStatus` | ✅ Definido, ya soporta approval flow | `packages/shared/src/constants/status.ts` |
| `CampaignFilter` | ✅ Definido (sin `organizationId`) | junto a la entidad |
| `CampaignRepository` (interfaz) | ✅ Definida | `packages/domain/src/repositories/campaign.repository.ts` |
| `CampaignRepository` (implementación) | ❌ No existe | — |
| Mapper Supabase | ❌ No existe | — |
| Use case `listCampaigns` | 🟡 Escrito, no ejecutable (sin repo real) | `packages/application/src/use-cases/campaigns/` |
| Use case `createCampaignDraft` | 🟡 Stub explícito (`notImplemented`) | ídem |
| Use cases approve/reject/AI | ❌ No existen | — |
| Server Actions | ❌ No existen | — |
| `campaigns/page.tsx` | 🟡 Placeholder `UnderConstruction` | `apps/web/src/app/(protected)/campaigns/page.tsx` |
| `campaigns/new/page.tsx` | 🟡 Placeholder `UnderConstruction` | ídem `/new` |
| `campaigns/[id]/page.tsx` | ❌ No existe | — |
| `CampaignApprovalPanel` | ❌ No existe (solo mencionado en roadmap) | — |
| Schema Zod | ❌ No existe | — |
| Tests | ❌ Ninguno | — |
| Datos demo `demoCampaigns` | 🟡 Existen pero no se usan (código muerto) | `apps/web/src/lib/placeholder-data.ts` |

---

## 2. Auditoría de base de datos real versionada

Se revisaron las 9 migraciones existentes en `supabase/migrations/` (todo el `CREATE TABLE IF NOT EXISTS public.*` del repo) y `apps/web/src/lib/supabase/database.types.ts`.

### A. Campañas operativas externas / métricas JSONB (NO es Campaign Studio)

`public.client_metrics` (definida en `20260730150000_phase4_data_migration_targets.sql`) tiene una columna `campaigns jsonb`. Esto es un **arreglo de métricas de campañas que corren en plataformas externas** (Meta/Google/YouTube), ingeridas típicamente vía n8n / `AdvertisingPlatformProvider`, y modeladas en dominio como `CampaignMetric` (`packages/domain/src/entities/metric.ts`), con mapper dedicado `packages/infrastructure/src/supabase/mappers/metric.mapper.ts` (`parseCampaignMetric`, `parseCampaigns`). El propio código advierte explícitamente: *"campaigns NUNCA se carga en consultas de lista (puede tener 55+ items)"* y separa `Metric` (con campaigns) de `MetricSummary` (sin campaigns) para no cargar el JSONB pesado en listados.

**Esto no es, y no debe confundirse con, Campaign Studio.** Es un registro de resultados de campañas que ya corren fuera del sistema — no hay creación, aprobación ni gestión de esas campañas desde BopIAgency.

### B. Entidades de "Campaign Studio" (lo que Phase 7 debe construir)

Existen solo como **tipos TypeScript sin tabla física**: `Campaign`, `CampaignStatus`, `CampaignFilter`, `CampaignRepository` (§1). No existe ningún tipo ni tabla para `CampaignApproval` ni para `ComplianceRule`/`compliance_rules` en ninguna capa del código — ni domain, ni shared, ni infrastructure.

### C. Tablas que existen (todas las `CREATE TABLE IF NOT EXISTS public.*` del repo)

`profiles`, `organizations`, `organization_members`, `organization_invitations`, `user_preferences` (Phase 2) · `clients`, `client_contacts`, `client_documents`, `client_integrations` (Phase 3) · `tasks`, `client_metrics`, `alerts`, `reports`, `report_recipients`, `agents`, `skills`, `templates`, `automations`, `migration_runs`, `migration_records` (Phase 4) · `automation_executions`, `automation_execution_logs`, `automation_webhook_events`, `automation_secrets_metadata` (Phase 6B).

### D. Tablas que faltan (para Campaign Studio)

- `public.campaigns` — **no existe.**
- `public.campaign_approvals` — **no existe.**
- `public.compliance_rules` — **no existe.**

`grep -n "CREATE TABLE public\.campaigns\|campaign_approvals\|compliance_rules" supabase/migrations/*.sql` no devuelve ningún resultado. `database.types.ts` solo contiene `campaigns` como el nombre de la columna JSONB de `client_metrics` (`campaigns: Json`), consistente con el punto A.

**Conclusión de §2:** el roadmap original (7.1) está 100% vigente tal cual — no hay nada que reconciliar aquí salvo el diseño de columnas (falta `organization_id` en el diseño implícito de `campaigns` si se sigue literalmente la forma de la entidad actual).

---

## 3. Auditoría de implementación de UI

### `apps/web/src/app/(protected)/campaigns/page.tsx`

Placeholder puro. Renderiza `<UnderConstruction module="Campaign Studio" description="El estudio de campañas estará disponible en la Fase 7..." availableIn="Fase 7" />`. No importa `demoCampaigns`, no llama a application layer, no llama a Supabase, no lee organización/cliente de la sesión.

### `apps/web/src/app/(protected)/campaigns/new/page.tsx`

Igual patrón: `<UnderConstruction module="Crear Campaña" ... availableIn="Fase 7" />`. Sin formulario, sin Server Action, sin Zod.

### Clasificación

- **Placeholder/demo:** sí, en el sentido más literal — son pantallas "en construcción", ni siquiera muestran los `demoCampaigns` existentes.
- **Parcialmente funcionales:** no.
- **Conectadas a application layer:** no.
- **Conectadas a Supabase:** no.
- **Usan `demoCampaigns`:** no (aunque el array existe, ninguna página lo importa — código muerto, §1.10).
- **Soportan organización/cliente real:** no aplica, no hay lógica.

### `/campaigns/[id]`

No existe la ruta.

### `CampaignApprovalPanel`

No existe el componente en ningún lugar del código (`apps/web/src/components/**`, ni fuera). Solo aparece nombrado en `docs/architecture/IMPLEMENTATION_ROADMAP.md` (ítem 7.9, pendiente).

**Nota de discrepancia de rutas:** el roadmap original especifica `app/(dashboard)/campaigns/...`, pero el route group real del proyecto es `app/(protected)/campaigns/...`. El grupo de rutas fue renombrado en una fase anterior (todas las páginas protegidas viven bajo `(protected)`), así que Phase 7 debe usar `(protected)`, no `(dashboard)`.

---

## 4. Auditoría de assets legacy reutilizables

Todo lo siguiente vive bajo `.agencia-ai/.claude/` y son **archivos Markdown de prompting** para uso interactivo con Claude Code/CLI (comandos, "skills" en el sentido de prompt-packages, y workflows/checklists) — **no son código de aplicación**, no se ejecutan, no tienen output estructurado, no hay parsing de su salida por ningún sistema. Se revisó su contenido sin modificarlo.

### Commands (`.agencia-ai/.claude/commands/`)

| Archivo | Contenido | Clasificación |
|---|---|---|
| `create-meta-campaign.md` | Prompt de 29 líneas: invoca agente `meta-ads-specialist` + skill `meta-ads-campaign-builder`, exige pasar `meta-ads-compliance-review` antes de entregar | **MIGRATE** — su lógica (estructura, pasos, uso obligatorio de compliance review) es el mejor insumo textual para el prompt/skill que usará `createCampaignWithAI` en 7D |
| `create-google-campaign.md` | Prompt de 18 líneas, agente `google-ads-specialist` + skill `google-ads-campaign-builder` | **MIGRATE** |
| `create-youtube-campaign.md` | Prompt de 17 líneas, skill `youtube-ads-campaign-builder` | **MIGRATE** |
| `bilingual-campaign.md` | Prompt de 17 líneas, skill `bilingual-campaign-builder` | **REFERENCE ONLY** — variante de negocio (no todos los clientes la necesitan en el MVP de 7D) |
| `local-campaign.md` | Prompt de 18 líneas, skill `local-business-campaign` | **REFERENCE ONLY** — mismo motivo |
| `campaign-analysis.md` | Analiza resultados post-lanzamiento, skill `campaign-performance-analysis` | **REFERENCE ONLY** — pertenece a una fase posterior (optimización de campañas activas), no a creación/aprobación |

### Skills (`.agencia-ai/.claude/skills/`)

| Carpeta | Tamaño | Clasificación |
|---|---|---|
| `meta-ads-campaign-builder` | `SKILL.md`, 155 líneas | **MIGRATE** — el más completo y directamente relevante a `createCampaignWithAI` para Meta |
| `google-ads-campaign-builder` | `SKILL.md`, 65 líneas | **MIGRATE** |
| `youtube-ads-campaign-builder` | `SKILL.md`, 58 líneas | **MIGRATE** |
| `bilingual-campaign-builder` | `SKILL.md`, 61 líneas | **REFERENCE ONLY** |
| `local-business-campaign` | `SKILL.md`, 57 líneas | **REFERENCE ONLY** |
| `luxury-brand-campaign` | `SKILL.md`, 62 líneas | **REFERENCE ONLY** |
| `campaign-performance-analysis` | `SKILL.md`, 55 líneas | **REFERENCE ONLY** (fase posterior) |

Todas estas "skills" son actualmente **texto de prompt** (`SKILL.md` sin lógica ejecutable, sin JSON Schema de salida). Para que `createCampaignWithAI` produzca `structured output` consumible por la UI de aprobación, su contenido debe reescribirse como plantillas de prompt versionadas (`TemplateDefinition`/`PromptReference`, que ya existen como contratos — ver §6) con un schema de salida explícito. Por eso se clasifican **MIGRATE** y no **REUSE**: el contenido es valioso, pero el formato no es directamente reutilizable por el AI Engine tal cual está.

### Workflows (`.agencia-ai/.claude/workflows/`)

| Archivo | Clasificación | Motivo |
|---|---|---|
| `meta-ads-campaign.md` (91 líneas, checklist "Briefing → Creación → Copy → QA compliance → Lanzamiento") | **REFERENCE ONLY** | Es un checklist operativo para humanos/agentes de la agencia trabajando en Claude Code, no un flujo de sistema. Útil como referencia para diseñar los *pasos* de `createCampaignWithAI`, pero no se "migra" 1:1 — se re-implementa como lógica de use case. |
| `google-ads-campaign.md` (71 líneas) | **REFERENCE ONLY** | Mismo motivo |

### Campañas históricas de clientes

No se auditaron campañas históricas específicas de clientes reales por fuera de lo ya cubierto en `.agencia-ai/clients/*/compliance-rules.md` (ver §5) — no se encontró un directorio separado de "campañas históricas" con briefs/copy de campañas pasadas que fuera candidato a importación estructurada. Si existiera contenido de este tipo en `backups/` o `migration-output/`, es candidato **ARCHIVE** (contexto histórico, no reutilizable como dato estructurado sin trabajo de migración dedicado, fuera del alcance de Phase 7).

### Resumen de clasificación

- **REUSE:** ninguno — no hay ningún asset legacy directamente ejecutable/consumible por el sistema actual sin transformación.
- **MIGRATE:** `create-meta-campaign.md`, `create-google-campaign.md`, `create-youtube-campaign.md`, `meta-ads-campaign-builder`, `google-ads-campaign-builder`, `youtube-ads-campaign-builder` — insumo textual directo para las plantillas de prompt de 7D, por plataforma.
- **REFERENCE ONLY:** `bilingual-campaign.md`, `local-campaign.md`, `campaign-analysis.md`, `bilingual-campaign-builder`, `local-business-campaign`, `luxury-brand-campaign`, `campaign-performance-analysis`, ambos workflows — variantes de negocio o fases posteriores, útiles como contexto de diseño, no como insumo directo del MVP 7D.
- **ARCHIVE:** contenido histórico en `backups/` / `migration-output/` no estructurado — no se tocó, no se requiere para Phase 7.

No se copió ni migró nada — solo se clasificó, según instrucción explícita.

---

## 5. Compliance

### Guía maestra: `.agencia-ai/.claude/references/compliance-master-guide.md`

422 líneas, versión 1.1, "Aplicable a Meta Ads, Google Ads y Contenido Orgánico". Estructura: tabla de índice por industria/riesgo (Salud General, Estética/Medspa, Pérdida de Peso, Estudios Clínicos, Finanzas/Inversiones, Seguros de Vida, Bienestar, Claims de Resultados, Reglas Meta Ads, Reglas Google Ads), y por cada sección: prohibiciones absolutas, requerimientos obligatorios, y una **tabla de palabras de alto riesgo → alternativa segura** (ej. "Cura" → "Apoya", "Garantizado" → "Enfocado en").

**Formato actual:** Markdown puro, no estructurado como datos — reglas expresadas en prosa + tablas de 2 columnas (palabra prohibida / alternativa), sin identificadores únicos, sin metadata de severidad/jurisdicción machine-readable, sin versión por regla individual (solo una versión global del documento).

**¿Se puede convertir a reglas persistidas?** Sí, y el patrón es claro: cada fila de cada tabla "Palabra riesgosa → Alternativa" es naturalmente un candidato a fila de `compliance_rules` (`pattern`, `severity`, `category`, `suggested_alternative`, `platform`, `industry`). Las "Prohibiciones Absolutas" en prosa requieren más trabajo (son reglas semánticas, no solo de patrón textual) — probablemente conviene modelarlas como reglas de **categoría** con descripción, no solo listas de palabras, y dejar la validación semántica fina para el propio `createCampaignWithAI` (el agente aplica las reglas persistidas + su propio juicio antes de marcar `review`).

**Jurisdicciones/plataformas soportadas hoy:** el documento cubre Meta Ads y Google Ads explícitamente (secciones §9 y §10) y contenido orgánico en general; menciona FTC guidelines (EE.UU.) para *health endorsements* pero no está organizado por jurisdicción de forma sistemática — es más bien por industria/plataforma. No cubre YouTube Ads como sección propia (aunque las reglas de Google Ads aplican parcialmente).

### Uso actual por agentes/skills/commands/workflows

- **Agente `compliance-reviewer.md`** (`.agencia-ai/.claude/agents/`, 57 líneas): define rol y responsabilidades ("revisar copy de Meta/Google Ads", "identificar claims sensibles en salud, finanzas y servicios regulados"), y **duplica un subconjunto** de las reglas de la guía maestra directamente en su propio prompt (categorías especiales de Meta, red flags), en lugar de referenciarla dinámicamente. Es decir: hoy hay **dos fuentes de reglas parcialmente solapadas** (la guía maestra y el prompt del agente), lo cual es justo el tipo de duplicación que una tabla `compliance_rules` centralizada resolvería.
- **Skill `meta-ads-compliance-review`** — invocada explícitamente por el command `create-meta-campaign.md` antes de entregar cualquier copy.
- **Commands** `meta-compliance-check.md` — comando dedicado a correr una revisión de compliance ad-hoc.
- **Reglas por cliente** (`.agencia-ai/clients/{slug}/compliance-rules.md`) — existen para 5 clientes reales (`bop-soluciones`, `cliente-prueba-automatizacion-marketing-digital`, `legalink-col`, `magic-bungalow`, `the-industrial-depot`) + 1 plantilla (`_template-client/`) + 1 en backups. Cada archivo tiene su propia tabla de "Frases PROHIBIDAS → Alternativa", específica del negocio del cliente (ej. para una agencia de marketing/IA: no prometer "resultados garantizados", no decir "la IA reemplaza al equipo humano"). **Esto es evidencia directa de que `compliance_rules` necesita ser multi-nivel: reglas globales (guía maestra) + reglas por cliente (override/adición), no solo global.**

### Cómo debería integrarse con Campaign Studio

1. `compliance_rules` como tabla con `scope` (`global` | `client`), `organization_id`, `client_id` nullable, `platform`, `industry`, `pattern`/`category`, `severity`, `suggested_alternative`, `source` (para trazar de qué documento vino cada regla importada).
2. La importación de la guía maestra y de los `compliance-rules.md` por cliente es un **script de un solo uso** (fuera del alcance de esta auditoría — no se importa nada todavía, 7.10 en la reconciliación).
3. `createCampaignWithAI` (7D) consulta las reglas activas (globales + del cliente) como contexto de compliance antes de generar copy, y el resultado de create-with-AI nace en estado `review`, nunca `active`, forzando el paso por aprobación humana (7C) — coherente con que `CampaignStatus` ya incluye `review`/`approved`/`rejected`.

No se importó ninguna regla — solo se documentó el estado y la ruta de integración, según instrucción explícita.

---

## 6. AI Engine

`packages/ai-engine/` existe como paquete propio, y es **explícitamente solo contratos**: su propio `README.md` dice *"Contracts and type definitions for the AI layer. No live API calls in Fase 1."*, y `src/index.ts` lo confirma con el comentario `// Contracts (interfaces — no implementations in Fase 1)`.

### Qué existe

| Pieza | Archivo | Contenido |
|---|---|---|
| `AIProvider` (puerto) | `contracts/ai-provider.ts` | `interface AIProvider { complete(request: AIRequest): Promise<Result<AIResponse>> }`. `AIRequest` incluye `model`, `messages` (role system/user/assistant), `maxTokens?`, `temperature?`, `stopSequences?`. `AIResponse` incluye `content`, `model`, `usage: AIUsage` (`inputTokens`/`outputTokens`/`totalTokens`), `finishReason`. Comentario explícito: *"implemented in infrastructure (Claude API adapter). Not connected in Fase 1."* |
| `AgentDefinition` | `contracts/agent-definition.ts` | Mapea `AgentType` (de domain, incluye `'campaign_creator' \| 'compliance_reviewer' \| ...'`) a `systemPrompt`, `availableSkills: SkillId[]`, `maxTokensPerCall`. |
| `SkillDefinition` | `contracts/skill-definition.ts` | `{ id, name, description, buildRequest(input): AIRequest, parseOutput(raw): SkillOutput }` — es decir, el contrato ya anticipa **input/output estructurado** (`SkillInput`/`SkillOutput` como `Record<string, unknown>`), pero sin ninguna implementación concreta ni parser real. |
| `TemplateDefinition` | `contracts/template-definition.ts` | `{ type: TemplateType, name, description, promptTemplate, requiredVariables }`. `TemplateType` (domain) ya incluye `'campaign_brief'`. |
| `PromptReference` + `renderPrompt()` | `contracts/prompt-reference.ts` | Única pieza con **lógica real implementada**: interpolación simple de variables `{{var}}` sobre un template versionado (`id`, `version`, `template`, `variables`). |

`package.json` de `ai-engine` solo depende de `@bop-agency/shared` y `@bop-agency/domain` — **no tiene el SDK de Anthropic ni de OpenAI como dependencia**, confirmado también a nivel de repo (`grep -i "anthropic\|openai"` sobre todos los `package.json` no arroja resultados).

### Qué NO existe (todo pendiente para 7D)

- **AI provider abstraction implementada:** no hay ningún `ClaudeAPIProvider` en `packages/infrastructure` — el propio README de ai-engine lo lista como pendiente de "Fase 2+".
- **Agents runtime:** no hay loop de orquestación de agentes, ni registro/router de skills (`README.md`: *"Agent orchestration loop"* y *"Skill registry and router"* listados como pendientes).
- **Prompt execution:** `renderPrompt()` solo interpola variables en texto — no hay nada que efectivamente llame a un modelo.
- **Context injection** (organización/cliente): no existe ningún mecanismo que inyecte `organizationId`/`clientId`/brand profile/compliance rules en un `AIRequest`.
- **Structured output:** el contrato `SkillDefinition.parseOutput` anticipa la necesidad pero no hay implementación ni schema Zod de validación de la salida del modelo.
- **Logging, retries, cost/token tracking:** `AIUsage` existe como *tipo* de dato (`inputTokens`, `outputTokens`, `totalTokens`) pero no hay ningún sitio donde se registre, persista o agregue. No hay tabla de uso de IA en las migraciones. No hay lógica de retry.

**Conclusión de §6:** `createCampaignWithAI` (7.3/7D) parte de contratos bien pensados (y coherentes con lo que se necesitará) pero de una implementación en cero. Es, en la práctica, la pieza de mayor esfuerzo real de todo Phase 7 — no hay atajos: hay que construir el adapter del proveedor, el runtime mínimo de ejecución de skills, y la inyección de contexto (organización, cliente, compliance rules) desde cero.

---

## 7. Ver `PHASE_7_IMPLEMENTATION_PLAN.md`

La reconciliación punto por punto del roadmap original (7.1–7.12), la propuesta de subfases 7A–7G y el diseño de seguridad/multi-tenancy se documentan en `PHASE_7_IMPLEMENTATION_PLAN.md` para mantener la auditoría (hechos) separada de la propuesta (decisiones a aprobar).
