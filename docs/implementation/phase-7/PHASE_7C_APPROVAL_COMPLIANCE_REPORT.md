# Phase 7C — Campaign Studio: Approval + Compliance

**Fecha:** 2026-08-16
**Rama:** `feat/phase-7-campaign-studio`
**Commit base:** `ba64c09` (`feat(phase-7): add campaign studio persistence layer` — Phase 7B)
**Estado:** implementado en el working tree, **sin `git add`, sin commit**, **sin aplicar ninguna migración** (ni local ni remota).

---

## 1. Precheck

- Branch confirmado: `feat/phase-7-campaign-studio`.
- `git status --short` inicial: working tree limpio salvo el archivo pre-existente fuera de alcance `.agencia-ai/.claude/commands/new-client.md` (untracked, no tocado en esta tarea — ver §13 para el `git status` final, donde sigue apareciendo intacto).
- Documentos re-leídos antes de diseñar: `PHASE_7_AUDIT.md`, `PHASE_7_IMPLEMENTATION_PLAN.md`, `PHASE_7_RISK_REGISTER.md`, `PHASE_7B_PERSISTENCE_REPORT.md`.
- Código de Phase 7B revisado antes de extenderlo: entidad `Campaign` (`CAMPAIGN_TRANSITIONS`/`canTransitionCampaign` ya completos), `CampaignApproval`/`ComplianceRule` (solo tipos, sin repositorio), `CampaignRepository`/`SupabaseCampaignRepository`, y la migración `20260816130000_phase7b_campaign_studio_persistence.sql` completa (RLS, triggers, `check_client_organization_match`, `manage_campaign_write`).
- Precedentes internos usados como plantilla: `AlertRepository.acknowledge`/`resolve` + las RPCs `acknowledge_alert`/`resolve_alert` (Phase 4) — mismo patrón `SECURITY DEFINER`, replicado y endurecido (`FOR UPDATE`, verificación de status) en 7C.

---

## 2. Schema — migración 7C (aditiva, no toca 7B)

**Archivo nuevo:** `supabase/migrations/20260816140000_phase7c_campaign_approval_workflow.sql`. No se editó `20260816130000_phase7b_campaign_studio_persistence.sql` — verificado también por los tests estáticos de la migración (§10), que confirman ausencia de `ALTER TABLE`/`DROP TABLE` sobre `campaigns`, `campaign_approvals` o `compliance_rules`.

La migración tiene 4 secciones:

- **Sección A/B** — dos RPCs `SECURITY DEFINER`: `approve_campaign(p_campaign_id uuid)` y `reject_campaign(p_campaign_id uuid, p_note text)`.
- **Sección C** — retira la policy `campaign_approvals_insert` y el `GRANT INSERT` directo de `authenticated` sobre `campaign_approvals`.
- **Sección D** — grants de las dos RPCs (`REVOKE` de `PUBLIC`/`anon`, `GRANT EXECUTE` solo a `authenticated`).

No se tocan `campaigns_update`/`campaigns_select` ni ninguna policy de `compliance_rules` — esas siguen exactamente como quedaron en 7B.

---

## 3. Diseño exacto de la RPC

### 3.1 Por qué dos funciones, no una `transition_campaign_review(action, note)`

`reject_campaign` exige `note` no vacía; `approve_campaign` no recibe nota en absoluto. Una función genérica con una rama `IF action = 'rejected' THEN ...` habría requerido SQL condicional adicional para simular dos firmas distintas, y complica el `GRANT`/la auditoría (¿quién puede ejecutar "transition" en general vs. solo aprobar?). Dos funciones con nombre explícito son más simples de otorgar y de leer, y siguen el precedente ya establecido en el repo: `acknowledge_alert`/`resolve_alert` (Phase 4) son dos funciones separadas, no una sola `transition_alert(action)`.

### 3.2 Cuerpo de `approve_campaign(p_campaign_id uuid)`

```sql
CREATE OR REPLACE FUNCTION public.approve_campaign(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_org_id  uuid;
  v_status  public.campaign_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'approve_campaign: authentication required';
  END IF;

  SELECT organization_id, status INTO v_org_id, v_status
  FROM public.campaigns WHERE id = p_campaign_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_campaign: campaign not found (id: %)', p_campaign_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'admin') THEN
    RAISE EXCEPTION 'approve_campaign: actor lacks admin/owner role (campaign_id: %, organization_id: %)',
      p_campaign_id, v_org_id;
  END IF;

  IF v_status <> 'review' THEN
    RAISE EXCEPTION 'approve_campaign: campaign % is not in review (current status: %)',
      p_campaign_id, v_status;
  END IF;

  UPDATE public.campaigns
  SET status = 'approved', approved_at = now(), rejected_at = NULL
  WHERE id = p_campaign_id;

  INSERT INTO public.campaign_approvals (organization_id, campaign_id, action, actor_user_id)
  VALUES (v_org_id, p_campaign_id, 'approved', v_actor);
END;
$$;
```

