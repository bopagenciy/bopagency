# Phase 7B — Campaign Studio: Persistencia
**Fecha:** 2026-08-16
**Rama:** `feat/phase-7-campaign-studio`
**Commit base:** `1955ad0` (docs(phase-7): audit and plan campaign studio)
**Estado:** implementado en el working tree, **sin commit** — pendiente de revisión y aprobación del usuario. Ninguna migración se aplicó a Supabase (ni local ni remoto). No se tocó n8n. No se implementó IA ni UI.

---

## 1. Precheck

```
git branch --show-current  → feat/phase-7-campaign-studio
git log -1 --oneline       → 1955ad0 docs(phase-7): audit and plan campaign studio
git status --short (antes) → ?? .agencia-ai/.claude/commands/new-client.md   (único untracked preexistente, confirmado)
```

Se leyeron `PHASE_7_AUDIT.md`, `PHASE_7_IMPLEMENTATION_PLAN.md`, `PHASE_7_RISK_REGISTER.md` y se re-auditó el código real antes de diseñar el schema: `packages/domain/src/entities/campaign.ts`, `campaign.repository.ts`, `packages/application/src/use-cases/campaigns/`, `packages/shared/` (`status.ts`, `platforms.ts`, `result.ts`, `errors.ts`), `apps/web/src/lib/supabase/database.types.ts` y `types.ts`. Se confirmó que ninguna migración existente crea `campaigns`, `campaign_approvals` ni `compliance_rules` (0 resultados para esos nombres en `supabase/migrations/*.sql`).

También se auditaron los patrones reales del repo antes de escribir SQL nuevo: helpers de RLS (`is_organization_member`, `has_organization_role`, `can_manage_organization`), triggers reutilizables (`check_client_organization_match`, `protect_child_immutable_fields`, `set_updated_at`), el patrón de auditoría `manage_client_write`/`set_document_audit`, el patrón append-only de `protect_alerts_audit_fields`, y el patrón `is_global` de `agents`/`skills`/`templates` (organization_id nullable) — todos referenciados explícitamente en las decisiones de diseño de este reporte.

---

## 2. Schema final

Migración nueva (no se editó ninguna migración ya aplicada):
`supabase/migrations/20260816130000_phase7b_campaign_studio_persistence.sql`

