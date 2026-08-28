import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as publicationActions from '../publication-actions';
import {
  queuePublicationAction,
  cancelPublicationJobAction,
  retryPublicationAction,
  reconcilePublicationOutcomeAction,
  getPublicationWebhookEvidenceAction,
} from '../publication-actions';
import { requireOrganization } from '@/lib/auth/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createPublicationComposition } from '@/lib/composition/publication.composition';
import { ok, err } from '@bop-agency/shared';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  requireOrganization: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/composition/publication.composition', () => ({
  createPublicationComposition: vi.fn(),
}));

describe('Publication Server Actions Security & Authorization (Phase 8B.4)', () => {
  const org1 = '00000000-0000-4000-8000-000000000001';
  const user1 = 'user-123';
  const campaignId = 'camp-123';

  const mockUseCases = {
    queuePublication: vi.fn(),
    cancelPublicationJob: vi.fn(),
    retryPublication: vi.fn(),
    reconcilePublicationOutcome: vi.fn(),
    listPublicationWebhookEvidenceByJob: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrganization).mockResolvedValue({
      organization: { id: org1 },
      membership: { role: 'operator' },
      user: { id: user1 },
    } as unknown as Awaited<ReturnType<typeof requireOrganization>>);
    vi.mocked(createServerSupabaseClient).mockResolvedValue({} as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>);
    vi.mocked(createPublicationComposition).mockReturnValue({
      useCases: mockUseCases,
    } as unknown as ReturnType<typeof createPublicationComposition>);
  });

  it('VERIFICATION: dispatchPublicationJobAction and preparePublicationRetryAction are NOT exported', () => {
    const exportsObj = publicationActions as Record<string, unknown>;
    expect(exportsObj['dispatchPublicationJobAction']).toBeUndefined();
    expect(exportsObj['preparePublicationRetryAction']).toBeUndefined();
  });

  it('unauthenticated request rejects cleanly with error message', async () => {
    vi.mocked(requireOrganization).mockRejectedValueOnce(new Error('Unauthorized session'));

    const result = await queuePublicationAction({ targetId: 'target-1', campaignId });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('Unauthorized session');
  });

  it('queuePublicationAction derives org and actor from server session', async () => {
    mockUseCases.queuePublication.mockResolvedValueOnce(ok({ id: 'job-1' }));

    const result = await queuePublicationAction({ targetId: 'target-1', campaignId });
    expect(result.success).toBe(true);

    expect(mockUseCases.queuePublication).toHaveBeenCalledWith({
      targetId: 'target-1',
      organizationId: org1,
      actorUserId: user1,
    });
  });

  it('cancelPublicationJobAction invokes cancel publication use case with session data', async () => {
    mockUseCases.cancelPublicationJob.mockResolvedValueOnce(ok({ id: 'job-1' }));

    const result = await cancelPublicationJobAction({ jobId: 'job-1', campaignId, note: 'Cancel note' });
    expect(result.success).toBe(true);

    expect(mockUseCases.cancelPublicationJob).toHaveBeenCalledWith({
      jobId: 'job-1',
      organizationId: org1,
      actorUserId: user1,
      reason: 'Cancel note',
    });
  });

  it('retryPublicationAction calls composite retry use case', async () => {
    mockUseCases.retryPublication.mockResolvedValueOnce(ok({ id: 'job-2' }));

    const result = await retryPublicationAction({ jobId: 'job-1', campaignId, note: 'Retry reason' });
    expect(result.success).toBe(true);

    expect(mockUseCases.retryPublication).toHaveBeenCalledWith({
      jobId: 'job-1',
      organizationId: org1,
      actorUserId: user1,
      note: 'Retry reason',
    });
  });

  it('reconcilePublicationOutcomeAction calls reconcile use case with mapped outcome', async () => {
    mockUseCases.reconcilePublicationOutcome.mockResolvedValueOnce(ok({ id: 'job-1' }));

    const result = await reconcilePublicationOutcomeAction({
      jobId: 'job-1',
      campaignId,
      outcome: 'published',
      note: 'Verified in Meta Ads Manager dashboard',
      externalId: 'meta-ad-999',
    });
    expect(result.success).toBe(true);

    expect(mockUseCases.reconcilePublicationOutcome).toHaveBeenCalledWith({
      jobId: 'job-1',
      organizationId: org1,
      actorUserId: user1,
      outcome: 'published',
      externalId: 'meta-ad-999',
      externalUrl: null,
      note: 'Verified in Meta Ads Manager dashboard',
    });
  });

  it('getPublicationWebhookEvidenceAction returns sanitized evidence data', async () => {
    const mockEvidence = [
      {
        id: 'wh-1',
        provider: 'meta' as const,
        externalEventId: 'evt-1',
        payloadHash: 'hash123',
        status: 'processed' as const,
        errorCode: null,
        receivedAt: new Date(),
      },
    ];
    mockUseCases.listPublicationWebhookEvidenceByJob.mockResolvedValueOnce(ok(mockEvidence));

    const result = await getPublicationWebhookEvidenceAction({ jobId: 'job-1' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const firstItem = result.data[0];
    expect(firstItem?.id).toBe('wh-1');
  });

  it('returns structured domain error when use case fails', async () => {
    mockUseCases.queuePublication.mockResolvedValueOnce(
      err({ code: 'INSUFFICIENT_ROLE', message: 'Rol insuficiente' }),
    );

    const result = await queuePublicationAction({ targetId: 'target-1', campaignId });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('Rol insuficiente');
  });
});
