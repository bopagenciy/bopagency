# Phase 7 — Closure Report (7G: E2E / Final Closure)

**Rama:** `feat/phase-7-campaign-studio`
**HEAD auditado:** `0a93419` — "feat(phase-7): add campaign automation and notifications"
**Fecha de cierre:** 2026-08-23
**Estado global:** ver §17 (clasificación de merge-readiness)

> Este documento es el cierre de **todo Phase 7 (7A–7G)**, no solo de 7F. No se
> hizo `git add`/`commit`/`push`/`merge` en ningún momento de esta tarea. No se
> tocó `supabase/config.toml` ni `.agencia-ai/.claude/commands/new-client.md`.
> No se ejecutó ninguna migración, ninguna llamada real a Meta/Google/YouTube/
> email/redes sociales, ni ninguna operación destructiva sobre datos locales.

---

## 1. Alcance de 7G

Phase 7G es una fase de **auditoría y cierre**, no de features nuevas. El
mandato explícito fue: auditar 7B–7F contra el código real (no solo contra la
documentación previa), construir una matriz E2E explícita, ejecutar la
regresión de tests que el entorno permita, auditar seguridad de base de
datos, roles, rutas de lectura, publicación externa y secretos, evaluar
disponibilidad de proveedores de IA, auditar el componente de UI de
automatización, inventariar datos de smoke, y producir este reporte más
actualizaciones a `PHASE_7_IMPLEMENTATION_PLAN.md` y
`PHASE_7_RISK_REGISTER.md`. Ningún hallazgo de esta auditoría requirió
detenerse por alguna de las condiciones STOP definidas (ver §19 del mandato /
§9 de este reporte).

## 2. Resumen por sub-fase (7A–7G)

| Fase | Alcance | Estado |
|---|---|---|
| 7A | Auditoría inicial y plan | ✅ Completa (docs previos) |
| 7B | Persistencia (`campaigns`, `campaign_approvals`, `compliance_rules`) | ✅ Completa — verificada de nuevo en §7 |
| 7C | Workflow de aprobación (RPCs `approve_campaign`/`reject_campaign`) | ✅ Completa — verificada de nuevo en §7 |
| 7D | AI campaign builder (generación estructurada) | ✅ Completa |
| 7D.1 / 7D.1.1 | Multi-provider AI + fixes de smoke real (Gemini) | ✅ Completa, con smoke real ejecutado |
| 7E | Campaign Studio UI (wizard, detail, aprobación) | ✅ Completa, con smoke real ejecutado |
| 7F | Automatización / notificaciones (tasks/alerts) | ✅ Completa, con smoke real ejecutado (4/4 PASS) y bug real corregido (`created_by`) |
| 7G | E2E / cierre final | ✅ Completa — este documento |

## 3. Matriz de evidencia E2E (categorías A–H)

Convención: **AUTO** = cubierto por tests automatizados existentes (leídos y
confirmados en este ciclo, no solo referenciados). **SMOKE** = evidencia de
ejecución manual real ya provista por el usuario (7D.1/7E o 7F), **no
re-ejecutada ni re-fabricada aquí**. **GAP** = sin cobertura directa; se
documenta la decisión tomada.