### A. `public.campaigns`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `organization_id` | `uuid` NOT NULL | FK → `organizations(id)` ON DELETE CASCADE |
| `client_id` | `uuid` NOT NULL | FK → `clients(id)` ON DELETE RESTRICT |
| `name` | `text` NOT NULL | 1–200 caracteres |
| `platform` | `text` NOT NULL | CHECK contra los 14 valores de `AD_PLATFORMS` (no ENUM — mismo criterio que `client_metrics.platform`/`alerts.platform`, lista más propensa a crecer) |
| `objective` | `campaign_objective` (ENUM) NOT NULL | 7 valores = `CampaignObjective` |
| `status` | `campaign_status` (ENUM) NOT NULL DEFAULT `'draft'` | 7 valores = `CAMPAIGN_STATUSES` |
| `brief` | `text` NULL | ≤10 000 caracteres |
| `budget` | `numeric(14,2)` NOT NULL | ≥ 0 |
| `currency` | `text` NOT NULL DEFAULT `'COP'` | `USD`/`COP`/`MXN`/`EUR` (mismo CHECK que `clients.currency`) |
| `start_date` / `end_date` | `date` NULL | `end_date >= start_date` si ambas presentes |
| `generated_content` | `jsonb` NULL | Objeto; Phase 7D |
| `metadata` | `jsonb` NOT NULL DEFAULT `'{}'` | Objeto |
| `created_by` | `uuid` NOT NULL | FK → `auth.users(id)` ON DELETE RESTRICT, asignado por trigger |
| `updated_by` | `uuid` NULL | FK → `auth.users(id)` ON DELETE SET NULL |
| `submitted_for_review_at` / `approved_at` / `rejected_at` | `timestamptz` NULL | Ver §4 "Cambios de estado sensibles" |
| `created_at` / `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Índices: `organization_id`, `client_id`, `status`, `(organization_id, client_id, status)`, `(organization_id, created_at DESC)`.

### B. `public.campaign_approvals` (audit trail append-only)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` NOT NULL | FK → `organizations(id)` CASCADE |
| `campaign_id` | `uuid` NOT NULL | FK → `campaigns(id)` ON DELETE RESTRICT |
| `action` | `campaign_approval_action` (ENUM) NOT NULL | `approved` \| `rejected` |
| `note` | `text` NULL | CHECK: NOT NULL y no vacía si `action = 'rejected'` (regla de negocio #7, reforzada en BD) |
| `actor_user_id` | `uuid` NOT NULL | FK → `auth.users(id)` RESTRICT |
| `metadata` | `jsonb` NOT NULL DEFAULT `'{}'` | |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | Única marca de tiempo — no hay `updated_at` (inmutable) |

Sin columna de borrado: append-only real, reforzado en 3 capas — sin policy de UPDATE/DELETE, sin GRANT de UPDATE/DELETE, y sin `updated_at` en el schema.

### C. `public.compliance_rules`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` NULL | `NULL` = regla global |
| `client_id` | `uuid` NULL | `NULL` = regla de organización completa (o global) |
| `platform` | `text` NULL | `NULL` = todas las plataformas; mismo CHECK de 14 valores que `campaigns.platform` |
| `jurisdiction` | `text` NULL | Libre, sin CHECK cerrado (ver §3) |
| `rule_key` | `text` NOT NULL | slug, único por nivel de scope |
| `title` | `text` NOT NULL | |
| `description` | `text` NOT NULL | |
| `severity` | `compliance_rule_severity` (ENUM) NOT NULL DEFAULT `'medium'` | `critical`\|`high`\|`medium`\|`low` |
| `category` | `text` NOT NULL DEFAULT `'general'` | Libre |
| `active` | `boolean` NOT NULL DEFAULT `true` | |
| `source` | `text` NULL | Trazabilidad de origen |
| `metadata` | `jsonb` NOT NULL DEFAULT `'{}'` | |
| `created_at` / `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

CHECK: `client_id IS NOT NULL ⟹ organization_id IS NOT NULL`. Únicos parciales de `rule_key` por nivel (global / org / cliente) — ver §3.

La tabla se crea **vacía**: no se importó `compliance-master-guide.md` ni los `compliance-rules.md` por cliente (instrucción explícita de esta tarea — queda para Phase 7C).

---

## 3. Decisiones de diseño

**`organization_id` obligatorio en `campaigns`.** Corrige el gap R-DOM-01 del risk register: la entidad `Campaign` de Phase 1 no lo tenía. Ahora es `NOT NULL` en dominio, DB y en `CampaignFilter`/`CreateCampaignInput`.

**`budget`/`currency`/`startDate`/`endDate` se conservan.** No están en la lista mínima de columnas de esta tarea, pero ya existían en la entidad `Campaign` aprobada en Phase 1 — se reconciliaron, no se inventaron. Retirarlos habría sido un cambio de alcance mayor no solicitado.

**`CampaignRepository.delete()` se retira del contrato**, en vez de convertirlo en soft-delete como proponía el risk register (R-DOM-02). Al diseñar el schema real se confirmó que las reglas de negocio fijadas para Phase 7 no definen ningún concepto de "borrar" una campaña — los estados (`draft`/`review`/`approved`/`rejected`/…) son el mecanismo completo de ciclo de vida, y `campaign_approvals` referencia `campaigns` con `ON DELETE RESTRICT`, lo que habría hecho un soft-delete semánticamente confuso (¿qué pasa con el audit trail de una campaña "eliminada"?). Se documenta como decisión explícita: si en el futuro se necesita archivar/descartar un draft, la recomendación es añadir un estado `archived` a `CampaignStatus` (documentado, como ya se hizo con `active`/`paused`/`completed`), no reintroducir un borrado.

**Enums vs. texto+CHECK.** `status`, `objective` (campaigns), `action` (campaign_approvals) y `severity` (compliance_rules) son ENUMs de Postgres, siguiendo el patrón dominante del repo (`client_status`, `task_status`, `alert_status`, etc.). `platform` es texto+CHECK en vez de ENUM, replicando exactamente el criterio ya usado en `client_metrics.platform`/`alerts.platform`: es una lista de configuración de producto (qué plataformas de ads soporta la agencia) más propensa a crecer que a un enum de estado de dominio, y un ENUM de Postgres no admite `DROP VALUE` ni reordenar fácilmente.

**`compliance_rules.organization_id` nullable = regla global.** Confirmado por auditoría (§5 de `PHASE_7_AUDIT.md`): existe una guía maestra global y 5 archivos de compliance por cliente con reglas que a veces se solapan y a veces son específicas. Se optó por el patrón de dos niveles con nullable (`organization_id`, luego `client_id`) en vez de replicar el booleano `is_global` de `agents`/`skills`/`templates`, para no añadir una columna redundante cuando `organization_id IS NULL` ya expresa lo mismo sin ambigüedad.

**Quién puede escribir reglas globales.** Las policies de INSERT/UPDATE de `compliance_rules` exigen `organization_id IS NOT NULL` — es decir, ningún admin de una organización individual puede crear o modificar una regla global vía RLS. Las reglas globales solo las gestiona `service_role` (fuera de RLS), evitando que el admin de una organización sobrescriba reglas que aplican a todo el sistema.

**`jurisdiction` sin CHECK cerrado.** La auditoría de Phase 7A encontró que la guía maestra no está organizada sistemáticamente por jurisdicción (solo menciona FTC/EE.UU. de forma incidental). Se dejó como texto libre para no bloquear una importación futura con un valor no anticipado hoy.

**Cambios de estado sensibles — dónde queda la frontera RLS/use case.** Este es el punto de diseño más delicado de la subfase, siguiendo la instrucción explícita de no confiar solo en RLS cuando no puede expresar robustamente una transición anterior→nueva:

- La policy `campaigns_update` limita `USING` a filas cuyo `status` actual es `'draft'`, y limita `WITH CHECK` a que el nuevo `status` sea `'draft'` o `'review'`.
- Esto significa que **ningún actor — ni siquiera admin/owner — puede fijar `status = 'approved'` o `'rejected'` mediante un `UPDATE` genérico**, sin importar su rol. Esa escritura queda reservada a una función `SECURITY DEFINER` que Phase 7C debe crear (mismo patrón exacto que `acknowledge_alert`/`resolve_alert`), que es la única vía autorizada para tocar `approved_at`/`rejected_at` con el actor correcto y, de paso, insertar la fila correspondiente en `campaign_approvals` de forma atómica.
- `submitted_for_review_at` sí se puede escribir hoy vía `UPDATE` normal (es la transición `draft → review`, permitida a operator+ por la matriz de permisos aprobada) — no requiere RPC porque no involucra ninguna decisión de autorización adicional más allá de "cualquiera con permiso de editar puede enviar a revisión".
- Esta es una mitigación real, no solo una nota: se implementó en la migración, no se dejó únicamente documentada.

**GRANTs — defensa en profundidad.** Además de las policies de RLS, `campaign_approvals` no tiene `GRANT UPDATE`/`DELETE` en absoluto para `authenticated` — un intento de `UPDATE`/`DELETE` se rechaza antes siquiera de evaluar RLS. Mismo criterio para `DELETE` en `campaigns` y `compliance_rules` (preferir `active = false` en vez de borrar).

**`service_role` — sin grants nuevos.** No existe ningún consumidor server-side real en código para estas 3 tablas en Phase 7B (no hay webhook n8n, no hay job de importación). Conforme a la instrucción de no asumir privilegios heredados, no se otorgó ningún grant explícito nuevo a `service_role` — sigue bypaseando RLS por defecto, como el resto del proyecto (ver comentario existente sobre `migration_runs`/`migration_records`).

---

## 4. RLS y grants por tabla

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `campaigns` | Miembro de la org + cliente padre activo | operator+, `status='draft'` obligatorio | operator+, solo si `status` actual es `draft`; nuevo `status` limitado a `draft`/`review` | Sin policy ni GRANT — rechazado siempre |
| `campaign_approvals` | Miembro de la org | admin/owner, `actor_user_id = auth.uid()` | Sin policy ni GRANT | Sin policy ni GRANT |
| `compliance_rules` | Global (org NULL) visible a cualquiera; org/cliente-scoped solo a miembros | admin/owner, solo `organization_id NOT NULL` (reglas globales fuera de RLS) | admin/owner, mismo criterio | Sin policy ni GRANT — preferir `active=false` |

Todas las policies usan `is_organization_member`/`has_organization_role` ya existentes — no se creó ningún sistema de autorización nuevo. `manage_campaign_write()` y `check_campaign_organization_match()` son los dos triggers nuevos (documentados en el encabezado de la migración); el resto de triggers reutiliza funciones existentes del repo (`check_client_organization_match`, `protect_child_immutable_fields`, `set_updated_at`).

---

## 5. Cambios de dominio

- `packages/domain/src/entities/campaign.ts`: `organizationId` añadido (obligatorio); `brief`, `generatedContent`, `metadata`, `createdBy`/`updatedBy`, `submittedForReviewAt`/`approvedAt`/`rejectedAt` añadidos; `budget`/`currency`/`startDate`/`endDate` conservados (`startDate`/`endDate` ahora `Date | null` en vez de `Date | undefined`, alineado con el patrón `| null` del resto del dominio). Nuevos tipos `CreateCampaignInput`/`UpdateCampaignInput`. Nueva invariante pura `canTransitionCampaign`/`getCampaignNextStates`/`isCampaignStatusTerminal` (grafo de transición completo de los 7 `CampaignStatus`, mismo patrón que `canTransitionTask`).
- `packages/domain/src/repositories/campaign.repository.ts`: `delete()` retirado (ver §3); `findById`/`update` ahora reciben `organizationId` explícito (patrón `TaskRepository`); `create`/`update` usan los nuevos tipos de input.
- `packages/domain/src/entities/campaign-approval.ts` y `compliance-rule.ts`: **nuevos**, solo tipos — ver "Deuda técnica" (§7) sobre por qué no llevan repositorio en 7B.
- `packages/domain/src/index.ts`: exports actualizados.
- No se tocó `CampaignStatus` en `packages/shared/src/constants/status.ts` — ya soportaba el flujo de aprobación completo desde antes de esta tarea (confirmado en Phase 7A).

---

## 6. `CampaignRepository` — implementación

`packages/infrastructure/src/supabase/repositories/supabase-campaign.repository.ts` + `packages/infrastructure/src/supabase/mappers/campaign.mapper.ts`, sobre el patrón exacto de `SupabaseTaskRepository`/`TaskMapper`.

Implementado en Phase 7B: `findById`, `findAll` (filtros + paginación), `create`, `update`. **No implementado** (fuera de alcance, Phase 7C/7D): `approveCampaign`, `rejectCampaign`, `createCampaignWithAI` — ninguno de los tres existe como método del repositorio ni como use case.

## 7. `createCampaignDraft` — estado final

`packages/application/src/use-cases/campaigns/create-campaign-draft.use-case.ts` — implementación real, ya no es el stub `notImplemented` heredado de Phase 1/7A.

Hace: valida input con `createCampaignDraftSchema` (Zod); verifica que el cliente exista, esté activo y pertenezca a la organización del actor (vía `ClientRepository.findById`, defensa en profundidad además del trigger `check_client_organization_match`); crea la campaña en `draft` vía `CampaignRepository.create`; loggea debug/info/error.

No hace (verificado también por test explícito): no llama a ningún `AIProvider`; no llama a n8n ni a ningún webhook; no publica nada externamente; no pasa `generatedContent` en la creación.

`listCampaigns` no requirió cambios — su firma ya delegaba `input.filter` directamente al repositorio, así que el nuevo `organizationId` obligatorio en `CampaignFilter` se propaga sin tocar el use case.

---

## 8. Tests y resultados

Todos los comandos se ejecutaron directamente en el entorno del usuario (vía el puente de dispositivo), no en un sandbox aislado — así que reflejan el estado real del repo.

| Paquete | Comando | Resultado |
|---|---|---|
| `@bop-agency/domain` | `npm run test --workspace=@bop-agency/domain` | **189/189 verdes** (incluye 20 tests nuevos de `campaign-transitions.test.ts`) |
| `@bop-agency/shared` | `npm run test --workspace=@bop-agency/shared` | **49/49 verdes** (incluye 19 tests nuevos de `campaign.schema.test.ts`) |
| `@bop-agency/infrastructure` | `vitest run` por subcarpeta (`src/n8n`, `src/supabase/mappers`, `src/supabase/repositories` — el paquete completo excede el timeout de una sola invocación en este entorno) | **331/331 verdes** (28 n8n + 153 mappers incl. 12 nuevos de `campaign.mapper.test.ts` + 150 repositorios incl. 14 nuevos de `supabase-campaign.repository.test.ts`) |
| `@bop-agency/application` | `vitest run` por subcarpeta (`src/use-cases/campaigns`, `src/__tests__`, `src/use-cases/alerts` + `tasks`, `src/use-cases/automations`) | **217/217 verdes** (incluye 8 tests nuevos de `create-campaign-draft.use-case.test.ts`) |
| `domain` | `tsc --noEmit` | limpio |
| `shared` | `tsc --noEmit` | limpio |
| `application` | `tsc --noEmit` | limpio (1 error inicial en el test nuevo por indexado no verificado de `mock.calls[0][0]`, corregido con el mismo patrón `?.[0]` ya usado en `cancel-execution.use-case.test.ts`) |
| `infrastructure` | `tsc --noEmit` | limpio |
| `apps/web` | `tsc --noEmit` | limpio (typecheck completo del paquete, no solo los archivos tocados) |
| `domain`, `shared`, `application`, `infrastructure` | `eslint src --ext .ts` | limpio en los 4 |
| `apps/web` | `eslint "src/**/*.{ts,tsx}"` | limpio |

**Total: 73 tests nuevos, 786 tests totales ejecutados en los 4 paquetes de dominio/aplicación/infraestructura, todos verdes.**

**Nota sobre `npm run test`/`typecheck`/`lint` a nivel raíz (`--workspaces`):** en este entorno cada invocación de shell tiene un límite de 45 segundos; el monorepo completo (10 workspaces, incluida una app Next.js) excede ese límite en una sola llamada. Se resolvió ejecutando cada workspace por separado (y, para `infrastructure`/`application`, por subcarpeta de tests) en vez de `--workspaces`. El resultado es equivalente — se cubrió el 100% de los archivos de test existentes en los 4 paquetes pedidos — pero se documenta la desviación mecánica del comando exacto pedido (`npm run test --workspace=@bop-agency/infrastructure` y `@bop-agency/application` no completaron dentro de una sola invocación; se dividieron en sub-invocaciones `npx vitest run <carpeta>` desde el propio directorio del paquete).

No se ejecutaron tests de migración SQL contra una base de datos real (ni local ni remota) — no hay Supabase local levantado en este entorno y no se aplicó la migración a ningún ambiente, conforme a las restricciones de la tarea. La verificación del SQL fue por revisión manual línea a línea contra los patrones ya probados del repo (mismos helpers, mismos triggers reutilizados donde aplicaba), no por ejecución.

---

## 9. Archivos nuevos y modificados

**Nuevos:**
```
supabase/migrations/20260816130000_phase7b_campaign_studio_persistence.sql
packages/domain/src/entities/campaign-approval.ts
packages/domain/src/entities/compliance-rule.ts
packages/domain/src/__tests__/campaign-transitions.test.ts
packages/infrastructure/src/supabase/mappers/campaign.mapper.ts
packages/infrastructure/src/supabase/mappers/__tests__/campaign.mapper.test.ts
packages/infrastructure/src/supabase/repositories/supabase-campaign.repository.ts
packages/infrastructure/src/supabase/repositories/__tests__/supabase-campaign.repository.test.ts
packages/application/src/use-cases/campaigns/__tests__/create-campaign-draft.use-case.test.ts
packages/shared/src/schemas/campaign.schema.ts
packages/shared/src/schemas/__tests__/campaign.schema.test.ts
docs/implementation/phase-7/PHASE_7B_PERSISTENCE_REPORT.md
```

**Modificados:**
```
packages/domain/src/entities/campaign.ts
packages/domain/src/repositories/campaign.repository.ts
packages/domain/src/index.ts
packages/application/src/use-cases/campaigns/create-campaign-draft.use-case.ts
packages/application/src/index.ts
packages/infrastructure/src/index.ts
packages/shared/src/index.ts
apps/web/src/lib/supabase/types.ts
apps/web/src/lib/supabase/database.types.ts
docs/implementation/phase-7/PHASE_7_IMPLEMENTATION_PLAN.md
```

`packages/application/src/use-cases/campaigns/list-campaigns.use-case.ts` se revisó pero **no se modificó** — no lo necesitaba (§7).

---

## 10. Instrucciones para aplicar y verificar localmente

Nada de esto se ejecutó como parte de esta tarea. Comandos exactos para que el usuario los corra cuando apruebe:

**Aplicar la migración en Supabase local:**
```bash
supabase start          # si no está corriendo
supabase db reset       # reaplica todas las migraciones, incluida la nueva
```
o, contra una instancia local ya iniciada, sin resetear datos existentes:
```bash
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2)" \
  < supabase/migrations/20260816130000_phase7b_campaign_studio_persistence.sql
