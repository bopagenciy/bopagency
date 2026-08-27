/**
 * preparePublicationRetry / retryPublication / cancelPublicationJob /
 * reconcilePublicationOutcome — tests unitarios (Phase 8B.2).
 *
 * Cubre: guardas de rol/estado de retry, retry crea job NUEVO
 * (retryOfJobId encadenado, nunca muta el job original), cancelación
 * role/state (operator+ queued/claimed, strategist+ in_progress
 * cooperativo, unknown_outcome/terminal rechazado sin llamar a la RPC),
 * reconciliación role/state (strategist+ únicamente).
 */

import { describe, it, expect, vi } from 'vitest';
import { isOk, isErr, err, ok } from '@bop-agency/shared';
import { preparePublicationRetry } from '../prepare-publication-retry.use-case';
import { retryPublication } from '../retry-publication.use-case';
import { cancelPublicationJob } from '../cancel-publication-job.use-case';
import { reconcilePublicationOutcome } from '../reconcile-publication-outcome.use-case';
import {
  ORG_ID,
  TARGET_ID,
  JOB_ID,
  ACTOR_ID,
  makeJob,
  makePublicationRepo,
  makeOrganizationRepo,
  testLogger,
} from './fixtures';

describe('preparePublicationRetry', () => {
  it('permite strategist+ y devuelve el targetId reseteado', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('strategist');

    const result = await preparePublicationRetry(
      { jobId: String(JOB_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.prepareRetry).toHaveBeenCalled();
  });

  it('rechaza operator (rol insuficiente) SIN llamar al repositorio', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('operator');

    const result = await preparePublicationRetry(
      { jobId: String(JOB_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.prepareRetry).not.toHaveBeenCalled();
  });

  it('propaga el rechazo de la RPC cuando el job no está failed/no es retryable', async () => {
    const publicationRepository = makePublicationRepo({
      prepareRetry: vi.fn().mockResolvedValue(err({ code: 'VALIDATION_ERROR' as const, message: 'job is not failed' })),
    });
    const organizationRepository = makeOrganizationRepo('strategist');

    const result = await preparePublicationRetry(
      { jobId: String(JOB_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
  });
});

describe('retryPublication (composición prepare + queue)', () => {
  it('crea un job NUEVO encadenado con retryOfJobId — nunca muta el job original', async () => {
    const newJobId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const publicationRepository = makePublicationRepo({
      createJob: vi.fn().mockResolvedValue(
        ok(makeJob({ id: newJobId as unknown as ReturnType<typeof makeJob>['id'], retryOfJobId: JOB_ID, retryCount: 1, status: 'queued' })),
      ),
    });
    const organizationRepository = makeOrganizationRepo('strategist');

    const result = await retryPublication(
      { jobId: String(JOB_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID, note: 'retry tras fallo transitorio' },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.prepareRetry).toHaveBeenCalled();
    expect(publicationRepository.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: String(TARGET_ID), retryOfJobId: String(JOB_ID) }),
      ACTOR_ID,
    );
    // El job ORIGINAL nunca se toca con ninguna escritura directa — solo
    // prepareRetry (que internamente resetea el TARGET, no el job) y
    // createJob (que crea una fila nueva). Ningún método de "update job"
    // existe en el contrato del repositorio salvo las RPCs de transición
    // de ESTE job nuevo.
    if (isOk(result)) {
      expect(result.value.retryOfJobId).toBe(JOB_ID);
      expect(result.value.id).not.toBe(JOB_ID);
    }
  });

  it('si prepare falla, NUNCA llama a createJob (no queda ningún job a medias)', async () => {
    const publicationRepository = makePublicationRepo({
      prepareRetry: vi.fn().mockResolvedValue(err({ code: 'VALIDATION_ERROR' as const, message: 'job is not failed' })),
    });
    const organizationRepository = makeOrganizationRepo('strategist');

    const result = await retryPublication(
      { jobId: String(JOB_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.createJob).not.toHaveBeenCalled();
  });
});

describe('cancelPublicationJob', () => {
  it('permite operator+ cancelar un job queued', async () => {
    const publicationRepository = makePublicationRepo({
      findJobById: vi.fn().mockResolvedValue(ok(makeJob({ status: 'queued' }))),
    });
    const organizationRepository = makeOrganizationRepo('operator');

    const result = await cancelPublicationJob(
      { jobId: String(JOB_ID), reason: 'cliente pausó la campaña', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.cancelJob).toHaveBeenCalled();
  });

  it('rechaza operator (insuficiente) cancelando un job in_progress — exige strategist+', async () => {
    const publicationRepository = makePublicationRepo({
      findJobById: vi.fn().mockResolvedValue(ok(makeJob({ status: 'in_progress' }))),
    });
    const organizationRepository = makeOrganizationRepo('operator');

    const result = await cancelPublicationJob(
      { jobId: String(JOB_ID), reason: 'necesita detenerse', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.cancelJob).not.toHaveBeenCalled();
  });

  it('permite strategist+ cancelar (cooperativamente) un job in_progress', async () => {
    const publicationRepository = makePublicationRepo({
      findJobById: vi.fn().mockResolvedValue(ok(makeJob({ status: 'in_progress' }))),
    });
    const organizationRepository = makeOrganizationRepo('strategist');

    const result = await cancelPublicationJob(
      { jobId: String(JOB_ID), reason: 'necesita detenerse', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.cancelJob).toHaveBeenCalled();
  });

  it('rechaza cancelación de un job en unknown_outcome — exige reconciliación, nunca cancelación', async () => {
    const publicationRepository = makePublicationRepo({
      findJobById: vi.fn().mockResolvedValue(ok(makeJob({ status: 'unknown_outcome' }))),
    });
    const organizationRepository = makeOrganizationRepo('strategist');

    const result = await cancelPublicationJob(
      { jobId: String(JOB_ID), reason: 'intento invalido', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.cancelJob).not.toHaveBeenCalled();
  });

  it('rechaza cancelación de un job ya terminal (succeeded)', async () => {
    const publicationRepository = makePublicationRepo({
      findJobById: vi.fn().mockResolvedValue(ok(makeJob({ status: 'succeeded' }))),
    });
    const organizationRepository = makeOrganizationRepo('strategist');

    const result = await cancelPublicationJob(
      { jobId: String(JOB_ID), reason: 'intento invalido', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.cancelJob).not.toHaveBeenCalled();
  });

  it('exige reason no vacío', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('operator');

    const result = await cancelPublicationJob(
      { jobId: String(JOB_ID), reason: '  ', organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.findJobById).not.toHaveBeenCalled();
  });
});

describe('reconcilePublicationOutcome', () => {
  it('permite strategist+ reconciliar unknown_outcome -> succeeded', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('strategist');

    const result = await reconcilePublicationOutcome(
      {
        jobId: String(JOB_ID),
        organizationId: ORG_ID,
        actorUserId: ACTOR_ID,
        outcome: 'published',
        externalId: 'ext-123',
        note: 'confirmado manualmente con el proveedor',
      },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.reconcileJob).toHaveBeenCalled();
  });

  it('rechaza operator (rol insuficiente) — reconciliación es strategist+ únicamente', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('operator');

    const result = await reconcilePublicationOutcome(
      {
        jobId: String(JOB_ID),
        organizationId: ORG_ID,
        actorUserId: ACTOR_ID,
        outcome: 'not_published',
        note: 'confirmado que no se publico',
      },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.reconcileJob).not.toHaveBeenCalled();
  });

  it('exige note no vacío', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('strategist');

    const result = await reconcilePublicationOutcome(
      { jobId: String(JOB_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID, outcome: 'published', note: '' },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.reconcileJob).not.toHaveBeenCalled();
  });
});
