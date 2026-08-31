-- Migration: 20260908000000_phase9b3_sync_claim_security_hardening.sql
-- Description: Phase 9B.3 — Atomic Claim RPC Hardening, Safe search_path & service_role ACL Isolation

-- 1. Harden Atomic Claim RPC with explicit safe search_path
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
SET search_path = public, pg_temp
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

-- 2. Revoke public/anon/authenticated execution; grant strictly to service_role
REVOKE ALL ON FUNCTION public.claim_due_metrics_sync_target(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_metrics_sync_target(uuid, text, integer) TO service_role;