| # | Categoría | Cobertura | Detalle |
|---|---|---|---|
| A | Creación de campaña (manual + IA) | AUTO + SMOKE | `create-campaign-draft`/`generate-campaign-draft-with-ai` con tests unitarios; SMOKE 7D.1/7E: generación real con Gemini, contenido estructurado persistido y renderizado. |
| B | Edición / regeneración de contenido | AUTO + SMOKE | `edit-campaign-draft`/`regenerate-campaign-content` con tests; SMOKE 7D.1.1: regeneración real tras el fix de timeout, sin duplicar campaña, preservando nombre/presupuesto. |
| C | Flujo de revisión (`draft → review`) | AUTO + SMOKE | `submit-campaign-for-review` con tests; SMOKE 7F: "Smoke 7F Review Fix" y "Smoke 7F Approved" confirmaron transición + 1 task creada por evento, sin duplicados en refresh. |
| D | Aprobación / rechazo (RPCs) | AUTO + SMOKE | `approve-campaign`/`reject-campaign` con tests; RPCs verificadas línea por línea en este ciclo (§7); SMOKE 7D.1/7E (aprobación/rechazo con nota, historial persistido) + SMOKE 7F (task por evento, `created_by` UUID real). |
| E | Automatización (tasks/alerts) por evento de negocio | AUTO + SMOKE | Suite extensa de `evaluate-campaign-automation`/`campaign-automation-dispatch`/signatures; SMOKE 7F 4/4 PASS (review, reject, approve, fallo de IA) con evidencia de DB citada exactamente (conteos de filas, tags, `created_by`). |
| F | Fallos de proveedor de IA (alertas) | AUTO + SMOKE | Tests de `getAiErrorKind`/alert branch; SMOKE 7F: fallo real de Gemini (404) generó alerta con `metadata.actorUserId` correcto, sin campaña creada previamente (scope `client:{clientId}`). |
| G | No publicación externa | AUTO (greps de este ciclo) + diseño | Barrido de código (§10) sin resultados de publicación real; ninguna función del dominio/aplicación/infraestructura llama a Meta/Google/YouTube/email/redes sociales. Documentado también en la UI (`CampaignAutomationActivity`, disclaimer explícito) y en cada RPC (comentarios SQL). |
| H | Roles / RLS / rutas de lectura | AUTO + verificación directa de SQL | Ver §7 (DB security audit) y §8 (matriz de roles) — verificado contra las migraciones reales, no asumido. |

**Ningún GAP fue identificado.** La regresión completa de tests en este HEAD
exacto, que en la primera pasada de esta auditoría quedó como GAP de
ejecución (bloqueada solo por el entorno de este puente, sin binario nativo
de Rollup para Linux ni acceso de red), fue cerrada por el usuario
ejecutando la suite completa manualmente en Windows contra este mismo HEAD
`0a93419` — ver §5 (actualizado: **PASS, 1557/1557**).

## 4. Evidencia manual de runtime (reutilizada, no re-ejecutada)

Se trata como evidencia ya válida y cerrada — **no se volvió a ejecutar
smoke manual en esta tarea**, siguiendo la instrucción explícita del
usuario:

- **7D.1 / 7E (2026-08-18):** generación IA (Gemini) real, regeneración real
  (tras fix de timeout), aprobación y rechazo manuales con nota persistida,
  historial de `campaign_approvals` verificado, sin publicación externa.
  Suite reportada por el usuario en ese momento: 1501 → 1517/1517 tests
  verdes tras el fix de 7D.1.1, typecheck/lint limpios en los 9 workspaces.
- **7F (previo a esta tarea):** 4/4 casos PASS con evidencia de DB citada
  textualmente por el usuario — revisión, rechazo, aprobación, fallo de IA —
  cada uno con conteo exacto de filas, tags, `created_by`/`actorUserId`, y
  confirmación de que ningún refresh de UI duplicó resultados. Suite
  reportada en Windows en ese momento: 1549 tests, 0 fallos — **total
  histórico, medido antes del commit `0a93419`; superado por la regresión
  final de §5 (1557 tests, 0 fallos), que es la evidencia vigente para el
  HEAD auditado por este documento.**

## 5. Regresión completa de tests — HEAD `0a93419` — ✅ PASS (evidencia final)

Un primer intento de `npm test --workspace=packages/shared` desde este
puente (Linux/WSL montado) reprodujo el fallo de entorno ya documentado en
fases anteriores (`Cannot find module '@rollup/rollup-linux-x64-gnu'` — el
`node_modules` montado está instalado para Windows y este puente no tiene
acceso de red para reinstalar). Ese límite sigue siendo real **para este
puente**, pero **el usuario ejecutó la suite completa manualmente en
Windows, contra este mismo HEAD `0a93419` exacto**, superando así el total
histórico de 1549 (medido antes de este commit) con evidencia fresca y
vigente:

| Workspace | Resultado |
|---|---|
| `packages/shared` | 106 passed / 0 failed |
| `packages/domain` | 229 passed / 0 failed |
| `packages/application` | 364 passed / 0 failed |
| `packages/infrastructure` | 502 passed / 0 failed |
| `packages/automation-engine` | 0 tests, exit code 0 (`--passWithNoTests`) |
| `packages/ai-engine` | 0 tests, exit code 0 (`--passWithNoTests`) |
| `packages/integrations` | 0 tests, exit code 0 (`--passWithNoTests`) |
| `packages/ui` | 0 tests, exit code 0 (`--passWithNoTests`) |
| `apps/web` | 356 passed / 0 failed |
| **TOTAL** | **1557 passed / 0 failed** |

