import { describe, it, expect, vi } from 'vitest';
import { listDispatchablePublicationJobs } from '../list-dispatchable-publication-jobs.use-case';
import { processPublicationWebhookEvidence } from '../process-publication-webhook-evidence.use-case';
import type { CampaignPublicationRepository, CampaignPublicationJob } from '@bop-agency/domain';
import {
  campaignPublicationJobId,
  organizationId,
  campaignActivationId,
  campaignActivationTargetId,
} from '@bop-agency/domain';
import type { ClientId, PublicationIdempotencyKey } from '@bop-agency/domain';
import { ok } from '@bop-agency/shared';

describe('Phase 8B.3 Worker & Webhook Evidence Use Cases', () => {
  const org1 = organizationId('00000000-0000-4000-8000-000000000001');

  function makeMockRepo(overrides?: Partial<CampaignPublicationRepository>): CampaignPublicationRepository {
    return {
      findJobById: vi.fn(),
      findJobWithAttempts: vi.fn(),
      findActiveJobByTarget: vi.fn(),
      listJobsByActivation: vi.fn(),
      listJobsByTarget: vi.fn(),
      listDispatchableJobs: vi.fn().mockResolvedValue(ok([])),
      findWebhookEventByProviderAndExternalId: vi.fn().mockResolvedValue(ok(null)),
      listWebhookEventsByJob: vi.fn().mockResolvedValue(ok([])),
      createJob: vi.fn(),
      claimJob: vi.fn(),
      startJob: vi.fn(),
      createAttempt: vi.fn(),
      recordSuccess: vi.fn(),
      recordFailure: vi.fn(),
      recordUnknownOutcome: vi.fn(),
      cancelJob: vi.fn(),
      reconcileJob: vi.fn(),
      prepareRetry: vi.fn(),
      listEvents: vi.fn(),
      appendEvent: vi.fn(),
      recordWebhookReceipt: vi.fn(),
      markWebhookEventProcessed: vi.fn(),
      ...overrides,
    };
  }

  describe('listDispatchablePublicationJobs', () => {
    it('enforces default batchSize of 10 and upper bound of 50', async () => {
      const repo = makeMockRepo();
      await listDispatchablePublicationJobs({}, { publicationRepository: repo });
      expect(repo.listDispatchableJobs).toHaveBeenCalledWith(10);

      await listDispatchablePublicationJobs({ batchSize: 100 }, { publicationRepository: repo });
      expect(repo.listDispatchableJobs).toHaveBeenCalledWith(50);

      await listDispatchablePublicationJobs({ batchSize: -5 }, { publicationRepository: repo });
      expect(repo.listDispatchableJobs).toHaveBeenCalledWith(1);
    });
  });

  describe('processPublicationWebhookEvidence', () => {
    const jobId1 = campaignPublicationJobId('11111111-1111-4000-8000-111111111111');

    function makeJob(status: 'queued' | 'claimed' | 'in_progress' | 'succeeded' | 'failed' | 'cancelled' | 'unknown_outcome'): CampaignPublicationJob {
      return {
        id: jobId1,
        organizationId: org1,
        clientId: '00000000-0000-4000-8000-000000000002' as ClientId,
        activationId: campaignActivationId('00000000-0000-4000-8000-000000000003'),
        targetId: campaignActivationTargetId('00000000-0000-4000-8000-000000000004'),
        channel: 'meta_ads',
        provider: 'meta',
        clientIntegrationId: null,
        status,
        idempotencyKey: 'idemp-1' as PublicationIdempotencyKey,
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
    }

    it('returns EVIDENCE_RECORDED for in_progress job and NEVER mutates outcome', async () => {
      const repo = makeMockRepo({
        findJobById: vi.fn().mockResolvedValue(ok(makeJob('in_progress'))),
      });

      const result = await processPublicationWebhookEvidence(
        {
          jobId: jobId1,
          organizationId: org1,
          provider: 'meta',
          externalEventId: 'evt-1',
          outcome: 'succeeded',
        },
        { publicationRepository: repo },
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.status).toBe('EVIDENCE_RECORDED');
      expect(repo.recordSuccess).not.toHaveBeenCalled();
      expect(repo.recordFailure).not.toHaveBeenCalled();
      expect(repo.recordUnknownOutcome).not.toHaveBeenCalled();
    });

    it('returns JOB_ALREADY_CLOSED for terminal jobs without outcome mutation', async () => {
      const repo = makeMockRepo({
        findJobById: vi.fn().mockResolvedValue(ok(makeJob('succeeded'))),
      });

      const result = await processPublicationWebhookEvidence(
        {
          jobId: jobId1,
          organizationId: org1,
          provider: 'meta',
          externalEventId: 'evt-1',
        },
        { publicationRepository: repo },
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.status).toBe('JOB_ALREADY_CLOSED');
      expect(repo.recordSuccess).not.toHaveBeenCalled();
    });

    it('returns REQUIRES_RECONCILIATION for unknown_outcome jobs without auto-reconciliation', async () => {
      const repo = makeMockRepo({
        findJobById: vi.fn().mockResolvedValue(ok(makeJob('unknown_outcome'))),
      });

      const result = await processPublicationWebhookEvidence(
        {
          jobId: jobId1,
          organizationId: org1,
          provider: 'meta',
          externalEventId: 'evt-1',
        },
        { publicationRepository: repo },
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.status).toBe('REQUIRES_RECONCILIATION');
      expect(repo.reconcileJob).not.toHaveBeenCalled();
    });

    it('returns JOB_NOT_FOUND when job does not exist', async () => {
      const repo = makeMockRepo({
        findJobById: vi.fn().mockResolvedValue(ok(null)),
      });

      const result = await processPublicationWebhookEvidence(
        {
          jobId: jobId1,
          organizationId: org1,
          provider: 'meta',
          externalEventId: 'evt-1',
        },
        { publicationRepository: repo },
      );

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.value.status).toBe('JOB_NOT_FOUND');
    });
  });
});
