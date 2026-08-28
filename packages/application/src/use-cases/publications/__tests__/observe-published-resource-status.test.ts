import { describe, it, expect, vi, beforeEach } from 'vitest';
import { observePublishedResourceStatus } from '../observe-published-resource-status.use-case';
import { PublicationProviderMonitorRegistry, type PublicationProviderMonitorPort } from '../../../ports/publication-provider-monitor.port';
import { ok } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationRepository,
  OrganizationRepository,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeOrgRepo(role: string = 'viewer'): OrganizationRepository {
  return {
    findMember: vi.fn().mockResolvedValue(ok({ role })),
  } as any;
}

describe('observePublishedResourceStatus Use Case (Phase 8G.1 & Phase 8G.1A)', () => {
  const mockSucceededJob: CampaignPublicationJob = {
    id: 'job-succ-1' as any,
    organizationId: 'org-1' as any,
    clientId: 'client-1' as any,
    targetId: 'target-1' as any,
    channel: 'google_ads',
    provider: 'google',
    clientIntegrationId: 'integ-1' as any,
    status: 'succeeded',
    idempotencyKey: 'idemp-1' as any,
    retryOfJobId: null,
    retryCount: 0,
    claimedAt: null,
    claimedByWorker: null,
    startedAt: null,
    completedAt: new Date(),
    reconciliationDeadlineAt: null,
    cancellationRequestedAt: null,
    cancellationRequestedBy: null,
    failureCategory: null,
    reconciledBy: null,
    reconciledAt: null,
    reconciliationNote: null,
    externalId: 'customers/1234567890/campaigns/9876543210',
    externalUrl: null,
    metadata: {},
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows any organization member (e.g. viewer) to observe status and orchestrates atomic persistence', async () => {
    const jobWithAttempts = { ...mockSucceededJob, attempts: [] };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(jobWithAttempts)),
      recordProviderObservation: vi.fn().mockResolvedValue(ok({
        inserted: true,
        observationId: 'obs-1',
        changeKind: 'first',
        observedAt: new Date(),
      })),
    } as unknown as CampaignPublicationRepository;

    const mockMonitor: PublicationProviderMonitorPort = {
      supports: (c, p) => c === 'google_ads' && p === 'google',
      observe: vi.fn().mockResolvedValue(ok({
        provider: 'google',
        channel: 'google_ads',
        externalId: mockSucceededJob.externalId!,
        observedAt: new Date().toISOString(),
        availability: 'observed',
        resourceStatus: 'PAUSED',
        servingStatus: 'SERVING',
        primaryStatus: 'PAUSED',
        primaryStatusReasons: ['CAMPAIGN_PAUSED'],
      })),
    };

    const registry = new PublicationProviderMonitorRegistry();
    registry.register(mockMonitor);

    const result = await observePublishedResourceStatus(
      {
        jobId: 'job-succ-1',
        organizationId: 'org-1' as any,
        actorUserId: 'user-viewer',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('viewer'),
        monitorRegistry: registry,
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.job.status).toBe('succeeded');
      expect(result.value.observation.resourceStatus).toBe('PAUSED');
      expect(result.value.persistence?.changeKind).toBe('first');
      expect(result.value.persistence?.inserted).toBe(true);
    }

    expect(pubRepo.recordProviderObservation).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-succ-1',
      externalId: 'customers/1234567890/campaigns/9876543210',
      availability: 'observed',
      resourceStatus: 'PAUSED',
    }));
  });

  it('handles SAME observation state cleanly (inserted: false, changeKind: same)', async () => {
    const jobWithAttempts = { ...mockSucceededJob, attempts: [] };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(jobWithAttempts)),
      recordProviderObservation: vi.fn().mockResolvedValue(ok({
        inserted: false,
        observationId: 'obs-1',
        changeKind: 'same',
        observedAt: new Date(),
      })),
    } as unknown as CampaignPublicationRepository;

    const mockMonitor: PublicationProviderMonitorPort = {
      supports: (c, p) => c === 'google_ads' && p === 'google',
      observe: vi.fn().mockResolvedValue(ok({
        provider: 'google',
        channel: 'google_ads',
        externalId: mockSucceededJob.externalId!,
        observedAt: new Date().toISOString(),
        availability: 'observed',
        resourceStatus: 'PAUSED',
      })),
    };

    const registry = new PublicationProviderMonitorRegistry();
    registry.register(mockMonitor);

    const result = await observePublishedResourceStatus(
      {
        jobId: 'job-succ-1',
        organizationId: 'org-1' as any,
        actorUserId: 'user-viewer',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('viewer'),
        monitorRegistry: registry,
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.persistence?.changeKind).toBe('same');
      expect(result.value.persistence?.inserted).toBe(false);
    }
  });

  it('rejects cross-tenant access if job is not found for organization', async () => {
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(null)),
    } as unknown as CampaignPublicationRepository;

    const result = await observePublishedResourceStatus(
      {
        jobId: 'job-succ-1',
        organizationId: 'org-other' as any,
        actorUserId: 'user-1',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('viewer'),
        monitorRegistry: new PublicationProviderMonitorRegistry(),
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('rejects observation if job status is NOT succeeded (e.g. unknown_outcome or failed)', async () => {
    const failedJob = { ...mockSucceededJob, status: 'failed', attempts: [] };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(failedJob)),
    } as unknown as CampaignPublicationRepository;

    const result = await observePublishedResourceStatus(
      {
        jobId: 'job-succ-1',
        organizationId: 'org-1' as any,
        actorUserId: 'user-1',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('viewer'),
        monitorRegistry: new PublicationProviderMonitorRegistry(),
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('IMMUTABLE GUARANTEE: observation result NEVER mutates DB publication job status', async () => {
    const jobWithAttempts = { ...mockSucceededJob, attempts: [] };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(jobWithAttempts)),
      recordProviderObservation: vi.fn().mockResolvedValue(ok({
        inserted: true,
        observationId: 'obs-removed',
        changeKind: 'change',
        observedAt: new Date(),
      })),
      reconcileJob: vi.fn(), // Should NEVER be called
    } as unknown as CampaignPublicationRepository;

    const mockMonitor: PublicationProviderMonitorPort = {
      supports: (c, p) => c === 'google_ads' && p === 'google',
      observe: vi.fn().mockResolvedValue(ok({
        provider: 'google',
        channel: 'google_ads',
        externalId: mockSucceededJob.externalId!,
        observedAt: new Date().toISOString(),
        availability: 'observed',
        resourceStatus: 'REMOVED',
        primaryStatus: 'REMOVED',
      })),
    };

    const registry = new PublicationProviderMonitorRegistry();
    registry.register(mockMonitor);

    const result = await observePublishedResourceStatus(
      {
        jobId: 'job-succ-1',
        organizationId: 'org-1' as any,
        actorUserId: 'user-1',
      },
      {
        publicationRepository: pubRepo,
        organizationRepository: makeOrgRepo('viewer'),
        monitorRegistry: registry,
        logger: makeLogger(),
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.job.status).toBe('succeeded');
      expect(result.value.observation.resourceStatus).toBe('REMOVED');
      expect(result.value.persistence?.changeKind).toBe('change');
    }

    expect(pubRepo.reconcileJob).not.toHaveBeenCalled();
  });
});