`packages/application` sube de 356 (evidencia previa) a 364 porque incluye
los tests finales de actor/idempotencia de Phase 7F (propagación real de
`actorUserId`/`createdBy`, ver §4 de `PHASE_7F_CAMPAIGN_AUTOMATION_REPORT.md`
§18b/§18c). La salida por `stderr` observada durante los tests de
`infrastructure`/`apps/web` corresponde a escenarios negativos/de error
intencionalmente ejercitados por esos mismos tests (p. ej. fallos de
proveedor de IA, validaciones rechazadas) — no indica un fallo de suite; el
resultado reportado por cada runner fue PASS.

**Estado final: PASS.** Ejecutado manualmente en Windows contra el HEAD
final de la implementación de Phase 7 (`0a93419`). Esto cierra por completo
lo que en la primera pasada de esta auditoría (ver historial de §3/§4)
quedaba como gap de ejecución en este puente — ya no es un gap, es
evidencia real y vigente para el HEAD auditado. Combinado con typecheck/lint
limpios en los 9 workspaces (§6, mismo HEAD), la superficie completa de
Phase 7 (7A–7G) queda con evidencia automatizada ejecutada + verificada.

## 6. Matriz typecheck / lint — HEAD `0a93419`

Ejecutado individualmente por workspace desde este puente (sin red, ambos
comandos son JS puro y sí funcionan aquí):

| Workspace | `tsc --noEmit` | `eslint` |
|---|---|---|
| `packages/shared` | ✅ limpio | ✅ limpio |
| `packages/domain` | ✅ limpio | ✅ limpio |
| `packages/application` | ✅ limpio | ✅ limpio |
| `packages/infrastructure` | ✅ limpio | ✅ limpio |
| `packages/automation-engine` | ✅ limpio | ✅ limpio |
| `packages/ai-engine` | ✅ limpio | ✅ limpio |
| `packages/integrations` | ✅ limpio | ✅ limpio |
| `packages/ui` | ✅ limpio | ✅ limpio |
| `apps/web` | ✅ limpio | ✅ limpio |

**9/9 workspaces limpios, typecheck y lint, en HEAD `0a93419` exacto.**

## 7. Auditoría de seguridad de base de datos

Verificado leyendo directamente `20260816130000_phase7b_campaign_studio_persistence.sql`
(623 líneas, completo) y `20260816140000_phase7c_campaign_approval_workflow.sql`
(278 líneas, completo), más re-confirmación de `tasks`/`alerts` desde
`20260730150000_phase4_data_migration_targets.sql` (Phase 4/6, sin cambios en
Phase 7).

### 7.1 `campaigns`
- `organization_id`/`client_id` `NOT NULL`, FKs correctas.
- Triggers de inmutabilidad: `organization_id`/`client_id` protegidos de
  `UPDATE` tras el insert.
- RLS: `campaigns_select`/`campaigns_insert`/`campaigns_update`, todas sobre
  `is_organization_member`/`has_organization_role(org, 'operator')`; el
  `WITH CHECK` de `campaigns_update` limita los estados escribibles vía
  `UPDATE` genérico a `('draft', 'review')` — los estados `approved`/
  `rejected` **no son alcanzables** por el `UPDATE` directo de `authenticated`,
  solo por las RPCs `SECURITY DEFINER` (ver 7.3). Sin policy de `DELETE`.

### 7.2 `campaign_approvals` — append-only reforzado en 7C
- 7B originalmente otorgaba `INSERT` directo a `authenticated` (admin/owner +
  `actor_user_id = auth.uid()`).
- **7C retiró esa vía por completo:** `DROP POLICY campaign_approvals_insert`
  + `REVOKE INSERT ON campaign_approvals FROM authenticated`. A partir de
  `0a93419`, `authenticated` solo tiene `SELECT` sobre esta tabla — **ningún**
  INSERT/UPDATE/DELETE directo es posible bajo ninguna circunstancia.
- La única vía de escritura son las RPCs `approve_campaign`/`reject_campaign`
  (§7.3), que corren `SECURITY DEFINER` con los privilegios del dueño de la
  función y por eso no requieren `GRANT INSERT` explícito.