`reject_campaign(p_campaign_id uuid, p_note text)` es idéntica salvo: valida `p_note IS NULL OR char_length(trim(p_note)) = 0` justo después del chequeo de `auth.uid()` (falla rápido, antes de tocar la fila); escribe `status = 'rejected'`, `rejected_at = now()`, `approved_at = NULL`; inserta `campaign_approvals` con `action = 'rejected', note = p_note`.

### 3.3 Orden de las verificaciones (idéntico en ambas funciones)

1. `auth.uid() IS NOT NULL` — rechaza llamadas anónimas o sin sesión antes de tocar cualquier fila.
2. (solo `reject_campaign`) nota no vacía tras `trim` — falla antes de bloquear la fila.
3. `SELECT ... FOR UPDATE` de la campaña por `id` — carga `organization_id`/`status` reales y toma el lock de fila (evita condiciones de carrera si dos decisiones llegan concurrentemente para la misma campaña).
4. `NOT FOUND` → error explícito (campaña inexistente).
5. `has_organization_role(v_org_id, 'admin')` sobre la organización **real** de la campaña — nunca se acepta `organization_id` como parámetro, así que no hay forma de pasar uno arbitrario para intentar un bypass cross-tenant.
6. `status <> 'review'` → error explícito.
7. `UPDATE campaigns` + `INSERT campaign_approvals` en la misma transacción implícita de la función — si el `INSERT` fallara (p. ej. violación del `CHECK` de nota), toda la función revierte y `campaigns.status` no cambia.

---

## 4. Hardening SECURITY DEFINER

| Requisito pedido | Cómo se cumple |
|---|---|
| `SET search_path` explícito y seguro | `SET search_path = public` en ambas funciones — evita que un `search_path` de sesión manipulado redirija `has_organization_role`/tablas a un schema distinto. |
| `auth.uid()` para identificar al actor | `v_actor uuid := auth.uid()` — nunca se acepta `actor_user_id` como parámetro. |
| Rechazar `auth.uid()` NULL | `IF v_actor IS NULL THEN RAISE EXCEPTION ...` como primera línea de cada función. |
| Cargar la campaña `FOR UPDATE` | `SELECT ... FOR UPDATE` — lock de fila explícito. |
| Confirmar `organization_id` real | Se lee de la fila cargada, nunca de un parámetro. |
| Confirmar rol admin/owner | `has_organization_role(v_org_id, 'admin')` (helper de Phase 2, ya probado). |
| Confirmar status = review | Chequeo explícito antes del `UPDATE`. |
| Aprobar/rechazar en una sola transacción | Todo el cuerpo de la función es una única transacción implícita — sin `COMMIT` intermedio. |
| Insertar `campaign_approvals` en la misma operación | El `INSERT` está en el mismo bloque `BEGIN...END`, después del `UPDATE`. |
| `actor_user_id = auth.uid()` | El `INSERT` usa literalmente `v_actor`, no un valor externo. |
| Nunca confiar en `actor_user_id`/`organization_id` del cliente | Ninguno de los dos se acepta como parámetro de la función — es estructuralmente imposible pasarlos. |
| Sin SQL dinámico innecesario | Todo el cuerpo es SQL estático (`plpgsql` con sentencias fijas) — no hay `EXECUTE`/concatenación de strings en ningún punto. |
| Sin llamadas anónimas | `anon` no tiene `EXECUTE` (ver §5) y, aunque lo tuviera, `auth.uid()` sería `NULL` para una sesión anónima y la función fallaría igual. |

**Por qué `SECURITY DEFINER` es seguro aquí (no un bypass de RLS):** la función corre con los privilegios de su dueño, que ya es dueño de `public.campaigns` (los dueños de tabla bypasean RLS por defecto en Postgres; esta migración no activa `FORCE ROW LEVEL SECURITY`, igual que ninguna otra tabla del proyecto). La función no "salta" seguridad — reimplementa manualmente y de forma **más estricta** las comprobaciones que la policy `campaigns_update` de 7B no puede expresar bien (esa policy permite `status IN ('draft','review')` en el `WITH CHECK`, pero no puede validar atómicamente "y además inserta una fila en otra tabla con el mismo actor"). Mismo patrón ya validado y en producción-de-facto vía `acknowledge_alert`/`resolve_alert`.

---

## 5. Grants

```sql
REVOKE ALL ON FUNCTION public.approve_campaign(uuid)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_campaign(uuid, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_campaign(uuid)       FROM anon;
REVOKE ALL ON FUNCTION public.reject_campaign(uuid, text)  FROM anon;

GRANT EXECUTE ON FUNCTION public.approve_campaign(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_campaign(uuid, text) TO authenticated;
```

