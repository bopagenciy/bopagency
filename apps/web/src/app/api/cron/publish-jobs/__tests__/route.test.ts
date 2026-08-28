import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
}));

const mockUseCases = {
  listDispatchablePublicationJobs: vi.fn(),
  dispatchPublicationJob: vi.fn(),
};

vi.mock('@/lib/composition/publication.composition', () => ({
  createPublicationWorkerComposition: vi.fn().mockImplementation(() => ({
    useCases: mockUseCases,
  })),
}));

describe('POST /api/cron/publish-jobs Route (Phase 8B.3)', () => {
  const originalEnv = process.env;
  const cronSecret = 'test-cron-secret-12345';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['CRON_SECRET'] = cronSecret;
    process.env['META_GRAPH_API_VERSION'] = 'v22.0';
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 401 if CRON_SECRET is missing from headers', async () => {
    const req = new NextRequest('http://localhost:3200/api/cron/publish-jobs', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 if CRON_SECRET header mismatch', async () => {
    const req = new NextRequest('http://localhost:3200/api/cron/publish-jobs', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('processes queued jobs for valid cron secret authorization', async () => {
    mockUseCases.listDispatchablePublicationJobs.mockResolvedValueOnce({
      success: true,
      value: [
        { id: 'job-1', organizationId: 'org-1' },
        { id: 'job-2', organizationId: 'org-2' },
      ],
    });
    mockUseCases.dispatchPublicationJob.mockResolvedValue({ success: true, value: undefined });

    const req = new NextRequest('http://localhost:3200/api/cron/publish-jobs?batchSize=5', {
      method: 'POST',
      headers: { authorization: `Bearer ${cronSecret}` },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobsCount).toBe(2);
    expect(json.claimedCount).toBe(2);
    expect(mockUseCases.dispatchPublicationJob).toHaveBeenCalledTimes(2);
  });

  it('skips job safely on CONFLICT error (claimed by another worker)', async () => {
    mockUseCases.listDispatchablePublicationJobs.mockResolvedValueOnce({
      success: true,
      value: [{ id: 'job-1', organizationId: 'org-1' }],
    });
    mockUseCases.dispatchPublicationJob.mockResolvedValueOnce({
      success: false,
      error: { code: 'CONFLICT', message: 'Job is not queued' },
    });

    const req = new NextRequest('http://localhost:3200/api/cron/publish-jobs', {
      method: 'POST',
      headers: { 'x-bop-cron-secret': cronSecret },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jobsCount).toBe(1);
    expect(json.claimedCount).toBe(0);
    expect(json.processedCount).toBe(1);
  });
});
