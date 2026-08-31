/**
 * /api/cron/metrics-sync/route.ts — Worker Cron Runtime de Sincronización de Métricas (Phase 9B.4 Final)
 *
 * Scannea targets de métricas vencidos de forma multi-tenant y ejecuta la sincronización
 * mediante `executeMetricsSyncBatch` de manera acotada, aislada y determinística.
 *
 * AUTORIZACIÓN VERCEL CRON OFICIAL:
 *   Requiere exclusivamente header `Authorization: Bearer <CRON_SECRET>`.
 *   Verificación mediante tiempo constante (`crypto.timingSafeEqual`) para mitigar ataques de tiempo.
 *   Falla cerrado (`401 Unauthorized`) si la variable `CRON_SECRET` no está configurada o no coincide.
 *
 * CONFIGURACIÓN DE RUNTIME VERCEL:
 *   - `export const maxDuration = 30;` (Límite máximo de función en Vercel).
 *   - Límite interno de aplicación `DEFAULT_RUNTIME_DEADLINE_MS = 20000` (20s) para asegurar
 *     un margen de seguridad de 10s antes de la terminación de la función por parte de Vercel.
 *   - Método HTTP soportado: EXCLUSIVAMENTE `GET` (invocado nativamente por Vercel Cron).
 */

import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { createMetricsSchedulingWorkerComposition } from '@/lib/composition/metrics-scheduling.composition';

export const maxDuration = 30;

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
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (timingSafeCompare(token, expectedSecret)) {
      return true;
    }
  }

  return false;
}

export async function GET(request: NextRequest): Promise<Response> {
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
    principal: { type: 'system', systemId: 'metrics_scheduler' },
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
