-- Phase 8G.1A: Provider Observation Persistence Foundation (Hardened & Relational)
-- Append-only table for campaign provider status observations and change detection.

SET search_path = public;

-- 1. Ensure Composite Unique Key on parent table for DB-level relational tenant & job-target integrity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'campaign_publication_jobs_tenant_target_unique'
  ) THEN
    ALTER TABLE public.campaign_publication_jobs
      ADD CONSTRAINT campaign_publication_jobs_tenant_target_unique
      UNIQUE (id, organization_id, client_id, target_id);
  END IF;
END $$;

-- 2. Table Creation
CREATE TABLE IF NOT EXISTS public.campaign_provider_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  job_id uuid NOT NULL,
  target_id uuid NOT NULL,
  provider text NOT NULL,
  channel text NOT NULL,
  external_id text NOT NULL,
  availability text NOT NULL,
  unavailability_reason text NULL,
  resource_status text NULL,
  serving_status text NULL,
  primary_status text NULL,
  primary_status_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  request_id text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT campaign_provider_obs_availability_check
    CHECK (availability IN ('observed', 'unavailable', 'not_found')),

  CONSTRAINT campaign_provider_obs_reasons_array_check
    CHECK (jsonb_typeof(primary_status_reasons) = 'array'),

  CONSTRAINT campaign_provider_obs_tenant_target_fk
    FOREIGN KEY (job_id, organization_id, client_id, target_id)
    REFERENCES public.campaign_publication_jobs(id, organization_id, client_id, target_id)
    ON DELETE CASCADE
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_provider_obs_job_latest
  ON public.campaign_provider_observations (job_id, observed_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_obs_resource_latest
  ON public.campaign_provider_observations (organization_id, provider, external_id, observed_at DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_provider_obs_target_history
  ON public.campaign_provider_observations (target_id, observed_at DESC, created_at DESC);

-- 4. RLS & Role Privilege Revocations (Immutable Protection)
ALTER TABLE public.campaign_provider_observations ENABLE ROW LEVEL SECURITY;

-- Revoke direct UPDATE/DELETE table privileges from authenticated/public
REVOKE UPDATE, DELETE ON TABLE public.campaign_provider_observations FROM PUBLIC;
REVOKE UPDATE, DELETE ON TABLE public.campaign_provider_observations FROM authenticated;

DROP POLICY IF EXISTS campaign_provider_obs_select ON public.campaign_provider_observations;
CREATE POLICY campaign_provider_obs_select
  ON public.campaign_provider_observations FOR SELECT TO authenticated
  USING (public.is_organization_member(campaign_provider_observations.organization_id));

-- 5. Database-Level Immutable Protection Trigger (Direct UPDATE blocked unconditionally)
CREATE OR REPLACE FUNCTION public.prevent_campaign_provider_obs_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'campaign_provider_observations rows are immutable and cannot be updated';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS campaign_provider_obs_immutable_upd_trg ON public.campaign_provider_observations;
CREATE TRIGGER campaign_provider_obs_immutable_upd_trg
  BEFORE UPDATE ON public.campaign_provider_observations
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_campaign_provider_obs_update();

-- 6. Atomic Stored Procedure: record_provider_observation
CREATE OR REPLACE FUNCTION public.record_provider_observation(
  p_organization_id uuid,
  p_client_id uuid,
  p_job_id uuid,
  p_target_id uuid,
  p_provider text,
  p_channel text,
  p_external_id text,
  p_availability text,
  p_unavailability_reason text DEFAULT NULL,
  p_resource_status text DEFAULT NULL,
  p_serving_status text DEFAULT NULL,
  p_primary_status text DEFAULT NULL,
  p_primary_status_reasons jsonb DEFAULT '[]'::jsonb,
  p_observed_at timestamptz DEFAULT now(),
  p_request_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  inserted boolean,
  observation_id uuid,
  change_kind text,
  observed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_record public.campaign_publication_jobs%ROWTYPE;
  v_latest public.campaign_provider_observations%ROWTYPE;
  v_reasons_jsonb jsonb;
  v_is_same boolean := false;
  v_new_id uuid;
  v_effective_observed_at timestamptz;
BEGIN
  -- 1. Lock job row FOR UPDATE and validate tenant / status / external_id consistency
  SELECT * INTO v_job_record
  FROM public.campaign_publication_jobs j
  WHERE j.id = p_job_id
    AND j.organization_id = p_organization_id
    AND j.client_id = p_client_id
    AND j.target_id = p_target_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_provider_observation: publication job % not found for specified tenant binding', p_job_id;
  END IF;

  IF v_job_record.status <> 'succeeded' THEN
    RAISE EXCEPTION 'record_provider_observation: publication job % has status %, but observations require succeeded status', p_job_id, v_job_record.status;
  END IF;

  IF v_job_record.external_id IS NULL THEN
    RAISE EXCEPTION 'record_provider_observation: publication job % lacks external_id required for provider monitoring', p_job_id;
  END IF;

  IF p_external_id <> v_job_record.external_id THEN
    RAISE EXCEPTION 'record_provider_observation: external_id mismatch for job % (expected %, got %)', p_job_id, v_job_record.external_id, p_external_id;
  END IF;

  IF p_availability NOT IN ('observed', 'unavailable', 'not_found') THEN
    RAISE EXCEPTION 'record_provider_observation: invalid availability status %', p_availability;
  END IF;

  -- Normalize reasons jsonb
  IF p_primary_status_reasons IS NULL OR jsonb_typeof(p_primary_status_reasons) <> 'array' THEN
    v_reasons_jsonb := '[]'::jsonb;
  ELSE
    v_reasons_jsonb := p_primary_status_reasons;
  END IF;

  v_effective_observed_at := COALESCE(p_observed_at, now());

  -- 2. Fetch latest observation for this job
  SELECT * INTO v_latest
  FROM public.campaign_provider_observations o
  WHERE o.job_id = p_job_id
  ORDER BY o.observed_at DESC, o.created_at DESC
  LIMIT 1;

  -- 3. Canonical state comparison if prior observation exists
  IF FOUND THEN
    IF v_latest.availability = p_availability
       AND COALESCE(v_latest.unavailability_reason, '') = COALESCE(p_unavailability_reason, '')
       AND COALESCE(v_latest.resource_status, '') = COALESCE(p_resource_status, '')
       AND COALESCE(v_latest.serving_status, '') = COALESCE(p_serving_status, '')
       AND COALESCE(v_latest.primary_status, '') = COALESCE(p_primary_status, '')
       AND v_latest.primary_status_reasons = v_reasons_jsonb
    THEN
      v_is_same := true;
    END IF;
  END IF;

  -- 4. If SAME: return latest without insert
  IF v_is_same THEN
    RETURN QUERY SELECT false, v_latest.id, 'same'::text, v_latest.observed_at;
    RETURN;
  END IF;

  -- 5. If FIRST or CHANGE: Insert new observation row
  v_new_id := gen_random_uuid();

  INSERT INTO public.campaign_provider_observations (
    id,
    organization_id,
    client_id,
    job_id,
    target_id,
    provider,
    channel,
    external_id,
    availability,
    unavailability_reason,
    resource_status,
    serving_status,
    primary_status,
    primary_status_reasons,
    observed_at,
    request_id,
    metadata,
    created_at
  ) VALUES (
    v_new_id,
    p_organization_id,
    p_client_id,
    p_job_id,
    p_target_id,
    p_provider,
    p_channel,
    p_external_id,
    p_availability,
    p_unavailability_reason,
    p_resource_status,
    p_serving_status,
    p_primary_status,
    v_reasons_jsonb,
    v_effective_observed_at,
    p_request_id,
    COALESCE(p_metadata, '{}'::jsonb),
    now()
  );

  IF v_latest.id IS NULL THEN
    RETURN QUERY SELECT true, v_new_id, 'first'::text, v_effective_observed_at;
  ELSE
    RETURN QUERY SELECT true, v_new_id, 'change'::text, v_effective_observed_at;
  END IF;

  RETURN;
END;
$$;

-- 7. Security Hardening Grants (Service Role Backend Execution Only)
REVOKE ALL ON FUNCTION public.record_provider_observation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_provider_observation FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_provider_observation TO service_role;