- Motivo documentado en la propia migración: evitar que un admin pueda
  insertar una fila de "decisión" desconectada del estado real de
  `campaigns` (por ejemplo, `action='approved'` para una campaña aún en
  `draft`), y garantizar atomicidad real entre el cambio de estado y el
  registro de auditoría.

### 7.3 RPCs `approve_campaign(uuid)` / `reject_campaign(uuid, text)`
Ambas, leídas completas:
- Exigen `auth.uid() IS NOT NULL`.
- Cargan la campaña con `FOR UPDATE` (lock de fila, previene condiciones de
  carrera entre aprobaciones/rechazos concurrentes).
- Leen `organization_id`/`status` **de la fila real** — nunca los reciben
  como parámetro, por lo que un bypass cross-tenant pasando un
  `organization_id` arbitrario es estructuralmente imposible.
- Verifican `has_organization_role(v_org_id, 'admin')` contra la organización
  real de la campaña.
- Exigen `status = 'review'` exacto antes de transicionar.
- Toman `actor_user_id` **siempre** de `auth.uid()`, nunca de un parámetro —
  no se puede falsificar quién decide.
- `UPDATE campaigns` + `INSERT campaign_approvals` ocurren en la misma
  transacción implícita de la función (si el `INSERT` falla — p.ej. el
  `CHECK` de nota vacía en rechazo — la función entera revierte).
- `reject_campaign` exige además nota no vacía (trim), reforzado tanto en la
  RPC como en el `CHECK` de tabla (defensa en profundidad).
- `EXECUTE` revocado de `PUBLIC`/`anon`, otorgado solo a `authenticated`. Sin
  grant a `service_role` — no hace falta, ningún consumidor real del runtime
  de campañas llama estas RPCs con `service_role`.
- SECURITY DEFINER es seguro aquí porque las funciones reimplementan
  manualmente y de forma más estricta las comprobaciones que RLS no puede
  expresar bien (rol exacto + estado exacto + atomicidad), exactamente el
  mismo patrón ya usado por `acknowledge_alert`/`resolve_alert` (Phase 4). No
  se activa `FORCE ROW LEVEL SECURITY` en ninguna tabla del proyecto — mismo
  criterio consistente en todo el repo.

### 7.4 `compliance_rules`
- SELECT: reglas globales (`organization_id IS NULL`) visibles a cualquier
  autenticado; reglas scoped visibles solo a miembros de esa organización.
- INSERT/UPDATE: requieren `organization_id NOT NULL` + rol admin de esa
  organización; si `client_id` está presente, se exige que el cliente
  pertenezca a esa misma organización (previene mezclar client override de
  otro tenant).
- Sin policy de DELETE — el patrón esperado es `active = false`.

### 7.5 `tasks` / `alerts` (Phase 4/6, reutilizadas sin cambios por 7F)
- Re-confirmado directamente en `20260730150000_phase4_data_migration_targets.sql`:
  `tasks_insert`/`alerts_insert` ambas exigen
  `has_organization_role(organization_id, 'operator')` y, si `client_id` no
  es null, que el cliente pertenezca a esa organización.
- Todos los call sites de Phase 7F (`submitCampaignForReview` operator+,
  `approveCampaign`/`rejectCampaign` admin+,
  `generateCampaignDraftWithAI`/`regenerateCampaignContent` operator+) ya
  verifican el rol mínimo requerido **antes** de invocar el hook de
  automatización, por lo que conectar `SupabaseAlertRepository`/
  `SupabaseTaskRepository` con el cliente Supabase de sesión del usuario (no
  `service_role`) en `campaign.composition.ts` es seguro y correcto — más
  restrictivo que el webhook n8n de Phase 6F, que sí necesita `service_role`
  por no tener sesión de usuario autenticada.
- `alerts` tiene columna `metadata jsonb NOT NULL DEFAULT '{}'`; `tasks` **no
  tiene** columna de metadata — la relación campaña→task en 7F se codifica
  vía `tags[]` + `description` con link interno, nunca asumiendo una columna
  inexistente. Confirmado en el propio código de `evaluate-campaign-automation.use-case.ts`.
- El trigger `trg_alerts_70_audit_fields` solo bloquea `UPDATE` directo de
  `acknowledged_by/at`/`resolved_by/at` — nunca bloquea `INSERT` ni cambios a
  otras columnas (`severity`/`title`/`description`/`metadata`).

