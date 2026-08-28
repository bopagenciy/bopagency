-- ============================================================================
-- BOPIAGENCY — MIGRATION 20260902000000_phase8e_meta_integration.sql
-- PHASE 8E: Meta Integration, Encrypted Credentials, Maintenance Sweeper,
--           OAuth State & Pending Connections, Instagram Crash Checkpoints.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. HARDEN client_integrations UNIQUE CONSTRAINT FOR COMPOSITE FKs
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_client_integrations_id_org'
  ) THEN
    ALTER TABLE public.client_integrations
      ADD CONSTRAINT uq_client_integrations_id_org UNIQUE (id, organization_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. TABLA: public.oauth_states (OAuth State CSRF / Replay Protection)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.oauth_states (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        text        NOT NULL CHECK (provider = 'meta'),
  state_hash      text        NOT NULL UNIQUE CHECK (char_length(state_hash) = 64),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.oauth_states IS 'Phase 8E: Replay-proof OAuth state nonces for Meta integration flow.';

CREATE INDEX IF NOT EXISTS idx_oauth_states_hash ON public.oauth_states(state_hash);

-- RPC: consume_oauth_state
CREATE OR REPLACE FUNCTION public.consume_oauth_state(p_state_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state record;
BEGIN
  IF p_state_hash IS NULL OR char_length(p_state_hash) <> 64 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ARGUMENT', 'message', 'Invalid state hash');
  END IF;

  SELECT * INTO v_state
  FROM public.oauth_states
  WHERE state_hash = p_state_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'OAuth state not found');
  END IF;

  IF v_state.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'OAuth state already consumed');
  END IF;

  IF v_state.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EXPIRED', 'message', 'OAuth state expired');
  END IF;

  IF auth.uid() IS NOT NULL AND v_state.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'OAuth state belongs to a different user');
  END IF;

  UPDATE public.oauth_states
  SET consumed_at = now()
  WHERE id = v_state.id;

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_state.organization_id,
    'client_id', v_state.client_id,
    'user_id', v_state.user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_oauth_state(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.consume_oauth_state(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. TABLAS: pending_oauth_connections & pending_oauth_resources
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pending_oauth_connections (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id       uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider        text        NOT NULL CHECK (provider = 'meta'),
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pending_oauth_connections IS 'Phase 8E: Server-side pending connection session for resource selection.';

CREATE TABLE IF NOT EXISTS public.pending_oauth_resources (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_connection_id uuid        NOT NULL REFERENCES public.pending_oauth_connections(id) ON DELETE CASCADE,
  page_id               text        NOT NULL,
  page_name             text        NOT NULL,
  instagram_account_id  text        NULL,
  instagram_username    text        NULL,
  key_version           smallint    NOT NULL DEFAULT 1,
  encrypted_page_token  text        NOT NULL,
  iv                    text        NOT NULL,
  auth_tag              text        NOT NULL,
  token_expires_at      timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pending_oauth_resources_page UNIQUE (pending_connection_id, page_id)
);

COMMENT ON TABLE public.pending_oauth_resources IS 'Phase 8E: Temporary encrypted page token resources for user selection.';

ALTER TABLE public.pending_oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_oauth_resources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pending_oauth_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pending_oauth_resources FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.pending_oauth_connections TO service_role;
GRANT ALL ON public.pending_oauth_resources TO service_role;

-- ---------------------------------------------------------------------------
-- 4. TABLA: public.client_integration_credentials (Encrypted Credentials)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_integration_credentials (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL,
  client_integration_id uuid        NOT NULL,
  credential_type       text        NOT NULL CHECK (credential_type = 'page_access_token'),
  key_version           smallint    NOT NULL DEFAULT 1,
  ciphertext            text        NOT NULL,
  iv                    text        NOT NULL,
  auth_tag              text        NOT NULL,
  token_expires_at      timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  rotated_at            timestamptz NULL,
  CONSTRAINT uq_client_integration_credentials_type UNIQUE (client_integration_id, credential_type),
  CONSTRAINT fk_integration_credentials_org
    FOREIGN KEY (client_integration_id, organization_id)
    REFERENCES public.client_integrations(id, organization_id)
    ON DELETE CASCADE
);

COMMENT ON TABLE public.client_integration_credentials IS 'Phase 8E: Encrypted credentials store. Access restricted strictly to service_role.';

ALTER TABLE public.client_integration_credentials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_integration_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.client_integration_credentials TO service_role;

-- ---------------------------------------------------------------------------
-- 5. TABLA: public.client_integration_events (Integration Audit Log)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.client_integration_events (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL,
  client_integration_id uuid        NOT NULL,
  event_type            text        NOT NULL CHECK (event_type IN (
                          'connected', 'reauthorized', 'resource_selected',
                          'disconnected', 'credential_rotated', 'health_error'
                        )),
  actor_user_id         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata              jsonb       NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_integration_events_org
    FOREIGN KEY (client_integration_id, organization_id)
    REFERENCES public.client_integrations(id, organization_id)
    ON DELETE RESTRICT
);

COMMENT ON TABLE public.client_integration_events IS 'Phase 8E: Audit events for integration lifecycle.';

ALTER TABLE public.client_integration_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_integration_events FROM PUBLIC, anon;
GRANT SELECT ON public.client_integration_events TO authenticated;
GRANT ALL ON public.client_integration_events TO service_role;

DROP POLICY IF EXISTS client_integration_events_select ON public.client_integration_events;
CREATE POLICY client_integration_events_select ON public.client_integration_events
  FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id));

-- ---------------------------------------------------------------------------
-- 6. HARDEN EXISTING TARGETS COMPOSITE FK
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_activation_targets_integration_org'
  ) THEN
    ALTER TABLE public.campaign_activation_targets
      ADD CONSTRAINT fk_activation_targets_integration_org
      FOREIGN KEY (client_integration_id, organization_id)
      REFERENCES public.client_integrations(id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 7. INSTAGRAM CHECKPOINT RPC & TRIGGER UPDATE
-- ---------------------------------------------------------------------------

-- Add metadata column to campaign_publication_attempts for Instagram crash checkpoints
ALTER TABLE public.campaign_publication_attempts
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_publication_attempts_metadata_object'
      AND conrelid = 'public.campaign_publication_attempts'::regclass
  ) THEN
    ALTER TABLE public.campaign_publication_attempts
      ADD CONSTRAINT ck_publication_attempts_metadata_object
      CHECK (jsonb_typeof(metadata) = 'object');
  END IF;
