/**
 * dispatchPublicationJob — tests unitarios (Phase 8B.2).
 *
 * Cubre TODOS los escenarios requeridos por el kickoff de 8B.2:
 * - happy path -> succeeded (recordSuccess llamado con externalId)
 * - fallo explícito del proveedor -> failed (recordFailure)
 * - resultado ambiguo del publisher -> unknown_outcome (recordUnknownOutcome)
 * - excepción DESPUÉS de que la solicitud pudo enviarse -> unknown_outcome
 *   (NUNCA failed — regla de seguridad central de 8B.1/8B.2)
 * - publisher/proveedor no soportado -> failed (DISPATCH_FAILED, certeza
 *   total de que nunca se intentó nada)
 * - succeeded sin externalId (contrato roto) -> unknown_outcome (guarda defensiva)
 * - nunca se filtra ningún tipo específico de Meta/Google — el receipt
 *   retornado es siempre `PublishReceipt` (provider-neutral)
 * - nunca escribe la tabla directamente — solo invoca los métodos RPC del
 *   repositorio (claim/start/createAttempt/record*), nunca un supabase
 *   client crudo.
 */

import { describe, it, expect, vi } from 'vitest';
import { isOk } from '@bop-agency/shared';
import { dispatchPublicationJob } from '../dispatch-publication-job.use-case';
import { ChannelPublisherRegistry } from '../../../ports/channel-publisher.port';
import {
  FakeSuccessfulPublisher,
  FakeFailedPublisher,
  FakeUnknownOutcomePublisher,
  FakeThrowingPublisher,
  FakeMalformedSuccessPublisher,
} from '../../../ports/channel-publisher.fakes';
import { ORG_ID, JOB_ID, makePublicationRepo, testLogger } from './fixtures';

const WORKER_ID = 'test-worker-1';