Postgres otorga `EXECUTE` a `PUBLIC` automáticamente al crear una función — se revoca explícitamente antes de otorgar solo a `authenticated`. El `REVOKE ... FROM anon` es redundante con el `REVOKE ... FROM PUBLIC` (ya lo cubre), pero se deja explícito para que la intención quede inequívoca en el código, no solo implícita — mismo criterio de "decir lo obvio explícitamente" ya usado en 7B. `service_role` no recibe ningún `GRANT` explícito: sigue bypaseando permisos de función por defecto en Supabase, y ningún consumidor server-side real llama a estas RPCs con `service_role` en 7C (no hay webhook n8n ni job de importación en esta subfase).

No se otorgó ningún `GRANT` adicional de CRUD sobre `campaign_approvals` — al contrario, se **retiró** uno (ver §6).

---

## 6. Cambios en `campaign_approvals` — retiro del INSERT directo

**Decisión:** se retira la policy `campaign_approvals_insert` (admin/owner + `actor_user_id = auth.uid()`, definida en 7B) y el `GRANT INSERT` a `authenticated`.

```sql
DROP POLICY IF EXISTS campaign_approvals_insert ON public.campaign_approvals;
REVOKE INSERT ON public.campaign_approvals FROM authenticated;
```

**Justificación:** la policy de 7B fue diseñada *antes* de que existiera la RPC, como único mecanismo de escritura previsto en ese momento. Con la RPC ya operativa, dejar el INSERT directo abierto habría creado una vía para insertar una fila de "decisión" (`action='approved'`/`'rejected'`) **sin que `campaigns.status`/`approved_at`/`rejected_at` cambien en absoluto**, y sin que se valide que la campaña esté en `review` — un admin podría insertar `action='approved'` para una campaña todavía en `draft`, dejando el audit trail completamente desconectado del estado real de la campaña. La RPC, en cambio, actualiza `campaigns` e inserta en `campaign_approvals` dentro de la misma transacción (atomicidad real, no solo "ambas cosas eventualmente ciertas"). Esto es exactamente la preferencia de diseño pedida para esta tarea: el audit trail debe ser escrito por el workflow de aprobación, no arbitrariamente por clientes.

**Qué queda igual:** `SELECT` no cambia — cualquier miembro de la organización sigue pudiendo leer el historial completo (usado por `listCampaignApprovals`). `UPDATE`/`DELETE` ya estaban cerrados desde 7B (sin policy, sin `GRANT`) y siguen así — `campaign_approvals` es y sigue siendo append-only.

**Consecuencia en el repositorio de dominio:** `CampaignApprovalRepository` (nuevo en 7C) es deliberadamente de **solo lectura** — `findByCampaignId`/`findLatestByCampaignId`, sin ningún método `create`/`insert`. Añadir uno habría reabierto exactamente la brecha que se acaba de cerrar (un caller de aplicación insertando una fila de audit trail sin pasar por la RPC).

---

## 7. Nuevos repositorios

### 7.1 `CampaignApprovalRepository` (dominio, solo lectura)

```ts
export interface CampaignApprovalRepository {
  findByCampaignId(campaignId: CampaignId, organizationId: OrganizationId): Promise<Result<CampaignApproval[]>>;
  findLatestByCampaignId(campaignId: CampaignId, organizationId: OrganizationId): Promise<Result<CampaignApproval | null>>;
}
```

Implementación: `SupabaseCampaignApprovalRepository` — `SELECT * FROM campaign_approvals WHERE campaign_id = ... AND organization_id = ...`, ordenado por `created_at DESC`. `findLatestByCampaignId` usa `.limit(1).maybeSingle()`. Ambos métodos aíslan siempre por `organizationId`, igual que el resto de repositorios del proyecto.

### 7.2 `ComplianceRuleRepository` (dominio, solo lectura)

```ts
export interface ComplianceRuleRepository {
  findApplicableRules(filter: ComplianceRuleFilter): Promise<Result<ComplianceRule[]>>;
}
```

No se implementó `findById` — no hay ningún caller real que lo necesite en 7C (instrucción explícita de la tarea: no crear métodos sin caller).

**Resolución de scope (global / organización / cliente):** `SupabaseComplianceRuleRepository.findApplicableRules` hace un único filtro `.or('organization_id.is.null,organization_id.eq.<org>')` a nivel de columna simple en PostgREST (deliberadamente el único uso de `.or()` en este repositorio), y resuelve el resto — `client_id` (NULL o el cliente exacto), `platform` (NULL o la plataforma exacta, solo si el caller la pide), `jurisdiction` (NULL o la jurisdicción exacta, solo si el caller la pide) — en TypeScript después de traer las filas. Esta decisión evita repetir el patrón de bug histórico ya documentado en este repo (`SupabaseAlertRepository.resolveActiveByAlertKeyPrefixes`, 3 defectos previos combinando `.or()`/`and()` anidados con `UPDATE`) — aquí no hay `UPDATE` involucrado, pero el criterio de "mantener `.or()` a una sola condición de columna simple" se aplicó igual por precaución. Solo se traen filas `active = true`; nunca se devuelven reglas de otra organización o de otro cliente (cubierto por tests).