### 7.6 `service_role`
Barrido de `campaign.composition.ts` y de todos los use-cases de
`packages/application/src/use-cases/campaigns/`: **cero referencias
funcionales** a `service_role`. La única mención es un comentario de diseño
que documenta explícitamente por qué ningún flujo de Campaign Studio lo
necesita — consistente con los hechos de RLS/RPC verificados arriba.

**Conclusión §7: sin hallazgos.** No se activó ninguna condición STOP
(no hay defecto de RLS, no hay fuga cross-org, no hay vía de bypass).

## 8. Matriz de roles

Verificada contra `hasMinimumRole(...)` real en cada use case (no asumida):

| Acción | viewer | operator | strategist | admin | owner |
|---|---|---|---|---|---|
| Ver campaña / listar / historial de aprobaciones | ✅ (miembro) | ✅ | ✅ | ✅ | ✅ |
| Crear draft manual | ❌ | ✅ | ✅ | ✅ | ✅ |
| Editar draft | ❌ | ✅ | ✅ | ✅ | ✅ |
| Generar con IA | ❌ | ✅ | ✅ | ✅ | ✅ |
| Regenerar con IA | ❌ | ✅ | ✅ | ✅ | ✅ |
| Enviar a revisión (`draft → review`) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Aprobar (`review → approved`) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Rechazar (`review → rejected`) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ver tasks/alerts generadas (`/tasks`, `CampaignAutomationActivity`) | ✅ (miembro, vía RLS de `tasks`/`alerts`) | ✅ | ✅ | ✅ | ✅ |

`strategist` tiene los mismos permisos que `operator` en Campaign Studio
porque `hasMinimumRole` compara contra la jerarquía completa
(`viewer < operator < strategist < admin < owner`, definida en Phase 2) y
ningún use case de campañas exige `strategist` como umbral propio — solo
`operator` o `admin`. No es un hallazgo, es el comportamiento diseñado.

## 9. Auditoría de rutas de lectura (sin efectos secundarios)

Verificado leyendo el cuerpo completo de los 4 use cases de solo lectura:
`get-campaign`, `list-campaigns`, `list-campaign-approvals`,
`get-applicable-compliance-rules`. Búsqueda de `.create(`, `.update(`,
`.upsert`, y del hook `evalCampaignAutomationSilently`/
`alertRepository`/`taskRepository`: **cero coincidencias en los cuatro
archivos**. Ninguna ruta GET/list/detail/refresh muta estado ni dispara
automatización. Sin hallazgos.

## 10. Barrido de publicación externa

Búsquedas ejecutadas sobre `packages/*/src apps/*/src`:
- Patrones de proveedores (`publishCampaign`, `meta_ads_api`,
  `graph.facebook`, `googleads.googleapis`, `youtube.googleapis`,
  `marketing.?api`) → **cero coincidencias**.
- `fetch(`/`axios` en archivos relacionados con `campaign` → **cero
  coincidencias**.

La única superficie de red relacionada con campañas es la llamada
server-side a los proveedores de IA (OpenAI/Gemini/Anthropic) para
**generar contenido de campaña**, nunca para publicarlo. Confirmado también
a nivel de UI: `CampaignAutomationActivity` incluye el disclaimer explícito
"No implica ninguna publicación en un proveedor externo (Meta Ads, Google
Ads, YouTube, email o redes sociales)", y los comentarios SQL de las RPCs
(§7.3) documentan lo mismo. **Sin hallazgos — la garantía de no-publicación
se sostiene en código, no solo en documentación.**

## 11. Barrido de secretos

Sobre los 791 archivos trackeados (`git ls-files`, excluyendo
`node_modules`/lockfile/`.next`):
- Referencias a `OPENAI_API_KEY`/`GEMINI_API_KEY`/`ANTHROPIC_API_KEY`: todas
  legítimas (docs, `ai-provider-config.ts`, adaptadores de proveedor,
  constantes, tests).
- Literales con forma de clave real (`sk-[a-zA-Z0-9]{20,}`,
  `AIza[a-zA-Z0-9_-]{20,}`): 3 archivos, los tres confirmados como fixtures
  sintéticos de test (claves Gemini falsas en tests, y un test de
  sanitización que **afirma** que una clave falsa con forma de OpenAI **no**
  aparece en la salida).
