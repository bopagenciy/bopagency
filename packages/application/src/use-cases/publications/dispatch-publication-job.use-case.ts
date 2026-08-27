/**
 * dispatchPublicationJob — Phase 8B.2.
 *
 * ÚNICO orquestador de la ejecución real de un `CampaignPublicationJob`
 * `queued`. Este use case es la pieza central de 8B.2: conecta el target
 * de activación -> el job de publicación -> el `ChannelPublisherPort` ->
 * las RPCs authoritativas de 8B.1, sin introducir NINGUNA llamada HTTP
 * real a un proveedor (eso queda para 8B.3+ vía un adapter concreto de
 * `ChannelPublisherPort`).
 *
 * DEPS: `publicationRepository` aquí DEBE ser una instancia construida con
 * un cliente Supabase `service_role` (worker) — `claimJob`/`startJob`/
 * `createAttempt`/`recordSuccess`/`recordFailure`/`recordUnknownOutcome`
 * son RPCs `service_role`-únicamente (ver 8B.1 §1 grants, 11 de 15 RPCs).
 * NUNCA pasar aquí el repositorio construido con el cliente de sesión del
 * usuario — ver `publication.composition.ts` para la separación de los
 * dos composition roots (interactivo vs. worker).
 *
 * FLUJO (auditado contra la atomicidad real de las RPCs de 8B.1 antes de
 * diseñar esto — cada paso invoca EXACTAMENTE una RPC, nunca escribe la
 * tabla directamente, nunca duplica una transición que la RPC ya hace
 * atómicamente):
 *
 *   1. claimJob        (queued -> claimed)                     [RPC]
 *   2. startJob         (claimed -> in_progress; target -> publishing) [RPC]
 *   3. createAttempt    (abre un CampaignPublicationAttempt)    [RPC]
 *   4. registry.resolve(channel, provider)
 *      -> si no hay publisher registrado: recordFailure(DISPATCH_FAILED)
 *         (certeza total de que NUNCA se intentó ninguna llamada — es
 *         seguro tratarlo como fallo definitivo, no ambiguo)
 *   5. publisher.publish(input)  — SIEMPRE dentro de try/catch
 *   6. Mapeo receipt.outcome -> RPC de cierre:
 *        succeeded (con externalId)     -> recordSuccess
 *        succeeded (SIN externalId)     -> recordUnknownOutcome (guarda defensiva — ver abajo)
 *        failed                         -> recordFailure
 *        unknown_outcome                -> recordUnknownOutcome
 *        Result.err del publisher       -> recordUnknownOutcome (conservador)
 *        excepción no capturada         -> recordUnknownOutcome (REGLA DE SEGURIDAD)
 *
 * REGLA DE SEGURIDAD (unknown_outcome, ver kickoff 8B.2 "UNKNOWN_OUTCOME
 * SAFETY"): timeout, desconexión de transporte, 5xx ambiguo, o una
 * excepción lanzada DESPUÉS de que la solicitud pudo haber sido aceptada
 * por el proveedor — NINGUNO de estos casos concluye jamás en `failed`
 * automáticamente. `failed` solo se usa cuando hay CERTEZA de que nada
 * fue aceptado por el proveedor (rechazo explícito del publisher, o
 * ningún publisher registrado). Esto preserva exactamente la invariante
 * de 8B.1: `unknown_outcome` nunca se reintenta ciegamente, solo se
 * reconcilia explícitamente (`reconcilePublicationOutcome`, strategist+).
 *
 * Si claimJob o startJob o createAttempt fallan (p.ej. concurrencia — otro
 * worker ya reclamó el job), este use case simplemente propaga el error
 * de la RPC — NO reintenta, NO fuerza ningún estado. Un job atascado en
 * `claimed` porque `startJob` falló es un residual operativo documentado
 * (mismo criterio que la "DEUDA TÉCNICA" de `startAutomationExecution`,
 * Phase 6D) — fuera de alcance resolverlo automáticamente en 8B.2.
 */