END $$;

-- Actualizar trigger append-only de attempts para permitir updates a metadata si completed_at es NULL y se invoca desde checkpoint

CREATE OR REPLACE FUNCTION public.trg_campaign_publication_attempts_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Permite la transición de cierre de attempt (completed_at pasa de NULL a NOT NULL)
  IF OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Permite actualizar metadata mientras completed_at sigue siendo NULL (Checkpoints)
  IF OLD.completed_at IS NULL AND NEW.completed_at IS NULL AND NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    RETURN NEW;
  END IF;

  IF OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'campaign_publication_attempts: attempt already closed (completed_at set), no further UPDATE allowed (use RPCs)';
  END IF;

  RAISE EXCEPTION 'campaign_publication_attempts: append-only, direct UPDATE/DELETE not allowed (use RPCs)';
END;
$$;

-- Rewire existing update guard trigger to use the new permissive function
DROP TRIGGER IF EXISTS trg_publication_attempts_no_update ON public.campaign_publication_attempts;
CREATE TRIGGER trg_publication_attempts_no_update
  BEFORE UPDATE ON public.campaign_publication_attempts
  FOR EACH ROW EXECUTE FUNCTION public.trg_campaign_publication_attempts_append_only();

CREATE OR REPLACE FUNCTION public.record_publication_attempt_checkpoint(
  p_attempt_id uuid,
  p_organization_id uuid,
  p_stage text,
  p_container_creation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt record;
  v_current_stage text;
  v_current_id text;
BEGIN
  IF p_stage NOT IN ('container_created', 'publish_requested') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ARGUMENT', 'message', 'Invalid stage');
  END IF;

  IF p_container_creation_id IS NULL OR char_length(btrim(p_container_creation_id)) BETWEEN 1 AND 200 IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ARGUMENT', 'message', 'Invalid container creation ID');
  END IF;

  SELECT * INTO v_attempt
  FROM public.campaign_publication_attempts
  WHERE id = p_attempt_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'Attempt not found');
  END IF;

  IF v_attempt.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Attempt is already completed');
  END IF;

  v_current_stage := v_attempt.metadata->>'meta_stage';
  v_current_id := v_attempt.metadata->>'container_creation_id';

  -- Reglas monotónicas de transición
  IF v_current_stage IS NULL THEN
    IF p_stage <> 'container_created' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Initial stage must be container_created');
    END IF;
  ELSIF v_current_stage = 'container_created' THEN
    IF p_stage = 'container_created' THEN
      IF v_current_id <> p_container_creation_id THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Container creation ID mismatch');
      END IF;
      RETURN jsonb_build_object('success', true, 'message', 'Idempotent checkpoint');
    ELSIF p_stage <> 'publish_requested' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Invalid stage transition');
    END IF;
  ELSIF v_current_stage = 'publish_requested' THEN
    IF p_stage = 'publish_requested' THEN
      IF v_current_id <> p_container_creation_id THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Container creation ID mismatch');
      END IF;
      RETURN jsonb_build_object('success', true, 'message', 'Idempotent checkpoint');
    ELSE
      RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Cannot transition backwards from publish_requested');
    END IF;
  END IF;

  UPDATE public.campaign_publication_attempts
  SET metadata = metadata || jsonb_build_object(
    'meta_stage', p_stage,
    'container_creation_id', p_container_creation_id
  )
  WHERE id = p_attempt_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

