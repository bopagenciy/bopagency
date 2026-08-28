import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reconcilePublicationWithProvider } from '../reconcile-publication-with-provider.use-case';
import { PublicationReconcilerRegistry, type PublicationReconcilerPort } from '../../../ports/publication-reconciler.port';
import { ok, err } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationRepository,
  OrganizationRepository,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeOrgRepo(role: string = 'strategist'): OrganizationRepository {
  return {
    findMember: vi.fn().mockResolvedValue(ok({ role })),
  } as any;
}

describe('reconcilePublicationWithProvider Use Case (Phase 8G.0)', () => {
  const mockJob: CampaignPublicationJob = {
    id: 'job-1' as any,
    organizationId: 'org-1' as any,
    clientId: 'client-1' as any,
    targetId: 'target-1' as any,
    channel: 'google_ads',
    provider: 'google',
    clientIntegrationId: 'integ-1' as any,
    status: 'unknown_outcome',
    idempotencyKey: 'idemp-1' as any,
    retryOfJobId: null,
    retryCount: 0,
    claimedAt: null,
    claimedByWorker: null,
    startedAt: null,
    completedAt: null,
    reconciliationDeadlineAt: null,
    cancellationRequestedAt: null,
    cancellationRequestedBy: null,
    failureCategory: null,
    reconciledBy: null,
    reconciledAt: null,
    reconciliationNote: null,
    metadata: {},
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects execution if actor role is insufficient (< strategist)', async () => {
    const operatorOrgRepo = makeOrgRepo('operator');

    const result = await reconcilePublicationWithProvider(
      {
        jobId: 'job-1',
        organizationId: 'org-1' as any,
        actorUserId: 'user-op',
      },
      {
        publicationRepository: {} as any,
        organizationRepository: operatorOrgRepo,
        reconcilerRegistry: new PublicationReconcilerRegistry(),
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('rejects cross-organization access if job is not found for tenant', async () => {
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(null)),
    } as unknown as CampaignPublicationRepository;

    const result = await reconcilePublicationWithProvider(
      {
        jobId: 'job-1',
        organizationId: 'org-other' as any,
        actorUserId: 'user-strat',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('strategist'),
        reconcilerRegistry: new PublicationReconcilerRegistry(),
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('rejects execution if job is not in unknown_outcome status', async () => {
    const succeededJob = { ...mockJob, status: 'succeeded', attempts: [] };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(succeededJob)),
    } as unknown as CampaignPublicationRepository;

    const result = await reconcilePublicationWithProvider(
      {
        jobId: 'job-1',
        organizationId: 'org-1' as any,
        actorUserId: 'user-strat',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('strategist'),
        reconcilerRegistry: new PublicationReconcilerRegistry(),
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('executes confirmed_published flow: calls RPC reconcileJob(outcome: published) and transitions job to succeeded', async () => {
    const jobWithAttempts = { ...mockJob, attempts: [] };
    const updatedSucceededJob = { ...mockJob, status: 'succeeded', externalId: 'customers/123/campaigns/999' };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(jobWithAttempts)),
      reconcileJob: vi.fn().mockResolvedValue(ok(updatedSucceededJob)),
    } as unknown as CampaignPublicationRepository;

    const mockReconciler: PublicationReconcilerPort = {
      supports: (c, p) => c === 'google_ads' && p === 'google',
      reconcile: vi.fn().mockResolvedValue(ok({
        outcome: 'confirmed_published',
        externalId: 'customers/123/campaigns/999',
        metadata: { matchCount: 1 },
      })),
    };

    const registry = new PublicationReconcilerRegistry();
    registry.register(mockReconciler);

    const result = await reconcilePublicationWithProvider(
      {
        jobId: 'job-1',
        organizationId: 'org-1' as any,
        actorUserId: 'user-strat',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('strategist'),
        reconcilerRegistry: registry,
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.job.status).toBe('succeeded');
      expect(result.value.reconcileResult.outcome).toBe('confirmed_published');
    }

    expect(pubRepo.reconcileJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1',
      outcome: 'published',
      externalId: 'customers/123/campaigns/999',
    }));
  });

  it('executes confirmed_not_published flow: calls RPC reconcileJob(outcome: not_published) and transitions job to failed (making target eligible for retry)', async () => {
    const jobWithAttempts = { ...mockJob, attempts: [] };
    const updatedFailedJob = { ...mockJob, status: 'failed', failureCategory: 'RECONCILED_NOT_PUBLISHED' };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(jobWithAttempts)),
      reconcileJob: vi.fn().mockResolvedValue(ok(updatedFailedJob)),
    } as unknown as CampaignPublicationRepository;

    const mockReconciler: PublicationReconcilerPort = {
      supports: (c, p) => c === 'google_ads' && p === 'google',
      reconcile: vi.fn().mockResolvedValue(ok({
        outcome: 'confirmed_not_published',
        metadata: { matchCount: 0 },
      })),
    };

    const registry = new PublicationReconcilerRegistry();
    registry.register(mockReconciler);

    const result = await reconcilePublicationWithProvider(
      {
        jobId: 'job-1',
        organizationId: 'org-1' as any,
        actorUserId: 'user-strat',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('strategist'),
        reconcilerRegistry: registry,
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.job.status).toBe('failed');
      expect(result.value.reconcileResult.outcome).toBe('confirmed_not_published');
    }

    expect(pubRepo.reconcileJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1',
      outcome: 'not_published',
    }));
  });

  it('handles unresolved outcome cleanly without mutating job state in DB (job stays unknown_outcome)', async () => {
    const jobWithAttempts = { ...mockJob, attempts: [] };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(jobWithAttempts)),
      reconcileJob: vi.fn(),
    } as unknown as CampaignPublicationRepository;

    const mockReconciler: PublicationReconcilerPort = {
      supports: (c, p) => c === 'google_ads' && p === 'google',
      reconcile: vi.fn().mockResolvedValue(ok({
        outcome: 'unresolved',
        unresolvedReason: 'AUTH_EXPIRED',
      })),
    };

    const registry = new PublicationReconcilerRegistry();
    registry.register(mockReconciler);

    const result = await reconcilePublicationWithProvider(
      {
        jobId: 'job-1',
        organizationId: 'org-1' as any,
        actorUserId: 'user-strat',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('strategist'),
        reconcilerRegistry: registry,
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.job.status).toBe('unknown_outcome');
      expect(result.value.reconcileResult.outcome).toBe('unresolved');
    }

    expect(pubRepo.reconcileJob).not.toHaveBeenCalled();
  });
});
