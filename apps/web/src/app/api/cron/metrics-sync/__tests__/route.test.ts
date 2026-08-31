import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET, POST } from '../route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn().mockReturnValue({}),
}));

const mockUseCases = {
  executeMetricsSyncBatch: vi.fn(),
};

vi.mock('@/lib/composition/metrics-scheduling.composition', () => ({
  createMetricsSchedulingWorkerComposition: vi.fn().mockImplementation(() => ({
    useCases: mockUseCases,
  })),
}));

describe('/api/cron/metrics-sync Route (Phase 9B.4)', () => {
  const originalEnv = process.env;
  const cronSecret = 'test-cron-secret-9b4-999';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['CRON_SECRET'] = cronSecret;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 401 if CRON_SECRET is missing from headers', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 if CRON_SECRET header mismatch', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 if CRON_SECRET environment variable is missing (fail closed)', async () => {
    delete process.env['CRON_SECRET'];
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with batch summary for valid Bearer token (POST)', async () => {
    mockUseCases.executeMetricsSyncBatch.mockResolvedValueOnce({
      success: true,
      value: {
        invocationId: 'inv-100',
        startedAt: '2026-08-30T12:00:00.000Z',
        finishedAt: '2026-08-30T12:00:01.000Z',
        durationMs: 1000,
        discovered: 2,
        claimed: 2,
        succeeded: 2,
        failed: 0,
        skipped: 0,
        deferred: 0,
        recordsFetched: 15,
        recordsSaved: 15,
      },
    });

    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync?batchSize=10', {
      method: 'POST',
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.invocationId).toBe('inv-100');
    expect(body.succeeded).toBe(2);
    expect(body.recordsSaved).toBe(15);
  });

  it('returns 200 with batch summary for valid x-bop-cron-secret header (GET)', async () => {
    mockUseCases.executeMetricsSyncBatch.mockResolvedValueOnce({
      success: true,
      value: {
        invocationId: 'inv-200',
        startedAt: '2026-08-30T12:00:00.000Z',
        finishedAt: '2026-08-30T12:00:01.000Z',
        durationMs: 500,
        discovered: 0,
        claimed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        deferred: 0,
        recordsFetched: 0,
        recordsSaved: 0,
      },
    });

    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'GET',
      headers: { 'x-bop-cron-secret': cronSecret },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.discovered).toBe(0);
  });

  it('handles partial target failures cleanly and returns 200 with failure summary', async () => {
    mockUseCases.executeMetricsSyncBatch.mockResolvedValueOnce({
      success: true,
      value: {
        invocationId: 'inv-300',
        startedAt: '2026-08-30T12:00:00.000Z',
        finishedAt: '2026-08-30T12:00:02.000Z',
        durationMs: 2000,
        discovered: 3,
        claimed: 3,
        succeeded: 2,
        failed: 1,
        skipped: 0,
        deferred: 0,
        recordsFetched: 10,
        recordsSaved: 10,
      },
    });

    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'POST',
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(1);
  });
});
