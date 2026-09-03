-- Migration: 20260907000000_phase9b3_scheduled_metrics_ingestion.sql
-- Description: Phase 9B.3 — Scheduled Metrics Ingestion & Freshness Status (Hardened)

-- ─── 1. campaign_metrics_sync_states ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.campaign_metrics_sync_states (
  id                       uuid          NOT NULL DEFAULT gen_random_uuid(),
  organization_id          uuid          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id                uuid          NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  campaign_id              uuid          NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  activation_id            uuid          NOT NULL REFERENCES public.campaign_activations(id) ON DELETE CASCADE,
  target_id                uuid          NOT NULL REFERENCES public.campaign_activation_targets(id) ON DELETE CASCADE,
  platform                 text          NOT NULL CHECK (platform IN ('meta', 'google', 'tiktok', 'linkedin', 'twitter', 'other')),
  provider_account_id      text          NOT NULL,
  external_campaign_id     text          NOT NULL,
  scope                    text          NOT NULL DEFAULT 'campaign' CHECK (scope = 'campaign'),
  granularity              text          NOT NULL DEFAULT 'daily' CHECK (granularity = 'daily'),
  status                   text          NOT NULL DEFAULT 'never_synced' CHECK (status IN ('never_synced', 'fresh', 'due', 'syncing', 'failed', 'backoff')),
  last_attempt_at          timestamptz       NULL,
  last_success_at          timestamptz       NULL,
  last_failure_at          timestamptz       NULL,
  last_synced_through_date date              NULL,
  next_eligible_sync_at    timestamptz   NOT NULL DEFAULT now(),
  consecutive_failures     integer       NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  claim_token              text              NULL,
  claimed_at               timestamptz       NULL,
  claim_expires_at         timestamptz       NULL,
  last_error_category      text              NULL CHECK (last_error_category IS NULL OR last_error_category IN ('AUTH_FAILURE', 'RATE_LIMIT', 'INVALID_REQUEST', 'TRANSIENT_FAILURE', 'PROVIDER_UNAVAILABLE', 'TENANT_MISMATCH', 'UNKNOWN')),
  last_error_message       text              NULL,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT campaign_metrics_sync_states_pkey PRIMARY KEY (id),
  CONSTRAINT uq_campaign_metrics_sync_states_stream UNIQUE (organization_id, client_id, campaign_id, activation_id, target_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_metrics_sync_states_due_lookup
  ON public.campaign_metrics_sync_states (organization_id, platform, status, next_eligible_sync_at);

CREATE INDEX IF NOT EXISTS idx_metrics_sync_states_target_id
  ON public.campaign_metrics_sync_states (target_id);

-- ─── 2. Row Level Security (RLS) ──────────────────────────────────────────

ALTER TABLE public.campaign_metrics_sync_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select_campaign_metrics_sync_states ON public.campaign_metrics_sync_states
  FOR SELECT
  USING (
    public.is_organization_member(organization_id)
  );

CREATE POLICY tenant_all_service_role_metrics_sync_states ON public.campaign_metrics_sync_states
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- ─── 3. Atomic Claim Stale & Due RPC ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.claim_due_metrics_sync_target(
  p_sync_state_id uuid,
  p_claim_token text,
  p_lease_duration_minutes integer DEFAULT 15
)
RETURNS TABLE (
  claimed boolean,
  sync_state public.campaign_metrics_sync_states
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_expires_at timestamptz := v_now + (p_lease_duration_minutes || ' minutes')::interval;
  v_row public.campaign_metrics_sync_states;
BEGIN
  UPDATE public.campaign_metrics_sync_states
  SET
    status = 'syncing',
    claim_token = p_claim_token,
    claimed_at = v_now,
    claim_expires_at = v_expires_at,
    updated_at = v_now
  WHERE id = p_sync_state_id
    AND (
      (status IN ('never_synced', 'due', 'fresh', 'failed', 'backoff') AND next_eligible_sync_at <= v_now)
      OR (status = 'syncing' AND (claim_expires_at IS NULL OR claim_expires_at <= v_now))
    )
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_row;
  ELSE
    RETURN QUERY SELECT false, NULL::public.campaign_metrics_sync_states;
  END IF;
END;
$$;
