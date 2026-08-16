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

### 7B — Persistence
- **Objetivo:** crear el esquema real (`campaigns`, `campaign_approvals`, `compliance_rules`) con multi-tenancy desde el día uno, e implementar `CampaignRepository` sobre Supabase con mapper y tests.
- **Archivos/tablas principales:**
  - Migración nueva `supabase/migrations/2026XXXXXXXXXX_phase7b_campaign_studio_schema.sql` — tres tablas + índices + RLS (ver §9) + triggers `set_updated_at` (reutilizar el helper existente) + trigger de auditoría `created_by`/`updated_by` (mismo patrón que `tasks`).
  - Actualizar `Campaign`/`CampaignFilter` en `packages/domain/src/entities/campaign.ts` para añadir `organizationId: OrganizationId` (obligatorio, no opcional).
  - Cambiar `CampaignRepository.delete` a soft-delete (`Result<void>` sigue igual, pero la implementación marca `deleted_at`, no `DELETE`), o renombrarlo `archive`/`softDelete` para ser explícito, igual que `softDeleteClient`.
  - `packages/infrastructure/src/supabase/repositories/supabase-campaign.repository.ts` + `packages/infrastructure/src/supabase/mappers/campaign.mapper.ts`, siguiendo el patrón exacto de `supabase-metrics.repository.ts`/`metric.mapper.ts`.
  - `packages/shared/src/schemas/campaign.schema.ts` (Zod) siguiendo el patrón minimalista de `automation.schema.ts` (nunca aceptar `organizationId` del cliente).
  - Tests: `packages/domain/src/entities/__tests__/campaign.test.ts` si aplica, `packages/infrastructure/src/supabase/repositories/__tests__/supabase-campaign.repository.test.ts`, `.../mappers/__tests__/campaign.mapper.test.ts`.
- **Dependencias:** ninguna externa; solo depende de que 7A esté aprobada.
- **Riesgos:** ver `PHASE_7_RISK_REGISTER.md` (R-TECH-01, R-SEC-01).
- **Criterios de aceptación:** migración re-ejecutable (idempotente, siguiendo el patrón `IF NOT EXISTS` / `DROP POLICY IF EXISTS` ya usado en el proyecto); `CampaignRepository` implementado y con tests pasando; `listCampaigns` funciona contra datos reales de staging; ningún dato de producción tocado (no se ejecuta en producción en esta subfase).

### 7C — Approval + Compliance
- **Objetivo:** flujo `draft → review → approved/rejected` con audit trail, y tabla `compliance_rules` poblable (sin importar contenido real todavía, solo el mecanismo).
- **Archivos/tablas principales:**
  - Use cases: `packages/application/src/use-cases/campaigns/approve-campaign.use-case.ts`, `reject-campaign.use-case.ts`, `submit-campaign-for-review.use-case.ts`.
  - `campaign_approvals`: una fila por decisión (no solo el estado en `campaigns`), con `decided_by`, `decided_at`, `decision` (`approved`/`rejected`), `note` — así se preserva historial completo, no solo el último estado.
  - Server Actions: `apps/web/src/app/(protected)/campaigns/actions.ts`, siguiendo el patrón exacto de `automations/actions.ts` (`requireOrganizationRole`, Zod antes de cualquier mutación, `organizationId` siempre de la sesión, nunca del cliente, `revalidatePath` solo en éxito).
  - `compliance_rules`: CRUD mínimo (lectura para 7D; escritura/importación se deja para un script separado fuera de Phase 7 o para el cierre de 7C si el usuario lo aprueba explícitamente).
- **Dependencias:** 7B (tablas y repositorio deben existir).
- **Riesgos:** ver R-SEC-02 (roles de aprobación mal definidos), R-TECH-02 (transición de estado inválida).
- **Criterios de aceptación:** una campaña en `review` puede pasar a `approved` o `rejected` solo por roles autorizados (§9); cada decisión queda registrada en `campaign_approvals` con actor y timestamp; test que verifica que un `operator` no puede aprobar (solo `admin`/`owner`, a definir con el usuario — ver §9).

