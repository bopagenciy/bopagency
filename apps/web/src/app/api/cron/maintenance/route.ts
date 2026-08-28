/**
 * /api/cron/maintenance/route.ts — Phase 8E.
 *
 * Route Handler de mantenimiento consolidado para el sistema de publicación e integraciones.
 * Ejecuta:
 * 1. public.sweep_expired_in_progress_publication_jobs(50) — Barredor de jobs estancados en_progreso.
 * 2. public.sweep_expired_pending_oauth_connections(100) — Limpiador de tokens pending expirados/consumidos.
 *
 * Protegido mediante la cabecera Bearer CRON_SECRET.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

function verifyCronAuthorization(request: Request): boolean {
  const cronSecret = process.env['CRON_SECRET'];
  if (!cronSecret) {
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7).trim();
  return token === cronSecret.trim();
}

export async function GET(request: Request) {
  if (!verifyCronAuthorization(request)) {
    return NextResponse.json({ error: 'Unauthorized cron execution' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const rpcClient = adminClient as unknown as {
    rpc: (
      fnName: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: {
        jobs_swept?: number;
        connections_swept?: number;
      } | null;
      error: { message: string } | null;
    }>;
  };

  // 1. Barrer jobs in_progress que superaron su reconciliation_deadline_at
  const { data: jobSweepData, error: jobSweepErr } = await rpcClient.rpc(
    'sweep_expired_in_progress_publication_jobs',
    { p_batch_size: 50 },
  );

  // 2. Limpiar conexiones y tokens pending expirados o consumidos
  const { data: oauthSweepData, error: oauthSweepErr } = await rpcClient.rpc(
    'sweep_expired_pending_oauth_connections',
    { p_batch_size: 100 },
  );

  if (jobSweepErr || oauthSweepErr) {
    return NextResponse.json(
      {
        error: 'Maintenance sweep completed with errors',
        jobSweepError: jobSweepErr?.message,
        oauthSweepError: oauthSweepErr?.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    jobsSwept: jobSweepData?.jobs_swept || 0,
    connectionsSwept: oauthSweepData?.connections_swept || 0,
  });
}