**Precedencia:** cuando dos reglas activas comparten el mismo `ruleKey` en distintos niveles de scope, `resolveComplianceRulePrecedence` (función pura de dominio) se queda con la más específica: cliente > organización > global. La base de datos ya impide dos reglas en el **mismo** nivel con el mismo `ruleKey` (índices únicos parciales de 7B), así que esta función solo decide entre niveles distintos. No se implementó ningún merge de contenido (título/descripción/severidad) entre reglas del mismo `ruleKey` — la más específica gana por completo, evitando deliberadamente una lógica de merge más compleja de la necesaria.

---

## 8. Use cases (application layer)

| Use case | Transición / acción | Rol mínimo | Invoca RPC |
|---|---|---|---|
| `submitCampaignForReview` | `draft → review` | `operator`+ | No — usa `CampaignRepository.update` genérico (la policy `campaigns_update` de 7B ya permite este cambio de status). |
| `approveCampaign` | `review → approved` | `admin`+ | Sí — `CampaignRepository.approve` → RPC `approve_campaign`. |
| `rejectCampaign` | `review → rejected`, nota obligatoria | `admin`+ | Sí — `CampaignRepository.reject` → RPC `reject_campaign`. |
| `listCampaignApprovals` | lectura del audit trail | cualquier miembro (mismo nivel que `listCampaigns`) | No. |
| `getApplicableComplianceRules` | lectura de reglas aplicables | cualquier miembro | No. |
| `evaluateCampaignCompliance` | evaluación determinística, informativa | cualquier miembro | No. |

Los tres use cases de transición (`submit`/`approve`/`reject`) verifican **rol** y **transición de dominio** (`canTransitionCampaign`) **antes** de llamar al repositorio — defensa en profundidad para que el caller reciba un error tipado y legible (`VALIDATION_ERROR`/`FORBIDDEN`) en vez de depender únicamente del texto de la excepción de Postgres, al costo de 1-2 round-trips extra a la base de datos, aceptable dado que este es un flujo humano-en-el-loop de bajo volumen, no un hot path. La RPC vuelve a verificar exactamente lo mismo del lado del servidor — es la autoridad final, no el use case.

`rejectCampaign` valida la nota en **tres** capas independientes, ninguna confía únicamente en la anterior: `rejectCampaignSchema` (Zod, `.trim().min(1)`), `isValidRejectionNote` (dominio, llamado explícitamente en el use case), y el `CHECK`/validación explícita dentro de la RPC (`reject_campaign`).

`approveCampaign`/`rejectCampaign` **no** llaman a `evaluateCampaignCompliance` — ver §9, no existe una regla de negocio fijada que exija que compliance bloquee la aprobación en 7C.

---

## 9. Compliance — retrieval y evaluación

### 9.1 `getApplicableComplianceRules`

Wrapper delgado sobre `ComplianceRuleRepository.findApplicableRules`. `organizationId` siempre resuelto del lado del servidor (nunca del cliente); `clientId`/`platform`/`jurisdiction` sí pueden venir del caller, validados por `complianceRuleFilterSchema`.

### 9.2 `evaluateCampaignCompliance` — determinístico, NO IA

Carga la campaña, obtiene las reglas aplicables (usando `clientId`/`platform` **de la campaña cargada**, no de un input externo), y delega en la función pura de dominio `evaluateCampaignCompliance(campaign, rules)`.

**Limitación documentada (no un bug, una decisión explícita):** el schema actual de `compliance_rules` (heredado de 7B) guarda el contenido de la regla como texto narrativo — `title`/`description`/`category` — sin ninguna condición estructurada (p. ej. "budget >= X", "requiere disclaimer Y") que se pueda evaluar mecánicamente contra los campos de `Campaign`. Fingir una evaluación automática con ese schema sería falso. Por eso el evaluador:

- Filtra las reglas aplicables por `active = true` y por plataforma (defensa en profundidad, aunque el repositorio ya filtró antes).
- Nunca produce `violations`/`warnings` reales — ambos arrays quedan siempre vacíos en 7C.
- Devuelve cada regla aplicable dentro de `requiresManualReview`, dejando la interpretación semántica (o asistida por IA) para Phase 7D.
- `passed: true` siempre — documentado exhaustivamente en el tipo (`ComplianceEvaluationResult`, `packages/domain/src/entities/compliance-rule.ts`) como "no se detectó ninguna violación automática", **no** como "la campaña cumple todas las reglas aplicables". `evaluatedRuleKeys` queda vacío para reflejarlo con honestidad.

### 9.3 ¿Compliance bloquea `approveCampaign`? — NO

Se auditaron `PHASE_7_AUDIT.md` y el resto de la documentación de Phase 7A/7B buscando una regla de negocio fijada que exigiera que compliance bloqueara la aprobación — no existe ninguna. Dado que además el evaluador actual no puede producir violaciones reales (§9.2), bloquear con esta información sería, en la práctica, bloquear con un resultado que siempre dice "sin violaciones" — peor que no bloquear, porque daría una falsa sensación de garantía. Por eso, en 7C: `evaluateCampaignCompliance` es puramente informativo, expuesto para que una UI o Phase 7D lo consuman; `approveCampaign` no lo invoca ni depende de él en ninguna forma. La aplicación de compliance como enforcement real queda diferida a una fase posterior, si el usuario decide fijar esa regla de negocio explícitamente.