describe('dispatchPublicationJob', () => {
  it('happy path: claim -> start -> attempt -> publish succeeded -> recordSuccess', async () => {
    const publicationRepository = makePublicationRepo();
    const registry = new ChannelPublisherRegistry([new FakeSuccessfulPublisher()]);

    const result = await dispatchPublicationJob(
      { jobId: String(JOB_ID), organizationId: ORG_ID },
      { publicationRepository, registry, logger: testLogger, workerId: WORKER_ID },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.claimJob).toHaveBeenCalledWith(String(JOB_ID), ORG_ID, WORKER_ID);
    expect(publicationRepository.startJob).toHaveBeenCalled();
    expect(publicationRepository.createAttempt).toHaveBeenCalled();
    expect(publicationRepository.recordSuccess).toHaveBeenCalled();
    expect(publicationRepository.recordFailure).not.toHaveBeenCalled();
    expect(publicationRepository.recordUnknownOutcome).not.toHaveBeenCalled();

    if (isOk(result)) {
      expect(result.value.receipt?.outcome).toBe('succeeded');
      // provider-neutral: el receipt solo expone las claves de PublishReceipt.
      expect(Object.keys(result.value.receipt ?? {}).every((k) =>
        ['outcome', 'externalId', 'externalUrl', 'providerStatus', 'httpStatus', 'providerErrorCode', 'failureCategory', 'durationMs', 'metadata'].includes(k),
      )).toBe(true);
    }
  });

  it('fallo explícito del proveedor -> recordFailure con la failureCategory del receipt', async () => {
    const publicationRepository = makePublicationRepo();
    const registry = new ChannelPublisherRegistry([new FakeFailedPublisher()]);

    const result = await dispatchPublicationJob(
      { jobId: String(JOB_ID), organizationId: ORG_ID },
      { publicationRepository, registry, logger: testLogger, workerId: WORKER_ID },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ failureCategory: 'PROVIDER_REJECTED' }),
    );
    expect(publicationRepository.recordSuccess).not.toHaveBeenCalled();
    expect(publicationRepository.recordUnknownOutcome).not.toHaveBeenCalled();
  });

  it('resultado ambiguo (5xx/timeout) -> recordUnknownOutcome, nunca failed', async () => {
    const publicationRepository = makePublicationRepo();
    const registry = new ChannelPublisherRegistry([new FakeUnknownOutcomePublisher()]);

    const result = await dispatchPublicationJob(
      { jobId: String(JOB_ID), organizationId: ORG_ID },
      { publicationRepository, registry, logger: testLogger, workerId: WORKER_ID },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.recordUnknownOutcome).toHaveBeenCalled();
    expect(publicationRepository.recordFailure).not.toHaveBeenCalled();
    expect(publicationRepository.recordSuccess).not.toHaveBeenCalled();
  });

  it('excepción del publisher DESPUÉS de un posible envío -> recordUnknownOutcome, nunca failed ni succeeded', async () => {
    const publicationRepository = makePublicationRepo();
    const registry = new ChannelPublisherRegistry([new FakeThrowingPublisher()]);

    const result = await dispatchPublicationJob(
      { jobId: String(JOB_ID), organizationId: ORG_ID },
      { publicationRepository, registry, logger: testLogger, workerId: WORKER_ID },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.recordUnknownOutcome).toHaveBeenCalled();
    expect(publicationRepository.recordFailure).not.toHaveBeenCalled();
    expect(publicationRepository.recordSuccess).not.toHaveBeenCalled();
    if (isOk(result)) {
      // No hay receipt real cuando el publisher lanzó — el use case no inventa uno.
      expect(result.value.receipt).toBeNull();
    }
  });

  it('succeeded SIN externalId (contrato roto del publisher) -> recordUnknownOutcome, nunca recordSuccess', async () => {
    const publicationRepository = makePublicationRepo();
    const registry = new ChannelPublisherRegistry([new FakeMalformedSuccessPublisher()]);

    const result = await dispatchPublicationJob(
      { jobId: String(JOB_ID), organizationId: ORG_ID },
      { publicationRepository, registry, logger: testLogger, workerId: WORKER_ID },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.recordUnknownOutcome).toHaveBeenCalled();
    expect(publicationRepository.recordSuccess).not.toHaveBeenCalled();
  });

  it('publisher/proveedor no soportado -> recordFailure(DISPATCH_FAILED), NUNCA invoca publish()', async () => {
    const publicationRepository = makePublicationRepo();
    const unsupportedPublisher = new FakeSuccessfulPublisher({ supportedProviders: ['google'] });
    const publishSpy = vi.spyOn(unsupportedPublisher, 'publish');
    const registry = new ChannelPublisherRegistry([unsupportedPublisher]); // job usa provider 'meta'

    const result = await dispatchPublicationJob(
      { jobId: String(JOB_ID), organizationId: ORG_ID },
      { publicationRepository, registry, logger: testLogger, workerId: WORKER_ID },
    );

    expect(isOk(result)).toBe(true);
    expect(publishSpy).not.toHaveBeenCalled();
    expect(publicationRepository.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({ failureCategory: 'DISPATCH_FAILED' }),
    );
    if (isOk(result)) {
      expect(result.value.receipt).toBeNull();
    }
  });

  it('propaga el error de claimJob sin invocar startJob/createAttempt/publisher', async () => {
    const publicationRepository = makePublicationRepo({
      claimJob: vi.fn().mockResolvedValue({
        success: false,
        error: { code: 'CONFLICT' as const, message: 'job already claimed by another worker' },
      }),
    });
    const publisher = new FakeSuccessfulPublisher();
    const publishSpy = vi.spyOn(publisher, 'publish');
    const registry = new ChannelPublisherRegistry([publisher]);

    const result = await dispatchPublicationJob(
      { jobId: String(JOB_ID), organizationId: ORG_ID },
      { publicationRepository, registry, logger: testLogger, workerId: WORKER_ID },
    );

    expect(isOk(result)).toBe(false);
    expect(publicationRepository.startJob).not.toHaveBeenCalled();
    expect(publicationRepository.createAttempt).not.toHaveBeenCalled();
    expect(publishSpy).not.toHaveBeenCalled();
  });
});