- Nombres de archivo tipo dump/tar/key/env: **cero coincidencias**
  trackeadas.
- Sin prefijo `NEXT_PUBLIC_` en ninguna clave de IA.
- Sin `dangerouslySetInnerHTML` en la UI de campañas.
- Sin `console.log` en código de app/infra de campañas.
- Único uso de `Bearer`/`Authorization`:
  `packages/infrastructure/src/ai/openai-api.provider.ts:93` — construcción
  server-side esperada del header, nunca expuesto/logueado.

**Sin hallazgos.**

## 12. Disponibilidad de proveedores de IA

| Proveedor | Tests automatizados | Smoke real | Estado |
|---|---|---|---|
| Gemini | ✅ | ✅ PASS (7D.1/7E, más el caso de fallo real 404 en 7F) | Listo — es el proveedor default verificado en runtime real. |
| OpenAI | ✅ | ❌ no ejecutado | Arquitectura y tests cubren el proveedor; sin smoke real. **No bloquea el cierre** (instrucción explícita del usuario) — clasificado DEFERRED OPS. |
| Anthropic | ✅ | ❌ no ejecutado | Igual que OpenAI. Adicionalmente `DEFAULT_MODELS.anthropic` sigue sin verificar (R-TECH-13, preexistente) — antes de usarlo en producción real, fijar `ANTHROPIC_MODEL` y correr un smoke dedicado. |

No se realizó ninguna llamada real a las APIs de OpenAI/Anthropic durante
esta auditoría (se limitó a lectura de código estático).

## 13. Auditoría del componente `CampaignAutomationActivity`

Leído completo (`apps/web/src/components/campaigns/CampaignAutomationActivity.tsx`)
y su call site (`apps/web/src/app/(protected)/campaigns/[id]/page.tsx`):

| Criterio | Resultado |
|---|---|
| Org-scoped | ✅ — `findActiveBySignatureTag(tag, orgId)` reutiliza el mismo `orgId` ya validado por `getCampaign({ campaignId, organizationId: orgId })` en la misma página. |
| Sin fuga cross-org | ✅ — mismo motivo anterior; el componente no recibe ni resuelve `orgId` por su cuenta, solo renderiza la prop ya resuelta. |
| Sin efecto secundario | ✅ — Server Component puro, cero llamadas a repositorio dentro del propio archivo. |
| Estado vacío | ⚠️ nota, no defecto — si `task` es `null`, el componente no renderiza nada (ni siquiera la sección). Es una decisión de diseño documentada explícitamente en el propio comentario de cabecera del archivo ("no sobrecargar Campaign detail"), no una omisión. |
| Enlaces seguros/internos | ✅ — único link es `href="/tasks"`, ruta interna de Next.js. |
| Sin filas duplicadas | ✅ — renderiza una sola tarea (la activa más reciente vía signature tag), no una lista; no hay superficie para duplicar. |
| No implica publicación | ✅ — disclaimer explícito en el propio componente. |

**Sin hallazgos que requieran cambios de código.**

## 14. Inventario de datos de smoke (local)

Datos identificados como artefactos de smoke manual, **no de uso real**:

- **"Smoke 7F Review Fix"** (campaña) — ciclo `draft → review → rejected`.
  Generó 2 tasks: *"Revisar campaña: Smoke 7F Review Fix"* y *"Campaña
  rechazada: Smoke 7F Review Fix"*.
- **"Smoke 7F Approved"** (campaña) — ciclo `draft → review → approved`.
  Generó 2 tasks: *"Revisar campaña: Smoke 7F Approved"* y *"Preparar
  activación de campaña: Smoke 7F Approved"*.
- **Al menos una alerta de fallo de IA** generada durante el smoke de fallo
  real de Gemini (404) en 7F, con `metadata.campaignId = null` (ocurrió
  antes de que existiera una campaña persistida) y `alert_key` con el
  formato `campaign:<org>:client:<client>:ai-provider-failure:AI_EXTERNAL_SERVICE_ERROR`.
- **Campañas del smoke 7D.1/7E** (2026-08-18): al menos una campaña generada
  con Gemini real, con al menos un ciclo de aprobación y uno de rechazo
  manuales. Los reportes de 7D.1/7E no registran un nombre específico para
  estas campañas — **no se fabrica un nombre aquí**; se documenta la
  existencia del artefacto, no un identificador inventado. Estas campañas
  son anteriores a que existiera la automatización de 7F, por lo que **no**
  generaron tasks/alerts (esa integración no existía todavía).