```

**Verificar que las 3 tablas existen:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('campaigns', 'campaign_approvals', 'compliance_rules');
-- Debe devolver 3 filas
```

**Regenerar los tipos TypeScript reales** (reemplazan las adiciones manuales hechas en esta tarea a `types.ts`/`database.types.ts`, siguiendo el mismo procedimiento documentado en `PHASE_6_OPERATIONS_RUNBOOK.md`):
```bash
npx supabase gen types typescript --local --schema public \
  > apps/web/src/lib/supabase/database.types.ts

# o, contra un proyecto vinculado (staging/prod):
npx supabase gen types typescript --project-id <PROJECT_REF> --schema public \
  > apps/web/src/lib/supabase/database.types.ts
```
Después de regenerar, actualizar también `apps/web/src/lib/supabase/types.ts` (el archivo realmente importado por `server.ts`/`browser.ts`/`middleware.ts` — ver nota preexistente dentro del propio `database.types.ts` sobre esta duplicación, no introducida por esta tarea) para que ambos coincidan, o migrar el código a importar directamente desde `database.types.ts` y retirar `types.ts` — decisión de limpieza fuera del alcance de 7B.

**Aplicar en staging/producción:** fuera de alcance de esta tarea. Cuando corresponda, seguir el mismo patrón ya documentado en `PHASE_6_OPERATIONS_RUNBOOK.md` (`supabase link --project-ref <REF>` → `supabase db push --project-ref <REF>` → regenerar tipos → verificar).

