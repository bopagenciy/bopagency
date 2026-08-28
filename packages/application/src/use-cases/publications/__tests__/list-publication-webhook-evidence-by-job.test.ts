import { describe, it, expect, vi } from 'vitest';
import { listPublicationWebhookEvidenceByJob } from '../list-publication-webhook-evidence-by-job.use-case';
import type {
  CampaignPublicationRepository,
  OrganizationRepository,
  CampaignPublicationWebhookEvent,
} from '@bop-agency/domain';
import {
  campaignPublicationJobId,
  organizationId,
  campaignPublicationWebhookEventId,
} from '@bop-agency/domain';
import { ok, err } from '@bop-agency/shared';

describe('listPublicationWebhookEvidenceByJob Use Case (Phase 8B.4)', () => {
  const org1 = organizationId('00000000-0000-4000-8000-000000000001');
  const jobId1 = '11111111-1111-4000-8000-111111111111';

  function makeMockOrgRepo(isMember = true): OrganizationRepository {
    return {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMembers: vi.fn(),
      findMember: vi.fn().mockResolvedValue(
        isMember ? ok({ organizationId: org1, userId: 'user-1', role: 'viewer' }) : err({ code: 'NOT_FOUND', message: 'Not member' }),
      ),
      addMember: vi.fn(),
      updateMemberRole: vi.fn(),
      removeMember: vi.fn(),
      findInvitations: vi.fn(),
      findInvitationByToken: vi.fn(),
      createInvitation: vi.fn(),
      acceptInvitation: vi.fn(),
      cancelInvitation: vi.fn(),
    };
  }

  function makeMockPubRepo(events: CampaignPublicationWebhookEvent[] = []): CampaignPublicationRepository {
    return {
      findJobById: vi.fn(),
      findJobWithAttempts: vi.fn(),
      findActiveJobByTarget: vi.fn(),
      listJobsByActivation: vi.fn(),
      listJobsByTarget: vi.fn(),
      listDispatchableJobs: vi.fn(),
      findWebhookEventByProviderAndExternalId: vi.fn(),
      listWebhookEventsByJob: vi.fn().mockResolvedValue(ok(events)),
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
      recordProviderObservation: vi.fn(),
    };
  }

  it('returns NOT_ORGANIZATION_MEMBER if actor is not an organization member', async () => {
    const orgRepo = makeMockOrgRepo(false);
    const pubRepo = makeMockPubRepo();

    const result = await listPublicationWebhookEvidenceByJob(
      { jobId: jobId1, organizationId: org1, actorUserId: 'user-unknown' },
      { publicationRepository: pubRepo, organizationRepository: orgRepo },
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('FORBIDDEN');
  });

  it('returns sanitized evidence records scoped to requested job in deterministic order', async () => {
    const orgRepo = makeMockOrgRepo(true);
    const date1 = new Date('2026-08-27T10:00:00Z');
    const mockEvents: CampaignPublicationWebhookEvent[] = [
      {
        id: campaignPublicationWebhookEventId('wh-1'),
        organizationId: org1,
        provider: 'meta',
        externalEventId: 'ext-evt-1',
        payloadHash: 'hash-64-chars-1234567890abcdef1234567890abcdef1234567890abcdef12345',
        status: 'processed',
        jobId: campaignPublicationJobId(jobId1),
        attemptId: null,
        errorCode: null,
        receivedAt: date1,
        processedAt: date1,
        createdAt: date1,
      },
    ];
    const pubRepo = makeMockPubRepo(mockEvents);

    const result = await listPublicationWebhookEvidenceByJob(
      { jobId: jobId1, organizationId: org1, actorUserId: 'user-viewer' },
      { publicationRepository: pubRepo, organizationRepository: orgRepo },
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.value.length).toBe(1);
    const item = result.value[0];
    expect(item?.id).toBe('wh-1');
    expect(item?.provider).toBe('meta');
    expect(item?.externalEventId).toBe('ext-evt-1');
    expect(item?.payloadHash).toBe('hash-64-chars-1234567890abcdef1234567890abcdef1234567890abcdef12345');
    expect(item?.status).toBe('processed');
    expect(item?.receivedAt).toEqual(date1);

    // Verify raw secret/payload is NOT present on sanitized item
    expect((item as unknown as Record<string, unknown>)['payload']).toBeUndefined();
    expect((item as unknown as Record<string, unknown>)['secretToken']).toBeUndefined();

    expect(pubRepo.listWebhookEventsByJob).toHaveBeenCalledWith(
      campaignPublicationJobId(jobId1),
      org1,
    );
  });
});