### Recomendación de limpieza (NO ejecutada — requiere aprobación explícita)

```sql
-- Revisar y ajustar manualmente los nombres/organización antes de ejecutar.
-- NO ejecutar sin aprobación explícita del usuario.
BEGIN;

DELETE FROM public.tasks
WHERE organization_id = '<organization_id_smoke>'
  AND title IN (
    'Revisar campaña: Smoke 7F Review Fix',
    'Campaña rechazada: Smoke 7F Review Fix',
    'Revisar campaña: Smoke 7F Approved',
    'Preparar activación de campaña: Smoke 7F Approved'
  );

DELETE FROM public.alerts
WHERE organization_id = '<organization_id_smoke>'
  AND metadata->>'source' = 'campaign'
  AND created_at >= '<fecha_del_smoke_7F>';

-- campaign_approvals es append-only por diseño (§7.2) — no se borra vía
-- DELETE aquí; si se decide limpiar, requiere decisión explícita separada
-- porque no hay policy/grant de DELETE para authenticated en absoluto.
DELETE FROM public.campaigns
WHERE organization_id = '<organization_id_smoke>'
  AND name IN ('Smoke 7F Review Fix', 'Smoke 7F Approved');
-- Esto arrastra sus campaign_approvals vía ON DELETE (verificar el
-- comportamiento real de la FK antes de ejecutar — RESTRICT vs CASCADE,
-- ver 7B DDL).

COMMIT; -- o ROLLBACK si algo no coincide con lo esperado
```

**No se ejecutó ninguna sentencia de este bloque.** Es documentación,
pendiente de aprobación explícita del usuario.

## 15. Limitaciones conocidas (heredadas, no nuevas en 7G)

- **R-TECH-14** — `TaskRepository` solo expone tareas activas, no historial
  completo por campaña (afecta a `CampaignAutomationActivity`, ver §13).
- **R-OPS-04** — el upsert de alertas siempre resetea `status: 'active'` en
  cada reintento del mismo tipo (heredado de Phase 6F).
- **R-TECH-13** — modelo default de Anthropic sin verificar en smoke real.
- Entorno de este puente no puede ejecutar `vitest` (sin binario nativo
  Linux de Rollup, sin red) — ver §5.

## 16. Cierre de riesgos de Phase 7

