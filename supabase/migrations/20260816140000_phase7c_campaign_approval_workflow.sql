-- =============================================================================
-- BopIAgency — Migración Phase 7C: Campaign Studio — Approval Workflow
-- Archivo: 20260816140000_phase7c_campaign_approval_workflow.sql
-- Rama: feat/phase-7-campaign-studio
-- Requiere: 20260816130000 (campaigns, campaign_approvals, compliance_rules,
--           is_organization_member, has_organization_role) aplicada.
--
-- ⚠️  ACCIÓN MANUAL: Aplicar en Supabase Dashboard → SQL Editor → Run,
--     o localmente vía psql/docker contra `supabase_db_BopIAgency` (ver
--     docs/implementation/phase-7/PHASE_7C_APPROVAL_COMPLIANCE_REPORT.md).
--     NO ejecutar contra Supabase remoto/producción desde esta tarea.
--     NO editar 20260816130000_phase7b_campaign_studio_persistence.sql —
--     esta migración es aditiva y NUEVA, siguiendo el mismo patrón ya usado
--     en el repo para correcciones posteriores (ver comentario sobre
--     20260807150000_fix_alerts_service_role_grant.sql en
--     supabase-alert.repository.ts).
--
-- ALCANCE (Phase 7C — solo approval workflow + retrieval de compliance):
--   • Crea las RPCs SECURITY DEFINER `approve_campaign(uuid)` y
--     `reject_campaign(uuid, text)`, único camino autorizado para escribir
--     campaigns.status IN ('approved','rejected') y para insertar en
--     campaign_approvals — exactamente la barrera que 20260816130000 dejó
--     preparada (ver su comentario "Cambios de estado sensibles").
--   • Retira la policy `campaign_approvals_insert` y el GRANT INSERT directo
--     de `authenticated` sobre `campaign_approvals` — ver justificación en
--     la SECCIÓN C más abajo.
--   • NO crea `compliance_rules` CRUD de escritura para `authenticated`
--     (ya existe desde 7B, sin cambios aquí — solo se usa `findApplicableRules`
--     de lectura desde el application layer, Phase 7C).
--   • NO importa reglas de compliance (sigue diferido).
--   • NO publica campañas a Meta/Google/YouTube (fase posterior).
--   • NO toca `submitCampaignForReview`: la transición draft → review sigue
--     usando el UPDATE genérico ya permitido por la policy `campaigns_update`
--     de 7B — no requiere RPC (confirmado: esa policy ya permite status
--     nuevo IN ('draft','review'), y approveCampaign/rejectCampaign son las
--     únicas transiciones que de verdad necesitaban una función dedicada).
--
-- DECISIONES DE DISEÑO (detalle completo en
-- PHASE_7C_APPROVAL_COMPLIANCE_REPORT.md):
--
-- SECCIÓN A/B — Por qué DOS funciones (approve_campaign/reject_campaign) y
-- no una sola `transition_campaign_review(action, note)`: los requisitos de
-- entrada difieren (reject exige `note` no vacía, approve no recibe nota en
-- absoluto), y dos funciones con nombres explícitos son más simples de
-- otorgar/auditar/leer que una función genérica con una rama `IF action =
-- 'rejected' THEN ...` — evita "SQL dinámico innecesario" (instrucción
-- explícita de esta tarea) y mantiene cada función con una sola
-- responsabilidad, igual que `acknowledge_alert`/`resolve_alert` (Phase 4)
-- son dos funciones separadas y no una sola `transition_alert(action)`.
--
-- SECCIÓN C — Por qué se retira el INSERT directo de campaign_approvals:
-- La policy `campaign_approvals_insert` de 7B (admin/owner + actor_user_id =
-- auth.uid()) fue diseñada ANTES de que existiera la RPC, como único
-- mecanismo de escritura previsto en ese momento. Con la RPC ya operativa,
-- dejar el INSERT directo abierto crea una vía para insertar una fila de
-- "decisión" (`action='approved'`/`'rejected'`) SIN que
-- `campaigns.status`/`approved_at`/`rejected_at` cambien en absoluto, y sin
-- que la RPC valide que la campaña esté en 'review' — un admin podría
-- insertar `action='approved'` para una campaña todavía en 'draft', dejando
-- el audit trail completamente desconectado del estado real. La RPC, en
-- cambio, actualiza `campaigns` y escribe `campaign_approvals` dentro de LA
-- MISMA transacción (atomicidad real). Se retira el INSERT directo
-- (`DROP POLICY` + `REVOKE INSERT`) para que la única vía de escritura sea
-- la RPC — preferencia de diseño explícita de esta tarea ("audit trail
-- escrito por el workflow de aprobación, no arbitrariamente por clientes").
-- SELECT se mantiene sin cambios (todo miembro de la organización sigue
-- pudiendo leer el historial). UPDATE/DELETE ya estaban cerrados desde 7B
-- (sin policy, sin GRANT) y siguen así.
--
-- SECCIÓN A/B — Por qué SECURITY DEFINER sí puede escribir 'approved'/
-- 'rejected' pese a la policy `campaigns_update` (WITH CHECK status IN
-- ('draft','review')): una función SECURITY DEFINER se ejecuta con los
-- privilegios de su DUEÑO (quien corrió la migración, típicamente el mismo
-- rol que ya es dueño de `public.campaigns`), y los dueños de tabla
-- bypasean RLS por defecto en Postgres (esta migración no activa `FORCE ROW
-- LEVEL SECURITY`, igual que ninguna otra tabla del proyecto). La RPC no
-- "salta" RLS de forma insegura: en su lugar, reimplementa manualmente y de
-- forma más estricta las comprobaciones que la RLS no puede expresar bien
-- (rol exacto + estado exacto + atomicidad con el INSERT del audit trail) —
-- exactamente el mismo patrón ya usado por `acknowledge_alert`/
-- `resolve_alert` (Phase 4).
--
-- IDEMPOTENCIA: CREATE OR REPLACE FUNCTION / DROP POLICY IF EXISTS, igual
-- que el resto de migraciones del repo.
-- =============================================================================

-- =============================================================================
-- SECCIÓN A — RPC: approve_campaign(p_campaign_id uuid)
-- =============================================================================
--
-- Transición: review → approved.
-- Requisitos de seguridad (todos reforzados en esta función, no solo en RLS):
--   • auth.uid() no NULL (usuario autenticado).
--   • Carga la campaña con FOR UPDATE (lock de fila — evita condiciones de
--     carrera si dos aprobaciones/rechazos llegan concurrentemente para la
--     misma campaña).
--   • organization_id se lee de la campaña real (nunca se acepta como
--     parámetro) — imposible hacer bypass cross-tenant pasando un
--     organization_id arbitrario, porque la función no recibe ninguno.
--   • has_organization_role(organization_id, 'admin') sobre la organización
--     REAL de la campaña (admin u owner — jerarquía ya definida en Phase 2).
--   • status actual debe ser exactamente 'review'.
--   • actor_user_id se toma SIEMPRE de auth.uid() — nunca de un parámetro,
--     así que no se puede falsificar quién decide.
--   • UPDATE de campaigns + INSERT de campaign_approvals ocurren dentro de
--     la misma transacción implícita de la función (si el INSERT falla —
--     p.ej. por el CHECK de nota en rechazos — toda la función revierte).

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

  SELECT organization_id, status
    INTO v_org_id, v_status
  FROM public.campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_campaign: campaign not found (id: %)', p_campaign_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'admin') THEN
    RAISE EXCEPTION
      'approve_campaign: actor lacks admin/owner role (campaign_id: %, organization_id: %)',
      p_campaign_id, v_org_id;
  END IF;

  IF v_status <> 'review' THEN
    RAISE EXCEPTION
      'approve_campaign: campaign % is not in review (current status: %)',
      p_campaign_id, v_status;
  END IF;

  UPDATE public.campaigns
  SET status      = 'approved',
      approved_at = now(),
      rejected_at = NULL
  WHERE id = p_campaign_id;

  INSERT INTO public.campaign_approvals (organization_id, campaign_id, action, actor_user_id)
  VALUES (v_org_id, p_campaign_id, 'approved', v_actor);
END;
$$;

COMMENT ON FUNCTION public.approve_campaign(uuid) IS
  'RPC para aprobar una campaña en revisión (review → approved). '
  'Requiere auth.uid() + rol admin/owner en la organización real de la '
  'campaña + status actual = review. Actualiza campaigns e inserta en '
  'campaign_approvals dentro de la misma transacción. Único camino '
  'autorizado para escribir campaigns.status = approved.';

-- =============================================================================
-- SECCIÓN B — RPC: reject_campaign(p_campaign_id uuid, p_note text)
-- =============================================================================
--
-- Transición: review → rejected. Mismos requisitos que approve_campaign,
-- más: p_note obligatoria y no vacía (trim) — regla de negocio fijada #7,
-- reforzada aquí ADEMÁS del CHECK de tabla ck_campaign_approvals_rejection_note
-- (defensa en profundidad: un mensaje de error claro desde la RPC en vez de
-- depender únicamente de la violación genérica del CHECK).

CREATE OR REPLACE FUNCTION public.reject_campaign(p_campaign_id uuid, p_note text)
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
    RAISE EXCEPTION 'reject_campaign: authentication required';
  END IF;

  IF p_note IS NULL OR char_length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'reject_campaign: rejection note is required';
  END IF;

  SELECT organization_id, status
    INTO v_org_id, v_status
  FROM public.campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reject_campaign: campaign not found (id: %)', p_campaign_id;
  END IF;

  IF NOT public.has_organization_role(v_org_id, 'admin') THEN
    RAISE EXCEPTION
      'reject_campaign: actor lacks admin/owner role (campaign_id: %, organization_id: %)',
      p_campaign_id, v_org_id;
  END IF;

  IF v_status <> 'review' THEN
    RAISE EXCEPTION
      'reject_campaign: campaign % is not in review (current status: %)',
      p_campaign_id, v_status;
  END IF;

  UPDATE public.campaigns
  SET status      = 'rejected',
      rejected_at = now(),
      approved_at = NULL
  WHERE id = p_campaign_id;

  INSERT INTO public.campaign_approvals (organization_id, campaign_id, action, note, actor_user_id)
  VALUES (v_org_id, p_campaign_id, 'rejected', p_note, v_actor);
END;
$$;

COMMENT ON FUNCTION public.reject_campaign(uuid, text) IS
  'RPC para rechazar una campaña en revisión (review → rejected). '
  'Requiere auth.uid() + rol admin/owner en la organización real de la '
  'campaña + status actual = review + nota no vacía. Actualiza campaigns e '
  'inserta en campaign_approvals dentro de la misma transacción. Único '
  'camino autorizado para escribir campaigns.status = rejected.';

-- =============================================================================
-- SECCIÓN C — campaign_approvals: retirar INSERT directo de authenticated
-- =============================================================================
-- Ver justificación extensa en el encabezado de esta migración. A partir de
-- esta migración, la ÚNICA forma de insertar una fila en campaign_approvals
-- es a través de approve_campaign/reject_campaign (que corren con los
-- privilegios del dueño de la función y por eso no necesitan GRANT INSERT
-- explícito para escribir la tabla). SELECT no cambia.

DROP POLICY IF EXISTS campaign_approvals_insert ON public.campaign_approvals;

REVOKE INSERT ON public.campaign_approvals FROM authenticated;

-- campaign_approvals queda, para `authenticated`: SELECT únicamente (RLS +
-- GRANT). Sin INSERT/UPDATE/DELETE directos bajo ninguna circunstancia.

-- =============================================================================
-- SECCIÓN D — GRANTS de las RPCs
-- =============================================================================
-- Postgres otorga EXECUTE a PUBLIC automáticamente al crear una función —
-- se revoca explícitamente antes de otorgar solo a `authenticated`. Se
-- revoca también de `anon` de forma explícita y redundante (ya cubierto por
-- el REVOKE FROM PUBLIC) para que la intención quede inequívoca en el
-- código, no solo implícita.

REVOKE ALL ON FUNCTION public.approve_campaign(uuid)       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_campaign(uuid, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_campaign(uuid)       FROM anon;
REVOKE ALL ON FUNCTION public.reject_campaign(uuid, text)  FROM anon;

GRANT EXECUTE ON FUNCTION public.approve_campaign(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_campaign(uuid, text) TO authenticated;

-- service_role: sin GRANT explícito — sigue bypaseando RLS/permisos de
-- función por defecto en Supabase; ningún consumidor server-side real en
-- código llama a estas RPCs con service_role en Phase 7C (no hay webhook
-- n8n, no hay job de importación), mismo criterio que 20260816130000.

-- =============================================================================
-- FIN DE MIGRACIÓN
-- Aplicar manualmente en: Supabase Dashboard → SQL Editor → Run (o local, ver
-- PHASE_7C_APPROVAL_COMPLIANCE_REPORT.md §"Comando exacto para aplicar SOLO
-- la migración local").
-- NO ejecutada contra Supabase remoto/producción/local como parte de esta
-- tarea.
-- =============================================================================
