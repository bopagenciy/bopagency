-- Migration: 20260906000000_phase9_fractional_attribution_counts.sql
-- Description: Sub-Phase 9B.2A — Evolve conversions column to numeric(14,4) for fractional provider attribution counts

ALTER TABLE public.campaign_metric_snapshots
  ALTER COLUMN conversions TYPE numeric(14,4) USING conversions::numeric(14,4);
