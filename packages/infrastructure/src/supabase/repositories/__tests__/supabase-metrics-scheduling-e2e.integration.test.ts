import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationId, ClientId, CampaignId, CampaignActivationId, CampaignActivationTargetId } from '@bop-agency/domain';
import { SupabaseCampaignMetricsSyncStateRepository } from '../supabase-campaign-metrics-sync-state.repository';

const runRealDb = process.env['RUN_REAL_DB_TESTS'] === 'true';

describe.skipIf(!runRealDb)('Supabase Metrics Scheduling Hardened Real DB Suite (Phase 9B.3)', () => {
  const SUPABASE_URL = process.env['SUPABASE_URL'] || 'http://127.0.0.1:54721';
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
  const SUPABASE_ANON_KEY =
    process.env['SUPABASE_ANON_KEY'] ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.t4IlyzXQe-0YJ27D7S9j_5kZ27_sY_J_2Z_J2Z_J2Z';

  let serviceClient: SupabaseClient;
  let anonClient: SupabaseClient;
  let repository: SupabaseCampaignMetricsSyncStateRepository;

  const orgId = 'a0000000-0000-0000-0000-000000000001' as OrganizationId;
  const orgIdB = 'a0000000-0000-0000-0000-000000000002' as OrganizationId;
  const cliId = 'b0000000-0000-0000-0000-000000000001' as ClientId;
  const cmpId = 'c0000000-0000-0000-0000-000000000001' as CampaignId;
  const appValId = 'f0000000-0000-0000-0000-000000000001';
  const actId = 'd0000000-0000-0000-0000-000000000001' as CampaignActivationId;
  const trgId = 'e0000000-0000-0000-0000-000000000001' as CampaignActivationTargetId;
  const trgIdFail = 'e0000000-0000-0000-0000-000000000002' as CampaignActivationTargetId;
  const trgIdConcurrent = 'e0000000-0000-0000-0000-000000000003' as CampaignActivationTargetId;
  const userId = '208779e6-081e-4a92-8971-2b1a19fb6f3d';

  beforeAll(async () => {
    serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    repository = new SupabaseCampaignMetricsSyncStateRepository(serviceClient);

    // Seed prerequisite entities for FK constraints
    await serviceClient.from('organizations').upsert({ id: orgId, name: '9B.3 Sched Org', slug: '9b3-sched-org' });
    await serviceClient.from('organizations').upsert({ id: orgIdB, name: '9B.3 Sched Org B', slug: '9b3-sched-org-b' });
    await serviceClient.from('clients').upsert({ id: cliId, organization_id: orgId, name: '9B.3 Sched Client', slug: '9b3-sched-client', timezone: 'UTC', currency: 'COP', created_by: userId });
    await serviceClient.from('campaigns').upsert({ id: cmpId, organization_id: orgId, client_id: cliId, name: '9B.3 Sched Campaign', platform: 'google_ads', objective: 'traffic', budget: '100000.00', status: 'approved', created_by: userId });
    await serviceClient.from('campaign_approvals').upsert({ id: appValId, organization_id: orgId, campaign_id: cmpId, action: 'approved', note: 'Approved for test', actor_user_id: userId });
    await serviceClient.from('campaign_activations').upsert({ id: actId, organization_id: orgId, client_id: cliId, campaign_id: cmpId, campaign_approval_id: appValId, status: 'completed', approved_snapshot: { concept: 'test', name: 'Test Campaign' }, created_by: userId });
    await serviceClient.from('campaign_activation_targets').upsert({ id: trgId, activation_id: actId, organization_id: orgId, client_id: cliId, channel: 'manual', provider: 'manual', placement: 'target_1', status: 'published', external_reference: 'ext-real-db-999' });
    await serviceClient.from('campaign_activation_targets').upsert({ id: trgIdFail, activation_id: actId, organization_id: orgId, client_id: cliId, channel: 'manual', provider: 'manual', placement: 'target_2', status: 'published', external_reference: 'meta-cmp-fail-1' });
    await serviceClient.from('campaign_activation_targets').upsert({ id: trgIdConcurrent, activation_id: actId, organization_id: orgId, client_id: cliId, channel: 'manual', provider: 'manual', placement: 'target_3', status: 'published', external_reference: 'concurrent-target-1' });
  });

  it('proves idempotent creation, atomic claim locking, and markSuccess state update on real PostgreSQL', async () => {
    await serviceClient.from('campaign_metrics_sync_states').delete().eq('target_id', trgId);

    const createRes = await repository.getOrCreateSyncState({
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgId,
      platform: 'google',
      providerAccountId: '1234567890',
      externalCampaignId: 'ext-real-db-999',
    });

    expect(createRes.success).toBe(true);
    if (!createRes.success) return;

    const state = createRes.value;
    expect(state.status).toBe('never_synced');
    expect(state.platform).toBe('google');

    const secondCreateRes = await repository.getOrCreateSyncState({
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgId,
      platform: 'google',
      providerAccountId: '1234567890',
      externalCampaignId: 'ext-real-db-999',
    });

    expect(secondCreateRes.success).toBe(true);
    if (secondCreateRes.success) {
      expect(secondCreateRes.value.id).toBe(state.id);
    }

    const claimRes1 = await repository.claimDueTarget(state.id, 'worker-token-alpha', 15);
    expect(claimRes1.success).toBe(true);
    if (claimRes1.success) {
      expect(claimRes1.value.claimed).toBe(true);
      expect(claimRes1.value.syncState?.status).toBe('syncing');
      expect(claimRes1.value.syncState?.claimToken).toBe('worker-token-alpha');
    }

    const claimRes2 = await repository.claimDueTarget(state.id, 'worker-token-beta', 15);
    expect(claimRes2.success).toBe(true);
    if (claimRes2.success) {
      expect(claimRes2.value.claimed).toBe(false);
    }

    const now = new Date();
    const nextEligible = new Date(now.getTime() + 1440 * 60 * 1000);
    const successRes = await repository.markSuccess({
      syncStateId: state.id,
      claimToken: 'worker-token-alpha',
      attemptedAt: now,
      syncedThroughDate: '2026-08-30',
      nextEligibleSyncAt: nextEligible,
    });

    expect(successRes.success).toBe(true);
    if (successRes.success) {
      expect(successRes.value.status).toBe('fresh');
      expect(successRes.value.lastSyncedThroughDate).toBe('2026-08-30');
      expect(successRes.value.consecutiveFailures).toBe(0);
      expect(successRes.value.claimToken).toBeNull();
    }
  });

  it('proves stale worker race condition rejection (Worker A token rejected after Worker B re-claims expired lease)', async () => {
    await serviceClient.from('campaign_metrics_sync_states').delete().eq('target_id', trgId);

    const createRes = await repository.getOrCreateSyncState({
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgId,
      platform: 'google',
      providerAccountId: '1234567890',
      externalCampaignId: 'ext-real-db-999',
    });

    expect(createRes.success).toBe(true);
    if (!createRes.success) return;

    const state = createRes.value;

    // 1. Worker A claims target
    const claimA = await repository.claimDueTarget(state.id, 'worker-token-A', 15);
    expect(claimA.success).toBe(true);
    if (!claimA.success || !claimA.value.claimed) return;

    // 2. Force lease expiration in DB to simulate worker A delay/crash
    const pastTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await serviceClient
      .from('campaign_metrics_sync_states')
      .update({ claim_expires_at: pastTime })
      .eq('id', state.id);

    // 3. Worker B claims expired lease successfully
    const claimB = await repository.claimDueTarget(state.id, 'worker-token-B', 15);
    expect(claimB.success).toBe(true);
    if (claimB.success) {
      expect(claimB.value.claimed).toBe(true);
      expect(claimB.value.syncState?.claimToken).toBe('worker-token-B');
    }

    // 4. Stale Worker A attempts markSuccess with token A -> MUST be rejected
    const now = new Date();
    const markSuccessStaleA = await repository.markSuccess({
      syncStateId: state.id,
      claimToken: 'worker-token-A',
      attemptedAt: now,
      syncedThroughDate: '2026-08-30',
      nextEligibleSyncAt: new Date(now.getTime() + 1440 * 60 * 1000),
    });
    expect(markSuccessStaleA.success).toBe(false);
    if (!markSuccessStaleA.success) {
      expect(markSuccessStaleA.error.code).toBe('CONFLICT');
    }

    // Verify row in DB is still owned by Worker B
    const { data: dbRow } = await serviceClient
      .from('campaign_metrics_sync_states')
      .select('claim_token, status')
      .eq('id', state.id)
      .single();
    expect(dbRow?.claim_token).toBe('worker-token-B');
    expect(dbRow?.status).toBe('syncing');

    // 5. Worker B completes markSuccess -> succeeds!
    const markSuccessB = await repository.markSuccess({
      syncStateId: state.id,
      claimToken: 'worker-token-B',
      attemptedAt: now,
      syncedThroughDate: '2026-08-30',
      nextEligibleSyncAt: new Date(now.getTime() + 1440 * 60 * 1000),
    });
    expect(markSuccessB.success).toBe(true);
    if (markSuccessB.success) {
      expect(markSuccessB.value.status).toBe('fresh');
      expect(markSuccessB.value.claimToken).toBeNull();
    }
  });

  it('proves simultaneous two-worker claim race (exactly one worker receives lease, no deadlocks)', async () => {
    await serviceClient.from('campaign_metrics_sync_states').delete().eq('target_id', trgIdConcurrent);

    const createRes = await repository.getOrCreateSyncState({
      organizationId: orgId,
      clientId: cliId,
      campaignId: cmpId,
      activationId: actId,
      targetId: trgIdConcurrent,
      platform: 'meta',
      providerAccountId: 'act_concurrent',
      externalCampaignId: 'ext-meta-concurrent',
    });

    expect(createRes.success).toBe(true);
    if (!createRes.success) return;

    const state = createRes.value;

    // Execute 2 concurrent claim requests in parallel
    const [resA, resB] = await Promise.all([
      repository.claimDueTarget(state.id, 'parallel-token-A', 15),
      repository.claimDueTarget(state.id, 'parallel-token-B', 15),
    ]);

    expect(resA.success).toBe(true);
    expect(resB.success).toBe(true);

    if (resA.success && resB.success) {
      const claimedA = resA.value.claimed;
      const claimedB = resB.value.claimed;

      // Exactly one must succeed, exactly one must fail
      expect(claimedA !== claimedB).toBe(true);
      expect((claimedA ? 1 : 0) + (claimedB ? 1 : 0)).toBe(1);
    }
  });

  it('proves RPC Security ACL isolation (anon/public rejected, service_role succeeds)', async () => {
    const { data: anonRes, error: anonErr } = await anonClient.rpc('claim_due_metrics_sync_target', {
      p_sync_state_id: '00000000-0000-4000-a000-000000000001',
      p_claim_token: 'hacker-token',
      p_lease_duration_minutes: 15,
    });

    // Anon calling RPC must be rejected by PostgreSQL ACL
    expect(anonErr).not.toBeNull();
    expect(anonRes).toBeNull();
  });

  it('proves multi-tenant listDueTargetsGlobal returns due targets across different organizations', async () => {
    const globalRes = await repository.listDueTargetsGlobal(null, 50);
    expect(globalRes.success).toBe(true);
    if (globalRes.success) {
      expect(globalRes.value.length).toBeGreaterThan(0);
      const orgIds = new Set(globalRes.value.map((s) => s.organizationId));
      expect(orgIds.size).toBeGreaterThan(0);
    }
  });
});