---

## 10. Tests y resultados

Todos los comandos se corrieron por paquete (`tsc --noEmit`, `eslint`, `vitest run`), replicando el patrón ya usado en 7B dado que no existe un harness de base de datos viva en este repo.

| Paquete | Nuevo/extendido en 7C | Resultado |
|---|---|---|
| `domain` | `campaign-approval-invariants.test.ts` (7), `compliance-rule-precedence.test.ts` (15) | **211/211** tests del paquete completo, verdes. `tsc`/`eslint` limpios. |
| `shared` | `campaign-approval.schema.test.ts` (17) — schemas de submit/approve/reject/compliance-filter | **66/66** tests del paquete completo, verdes. `tsc`/`eslint` limpios. |
| `infrastructure` | mappers (`campaign-approval.mapper.test.ts` 6, `compliance-rule.mapper.test.ts` 11), repositorios (`supabase-campaign-approval.repository.test.ts` 8, `supabase-compliance-rule.repository.test.ts` 10), `supabase-campaign.repository.test.ts` extendido (+ bloques `approve`/`reject`, 23 tests en total), `phase7c-migration-security.test.ts` (16, estático sobre el `.sql` real) | **74/74** tests del área 7C, verdes (`tsc --noEmit` del paquete completo, limpio). |
| `application` | `submit-campaign-for-review.use-case.test.ts` (9), `approve-campaign.use-case.test.ts` (10), `reject-campaign.use-case.test.ts` (11), `list-campaign-approvals.use-case.test.ts` (5), `get-applicable-compliance-rules.use-case.test.ts` (5), `evaluate-campaign-compliance.use-case.test.ts` (6); `create-campaign-draft.use-case.test.ts` ajustado (fixture `makeCampaignRepo` ahora incluye `approve`/`reject`, requeridos por la interfaz extendida) | **221/221** tests del paquete completo (54 en `campaigns` + 147 en `alerts`/`automations` + 20 en `tasks`), verdes. `tsc`/`eslint` limpios. |
| `apps/web` | `types.ts`/`database.types.ts` — RPCs `approve_campaign`/`reject_campaign` documentadas en `Functions`; nota sobre el `GRANT INSERT` retirado | `tsc --noEmit -p tsconfig.json` limpio; `eslint` sobre `src/lib/supabase` limpio. |

**Cobertura de escenarios pedidos en la tarea (§15 del brief):**

- Dominio: transiciones permitidas/prohibidas ya cubiertas desde 7B (`campaign-transitions.test.ts`, 20 tests, confirma que no existe `rejected → draft`); rechazo exige nota no vacía (`isValidRejectionNote`, 7 tests); tipos de resultado de compliance (15 tests de precedencia/evaluación).
- Aplicación: submit draft→review OK; viewer rechazado en los tres flujos; approve/reject review→approved/rejected por admin/owner; operator/strategist/viewer no pueden aprobar/rechazar (`it.each`); actor no-miembro → `FORBIDDEN`; campaña de otra organización → `NOT_FOUND`; status inválido → `VALIDATION_ERROR`; rechazo sin nota / solo espacios → `VALIDATION_ERROR` sin tocar el repositorio; lista de approvals (vacía y con datos); propagación de errores del repositorio/RPC en cada use case.
- Infraestructura: `approve_campaign`/`reject_campaign` invocadas con los argumentos correctos vía `rpc()`; errores de RPC mapeados a `NOT_FOUND`/`FORBIDDEN`/`CONFLICT`/`VALIDATION_ERROR`/`INTERNAL_ERROR` según el texto del mensaje; repositorio de approvals aislado por organización; reglas de compliance global/organización/cliente resueltas correctamente, solo `active = true`, sin fuga cross-tenant, precedencia cliente > organización > global verificada.
- Migración (estático, sobre el `.sql` real vía `fs.readFileSync`): `SECURITY DEFINER` presente en ambas funciones; `SET search_path = public` presente; declaración `v_actor uuid := auth.uid()` presente; verificación de rol admin/owner presente; verificación de status `review` presente; `UPDATE campaigns` e `INSERT campaign_approvals` dentro del mismo cuerpo de función (atomicidad); nota de rechazo validada; `GRANT EXECUTE` solo a `authenticated`; `REVOKE` de `anon`/`PUBLIC` presente; ausencia de `ALTER TABLE`/`DROP TABLE` (migración puramente aditiva, no toca 7B).

---

## 11. Archivos modificados / nuevos

**Nuevo (migración):**
- `supabase/migrations/20260816140000_phase7c_campaign_approval_workflow.sql`

