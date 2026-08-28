-- ============================================================================
-- BOPIAGENCY — MIGRATION 20260903000000_phase8f1_google_integration.sql
-- PHASE 8F.1: Google OAuth, Pending Discovery Credentials & Resources,
--            Hardened Provider-Bound State & Connection RPCs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. EXTEND PROVIDER AND CREDENTIAL CHECK CONSTRAINTS
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE public.oauth_states
    DROP CONSTRAINT IF EXISTS oauth_states_provider_check;
  ALTER TABLE public.oauth_states
    ADD CONSTRAINT oauth_states_provider_check CHECK (provider IN ('meta', 'google'));
END $$;

DO $$
BEGIN
  ALTER TABLE public.pending_oauth_connections
    DROP CONSTRAINT IF EXISTS pending_oauth_connections_provider_check;
  ALTER TABLE public.pending_oauth_connections
    ADD CONSTRAINT pending_oauth_connections_provider_check CHECK (provider IN ('meta', 'google'));
END $$;

DO $$
BEGIN
  ALTER TABLE public.client_integration_credentials
    DROP CONSTRAINT IF EXISTS client_integration_credentials_credential_type_check;
  ALTER TABLE public.client_integration_credentials
    ADD CONSTRAINT client_integration_credentials_credential_type_check
    CHECK (credential_type IN ('page_access_token', 'google_ads_refresh_token'));
END $$;

-- ---------------------------------------------------------------------------
-- 2. TABLAS: pending_google_oauth_credentials & pending_google_oauth_resources
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pending_google_oauth_credentials (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_connection_id uuid        NOT NULL UNIQUE REFERENCES public.pending_oauth_connections(id) ON DELETE CASCADE,
  key_version           smallint    NOT NULL DEFAULT 1,
  ciphertext            text        NOT NULL,
  iv                    text        NOT NULL,
  auth_tag              text        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pending_google_oauth_credentials IS 'Phase 8F.1: Server-side encrypted Google refresh token for pending OAuth connection.';

CREATE TABLE IF NOT EXISTS public.pending_google_oauth_resources (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_connection_id uuid        NOT NULL REFERENCES public.pending_oauth_connections(id) ON DELETE CASCADE,
  customer_id           text        NOT NULL CHECK (customer_id ~ '^\d{10}$'),
  customer_name         text        NOT NULL,
  manager_customer_id  text        NULL CHECK (manager_customer_id IS NULL OR manager_customer_id ~ '^\d{10}$'),
  is_manager            boolean     NOT NULL DEFAULT false,
  currency_code         text        NULL,
  time_zone             text        NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_pending_google_resources_cust_mgr UNIQUE NULLS NOT DISTINCT (pending_connection_id, customer_id, manager_customer_id)
);

COMMENT ON TABLE public.pending_google_oauth_resources IS 'Phase 8F.1: Discovered Google Ads customer accounts for pending selection.';

ALTER TABLE public.pending_google_oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_google_oauth_resources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.pending_google_oauth_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.pending_google_oauth_resources FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.pending_google_oauth_credentials TO service_role;
GRANT ALL ON public.pending_google_oauth_resources TO service_role;

-- ---------------------------------------------------------------------------
-- 3. HARDENED RPC: consume_oauth_state (PROVIDER-BOUND NONCE CONSUMPTION)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.consume_oauth_state(text);

CREATE OR REPLACE FUNCTION public.consume_oauth_state(
  p_state_hash text,
  p_expected_provider text
)
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

  IF p_expected_provider IS NULL OR p_expected_provider NOT IN ('meta', 'google') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ARGUMENT', 'message', 'Invalid expected provider');
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

  IF v_state.provider <> p_expected_provider THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PROVIDER_MISMATCH', 'message', 'OAuth state provider mismatch');
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
    'user_id', v_state.user_id,
    'provider', v_state.provider
  );
END;
$$;

