import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '../route';
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

describe('/api/cron/metrics-sync Route Final Security Audit (Phase 9B.4)', () => {
  const originalEnv = process.env;
  const cronSecret = 'test-cron-secret-9b4-final-123';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env['CRON_SECRET'] = cronSecret;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns 401 if CRON_SECRET is missing from environment (fail closed)', async () => {
    delete process.env['CRON_SECRET'];
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'GET',
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 if CRON_SECRET is empty string or whitespace', async () => {
    process.env['CRON_SECRET'] = '   ';
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'GET',
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 if Authorization header is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong Bearer secret', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'GET',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 for different-length Bearer secret without throwing (timing-safe)', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'GET',
      headers: { authorization: 'Bearer short' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('rejects legacy x-bop-cron-secret header with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'GET',
      headers: { 'x-bop-cron-secret': cronSecret },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated x-vercel-cron header with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync', {
      method: 'GET',
      headers: { 'x-vercel-cron': '1' },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 200 with batch summary for valid Authorization Bearer secret', async () => {
    mockUseCases.executeMetricsSyncBatch.mockResolvedValueOnce({
      success: true,
      value: {
        invocationId: 'inv-final-100',
        startedAt: '2026-08-30T12:00:00.000Z',
        finishedAt: '2026-08-30T12:00:01.000Z',
        durationMs: 1000,
        discovered: 1,
        claimed: 1,
        succeeded: 1,
        failed: 0,
        skipped: 0,
        deferred: 0,
        recordsFetched: 10,
        recordsSaved: 10,
      },
    });

    const req = new NextRequest('http://localhost:3000/api/cron/metrics-sync?batchSize=10', {
      method: 'GET',
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.invocationId).toBe('inv-final-100');
    expect(body.succeeded).toBe(1);
    expect(body.recordsSaved).toBe(10);
    expect(mockUseCases.executeMetricsSyncBatch).toHaveBeenCalledWith({
      principal: { type: 'system', systemId: 'metrics_scheduler' },
      batchSize: 10,
    });
  });
});