**Nuevo (domain):**
- `packages/domain/src/repositories/campaign-approval.repository.ts`
- `packages/domain/src/repositories/compliance-rule.repository.ts`
- `packages/domain/src/__tests__/campaign-approval-invariants.test.ts`
- `packages/domain/src/__tests__/compliance-rule-precedence.test.ts`

**Modificado (domain):**
- `packages/domain/src/entities/campaign-approval.ts` (+`isValidRejectionNote`)
- `packages/domain/src/entities/compliance-rule.ts` (+`ComplianceRuleFilter`, `resolveComplianceRulePrecedence`, `evaluateCampaignCompliance`, tipos de evaluación)
- `packages/domain/src/repositories/campaign.repository.ts` (+`approve`, `reject`)
- `packages/domain/src/errors/domain.errors.ts` (+`rejectionNoteRequired`)
- `packages/domain/src/index.ts` (exports nuevos)

**Nuevo (infrastructure):**
- `packages/infrastructure/src/supabase/mappers/campaign-approval.mapper.ts`
- `packages/infrastructure/src/supabase/mappers/compliance-rule.mapper.ts`
- `packages/infrastructure/src/supabase/repositories/supabase-campaign-approval.repository.ts`
- `packages/infrastructure/src/supabase/repositories/supabase-compliance-rule.repository.ts`
- `packages/infrastructure/src/supabase/__tests__/phase7c-migration-security.test.ts`
- `packages/infrastructure/src/supabase/mappers/__tests__/campaign-approval.mapper.test.ts`
- `packages/infrastructure/src/supabase/mappers/__tests__/compliance-rule.mapper.test.ts`
- `packages/infrastructure/src/supabase/repositories/__tests__/supabase-campaign-approval.repository.test.ts`
- `packages/infrastructure/src/supabase/repositories/__tests__/supabase-compliance-rule.repository.test.ts`

**Modificado (infrastructure):**
- `packages/infrastructure/src/supabase/repositories/supabase-campaign.repository.ts` (+`approve`, `reject`, `mapCampaignRpcError`)
- `packages/infrastructure/src/supabase/repositories/__tests__/supabase-campaign.repository.test.ts` (+bloques `approve`/`reject`)
- `packages/infrastructure/src/index.ts` (exports nuevos)

**Nuevo (application):**
- `packages/application/src/use-cases/campaigns/submit-campaign-for-review.use-case.ts`
- `packages/application/src/use-cases/campaigns/approve-campaign.use-case.ts`
- `packages/application/src/use-cases/campaigns/reject-campaign.use-case.ts`
- `packages/application/src/use-cases/campaigns/list-campaign-approvals.use-case.ts`
- `packages/application/src/use-cases/campaigns/get-applicable-compliance-rules.use-case.ts`
- `packages/application/src/use-cases/campaigns/evaluate-campaign-compliance.use-case.ts`
- `packages/application/src/use-cases/campaigns/__tests__/submit-campaign-for-review.use-case.test.ts`
- `packages/application/src/use-cases/campaigns/__tests__/approve-campaign.use-case.test.ts`
- `packages/application/src/use-cases/campaigns/__tests__/reject-campaign.use-case.test.ts`
- `packages/application/src/use-cases/campaigns/__tests__/list-campaign-approvals.use-case.test.ts`
- `packages/application/src/use-cases/campaigns/__tests__/get-applicable-compliance-rules.use-case.test.ts`
- `packages/application/src/use-cases/campaigns/__tests__/evaluate-campaign-compliance.use-case.test.ts`

**Modificado (application):**
- `packages/application/src/index.ts` (exports nuevos)
- `packages/application/src/use-cases/campaigns/__tests__/create-campaign-draft.use-case.test.ts` (fixture `makeCampaignRepo` actualizado para incluir `approve`/`reject`, requeridos ahora por `CampaignRepository`)

**Nuevo (shared):**
- `packages/shared/src/schemas/__tests__/campaign-approval.schema.test.ts`

**Modificado (shared):**
- `packages/shared/src/schemas/campaign.schema.ts` (+`submitCampaignForReviewSchema`, `approveCampaignSchema`, `rejectCampaignSchema`, `complianceRuleFilterSchema`)
- `packages/shared/src/index.ts` (exports nuevos)

**Modificado (apps/web):**
- `apps/web/src/lib/supabase/types.ts` (RPCs `approve_campaign`/`reject_campaign` en `Functions`; nota sobre `GRANT INSERT` retirado en `CampaignApprovalInsert`)
- `apps/web/src/lib/supabase/database.types.ts` (mismos cambios, archivo huérfano actualizado por completitud como en 7B)

**Modificado (docs):**
- `docs/implementation/phase-7/PHASE_7_IMPLEMENTATION_PLAN.md` (§7C marcado ✅ IMPLEMENTADO)
- `docs/implementation/phase-7/PHASE_7_RISK_REGISTER.md` (R-TECH-01, R-SEC-02 marcados ✅ RESUELTO)