### 7D — AI Campaign Builder
- **Objetivo:** implementar `createCampaignWithAI` end-to-end: recibe brief mínimo (cliente, objetivo, plataforma, presupuesto), inyecta contexto (brand profile del cliente si existe, reglas de compliance activas), genera estructura de campaña + copy con salida estructurada validada, y crea la campaña en estado `review` (nunca `active` directamente).
- **Archivos/tablas principales:**
  - `packages/infrastructure/src/ai/claude-api.provider.ts` — implementación real de `AIProvider` (contrato ya definido en `packages/ai-engine`).
  - `packages/application/src/use-cases/campaigns/create-campaign-with-ai.use-case.ts` — reemplaza/extiende el stub `createCampaignDraft`.
  - Plantillas de prompt versionadas por plataforma (`TemplateDefinition`/`PromptReference`, ya existen como contratos) construidas a partir de los assets **MIGRATE** identificados en la auditoría (`meta-ads-campaign-builder`, `google-ads-campaign-builder`, `youtube-ads-campaign-builder` y sus commands correspondientes).
  - Validación de salida: schema Zod que valida la respuesta del modelo antes de persistir (nunca confiar en JSON crudo del LLM).
  - Registro de uso: tabla o columna para `AIUsage` (tokens/costo) — no existe hoy, es nueva. Puede vivir como columnas en `campaigns` (`ai_generation_tokens`, `ai_generation_cost`) o tabla separada `campaign_ai_generations` si se quiere historial de intentos — a decidir con el usuario al iniciar esta subfase.
- **Dependencias:** 7B (persistencia) y 7C (compliance rules disponibles para inyectar como contexto, aunque sea vacío al inicio).
- **Riesgos:** es la subfase de mayor riesgo técnico y de costo — ver R-TECH-03, R-SEC-03, R-COST-01 en el risk register.
- **Criterios de aceptación:** dado un brief válido, el use case produce una campaña en estado `review` con copy generado, sin llamar nunca a ninguna API externa de publicación (Meta/Google/YouTube — eso es fase posterior, fuera de alcance aquí); errores del proveedor de IA se manejan como `Result` de error, no excepciones sin capturar; hay al menos un test con el `AIProvider` mockeado (nunca golpear la API real en tests).

### 7E — Campaign Studio UI
- **Objetivo:** reemplazar los placeholders `UnderConstruction` con la experiencia real: listado por cliente, wizard de creación (brief → generación IA → revisión), página de detalle con `CampaignApprovalPanel`.
- **Archivos/tablas principales:**
  - `apps/web/src/app/(protected)/campaigns/page.tsx` (reescribir, conectar a `listCampaigns` real vía composition root).
  - `apps/web/src/app/(protected)/campaigns/new/page.tsx` (wizard conectado a `createCampaignWithAI`).
  - `apps/web/src/app/(protected)/campaigns/[id]/page.tsx` (nueva).
  - `apps/web/src/components/campaigns/CampaignApprovalPanel.tsx` (nuevo).
  - `apps/web/src/lib/composition/campaign.composition.ts` (nuevo, patrón `automation.composition.ts`).
  - Retirar o dejar explícitamente marcado como código muerto `demoCampaigns` en `placeholder-data.ts` una vez la UI real esté conectada.
- **Dependencias:** 7B, 7C, 7D (necesita datos reales y el flujo de aprobación funcionando).
- **Riesgos:** R-UX-01 (exponer error interno del LLM al usuario final).
- **Criterios de aceptación:** un usuario con rol suficiente puede crear una campaña, verla en `review`, y otro usuario con rol de aprobación puede aprobarla o rechazarla con nota, todo contra Supabase de staging (no producción).

### 7F — Automation / notifications
- **Objetivo:** notificar cuando una campaña pasa a `review` (creada) y cuando se decide (aprobada/rechazada), reemplazando el ítem 7.11 original (Inngest) por el patrón real del proyecto.
- **Archivos/tablas principales:** hook en el use case `submitCampaignForReview` que crea una `alert`/`task` (reutilizando `alerts`/`tasks` ya existentes, mismo patrón que Phase 6F usa para incidentes de automation) dirigida a los roles con permiso de aprobar. Opcionalmente, un evento en `automation_webhook_events` si se decide enrutar la notificación por n8n (email/Slack) — a decidir con el usuario, no asumido.
- **Dependencias:** 7C.
- **Riesgos:** R-TECH-04 (duplicar notificaciones si el use case se reintenta).
- **Criterios de aceptación:** crear una campaña genera exactamente una notificación visible en el dashboard operativo existente (Phase 5); aprobar/rechazar notifica al creador.

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
