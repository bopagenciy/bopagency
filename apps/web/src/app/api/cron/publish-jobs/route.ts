/**
 * POST /api/cron/publish-jobs — Worker Cron de Publicación (Phase 8B.3)
 *
 * Scannea jobs de publicación en estado `queued` de forma multi-tenant y ejecuta
 * `dispatchPublicationJob` para cada uno de manera acotada y determinística.
 *
 * AUTORIZACIÓN:
 *   Requiere header `Authorization: Bearer <CRON_SECRET>` o `x-bop-cron-secret: <CRON_SECRET>`.
 *
 * REGLAS DE SEGURIDAD Y CONCURRENCIA:
 *   - `CRON_SECRET` es server-only.
 *   - Solo usa `createPublicationWorkerComposition` (service_role).
 *   - `batchSize` acotado (min 1, max 50, default 10).
 *   - La RPC `claim_publication_job` garantiza reclamo atómico por job.
 *   - Si un worker concurrente ya reclamó un job, `dispatchPublicationJob` falla con
 *     `CONFLICT` y la ruta continúa de forma limpia sin romper el batch.
 */

import type { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createPublicationWorkerComposition } from '@/lib/composition/publication.composition';
import {
  N8nPublicationTransportAdapter,
  MetaPublisherAdapter,
  MetaGraphApiClient,
  SupabaseCredentialRepository,
} from '@bop-agency/infrastructure';
import { ChannelPublisherRegistry } from '@bop-agency/application';

function requireCronSecret(): string {
  const secret = process.env['CRON_SECRET'];
  if (!secret || secret.trim().length === 0) {
    throw new Error('[cron/publish-jobs] CRON_SECRET no está configurado');
  }
  return secret.trim();
}

function verifyCronAuthorization(request: NextRequest): boolean {
  let expectedSecret: string;
  try {
    expectedSecret = requireCronSecret();
  } catch {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-bop-cron-secret');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token === expectedSecret) return true;
  }

  if (cronHeader && cronHeader.trim() === expectedSecret) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!verifyCronAuthorization(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const rawBatch = searchParams.get('batchSize');
  const parsedBatch = rawBatch ? parseInt(rawBatch, 10) : 10;
  const batchSize = isNaN(parsedBatch) ? 10 : Math.min(Math.max(1, parsedBatch), 50);

  let adminClient: ReturnType<typeof createAdminClient>;
  try {
    adminClient = createAdminClient();
  } catch {
    console.error('[cron/publish-jobs] Failed to create admin client');
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }

  // Registrar adapters de publicación: MetaPublisherAdapter para facebook_organic/instagram_organic + meta
  const credentialRepo = new SupabaseCredentialRepository(adminClient);
  const metaApiClient = new MetaGraphApiClient();

  const checkpointRpc = async (
    attemptId: string,
    organizationId: string,
    stage: 'container_created' | 'publish_requested',
    containerCreationId: string,
  ) => {
    const rpcClient = adminClient as unknown as {
      rpc: (
        fnName: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: { success?: boolean } | null }>;
    };
    const { data } = await rpcClient.rpc('record_publication_attempt_checkpoint', {
      p_attempt_id: attemptId,
      p_organization_id: organizationId,
      p_stage: stage,
      p_container_creation_id: containerCreationId,
    });
    return Boolean(data?.success);
  };

  const metaAdapter = new MetaPublisherAdapter(
    credentialRepo,
    metaApiClient,
    undefined,
    checkpointRpc,
  );
  const n8nAdapter = new N8nPublicationTransportAdapter();
  const registry = new ChannelPublisherRegistry([metaAdapter, n8nAdapter]);

  const workerComp = createPublicationWorkerComposition(adminClient, {
    registry,
    workerId: 'cron-worker-01',
  });

  const listResult = await workerComp.useCases.listDispatchablePublicationJobs({ batchSize });
  if (!listResult.success) {
    console.error('[cron/publish-jobs] Error listing dispatchable jobs', listResult.error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }

  const jobs = listResult.value;
  let claimedCount = 0;
  let processedCount = 0;

  for (const job of jobs) {
    processedCount++;
    const dispatchResult = await workerComp.useCases.dispatchPublicationJob({
      jobId: job.id,
      organizationId: job.organizationId,
    });

    if (dispatchResult.success) {
      claimedCount++;
    } else if (dispatchResult.error.code === 'CONFLICT') {
      // Reclamado por otro worker concurrente — comportamiento benigno y esperado
      console.warn(`[cron/publish-jobs] Job ${job.id} already claimed by concurrent worker.`);
    } else {
      console.warn(`[cron/publish-jobs] Dispatch failed for job ${job.id}`, dispatchResult.error);
    }
  }

  return Response.json(
    {
      ok: true,
      batchSize,
      jobsCount: jobs.length,
      processedCount,
      claimedCount,
    },
    { status: 200 },
  );
}