ALTER FUNCTION public.consume_oauth_state(text, text) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.consume_oauth_state(text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.consume_oauth_state(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. HARDEN EXISTING RPC: finalize_meta_connection (PROVIDER GUARD)
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

  IF v_conn.provider <> 'meta' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PROVIDER_MISMATCH', 'message', 'Pending connection is not for Meta');
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

-- ---------------------------------------------------------------------------
-- 5. NEW RPC: finalize_google_connection (UNAMBIGUOUS SELECTION BY RESOURCE UUID)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.finalize_google_connection(uuid, text);

CREATE OR REPLACE FUNCTION public.finalize_google_connection(
  p_pending_connection_id uuid,
  p_selected_resource_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conn         record;
  v_res          record;
  v_pending_cred record;
  v_existing_cred record;
  v_integration  record;
  v_integration_id uuid;
  v_is_reconnect boolean := false;
  v_event_type   text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'UNAUTHORIZED', 'message', 'User authentication required');
  END IF;

  IF p_selected_resource_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_ARGUMENT', 'message', 'Selected resource ID is required');
  END IF;

  SELECT * INTO v_conn
  FROM public.pending_oauth_connections
  WHERE id = p_pending_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'Pending OAuth connection not found');
  END IF;

  IF v_conn.provider <> 'google' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'PROVIDER_MISMATCH', 'message', 'Pending connection is not for Google');
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

  -- Obtenemos el recurso exacto seleccionado usando el p_selected_resource_id UUID
  SELECT * INTO v_res
  FROM public.pending_google_oauth_resources
  WHERE id = p_selected_resource_id AND pending_connection_id = p_pending_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'NOT_FOUND', 'message', 'Selected Google customer resource not found in pending session');
  END IF;

  -- Comprobar si existe una credencial temporal enviada en este flujo OAuth
  SELECT * INTO v_pending_cred
  FROM public.pending_google_oauth_credentials
  WHERE pending_connection_id = p_pending_connection_id;

  -- Buscar integración existente para el cliente y la cuenta de Google Ads (por v_res.customer_id)
  SELECT * INTO v_integration
  FROM public.client_integrations
  WHERE client_id = v_conn.client_id
    AND provider = 'google'
    AND external_account_id = v_res.customer_id
  FOR UPDATE;

  IF v_integration.id IS NULL THEN
    -- Primera conexión para esta cuenta: DEBE haber credencial en pending_google_oauth_credentials
    IF v_pending_cred.id IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error_code', 'MISSING_REFRESH_TOKEN',
        'message', 'No valid refresh token was issued by Google and no existing credential was found for this customer'
      );
    END IF;
  ELSE
    -- Reconexión: si no hay credencial temporal, comprobar que existe credencial previa activa
    IF v_pending_cred.id IS NULL THEN
      SELECT * INTO v_existing_cred
      FROM public.client_integration_credentials
      WHERE client_integration_id = v_integration.id
        AND credential_type = 'google_ads_refresh_token';

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'success', false,
          'error_code', 'MISSING_REFRESH_TOKEN',
          'message', 'No valid refresh token was issued by Google and no existing credential was found for this customer'
        );
      END IF;
    END IF;
  END IF;

  IF v_integration.id IS NOT NULL THEN
    v_is_reconnect := true;
    v_integration_id := v_integration.id;

    UPDATE public.client_integrations
    SET status = 'active'::public.integration_status,
        configuration = jsonb_build_object(
          'customer_id', v_res.customer_id,
          'customer_name', v_res.customer_name,
          'manager_customer_id', v_res.manager_customer_id,
          'is_manager', v_res.is_manager,
          'currency_code', v_res.currency_code,
          'time_zone', v_res.time_zone
        ),
        updated_at = now()
    WHERE id = v_integration_id;

    IF v_pending_cred.id IS NOT NULL THEN
      INSERT INTO public.client_integration_credentials (
        organization_id, client_integration_id, credential_type,
        key_version, ciphertext, iv, auth_tag, rotated_at
      ) VALUES (
        v_conn.organization_id, v_integration_id, 'google_ads_refresh_token',
        v_pending_cred.key_version, v_pending_cred.ciphertext, v_pending_cred.iv, v_pending_cred.auth_tag, now()
      )
      ON CONFLICT (client_integration_id, credential_type) DO UPDATE
      SET key_version = EXCLUDED.key_version,
          ciphertext = EXCLUDED.ciphertext,
          iv = EXCLUDED.iv,
          auth_tag = EXCLUDED.auth_tag,
          updated_at = now(),
          rotated_at = now();
    END IF;

    v_event_type := 'reauthorized';
  ELSE
    INSERT INTO public.client_integrations (
      organization_id, client_id, provider, external_account_id, status, configuration
    ) VALUES (
      v_conn.organization_id, v_conn.client_id, 'google', v_res.customer_id, 'active'::public.integration_status,
      jsonb_build_object(
        'customer_id', v_res.customer_id,
        'customer_name', v_res.customer_name,
        'manager_customer_id', v_res.manager_customer_id,
        'is_manager', v_res.is_manager,
        'currency_code', v_res.currency_code,
        'time_zone', v_res.time_zone
      )
    ) RETURNING id INTO v_integration_id;

    INSERT INTO public.client_integration_credentials (
      organization_id, client_integration_id, credential_type,
      key_version, ciphertext, iv, auth_tag
    ) VALUES (
      v_conn.organization_id, v_integration_id, 'google_ads_refresh_token',
      v_pending_cred.key_version, v_pending_cred.ciphertext, v_pending_cred.iv, v_pending_cred.auth_tag
    );

    v_event_type := 'connected';
  END IF;

  INSERT INTO public.client_integration_events (
    organization_id, client_integration_id, event_type, actor_user_id, metadata
  ) VALUES (
    v_conn.organization_id, v_integration_id, v_event_type, auth.uid(),
    jsonb_build_object(
      'customer_id', v_res.customer_id,
      'customer_name', v_res.customer_name,
      'manager_customer_id', v_res.manager_customer_id
    )
  );

  -- Marcar pending_oauth_connection como consumida (tombstone) y borrar secretos / recursos temporales
  UPDATE public.pending_oauth_connections
  SET consumed_at = now()
  WHERE id = p_pending_connection_id;

  DELETE FROM public.pending_google_oauth_credentials
  WHERE pending_connection_id = p_pending_connection_id;

  DELETE FROM public.pending_google_oauth_resources
  WHERE pending_connection_id = p_pending_connection_id;

  RETURN jsonb_build_object(
    'success', true,
    'client_integration_id', v_integration_id,
    'is_reconnect', v_is_reconnect,
    'event_type', v_event_type
  );
END;
$$;

ALTER FUNCTION public.finalize_google_connection(uuid, uuid) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.finalize_google_connection(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_google_connection(uuid, uuid) TO authenticated;