**Producción: no tocada.** No se ejecutó `supabase db push`, no se abrió ninguna conexión a un proyecto Supabase remoto, no se tocó n8n.

---

## 11. Deuda técnica diferida a 7C/7D

1. **RPC de aprobación/rechazo (7C, crítico).** La migración deja `approved_at`/`rejected_at` inalcanzables vía `UPDATE` genérico (ver §3), pero **no crea todavía** la función `SECURITY DEFINER` que sí puede escribirlos. Hasta que 7C la implemente, no existe ningún camino — ni siquiera vía Supabase Studio con rol admin — para aprobar o rechazar una campaña dentro de las reglas de negocio fijadas (lo cual es intencional: es exactamente la barrera que Phase 7B debía dejar lista).
2. **`CampaignApprovalRepository`/`ComplianceRuleRepository` no existen.** Se crearon los tipos de dominio (`CampaignApproval`, `ComplianceRule`) pero no los repositorios ni mappers ni implementaciones Supabase — ningún use case de 7B los necesita, y construirlos ahora habría sido sobrearquitectura sin caller real. Phase 7C debe crearlos junto con `approveCampaign`/`rejectCampaign`; Phase 7D junto con la lectura de reglas activas para `createCampaignWithAI`.
3. **Consistencia `approved_at`/`rejected_at` vs. `status`.** No se añadió un CHECK constraint que fuerce, por ejemplo, "`rejected_at` no NULL ⟺ `status = 'rejected'`" — la relación exacta depende de decisiones de diseño de 7C (¿puede una campaña `approved` pasar a `active` y `approved_at` seguir siendo el de la aprobación original? sí, por diseño) que no correspondía anticipar en 7B. Se recomienda que la RPC de 7C mantenga esta consistencia por construcción (como hace `acknowledge_alert`/`resolve_alert`), no un CHECK a nivel de tabla.
4. **`types.ts` y `database.types.ts` manuales.** Ambos se actualizaron a mano en esta tarea (comando de generación real documentado en §10, no ejecutado porque requiere Supabase local o un proyecto vinculado). Riesgo pre-existente heredado (ya lo señalaba un comentario en el propio `database.types.ts` sobre `automation_execution_logs` antes de esta tarea) de que los tipos manuales diverjan del schema real hasta que se regeneren.
5. **`compliance_rules` sigue vacía.** Ninguna regla de `compliance-master-guide.md` ni de los `compliance-rules.md` por cliente se importó — instrucción explícita de esta tarea, importación queda para Phase 7C.
6. **`jurisdiction` sin validación estructurada.** Documentado en §3 — decisión consciente de dejarlo libre hasta que la importación real de reglas (7C) revele qué valores concretos hacen falta.
7. **`CAMPAIGN_EDITABLE_STATUSES` en Zod (`['draft','review']`) vs. RLS.** Ambas capas coinciden hoy, pero si 7C cambia la máquina de estados (por ejemplo, permite que una campaña `rejected` vuelva a `draft` para resubmisión), habrá que actualizar el schema Zod, la policy `campaigns_update` y `CAMPAIGN_TRANSITIONS` en `campaign.ts` — los tres puntos están documentados con referencias cruzadas explícitas en el código para facilitar encontrarlos juntos.