import { ok, isOk, isErr } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type {
  CampaignPublicationJob,
  CampaignPublicationJobId,
  CampaignPublicationRepository,
} from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../ports/logger.port';
import type { ChannelPublisherRegistry, PublishReceipt } from '../../ports/channel-publisher.port';

export type DispatchPublicationJobInput = {
  readonly jobId: string;
  readonly organizationId: OrganizationId;
};

export type DispatchPublicationJobOutput = {
  readonly job: CampaignPublicationJob;
  /** null cuando el job se cerró sin llegar a invocar ningún publisher (p.ej. DISPATCH_FAILED por proveedor no soportado). */
  readonly receipt: PublishReceipt | null;
};

export type DispatchPublicationJobDeps = {
  /** DEBE ser un repositorio construido con cliente service_role — ver nota de cabecera. */
  publicationRepository: CampaignPublicationRepository;
  registry: ChannelPublisherRegistry;
  logger: LoggerPort;
  /** Identifica el proceso/worker — NUNCA un userId (mismo campo que `claimedByWorker`). */
  workerId: string;
  reconciliationTimeoutMinutes?: number;
};

export async function dispatchPublicationJob(
  input: DispatchPublicationJobInput,
  deps: DispatchPublicationJobDeps,
): Promise<Result<DispatchPublicationJobOutput>> {
  const jobId = input.jobId as CampaignPublicationJobId;

  deps.logger.debug('dispatchPublicationJob: begin', {
    jobId: input.jobId,
    organizationId: input.organizationId,
    workerId: deps.workerId,
  });

  // ── 1. claim (queued -> claimed) ─────────────────────────────────────────
  const claimResult = await deps.publicationRepository.claimJob(
    jobId,
    input.organizationId,
    deps.workerId,
  );
  if (!isOk(claimResult)) {
    deps.logger.warn('dispatchPublicationJob: claim failed', { error: claimResult, jobId: input.jobId });
    return claimResult;
  }
  // ── 2. start (claimed -> in_progress; target -> publishing) ─────────────
  const startResult = await deps.publicationRepository.startJob({
    jobId,
    organizationId: input.organizationId,
    ...(deps.reconciliationTimeoutMinutes !== undefined
      ? { reconciliationTimeoutMinutes: deps.reconciliationTimeoutMinutes }
      : {}),
  });
  if (!isOk(startResult)) {
    deps.logger.error('dispatchPublicationJob: start failed after claim — job stuck in claimed', {
      error: startResult,
      jobId: input.jobId,
    });
    return startResult;
  }
  const startedJob = startResult.value;

  // ── 3. open attempt ───────────────────────────────────────────────────────
  const attemptResult = await deps.publicationRepository.createAttempt({
    jobId,
    organizationId: input.organizationId,
    idempotencyKey: String(startedJob.idempotencyKey),
  });
  if (!isOk(attemptResult)) {
    deps.logger.error('dispatchPublicationJob: createAttempt failed after start', {
      error: attemptResult,
      jobId: input.jobId,
    });
    return attemptResult;
  }
  const attempt = attemptResult.value;

  // ── 4. resolve publisher ─────────────────────────────────────────────────
  const publisher = deps.registry.resolve(startedJob.channel, startedJob.provider);
  if (!publisher) {
    deps.logger.warn('dispatchPublicationJob: no publisher registered — definitive DISPATCH_FAILED', {
      jobId: input.jobId,
      channel: startedJob.channel,
      provider: startedJob.provider,
    });
    const failResult = await deps.publicationRepository.recordFailure({
      jobId,
      organizationId: input.organizationId,
      attemptId: attempt.id,
      failureCategory: 'DISPATCH_FAILED',
      note: `No hay ChannelPublisherPort registrado para channel=${startedJob.channel}, provider=${startedJob.provider}`,
    });
    if (!isOk(failResult)) return failResult;
    return ok({ job: failResult.value, receipt: null });
  }

  // ── 5. invoke publisher (SIEMPRE dentro de try/catch) ────────────────────
  let receiptResult: Result<PublishReceipt>;
  try {
    receiptResult = await publisher.publish({
      jobId,
      organizationId: input.organizationId,
      clientId: startedJob.clientId,
      targetId: startedJob.targetId,
      channel: startedJob.channel,
      provider: startedJob.provider,
      clientIntegrationId: startedJob.clientIntegrationId,
      attemptNumber: attempt.attemptNumber,
      idempotencyKey: String(startedJob.idempotencyKey),
    });
  } catch (thrown) {
    // REGLA DE SEGURIDAD: una excepción no capturada pudo ocurrir DESPUÉS de
    // que el proveedor aceptara la solicitud — NUNCA se asume failed aquí.
    deps.logger.error('dispatchPublicationJob: publisher threw — treating as unknown_outcome', {
      jobId: input.jobId,
      error: thrown instanceof Error ? thrown.message : String(thrown),
    });
    const unknownResult = await deps.publicationRepository.recordUnknownOutcome({
      jobId,
      organizationId: input.organizationId,
      attemptId: attempt.id,
      note: 'Publisher lanzó una excepción durante publish() — resultado indeterminado, requiere reconciliación.',
    });
    if (!isOk(unknownResult)) return unknownResult;
    return ok({ job: unknownResult.value, receipt: null });
  }

  if (isErr(receiptResult)) {
    // Conservador: un Result.err del publisher (violación de contrato, no
    // una respuesta real del proveedor) tampoco se asume failed.
    deps.logger.warn('dispatchPublicationJob: publisher returned Result.err — treating as unknown_outcome', {
      jobId: input.jobId,
      error: receiptResult,
    });
    const unknownResult = await deps.publicationRepository.recordUnknownOutcome({
      jobId,
      organizationId: input.organizationId,
      attemptId: attempt.id,
      note: 'Publisher retornó un error de contrato antes de confirmar el resultado — requiere reconciliación.',
    });
    if (!isOk(unknownResult)) return unknownResult;
    return ok({ job: unknownResult.value, receipt: null });
  }

  const receipt = receiptResult.value;

  // ── 6. mapear receipt.outcome -> RPC de cierre ───────────────────────────

  if (receipt.outcome === 'succeeded' && receipt.externalId) {
    const successResult = await deps.publicationRepository.recordSuccess({
      jobId,
      organizationId: input.organizationId,
      attemptId: attempt.id,
      externalId: receipt.externalId,
      externalUrl: receipt.externalUrl ?? null,
      providerStatus: receipt.providerStatus ?? null,
    });
    if (!isOk(successResult)) return successResult;
    return ok({ job: successResult.value, receipt });
  }

  if (receipt.outcome === 'succeeded' && !receipt.externalId) {
    // Guarda defensiva: un "succeeded" sin externalId es un contrato roto
    // del publisher — nunca se confía ciegamente, se trata como ambiguo.
    deps.logger.error('dispatchPublicationJob: publisher reported succeeded WITHOUT externalId — treating as unknown_outcome', {
      jobId: input.jobId,
    });
    const unknownResult = await deps.publicationRepository.recordUnknownOutcome({
      jobId,
      organizationId: input.organizationId,
      attemptId: attempt.id,
      note: 'Publisher reportó succeeded sin externalId — resultado no verificable, requiere reconciliación.',
    });
    if (!isOk(unknownResult)) return unknownResult;
    return ok({ job: unknownResult.value, receipt });
  }

  if (receipt.outcome === 'failed') {
    const failResult = await deps.publicationRepository.recordFailure({
      jobId,
      organizationId: input.organizationId,
      attemptId: attempt.id,
      failureCategory: receipt.failureCategory ?? 'PROVIDER_REJECTED',
      providerErrorCode: receipt.providerErrorCode ?? null,
      note: receipt.providerStatus ?? null,
    });
    if (!isOk(failResult)) return failResult;
    return ok({ job: failResult.value, receipt });
  }

  // receipt.outcome === 'unknown_outcome'
  const unknownResult = await deps.publicationRepository.recordUnknownOutcome({
    jobId,
    organizationId: input.organizationId,
    attemptId: attempt.id,
    note: receipt.providerStatus ?? null,
  });
  if (!isOk(unknownResult)) return unknownResult;
  return ok({ job: unknownResult.value, receipt });
}