**Nuevo (docs):**
- `docs/implementation/phase-7/PHASE_7C_APPROVAL_COMPLIANCE_REPORT.md` (este documento)

**Fuera de alcance, sin tocar (confirmado en `git status`):**
- `.agencia-ai/.claude/commands/new-client.md` — sigue apareciendo como `??` (untracked, pre-existente), no fue creado ni modificado por esta tarea.

---

## 12. Instrucciones para aplicar y verificar localmente (NO ejecutado)

La migración **no fue aplicada**. Comando exacto para aplicar **solo** la migración 7C contra el Supabase local `supabase_db_BopIAgency` (mismo patrón usado y entregado en la revisión de seguridad de 7B — requiere que 7B ya esté aplicada):

```bash
docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres \
  < supabase/migrations/20260816140000_phase7c_campaign_approval_workflow.sql
```

Alternativa vía Supabase CLI si el proyecto local ya está vinculado (`supabase start` corriendo y 7B ya aplicada — **no** usar `supabase db reset`, que reaplicaría todo el historial de migraciones):

```bash
supabase db execute --local --file supabase/migrations/20260816140000_phase7c_campaign_approval_workflow.sql
```

**Smoke tests manuales sugeridos después de aplicar (no ejecutados como parte de esta tarea):**

1. `submitCampaignForReview` sobre una campaña `draft` de la organización propia → `status = 'review'`, `submitted_for_review_at` seteado.
2. `approve_campaign` llamado por un `owner`/`admin` sobre una campaña en `review` → `status = 'approved'`, `approved_at` seteado, `rejected_at = NULL`, fila nueva en `campaign_approvals` con `action = 'approved'`.
3. `reject_campaign` llamado por un `owner`/`admin` con nota no vacía sobre una campaña en `review` → `status = 'rejected'`, `rejected_at` seteado, `approved_at = NULL`, fila nueva en `campaign_approvals` con `action = 'rejected'`, `note` correcta.
4. `approve_campaign`/`reject_campaign` llamados por un `operator`/`strategist` → excepción `actor lacks admin/owner role`, ningún cambio en `campaigns` ni en `campaign_approvals`.
5. `approve_campaign`/`reject_campaign` sobre una campaña de otra organización → excepción `campaign not found` (el `SELECT ... FOR UPDATE` no encuentra la fila porque no se filtra por `organization_id` explícito — la propia ausencia de la fila para ese actor ya la protege; confirmar además que ningún `SELECT` directo sin RLS deje ver la fila).
6. Intentar un `INSERT` directo en `campaign_approvals` desde `authenticated` (sin pasar por la RPC) → debe fallar por falta de `GRANT INSERT` (confirma que la Sección C quedó aplicada).
7. Intentar `UPDATE`/`DELETE` sobre una fila de `campaign_approvals` → debe fallar (sin policy, sin grant, igual que desde 7B).

---

## 13. `git status --short` (estado final, sin `git add`)

```
 M apps/web/src/lib/supabase/database.types.ts
 M apps/web/src/lib/supabase/types.ts
 M docs/implementation/phase-7/PHASE_7_IMPLEMENTATION_PLAN.md
 M docs/implementation/phase-7/PHASE_7_RISK_REGISTER.md
 M packages/application/src/index.ts
 M packages/application/src/use-cases/campaigns/__tests__/create-campaign-draft.use-case.test.ts
 M packages/domain/src/entities/campaign-approval.ts
 M packages/domain/src/entities/compliance-rule.ts
 M packages/domain/src/errors/domain.errors.ts
 M packages/domain/src/index.ts
 M packages/domain/src/repositories/campaign.repository.ts
 M packages/infrastructure/src/index.ts
 M packages/infrastructure/src/supabase/repositories/__tests__/supabase-campaign.repository.test.ts
 M packages/infrastructure/src/supabase/repositories/supabase-campaign.repository.ts
 M packages/shared/src/index.ts
 M packages/shared/src/schemas/campaign.schema.ts
?? .agencia-ai/.claude/commands/new-client.md   (pre-existente, fuera de alcance, no tocado)
?? packages/application/src/use-cases/campaigns/__tests__/approve-campaign.use-case.test.ts
?? packages/application/src/use-cases/campaigns/__tests__/evaluate-campaign-compliance.use-case.test.ts
?? packages/application/src/use-cases/campaigns/__tests__/get-applicable-compliance-rules.use-case.test.ts
?? packages/application/src/use-cases/campaigns/__tests__/list-campaign-approvals.use-case.test.ts
?? packages/application/src/use-cases/campaigns/__tests__/reject-campaign.use-case.test.ts
?? packages/application/src/use-cases/campaigns/__tests__/submit-campaign-for-review.use-case.test.ts
?? packages/application/src/use-cases/campaigns/approve-campaign.use-case.ts
?? packages/application/src/use-cases/campaigns/evaluate-campaign-compliance.use-case.ts
?? packages/application/src/use-cases/campaigns/get-applicable-compliance-rules.use-case.ts
?? packages/application/src/use-cases/campaigns/list-campaign-approvals.use-case.ts
?? packages/application/src/use-cases/campaigns/reject-campaign.use-case.ts
?? packages/application/src/use-cases/campaigns/submit-campaign-for-review.use-case.ts
?? packages/domain/src/__tests__/campaign-approval-invariants.test.ts
?? packages/domain/src/__tests__/compliance-rule-precedence.test.ts
?? packages/domain/src/repositories/campaign-approval.repository.ts
?? packages/domain/src/repositories/compliance-rule.repository.ts
?? packages/infrastructure/src/supabase/__tests__/
?? packages/infrastructure/src/supabase/mappers/__tests__/campaign-approval.mapper.test.ts
?? packages/infrastructure/src/supabase/mappers/__tests__/compliance-rule.mapper.test.ts
?? packages/infrastructure/src/supabase/mappers/campaign-approval.mapper.ts
?? packages/infrastructure/src/supabase/mappers/compliance-rule.mapper.ts
?? packages/infrastructure/src/supabase/repositories/__tests__/supabase-campaign-approval.repository.test.ts
?? packages/infrastructure/src/supabase/repositories/__tests__/supabase-compliance-rule.repository.test.ts
?? packages/infrastructure/src/supabase/repositories/supabase-campaign-approval.repository.ts
?? packages/infrastructure/src/supabase/repositories/supabase-compliance-rule.repository.ts
?? packages/shared/src/schemas/__tests__/campaign-approval.schema.test.ts
?? supabase/migrations/20260816140000_phase7c_campaign_approval_workflow.sql
```