Ver la tabla añadida directamente a `PHASE_7_RISK_REGISTER.md` (§ "Cierre
Phase 7G"), que clasifica cada riesgo abierto con OPEN/MITIGATED/CLOSED/
DEFERRED sin borrar el historial original. Resumen:

- **CLOSED** (resueltos y verificados en código real): R-TECH-01, R-TECH-03,
  R-SEC-02, R-SEC-03, R-SEC-04, R-TECH-12, R-OPS-02, R-DATA-01, R-UX-02,
  R-UX-03, R-TECH-15.
- **MITIGATED** (con salvaguarda activa, no eliminados de raíz por diseño):
  R-TECH-04 (idempotencia vía signature tags/alert_key), R-TECH-06,
  R-TECH-09 (verificado en 7D.1 con 1432 tests corridos en entorno con red),
  R-SEC-05, R-SEC-06, R-OPS-01, R-TECH-10, R-OPS-03.
- **DEFERRED** (aceptados explícitamente, con justificación): R-TECH-02
  (ya resuelto en 7B, cerrar), R-TECH-05 (ruta ya corregida, cerrar),
  R-TECH-07, R-TECH-08, R-TECH-11, R-TECH-13, R-TECH-14, R-OPS-04,
  R-PROD-02, R-ENV-01, R-ENV-02 (limitación del puente, no del código).
- **OPEN**: ninguno bloqueante para Phase 7 al cierre de 7G. R-DOM-01/02/03 y
  R-PROD-01 son riesgos de producto/diseño de fases futuras (no de Phase 7
  en sí), mantenidos abiertos como contexto para siguientes fases.

## 17. Clasificación de merge-readiness

## **READY_WITH_DEFERRED_OPS**

Justificación:
- Ningún hallazgo de esta auditoría activó una condición STOP (§9 del
  mandato): no hay defecto de RLS, no hay fuga cross-org, la aprobación no
  puede disparar publicación externa, no hay duplicación de side effects
  pese a las firmas de idempotencia, no se encontró ningún secreto expuesto,
  no se encontró ninguna regresión de Phase 6.
- 9/9 workspaces limpios en typecheck y lint contra el HEAD exacto
  (`0a93419`).
- Regresión completa de tests ejecutada manualmente en Windows contra el
  HEAD exacto `0a93419`: **1557 passed / 0 failed** (§5) — evidencia
  automatizada final, no solo típecheck/lint.
- Evidencia de runtime real (smoke manual, no reutilizada ciegamente)
  confirma los flujos críticos de extremo a extremo: creación, edición,
  generación/regeneración con IA, envío a revisión, aprobación, rechazo,
  automatización de tasks/alertas, y fallo de proveedor de IA.
- Los ítems que quedan como **DEFERRED OPS** (no bloqueantes, por decisión
  explícita del usuario o por ser limitaciones de entorno/diseño ya
  aceptadas — ninguno relacionado con tests, que ya están en PASS):
  1. Smoke real con OpenAI/Anthropic (explícitamente no bloqueante, per
     instrucción del usuario) — validación de proveedor en vivo, no un
     bloqueante funcional.
  2. Limpieza de datos de smoke locales (§14) — pendiente de aprobación
     explícita, no bloquea merge de código.
  3. R-TECH-13/14/R-OPS-04 y demás riesgos DEFERRED de §16 — limitaciones
     conocidas y aceptadas, no defectos.

## 18. Higiene de git (verificación final)

```
$ git status --short
 M supabase/config.toml
?? .agencia-ai/.claude/commands/new-client.md

$ git diff --stat
 supabase/config.toml | 12 ++++++------
 1 file changed, 6 insertions(+), 6 deletions(-)

$ git diff --check
(sin salida — sin conflictos de whitespace)

$ git log --oneline --decorate -8
0a93419 (HEAD -> feat/phase-7-campaign-studio, origin/feat/phase-7-campaign-studio) feat(phase-7): add campaign automation and notifications
8506790 feat(phase-7): complete campaign studio UI and multi-provider AI
5605823 feat(phase-7): add AI campaign builder
6d3623d feat(phase-7): add campaign approval and compliance workflow
ba64c09 feat(phase-7): add campaign studio persistence layer
1955ad0 docs(phase-7): audit and plan campaign studio
3fc9fee (origin/main, origin/feat/phase-6-automation-runtime, origin/HEAD, main, feat/phase-6-automation-runtime) fix(phase-6): finalize automation runtime staging validation
d14158e chore: complete phase 6 final audit and closure

$ git branch -vv
  feat/phase-6-automation-runtime 3fc9fee [origin/feat/phase-6-automation-runtime] fix(phase-6): finalize automation runtime staging validation
* feat/phase-7-campaign-studio    0a93419 [origin/feat/phase-7-campaign-studio] feat(phase-7): add campaign automation and notifications
  main                            3fc9fee [origin/main] fix(phase-6): finalize automation runtime staging validation
```

Confirmado: `main`/`origin/main` siguen en `3fc9fee`, **sin ningún commit de
Phase 7** — la rama de trabajo no ha sido mergeada. Únicos cambios en el
working tree son los dos archivos explícitamente excluidos por el usuario
(`supabase/config.toml`, modificado localmente por el entorno — no revertido
porque el entorno local depende de esos puertos; `.agencia-ai/.claude/commands/new-client.md`,
sin trackear). Barrido de artefactos (`*.dump`, `*.tar.gz`, `*key*.txt`,
`.env`/`.env.local`, `tmp/`, `_to_delete/`): los únicos archivos de ese tipo
presentes (`apps/web/.env.local`, `n8n-local/.env`, `tmp/`) ya están
ignorados por git (`!!` en `git status --ignored`) — no están staged, no
serían incluidos en ningún commit.

Advertencia informativa (preexistente, no generada por esta tarea): el
comando `git status` emite `warning: unable to unlink '.../.git/index.lock':
Operation not permitted` — es el mismo artefacto de `.git/index.lock` de 0
bytes documentado desde fases anteriores (R-ENV-01), no tocado.

**No se ejecutó ningún `git add`/`commit`/`push`/`merge` en esta tarea.**