ALTER FUNCTION public.record_publication_attempt_checkpoint(uuid, uuid, text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.record_publication_attempt_checkpoint(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_publication_attempt_checkpoint(uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. SWEEPER RPC FOR STALE IN-PROGRESS JOBS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sweep_expired_in_progress_publication_jobs(
  p_batch_size integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_ids uuid[];
  v_job_id  uuid;
  v_swept   integer := 0;
BEGIN
  SELECT array_agg(id) INTO v_job_ids
  FROM (
    SELECT id
    FROM public.campaign_publication_jobs
    WHERE status = 'in_progress'
      AND reconciliation_deadline_at <= now()
    ORDER BY reconciliation_deadline_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ) t;

  IF v_job_ids IS NULL THEN
    RETURN jsonb_build_object('success', true, 'jobs_swept', 0);
  END IF;

  FOREACH v_job_id IN ARRAY v_job_ids LOOP
    PERFORM public.mark_publication_job_unknown_outcome(
      v_job_id,
      NULL,
      'Sweeper: reconciliation deadline exceeded'
    );
    v_swept := v_swept + 1;
  END LOOP;


  RETURN jsonb_build_object('success', true, 'jobs_swept', v_swept);
END;
$$;

ALTER FUNCTION public.sweep_expired_in_progress_publication_jobs(integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.sweep_expired_in_progress_publication_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_in_progress_publication_jobs(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 9. SWEEPER RPC FOR EXPIRED PENDING OAUTH CONNECTIONS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sweep_expired_pending_oauth_connections(
  p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  WITH target_ids AS (
    SELECT id
    FROM public.pending_oauth_connections
    WHERE consumed_at IS NOT NULL OR expires_at <= now()
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.pending_oauth_connections
  WHERE id IN (SELECT id FROM target_ids);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'connections_swept', v_deleted);
END;
$$;

ALTER FUNCTION public.sweep_expired_pending_oauth_connections(integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.sweep_expired_pending_oauth_connections(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_pending_oauth_connections(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 10. FINALIZE META CONNECTION RPC (CONNECT / REAUTHORIZE UPSERT)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalize_meta_connection(
  p_pending_connection_id uuid,
  p_selected_page_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conn         record;
  v_res          record;
  v_integration  record;
  v_integration_id uuid;
  v_is_reconnect boolean := false;
  v_event_type   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED', 'message', 'User authentication required');
  END IF;

  SELECT * INTO v_conn
  FROM public.pending_oauth_connections
  WHERE id = p_pending_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'Pending OAuth connection not found');
  END IF;

  IF v_conn.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'STATE_CONFLICT', 'message', 'Pending connection already finalized');
  END IF;

  IF v_conn.expires_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'EXPIRED', 'message', 'Pending connection expired');
  END IF;

  IF v_conn.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'Pending connection belongs to a different user');
  END IF;

  IF NOT public.is_organization_member(v_conn.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'FORBIDDEN', 'message', 'User is not a member of the target organization');
  END IF;

  SELECT * INTO v_res
  FROM public.pending_oauth_resources
  WHERE pending_connection_id = p_pending_connection_id AND page_id = p_selected_page_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'Selected Page resource not found in pending session');
  END IF;

  -- Buscar integración existente para el cliente y la página
  SELECT * INTO v_integration
  FROM public.client_integrations
  WHERE client_id = v_conn.client_id
    AND provider = 'meta'
    AND external_account_id = p_selected_page_id
  FOR UPDATE;

  IF FOUND THEN
    v_is_reconnect := true;
    v_integration_id := v_integration.id;

    UPDATE public.client_integrations
    SET status = 'active'::public.integration_status,
        configuration = jsonb_build_object(
          'page_id', v_res.page_id,
          'page_name', v_res.page_name,
          'instagram_account_id', v_res.instagram_account_id,
          'instagram_username', v_res.instagram_username
        ),
        updated_at = now()
    WHERE id = v_integration_id;

    INSERT INTO public.client_integration_credentials (
      organization_id, client_integration_id, credential_type,
      key_version, ciphertext, iv, auth_tag, token_expires_at, rotated_at
    ) VALUES (
      v_conn.organization_id, v_integration_id, 'page_access_token',
      v_res.key_version, v_res.encrypted_page_token, v_res.iv, v_res.auth_tag, v_res.token_expires_at, now()
    )
    ON CONFLICT (client_integration_id, credential_type) DO UPDATE
    SET key_version = EXCLUDED.key_version,
        ciphertext = EXCLUDED.ciphertext,
        iv = EXCLUDED.iv,
        auth_tag = EXCLUDED.auth_tag,
        token_expires_at = EXCLUDED.token_expires_at,
        updated_at = now(),
        rotated_at = now();

    v_event_type := 'reauthorized';
  ELSE
    INSERT INTO public.client_integrations (
      organization_id, client_id, provider, external_account_id, status, configuration
    ) VALUES (
      v_conn.organization_id, v_conn.client_id, 'meta', p_selected_page_id, 'active'::public.integration_status,
      jsonb_build_object(
        'page_id', v_res.page_id,
        'page_name', v_res.page_name,
        'instagram_account_id', v_res.instagram_account_id,
        'instagram_username', v_res.instagram_username
      )
    ) RETURNING id INTO v_integration_id;

    INSERT INTO public.client_integration_credentials (
      organization_id, client_integration_id, credential_type,
      key_version, ciphertext, iv, auth_tag, token_expires_at
    ) VALUES (
      v_conn.organization_id, v_integration_id, 'page_access_token',
      v_res.key_version, v_res.encrypted_page_token, v_res.iv, v_res.auth_tag, v_res.token_expires_at
    );

    v_event_type := 'connected';
  END IF;

  INSERT INTO public.client_integration_events (
    organization_id, client_integration_id, event_type, actor_user_id, metadata
  ) VALUES (
    v_conn.organization_id, v_integration_id, v_event_type, auth.uid(),
    jsonb_build_object(
      'page_id', v_res.page_id,
      'page_name', v_res.page_name,
      'instagram_account_id', v_res.instagram_account_id
    )
  );

  -- Marcar pending_oauth_connection como consumida y borrar recursos temporales
  UPDATE public.pending_oauth_connections
  SET consumed_at = now()
  WHERE id = p_pending_connection_id;

  DELETE FROM public.pending_oauth_resources
  WHERE pending_connection_id = p_pending_connection_id;

  RETURN jsonb_build_object(
    'success', true,
    'client_integration_id', v_integration_id,
    'is_reconnect', v_is_reconnect,
    'event_type', v_event_type
  );
END;
$$;

ALTER FUNCTION public.finalize_meta_connection(uuid, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.finalize_meta_connection(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_meta_connection(uuid, text) TO authenticated;