---

## 12. Confirmación de restricciones respetadas

- ✅ No se tocó Phase 6 (ningún archivo bajo `packages/*/src` relacionado con `automation*`, ni migraciones anteriores a `20260816130000`, fue modificado).
- ✅ No se tocó producción — ninguna conexión a Supabase remoto, ninguna migración aplicada.
- ✅ No se ejecutó ninguna migración (ni local ni remota).
- ✅ No se creó ninguna tabla en una base de datos real — solo el archivo SQL de la migración, sin aplicar.
- ✅ No se tocó n8n.
- ✅ No se implementó IA (`packages/ai-engine` intacto, sin nuevas implementaciones de `AIProvider`).
- ✅ No se implementó UI (`apps/web/src/app/(protected)/campaigns/page.tsx` y `new/page.tsx` siguen siendo los placeholders `UnderConstruction` de Phase 7A, sin tocar).
- ✅ No se publicó nada externamente (ningún código nuevo llama a `AdvertisingPlatformProvider` ni a ninguna API de Meta/Google/YouTube).
- ✅ No se ejecutó `git add` ni `git commit` — los cambios quedan en el working tree.

**Nota operativa (no causada por esta tarea):** durante el precheck se detectó un archivo `.git/index.lock` de 0 bytes en el repositorio, con timestamp de esta sesión. El puente de dispositivo no tiene permiso para borrar archivos dentro de carpetas montadas (`rm`/`unlink` fallan con "Operation not permitted"), así que no se pudo limpiar. **Antes de hacer cualquier `git add`/`commit`, borrar manualmente `.git/index.lock`** (es un lock stale — no representa un proceso git real en ejecución); de lo contrario git rechazará cualquier operación de escritura sobre el índice.
