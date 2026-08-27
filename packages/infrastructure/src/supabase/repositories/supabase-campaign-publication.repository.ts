/**
 * SupabaseCampaignPublicationRepository
 *
 * Implementacion de CampaignPublicationRepository (aggregate unico) respaldada
 * por Supabase - Phase 8B.1. Todas las lecturas usan el cliente del usuario
 * (RLS activo). Las escrituras invocan EXCLUSIVAMENTE las RPCs SECURITY
 * DEFINER de 20260825120000_phase8b1_publication_domain_persistence.sql -
 * nunca INSERT/UPDATE directo (mismo criterio que
 * SupabaseCampaignActivationRepository, 8A.1).
 *
 * Las RPCs `authenticated` (create/cancel/reconcile) derivan el actor de
 * auth.uid() en BD - el parametro `actorUserId` se mantiene por conformidad
 * con el contrato de dominio pero no se envia a las RPCs. Las RPCs
 * `service_role` (claim, start, record attempt, mark succeeded/failed/unknown) requieren un cliente Supabase
 * construido con la service role key - este repositorio no construye ese
 * cliente por si mismo, solo invoca `rpc()` sobre el cliente que recibe en
 * el constructor (la composicion server-side decide que cliente inyectar,
 * mismo patron que el resto de infra).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationJobId,
  CreatePublicationJobInput,
  CampaignPublicationRepository,
  CampaignPublicationJobWithAttempts,
  CampaignPublicationAttempt,
  CampaignPublicationAttemptId,
  CampaignPublicationEvent,
  CampaignPublicationEventId,
  StartPublicationJobInput,
  CreatePublicationAttemptInput,
  RecordPublicationSuccessInput,
  RecordPublicationFailureInput,
  RecordPublicationUnknownOutcomeInput,
  ReconcilePublicationJobInput,
  PrepareRetryInput,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { CampaignActivationId } from '@bop-agency/domain';
import type { CampaignActivationTargetId } from '@bop-agency/domain';
import type { RecordWebhookReceiptInput, RecordWebhookReceiptResult } from '@bop-agency/domain';
import type { CampaignPublicationWebhookEvent } from '@bop-agency/domain';
import type { PublicationWebhookEventStatus } from '@bop-agency/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToCampaignPublicationJob,
  rowToCampaignPublicationAttempt,
  rowToCampaignPublicationEvent,
  type CampaignPublicationJobRow,
  type CampaignPublicationAttemptRow,
  type CampaignPublicationEventRow,
} from '../mappers/campaign-publication.mapper';

// --- Constants ---

const DEFAULT_PAGE_SIZE = 20;

const JOB_NON_TERMINAL_STATUSES = ['queued', 'claimed', 'in_progress', 'unknown_outcome'] as const;

// --- RPC helper type - mismo criterio que SupabaseCampaignActivationRepository ---

type RpcCapableClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

// --- Repository ---

export class SupabaseCampaignPublicationRepository implements CampaignPublicationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // -- findJobById --

  async findJobById(
    id: CampaignPublicationJobId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignPublicationJob>> {
    const { data, error } = await this.supabase
      .from('campaign_publication_jobs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) {
      return err({ code: 'NOT_FOUND' as const, message: `Job de publicacion ${id} no encontrado` });
    }

    try {
      return ok(rowToCampaignPublicationJob(data as unknown as CampaignPublicationJobRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los datos del job de publicacion',
        details: mappingError,
      });
    }
  }

  // -- findJobWithAttempts --

  async findJobWithAttempts(
    id: CampaignPublicationJobId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignPublicationJobWithAttempts>> {
    const jobResult = await this.findJobById(id, organizationId);
    if (!jobResult.success) return jobResult;

    const { data, error } = await this.supabase
      .from('campaign_publication_attempts')
      .select('*')
      .eq('job_id', id)
      .eq('organization_id', organizationId)
      .order('attempt_number', { ascending: true });

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al listar los intentos del job de publicacion',
        details: error.message,
      });
    }

    try {
      const attempts = (data ?? []).map((row) =>
        rowToCampaignPublicationAttempt(row as unknown as CampaignPublicationAttemptRow),
      );
      return ok({ ...jobResult.value, attempts });
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar los intentos del job de publicacion',
        details: mappingError,
      });
    }
  }

  // -- findActiveJobByTarget --

  async findActiveJobByTarget(
    targetId: CampaignActivationTargetId,
    organizationId: OrganizationId,
  ): Promise<Result<CampaignPublicationJob | null>> {
    const { data, error } = await this.supabase
      .from('campaign_publication_jobs')
      .select('*')
      .eq('target_id', targetId)
      .eq('organization_id', organizationId)
      .in('status', JOB_NON_TERMINAL_STATUSES as unknown as string[])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al buscar el job activo del target',
        details: error.message,
      });
    }

    if (!data) return ok(null);

    try {
      return ok(rowToCampaignPublicationJob(data as unknown as CampaignPublicationJobRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar el job activo del target',
        details: mappingError,
      });
    }
  }

  // -- listJobsByActivation --

  async listJobsByActivation(
    activationId: CampaignActivationId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignPublicationJob>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await this.supabase
      .from('campaign_publication_jobs')
      .select('*', { count: 'exact' })
      .eq('activation_id', activationId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    return buildPaginatedResult(data ?? [], count ?? 0, page, pageSize, (row) =>
      rowToCampaignPublicationJob(row as unknown as CampaignPublicationJobRow),
    );
  }

  // -- createJob - RPC create_publication_job --

  async createJob(
    input: CreatePublicationJobInput,
    _actorUserId: string,
  ): Promise<Result<CampaignPublicationJob>> {
    const { data, error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'create_publication_job',
      { p_target_id: input.targetId, p_retry_of_job_id: input.retryOfJobId ?? null },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al crear el job de publicacion'));
    }

    const jobId = data as string;
    return this.findJobById(jobId as CampaignPublicationJobId, input.organizationId);
  }

  // -- claimJob - RPC claim_publication_job --

  async claimJob(
    id: CampaignPublicationJobId,
    organizationId: OrganizationId,
    workerId: string,
  ): Promise<Result<CampaignPublicationJob>> {
    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc('claim_publication_job', {
      p_job_id: id,
      p_worker_id: workerId,
    });

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al reclamar el job de publicacion'));
    }

    return this.findJobById(id, organizationId);
  }

  // -- startJob - RPC start_publication_job --

  async startJob(input: StartPublicationJobInput): Promise<Result<CampaignPublicationJob>> {
    const args: Record<string, unknown> = { p_job_id: input.jobId };
    if (input.reconciliationTimeoutMinutes !== undefined) {
      args.p_reconciliation_timeout_minutes = input.reconciliationTimeoutMinutes;
    }

    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'start_publication_job',
      args,
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al iniciar el job de publicacion'));
    }

    return this.findJobById(input.jobId, input.organizationId);
  }

  // -- createAttempt - RPC record_publication_attempt --

  async createAttempt(
    input: CreatePublicationAttemptInput,
  ): Promise<Result<CampaignPublicationAttempt>> {
    const { data, error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'record_publication_attempt',
      { p_job_id: input.jobId, p_idempotency_key: input.idempotencyKey },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al registrar el intento de publicacion'));
    }

    const attemptId = data as string;
    const { data: row, error: readError } = await this.supabase
      .from('campaign_publication_attempts')
      .select('*')
      .eq('id', attemptId)
      .eq('organization_id', input.organizationId)
      .single();

    if (readError || !row) {
      return err({ code: 'NOT_FOUND' as const, message: `Intento de publicacion ${attemptId} no encontrado` });
    }

    try {
      return ok(rowToCampaignPublicationAttempt(row as unknown as CampaignPublicationAttemptRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar el intento de publicacion',
        details: mappingError,
      });
    }
  }

  // -- recordSuccess - RPC mark_publication_job_succeeded --

  async recordSuccess(input: RecordPublicationSuccessInput): Promise<Result<CampaignPublicationJob>> {
    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'mark_publication_job_succeeded',
      {
        p_job_id: input.jobId,
        p_attempt_id: input.attemptId,
        p_external_id: input.externalId,
        p_external_url: input.externalUrl ?? null,
        p_provider_status: input.providerStatus ?? null,
      },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al registrar el exito de la publicacion'));
    }

    return this.findJobById(input.jobId, input.organizationId);
  }

  // -- recordFailure - RPC mark_publication_job_failed --

  async recordFailure(input: RecordPublicationFailureInput): Promise<Result<CampaignPublicationJob>> {
    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'mark_publication_job_failed',
      {
        p_job_id: input.jobId,
        p_failure_category: input.failureCategory,
        p_attempt_id: input.attemptId ?? null,
        p_provider_error_code: input.providerErrorCode ?? null,
        p_note: input.note ?? null,
      },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al registrar el fallo de la publicacion'));
    }

    return this.findJobById(input.jobId, input.organizationId);
  }

  // -- recordUnknownOutcome - RPC mark_publication_job_unknown_outcome --

  async recordUnknownOutcome(
    input: RecordPublicationUnknownOutcomeInput,
  ): Promise<Result<CampaignPublicationJob>> {
    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'mark_publication_job_unknown_outcome',
      { p_job_id: input.jobId, p_attempt_id: input.attemptId ?? null, p_note: input.note ?? null },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al registrar el resultado desconocido de la publicacion'));
    }

    return this.findJobById(input.jobId, input.organizationId);
  }

  // -- cancelJob - RPC cancel_publication_job --

  async cancelJob(
    id: CampaignPublicationJobId,
    organizationId: OrganizationId,
    _actorUserId: string,
    reason: string,
  ): Promise<Result<CampaignPublicationJob>> {
    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc('cancel_publication_job', {
      p_job_id: id,
      p_reason: reason,
    });

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al cancelar el job de publicacion'));
    }

    return this.findJobById(id, organizationId);
  }

  // -- reconcileJob - RPC reconcile_publication_job --

  async reconcileJob(input: ReconcilePublicationJobInput): Promise<Result<CampaignPublicationJob>> {
    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'reconcile_publication_job',
      {
        p_job_id: input.jobId,
        p_outcome: input.outcome === 'published' ? 'published' : 'not_published',
        p_note: input.note,
        p_external_id: input.externalId ?? null,
        p_external_url: input.externalUrl ?? null,
      },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al reconciliar el job de publicacion'));
    }

    return this.findJobById(input.jobId, input.organizationId);
  }

  // -- prepareRetry - RPC prepare_publication_retry --

  async prepareRetry(input: PrepareRetryInput): Promise<Result<CampaignActivationTargetId>> {
    const { data, error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'prepare_publication_retry',
      {
        p_job_id: input.jobId,
        p_note: input.note ?? null,
      },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al preparar el retry del job de publicacion'));
    }

    return ok(data as CampaignActivationTargetId);
  }

  // -- listEvents --

  async listEvents(
    jobId: CampaignPublicationJobId,
    organizationId: OrganizationId,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<CampaignPublicationEvent>> {
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await this.supabase
      .from('campaign_publication_events')
      .select('*', { count: 'exact' })
      .eq('job_id', jobId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return emptyPaginatedResult(page, pageSize);
    }

    return buildPaginatedResult(data ?? [], count ?? 0, page, pageSize, (row) =>
      rowToCampaignPublicationEvent(row as unknown as CampaignPublicationEventRow),
    );
  }

  // -- appendEvent - RPC append_publication_event --

  async appendEvent(
    jobId: CampaignPublicationJobId,
    _organizationId: OrganizationId,
    eventType: string,
    options?: {
      readonly attemptId?: CampaignPublicationAttemptId | null;
      readonly note?: string | null;
      readonly metadata?: Record<string, unknown>;
    },
  ): Promise<Result<CampaignPublicationEventId>> {
    const { data, error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'append_publication_event',
      {
        p_job_id: jobId,
        p_event_type: eventType,
        p_attempt_id: options?.attemptId ?? null,
        p_note: options?.note ?? null,
        p_metadata: options?.metadata ?? {},
      },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al registrar el evento de publicacion'));
    }

    return ok(data as CampaignPublicationEventId);
  }

  // -- recordWebhookReceipt - RPC record_publication_webhook_receipt --

  async recordWebhookReceipt(
    input: RecordWebhookReceiptInput,
  ): Promise<Result<RecordWebhookReceiptResult>> {
    const { data, error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'record_publication_webhook_receipt',
      {
        p_provider: input.provider,
        p_external_event_id: input.externalEventId,
        p_payload_hash: input.payloadHash,
      },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al registrar la recepcion del webhook'));
    }

    const rows = data as Array<{ id: string; is_new: boolean; status: string }> | null;
    const row = rows && rows.length > 0 ? rows[0] : null;

    if (!row) {
      return err({ code: 'INTERNAL_ERROR' as const, message: 'record_publication_webhook_receipt no devolvio filas' });
    }

    return ok({
      id: row.id as unknown as RecordWebhookReceiptResult['id'],
      isNew: row.is_new,
      status: row.status as PublicationWebhookEventStatus,
    });
  }

  // -- markWebhookEventProcessed - RPC mark_webhook_event_processed --

  async markWebhookEventProcessed(
    id: CampaignPublicationWebhookEvent['id'],
    status: PublicationWebhookEventStatus,
    options?: {
      readonly errorCode?: string | null;
      readonly jobId?: CampaignPublicationJobId | null;
      readonly organizationId?: OrganizationId | null;
      readonly attemptId?: CampaignPublicationAttemptId | null;
    },
  ): Promise<Result<void>> {
    const { error } = await (this.supabase as unknown as RpcCapableClient).rpc(
      'mark_webhook_event_processed',
      {
        p_webhook_event_id: id,
        p_status: status,
        p_error_code: options?.errorCode ?? null,
        p_job_id: options?.jobId ?? null,
        p_organization_id: options?.organizationId ?? null,
        p_attempt_id: options?.attemptId ?? null,
      },
    );

    if (error) {
      return err(mapPublicationRpcError(error.message, 'Error al marcar el webhook como procesado'));
    }

    return ok(undefined);
  }
}

// --- Helpers ---

function emptyPaginatedResult<T>(page: number, pageSize: number): PaginatedResult<T> {
  return {
    data: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

function buildPaginatedResult<T>(
  rows: unknown[],
  total: number,
  page: number,
  pageSize: number,
  mapper: (row: unknown) => T,
): PaginatedResult<T> {
  const totalPages = pageSize > 0 ? Math.ceil(total / pageSize) : 0;
  const items = mapSafe(rows, mapper);

  return {
    data: items,
    total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

function mapSafe<T>(rows: unknown[], mapper: (row: unknown) => T): T[] {
  const results: T[] = [];
  for (const row of rows) {
    try {
      results.push(mapper(row));
    } catch {
      // Fila corrupta/no mapeable - se omite (mismo criterio que
      // SupabaseCampaignActivationRepository).
    }
  }
  return results;
}

function mapPublicationRpcError(
  rawMessage: string | undefined,
  fallbackMessage: string,
): { code: 'NOT_FOUND' | 'FORBIDDEN' | 'CONFLICT' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR'; message: string } {
  const msg = rawMessage ?? fallbackMessage;

  if (msg.includes('not found')) {
    return { code: 'NOT_FOUND', message: msg };
  }
  if (
    msg.includes('is required') ||
    msg.includes('must be') ||
    msg.includes('invalid') ||
    msg.includes('does not belong')
  ) {
    return { code: 'VALIDATION_ERROR', message: msg };
  }
  if (msg.includes('lacks') && msg.includes('role')) {
    return { code: 'FORBIDDEN', message: msg };
  }
  if (msg.includes('authentication required')) {
    return { code: 'FORBIDDEN', message: msg };
  }
  if (
    msg.includes('is not queued') ||
    msg.includes('is not claimed') ||
    msg.includes('is not in_progress') ||
    msg.includes('is not ready/scheduled') ||
    msg.includes('is not publishing') ||
    msg.includes('is not unknown_outcome') ||
    msg.includes('is already terminal') ||
    msg.includes('already has an active publication job') ||
    msg.includes('not eligible for retry') ||
    msg.includes('must be reconciled')
  ) {
    return { code: 'CONFLICT', message: msg };
  }
  return { code: 'INTERNAL_ERROR', message: msg };
}
