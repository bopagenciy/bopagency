import { describe, it, expect, vi, beforeEach } from 'vitest';
import { observePublishedResourceStatus } from '../observe-published-resource-status.use-case';
import {
  PublicationProviderMonitorRegistry,
  type PublicationProviderMonitorPort,
} from '../../../ports/publication-provider-monitor.port';
import { ok, err, type ActivationChannel } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationRepository,
  OrganizationRepository,
  OrganizationId,
  ClientId,
  CampaignActivationId,
  CampaignActivationTargetId,
  CampaignPublicationJobId,
  ClientIntegrationId,
  PublicationIdempotencyKey,
} from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeOrgRepo(role = 'viewer'): OrganizationRepository {
  return {
    findMember: vi.fn().mockResolvedValue(ok({ role })),
  } as unknown as OrganizationRepository;
}

describe('observePublishedResourceStatus Use Case (Phase 8G.1)', () => {
  const defaultExternalId = 'customers/1234567890/campaigns/9876543210';

  const mockSucceededJob: CampaignPublicationJob = {
    id: 'job-1' as unknown as CampaignPublicationJobId,
    organizationId: 'org-1' as unknown as OrganizationId,
    clientId: 'client-1' as unknown as ClientId,
    activationId: 'act-1' as unknown as CampaignActivationId,
    targetId: 'target-1' as unknown as CampaignActivationTargetId,
    channel: 'google_ads',
    provider: 'google',
    clientIntegrationId: 'integ-1' as unknown as ClientIntegrationId,
    status: 'succeeded',
    idempotencyKey: 'idemp-1' as unknown as PublicationIdempotencyKey,
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
    metadata: {},
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAttempt = {
    id: 'att-1',
    jobId: 'job-1',
    externalId: defaultExternalId,
    externalUrl: null,
    status: 'succeeded',
    attemptNumber: 1,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('allows any organization member (e.g. viewer) to observe status and orchestrates atomic persistence', async () => {
    const jobWithAttempts = { ...mockSucceededJob, attempts: [mockAttempt] };
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
        externalId: defaultExternalId,
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

    const res = await observePublishedResourceStatus({
      jobId: 'job-1',
      organizationId: 'org-1' as unknown as OrganizationId,
      actorUserId: 'user-viewer',
    }, {
      publicationRepository: pubRepo,
      organizationRepository: makeOrgRepo('viewer'),
      monitorRegistry: registry,
      logger: makeLogger(),
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.value.observation.availability).toBe('observed');
    expect(res.value.observation.resourceStatus).toBe('PAUSED');
    expect(pubRepo.recordProviderObservation).toHaveBeenCalledWith(expect.objectContaining({
      jobId: 'job-1',
      organizationId: 'org-1',
      externalId: defaultExternalId,
      availability: 'observed',
      resourceStatus: 'PAUSED',
    }));
  });

  it('fails if job is not found', async () => {
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(null)),
    } as unknown as CampaignPublicationRepository;

    const res = await observePublishedResourceStatus({
      jobId: 'job-missing',
      organizationId: 'org-1' as unknown as OrganizationId,
      actorUserId: 'user-1',
    }, {
      publicationRepository: pubRepo,
      organizationRepository: makeOrgRepo('operator'),
      monitorRegistry: new PublicationProviderMonitorRegistry(),
      logger: makeLogger(),
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe('NOT_FOUND');
  });

  it('fails if job status is not succeeded', async () => {
    const nonSucceededJob = { ...mockSucceededJob, status: 'in_progress', attempts: [mockAttempt] };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(nonSucceededJob)),
    } as unknown as CampaignPublicationRepository;

    const res = await observePublishedResourceStatus({
      jobId: 'job-1',
      organizationId: 'org-1' as unknown as OrganizationId,
      actorUserId: 'user-1',
    }, {
      publicationRepository: pubRepo,
      organizationRepository: makeOrgRepo('operator'),
      monitorRegistry: new PublicationProviderMonitorRegistry(),
      logger: makeLogger(),
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe('VALIDATION_ERROR');
    expect(res.error.message).toContain('succeeded');
  });

  it('fails safely with VALIDATION_ERROR when succeeded job has no attempt externalId', async () => {
    const jobWithoutExternalId = { ...mockSucceededJob, attempts: [] };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(jobWithoutExternalId)),
    } as unknown as CampaignPublicationRepository;

    const res = await observePublishedResourceStatus({
      jobId: 'job-1',
      organizationId: 'org-1' as unknown as OrganizationId,
      actorUserId: 'user-1',
    }, {
      publicationRepository: pubRepo,
      organizationRepository: makeOrgRepo('operator'),
      monitorRegistry: new PublicationProviderMonitorRegistry(),
      logger: makeLogger(),
    });

    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.code).toBe('VALIDATION_ERROR');
    expect(res.error.message).toContain('lacks externalId');
  });

  it('returns unavailable observation when no monitor is registered for channel/provider', async () => {
    const jobWithAttempts = { ...mockSucceededJob, channel: 'custom_channel' as unknown as ActivationChannel, attempts: [mockAttempt] };
    const pubRepo = {
      findJobWithAttempts: vi.fn().mockResolvedValue(ok(jobWithAttempts)),
      recordProviderObservation: vi.fn().mockResolvedValue(ok({
        inserted: true,
        observationId: 'obs-2',
        changeKind: 'first',
        observedAt: new Date(),
      })),
    } as unknown as CampaignPublicationRepository;

    const res = await observePublishedResourceStatus({
      jobId: 'job-1',
      organizationId: 'org-1' as unknown as OrganizationId,
      actorUserId: 'user-1',
    }, {
      publicationRepository: pubRepo,
      organizationRepository: makeOrgRepo('operator'),
      monitorRegistry: new PublicationProviderMonitorRegistry(),
      logger: makeLogger(),
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.value.observation.availability).toBe('unavailable');
    expect(res.value.observation.unavailabilityReason).toBe('CHANNEL_NOT_CONFIGURED');
  });

  it('returns error if user is not member of organization', async () => {
    const orgRepo = {
      findMember: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND', message: 'Not member' })),
    } as unknown as OrganizationRepository;

    const res = await observePublishedResourceStatus({
      jobId: 'job-1',
      organizationId: 'org-1' as unknown as OrganizationId,
      actorUserId: 'user-stranger',
    }, {
      publicationRepository: {} as unknown as CampaignPublicationRepository,
      organizationRepository: orgRepo,
      monitorRegistry: new PublicationProviderMonitorRegistry(),
      logger: makeLogger(),
    });

    expect(res.success).toBe(false);
  });
});
