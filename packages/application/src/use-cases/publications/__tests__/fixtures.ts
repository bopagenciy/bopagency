/**
 * Fixtures compartidas para los tests de use cases de publicación (8B.2).
 * NO es un archivo de test en sí (sin `describe`/`it`) — solo factories.
 */

import { vi } from 'vitest';
import { ok } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationJobId,
  CampaignPublicationAttempt,
  CampaignPublicationAttemptId,
  CampaignPublicationRepository,
  OrganizationId,
  OrganizationMember,
  OrganizationRole,
  ClientId,
  CampaignActivationId,
  CampaignActivationTargetId,
  OrganizationRepository,
} from '@bop-agency/domain';
import { buildPublicationIdempotencyKey } from '@bop-agency/domain';

export const ORG_ID = '11111111-1111-1111-1111-111111111111' as OrganizationId;
export const CLIENT_ID = '22222222-2222-2222-2222-222222222222' as ClientId;
export const ACTIVATION_ID = '33333333-3333-3333-3333-333333333333' as CampaignActivationId;
export const TARGET_ID = '44444444-4444-4444-4444-444444444444' as CampaignActivationTargetId;
export const JOB_ID = '55555555-5555-5555-5555-555555555555' as CampaignPublicationJobId;
export const ATTEMPT_ID = '66666666-6666-6666-6666-666666666666' as CampaignPublicationAttemptId;
export const ACTOR_ID = '77777777-7777-7777-7777-777777777777';
export const OTHER_ORG_ID = '99999999-9999-9999-9999-999999999999' as OrganizationId;

export function makeMember(role: OrganizationRole): OrganizationMember {
  return {
    id: 'member-1',
    organizationId: ORG_ID,
    userId: ACTOR_ID,
    role,
    status: 'active',
    invitedBy: null,
    joinedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

export function makeJob(overrides: Partial<CampaignPublicationJob> = {}): CampaignPublicationJob {
  return {
    id: JOB_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    activationId: ACTIVATION_ID,
    targetId: TARGET_ID,
    channel: 'meta_ads',
    provider: 'meta',
    clientIntegrationId: 'integration-1',
    status: 'queued',
    idempotencyKey: buildPublicationIdempotencyKey(ORG_ID, TARGET_ID, 0),
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
    createdBy: ACTOR_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export function makeAttempt(overrides: Partial<CampaignPublicationAttempt> = {}): CampaignPublicationAttempt {
  return {
    id: ATTEMPT_ID,
    jobId: JOB_ID,
    organizationId: ORG_ID,
    attemptNumber: 1,
    idempotencyKey: String(buildPublicationIdempotencyKey(ORG_ID, TARGET_ID, 0)),
    externalId: null,
    externalUrl: null,
    providerStatus: null,
    providerErrorCode: null,
    httpStatus: null,
    outcome: null,
    durationMs: null,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Mock completo de CampaignPublicationRepository — todos los métodos son vi.fn(). */
export function makePublicationRepo(
  overrides: Partial<CampaignPublicationRepository> = {},
): CampaignPublicationRepository {
  return {
    findJobById: vi.fn().mockResolvedValue(ok(makeJob())),
    findJobWithAttempts: vi.fn().mockResolvedValue(ok({ ...makeJob(), attempts: [] })),
    findActiveJobByTarget: vi.fn().mockResolvedValue(ok(null)),
    listJobsByActivation: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    listJobsByTarget: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    createJob: vi.fn().mockResolvedValue(ok(makeJob())),
    claimJob: vi.fn().mockResolvedValue(ok(makeJob({ status: 'claimed', claimedAt: new Date(), claimedByWorker: 'worker-1' }))),
    startJob: vi.fn().mockResolvedValue(ok(makeJob({ status: 'in_progress', startedAt: new Date() }))),
    createAttempt: vi.fn().mockResolvedValue(ok(makeAttempt())),
    recordSuccess: vi.fn().mockResolvedValue(ok(makeJob({ status: 'succeeded', completedAt: new Date() }))),
    recordFailure: vi.fn().mockResolvedValue(ok(makeJob({ status: 'failed', completedAt: new Date(), failureCategory: 'PROVIDER_REJECTED' }))),
    recordUnknownOutcome: vi.fn().mockResolvedValue(ok(makeJob({ status: 'unknown_outcome' }))),
    cancelJob: vi.fn().mockResolvedValue(ok(makeJob({ status: 'cancelled', completedAt: new Date() }))),
    reconcileJob: vi.fn().mockResolvedValue(ok(makeJob({ status: 'succeeded' }))),
    prepareRetry: vi.fn().mockResolvedValue(ok(TARGET_ID)),
    listEvents: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
    appendEvent: vi.fn().mockResolvedValue(ok('event-1')),
    recordWebhookReceipt: vi.fn().mockResolvedValue(ok({ webhookEventId: 'wh-1', isNew: true })),
    markWebhookEventProcessed: vi.fn().mockResolvedValue(ok(undefined)),
    ...overrides,
  } as unknown as CampaignPublicationRepository;
}

export function makeOrganizationRepo(role: OrganizationRole) {
  return {
    findMember: vi.fn().mockResolvedValue(ok(makeMember(role))),
  } as unknown as OrganizationRepository;
}

export const testLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
