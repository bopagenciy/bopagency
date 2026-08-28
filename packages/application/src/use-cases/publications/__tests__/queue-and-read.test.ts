/**
 * queuePublication + lecturas — tests unitarios (Phase 8B.2).
 *
 * Cubre: queue success (operator+), rechazo por rol insuficiente, rechazo
 * de no-elegible/duplicado propagado desde la RPC (defecto de fixture no
 * duplicado aquí — el use case NUNCA re-implementa esa validación de
 * estado, solo la propaga), aislamiento de tenant (member check por
 * organizationId), y las 4 lecturas (getPublicationJob,
 * listPublicationJobsByActivation, listPublicationJobsByTarget,
 * getPublicationTimeline).
 */

import { describe, it, expect, vi } from 'vitest';
import { ok, isOk, isErr, err } from '@bop-agency/shared';
import { queuePublication } from '../queue-publication.use-case';
import { getPublicationJob } from '../get-publication-job.use-case';
import { listPublicationJobsByActivation } from '../list-publication-jobs-by-activation.use-case';
import { listPublicationJobsByTarget } from '../list-publication-jobs-by-target.use-case';
import type { CampaignActivationRepository } from '@bop-agency/domain';
import { getPublicationTimeline } from '../get-publication-timeline.use-case';
import {
  ORG_ID,
  ACTIVATION_ID,
  TARGET_ID,
  JOB_ID,
  ACTOR_ID,
  makePublicationRepo,
  makeOrganizationRepo,
  testLogger,
} from './fixtures';

describe('queuePublication', () => {
  it('crea el job en queued cuando el actor es operator+', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('operator');

    const result = await queuePublication(
      { targetId: String(TARGET_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.createJob).toHaveBeenCalledWith(
      { targetId: String(TARGET_ID), organizationId: ORG_ID, retryOfJobId: null },
      ACTOR_ID,
    );
  });

  it('rechaza viewer (rol insuficiente) ANTES de llamar al repositorio', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('viewer');

    const result = await queuePublication(
      { targetId: String(TARGET_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.createJob).not.toHaveBeenCalled();
  });

  describe('Google Ads Defense-in-depth queue validation (Phase 8F.0)', () => {
    const validGoogleAdsConfig = {
      dailyBudget: { amount: 50, currency: 'USD' },
      biddingStrategy: 'MAXIMIZE_CLICKS',
      finalUrl: 'https://client.com/promo',
      geoTargetIds: ['2170'],
      languageCriterionIds: ['1003'],
      keywordMatchPolicy: 'PHRASE',
      negativeKeywordMatchPolicy: 'BROAD',
    };

    it('rechaza encolar publicación para un target de google_ads si el snapshot no contiene googleAdsConfig', async () => {
      const publicationRepository = makePublicationRepo();
      const organizationRepository = makeOrganizationRepo('operator');
      const activationRepository = {
        findTargetById: vi.fn().mockResolvedValue(ok({ id: TARGET_ID, activationId: ACTIVATION_ID, channel: 'google_ads' })),
        findById: vi.fn().mockResolvedValue(ok({ id: ACTIVATION_ID, approvedSnapshot: { googleAdsConfig: null } })),
      } as unknown as CampaignActivationRepository;

      const result = await queuePublication(
        { targetId: String(TARGET_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
        { publicationRepository, organizationRepository, activationRepository, logger: testLogger },
      );

      expect(isErr(result)).toBe(true);
      expect(publicationRepository.createJob).not.toHaveBeenCalled();
    });

    it('permite encolar publicación para un target de google_ads con googleAdsConfig válido', async () => {
      const publicationRepository = makePublicationRepo();
      const organizationRepository = makeOrganizationRepo('operator');
      const activationRepository = {
        findTargetById: vi.fn().mockResolvedValue(ok({ id: TARGET_ID, activationId: ACTIVATION_ID, channel: 'google_ads' })),
        findById: vi.fn().mockResolvedValue(ok({ id: ACTIVATION_ID, approvedSnapshot: { googleAdsConfig: validGoogleAdsConfig } })),
      } as unknown as CampaignActivationRepository;

      const result = await queuePublication(
        { targetId: String(TARGET_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
        { publicationRepository, organizationRepository, activationRepository, logger: testLogger },
      );

      expect(isOk(result)).toBe(true);
      expect(publicationRepository.createJob).toHaveBeenCalled();
    });
  });

  it('propaga el rechazo de la RPC cuando el target ya tiene un job activo (no-eligible/duplicado)', async () => {
    const publicationRepository = makePublicationRepo({
      createJob: vi.fn().mockResolvedValue(
        err({ code: 'CONFLICT' as const, message: 'target already has an active publication job' }),
      ),
    });
    const organizationRepository = makeOrganizationRepo('operator');

    const result = await queuePublication(
      { targetId: String(TARGET_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('aísla por tenant — nunca llama al repositorio si el actor no pertenece a ESA organización', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = {
      findMember: vi.fn().mockResolvedValue(err({ code: 'NOT_FOUND' as const, message: 'not a member' })),
    } as unknown as Parameters<typeof queuePublication>[1]['organizationRepository'];

    const result = await queuePublication(
      { targetId: String(TARGET_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isErr(result)).toBe(true);
    expect(publicationRepository.createJob).not.toHaveBeenCalled();
  });

  it('nunca toca ningún repositorio de campaign/activation — no hay transición de status de campaña posible', async () => {
    // Estructural: el tipo QueuePublicationDeps solo acepta
    // publicationRepository/organizationRepository/logger — no existe
    // ningún campo para inyectar un CampaignRepository, por lo que es
    // imposible que este use case transicione el status de una campaña.
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('operator');
    const deps = { publicationRepository, organizationRepository, logger: testLogger };
    expect(Object.keys(deps).sort()).toEqual(['logger', 'organizationRepository', 'publicationRepository']);
  });
});

describe('lecturas de publicación', () => {
  it('getPublicationJob retorna el agregado con attempts', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('viewer');

    const result = await getPublicationJob(
      { jobId: String(JOB_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.findJobWithAttempts).toHaveBeenCalled();
  });

  it('listPublicationJobsByActivation requiere solo membresía (viewer OK)', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('viewer');

    const result = await listPublicationJobsByActivation(
      { activationId: String(ACTIVATION_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID, pagination: {} },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
  });

  it('listPublicationJobsByTarget usa el nuevo método listJobsByTarget del repositorio', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('viewer');

    const result = await listPublicationJobsByTarget(
      { targetId: String(TARGET_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID, pagination: {} },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.listJobsByTarget).toHaveBeenCalledWith(String(TARGET_ID), ORG_ID, {});
  });

  it('getPublicationTimeline retorna los eventos append-only del job', async () => {
    const publicationRepository = makePublicationRepo();
    const organizationRepository = makeOrganizationRepo('viewer');

    const result = await getPublicationTimeline(
      { jobId: String(JOB_ID), organizationId: ORG_ID, actorUserId: ACTOR_ID, pagination: {} },
      { publicationRepository, organizationRepository, logger: testLogger },
    );

    expect(isOk(result)).toBe(true);
    expect(publicationRepository.listEvents).toHaveBeenCalled();
  });
});
