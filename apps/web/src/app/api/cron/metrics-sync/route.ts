/**
 * /api/cron/metrics-sync/route.ts — Worker Cron Runtime de Sincronización de Métricas (Phase 9B.4)
 *
 * Scannea targets de métricas vencidos de forma multi-tenant y ejecuta la sincronización
 * mediante `executeMetricsSyncBatch` de manera acotada, aislada y determinística.
 *
 * AUTORIZACIÓN:
 *   Requiere header `Authorization: Bearer <CRON_SECRET>`, `x-bop-cron-secret: <CRON_SECRET>`
 *   o `x-vercel-cron: <CRON_SECRET>`.
 *   Verificación mediante tiempo constante (timingSafeCompare) para mitigar ataques de tiempo.
 *
 * REGLAS DE SEGURIDAD Y CONCURRENCIA:
 *   - `CRON_SECRET` es server-only.
 *   - Solo usa `createMetricsSchedulingWorkerComposition` (service_role).
 *   - Reclamo atómico por target mediante la RPC `claim_due_metrics_sync_target`.
 *   - Los fallos de un target no abortan el batch.
 */

import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { createMetricsSchedulingWorkerComposition } from '@/lib/composition/metrics-scheduling.composition';

function requireCronSecret(): string {
  const secret = process.env['CRON_SECRET'];
  if (!secret || secret.trim().length === 0) {
    throw new Error('[cron/metrics-sync] CRON_SECRET is not configured');
  }
  return secret.trim();
}

function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyCronAuthorization(request: Request): boolean {
  let expectedSecret: string;
  try {
    expectedSecret = requireCronSecret();
  } catch {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-bop-cron-secret');
  const vercelCronHeader = request.headers.get('x-vercel-cron');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (timingSafeCompare(token, expectedSecret)) return true;
  }

  if (cronHeader && timingSafeCompare(cronHeader.trim(), expectedSecret)) {
    return true;
  }

  if (vercelCronHeader && timingSafeCompare(vercelCronHeader.trim(), expectedSecret)) {
    return true;
  }

  return false;
}

async function handleMetricsSyncCron(request: NextRequest): Promise<Response> {
  if (!verifyCronAuthorization(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const rawBatch = searchParams.get('batchSize');
  const parsedBatch = rawBatch ? parseInt(rawBatch, 10) : 25;
  const batchSize = isNaN(parsedBatch) ? 25 : Math.min(Math.max(1, parsedBatch), 50);

  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch {
    console.error('[cron/metrics-sync] Failed to create admin client');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const composition = createMetricsSchedulingWorkerComposition(adminClient);

  const batchResult = await composition.useCases.executeMetricsSyncBatch({
    batchSize,
  });

  if (!batchResult.success) {
    console.error('[cron/metrics-sync] Batch execution failed', batchResult.error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }

  const summary = batchResult.value;

  return NextResponse.json(
    {
      ok: true,
      invocationId: summary.invocationId,
      startedAt: summary.startedAt,
      finishedAt: summary.finishedAt,
      durationMs: summary.durationMs,
      discovered: summary.discovered,
      claimed: summary.claimed,
      succeeded: summary.succeeded,
      failed: summary.failed,
      skipped: summary.skipped,
      deferred: summary.deferred,
      recordsFetched: summary.recordsFetched,
      recordsSaved: summary.recordsSaved,
    },
    { status: 200 },
  );
}

export async function GET(request: NextRequest): Promise<Response> {
  return handleMetricsSyncCron(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleMetricsSyncCron(request);
}