**Nota operativa (no bloqueante):** al ejecutar `git status` en el entorno local del usuario apareció una advertencia `warning: unable to unlink '.git/index.lock': Operation not permitted`. El comando igualmente produjo la salida completa y correcta de arriba, así que no impidió esta verificación, pero sugiere que puede quedar un `index.lock` residual de una operación de Git previa (posiblemente de otra sesión/proceso) en el working tree del usuario. No se intentó limpiarlo — está fuera del alcance de esta tarea y de las herramientas disponibles. Se recomienda que el usuario verifique manualmente `.git/index.lock` antes de su próximo `git add`/`commit`, por si necesita eliminarlo a mano.

---

## 14. Riesgos pendientes para 7D

- **Evaluación semántica real de compliance:** `evaluateCampaignCompliance` no puede producir violaciones reales hasta que `compliance_rules` tenga alguna condición estructurada evaluable, o hasta que 7D incorpore un evaluador asistido por IA que interprete el texto de la regla contra el contenido de la campaña. Hasta entonces, todo lo que hoy es `requiresManualReview` seguirá siéndolo.
- **`generatedContent` e IA:** ninguna campaña tiene todavía contenido generado por IA (7D no empezó). El flujo de aprobación de 7C aprueba/rechaza la campaña como entidad (presupuesto, cliente, plataforma, objetivo), no ningún copy generado — eso es explícitamente contenido de 7D.
- **Notificación de "campaña enviada a revisión" / "campaña decidida":** sigue diferida a 7F (automations/notifications) — 7C no crea ninguna `alert`/`task` al transicionar una campaña; un aprobador solo se entera si consulta la lista de campañas en `review`.
- **UI de aprobación:** no implementada (explícitamente fuera de alcance de 7C) — el `CampaignApprovalPanel` sigue siendo un ítem de 7E.
- **Publicación externa:** sigue sin implementarse ni planearse en ninguna subfase hasta la fase de "Publicación de Campañas" del roadmap original, posterior a 7G.
- **`index.lock` residual observado en `git status`** (§13) — no relacionado con el código de esta tarea, pero puede bloquear un futuro `git add`/`commit` si no se limpia manualmente.

---

## 15. Confirmación de restricciones respetadas

- ❌ Producción: no tocada — ninguna conexión a Supabase remoto, ninguna migración aplicada.
- ❌ n8n: no tocado — cero referencias nuevas a n8n/webhooks en esta subfase.
- ❌ IA: no implementada — `evaluateCampaignCompliance` es determinístico puro, sin llamadas a ningún proveedor de IA.
- ❌ UI: no implementada — cero archivos bajo `apps/web/src/app` o `apps/web/src/components` tocados; solo `apps/web/src/lib/supabase/{types,database.types}.ts`.
- ❌ Publicación externa de campañas: no implementada — ningún código nuevo llama a `AdvertisingPlatformProvider` para escribir en Meta/Google/YouTube.
- ❌ Migración: **no ejecutada** (ni local ni remota) — solo escrita en el working tree; comando exacto entregado en §12 para que el usuario la aplique manualmente.
- ❌ `supabase db reset`: no ejecutado.
- ❌ `db push` contra cloud: no ejecutado.
- ❌ `git add`: no ejecutado.
- ❌ `git commit`: no ejecutado.
- ❌ `.agencia-ai/.claude/commands/new-client.md`: no tocado (confirmado en `git status`, §13).
