import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 8G.1A Provider Observation Persistence Migration Security & Integrity Audit', () => {
  const migrationPath = path.resolve(
    __dirname,
    '../../../../../supabase/migrations/20260904000000_phase8g1a_provider_observation_persistence.sql',
  );
  const sql = fs.readFileSync(migrationPath, 'utf8');

  it('sets search_path = public at script level and inside function body', () => {
    expect(sql).toMatch(/SET search_path = public/);
  });

  it('creates composite UNIQUE constraint on campaign_publication_jobs for DB-level relational tenant integrity', () => {
    expect(sql).toMatch(/campaign_publication_jobs_tenant_target_unique/);
    expect(sql).toMatch(/UNIQUE \(id, organization_id, client_id, target_id\)/);
  });

  it('creates composite Foreign Key campaign_provider_obs_tenant_target_fk on campaign_provider_observations', () => {
    expect(sql).toMatch(/CONSTRAINT campaign_provider_obs_tenant_target_fk/);
    expect(sql).toMatch(
      /FOREIGN KEY \(job_id, organization_id, client_id, target_id\)\s+REFERENCES public\.campaign_publication_jobs\(id, organization_id, client_id, target_id\)/,
    );
  });

  it('creates campaign_provider_observations table with RLS enabled', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.campaign_provider_observations/);
    expect(sql).toMatch(/ALTER TABLE public\.campaign_provider_observations ENABLE ROW LEVEL SECURITY/);
  });

  it('does NOT contain redundant is_change_event column', () => {
    expect(sql).not.toMatch(/is_change_event/);
  });

  it('configures BEFORE UPDATE immutable protection trigger blocking direct updates', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.prevent_campaign_provider_obs_update/);
    expect(sql).toMatch(/campaign_provider_obs_immutable_upd_trg/);
    expect(sql).toMatch(/BEFORE UPDATE ON public\.campaign_provider_observations/);
  });

  it('revokes UPDATE and DELETE privileges on table from PUBLIC and authenticated roles', () => {
    expect(sql).toMatch(/REVOKE UPDATE, DELETE ON TABLE public\.campaign_provider_observations FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE UPDATE, DELETE ON TABLE public\.campaign_provider_observations FROM authenticated/);
  });

  it('enforces job.external_id equality validation inside record_provider_observation RPC', () => {
    expect(sql).toMatch(/p_external_id <> v_job_record\.external_id/);
    expect(sql).toMatch(/v_job_record\.external_id IS NULL/);
  });

  it('hardens SECURITY DEFINER function grants by revoking execute from PUBLIC/authenticated and granting only to service_role', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_provider_observation FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_provider_observation FROM authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_provider_observation TO service_role/);
  });
});
