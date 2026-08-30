/**
 * Campaign Activation Server Actions — Phase 8A.3.
 *
 * Estrategia: mocks totales de dependencias externas (mismo patrón que
 * apps/web/src/app/(protected)/campaigns/__tests__/actions.test.ts). No se
 * toca Supabase ni ningún proveedor real.
 *
 * Cobertura (§9 del kickoff de 8A.3):
 *   S1. strategist puede crear una activación (rol suficiente, organizationId/
 *       actorUserId resueltos del servidor).
 *   S2. operator NO puede crear una activación → FORBIDDEN, use case nunca invocado.
 *   S3. viewer NO puede crear una activación → FORBIDDEN.
 *   S4. duplicado (CONFLICT del use case) se traduce a un ActionResult seguro,
 *       nunca lanza ni expone el error crudo.
 *   S5. transición inválida (VALIDATION_ERROR) se traduce a un mensaje seguro.
 *   S6. operator SÍ puede operar targets (prepare/ready/publish) pero NO
 *       agregar targets ni cancelar (ni target ni activación completa).
 *   S7. cancelActivationTargetAction / cancelCampaignActivationAction
 *       propagan la razón tal cual al use case (la validación de "no vacía"
 *       vive en el use case/schema — esta capa no la duplica, mismo criterio
 *       que rejectCampaignAction).
 *   S8. actor spoofing imposible: aunque el payload intente inyectar
 *       actorUserId/organizationId (vía `as any`), el use case SIEMPRE
 *       recibe los valores resueltos de la sesión servidor, nunca los del
 *       payload.
 *   S9. lecturas (list/get) solo requieren membresía activa (no rol
 *       mínimo) y no invocan ningún método de escritura.
 *   S10. ningún Server Action de este archivo importa/llama a un adapter de
 *        proveedor externo (Meta/Google/LinkedIn/email) ni hace fetch — 8A.3
 *        es exclusivamente manual.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ok, err } from '@bop-agency/shared';

const {
  mockRevalidatePath,
  mockRequireOrganizationRole,
  mockRequireOrganization,
  mockCreateServerSupabaseClient,
  mockUseCases,
  MockComposition,
} = vi.hoisted(() => {
  const mockUseCases = {
    createCampaignActivation: vi.fn(),
    cancelCampaignActivation: vi.fn(),
    addCampaignActivationTarget: vi.fn(),
    prepareActivationTarget: vi.fn(),
    markActivationTargetReady: vi.fn(),
    markActivationTargetPublished: vi.fn(),
    cancelActivationTarget: vi.fn(),
    getCampaignActivation: vi.fn(),
    listCampaignActivationsByCampaign: vi.fn(),
    listCampaignActivationsByClient: vi.fn(),
    getActivationWithTargetsAndEvents: vi.fn(),
  };
  return {
    mockRevalidatePath: vi.fn(),
    mockRequireOrganizationRole: vi.fn(),
    mockRequireOrganization: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn().mockResolvedValue({}),
    mockUseCases,
    MockComposition: vi.fn().mockReturnValue({ useCases: mockUseCases, repositories: {} }),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/auth/server', () => ({
  requireOrganization: mockRequireOrganization,
  requireOrganizationRole: mockRequireOrganizationRole,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));
vi.mock('@/lib/composition/activation.composition', () => ({
  createActivationComposition: MockComposition,
}));

import {
  createCampaignActivationAction,
  addCampaignActivationTargetAction,
  prepareActivationTargetAction,
  markActivationTargetReadyAction,
  markActivationTargetPublishedAction,
  cancelActivationTargetAction,
  cancelCampaignActivationAction,
  getCampaignActivationAction,
  listCampaignActivationsByCampaignAction,
} from '../actions';

/** Primer argumento con el que se invocó un mock, sin non-null assertions. */
function firstArg(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const [first] = mock.mock.calls as [unknown[]] | [];
  if (first === undefined) throw new Error('el use case no fue invocado');
  return first[0] as Record<string, unknown>;
}

function orgContext(role: string) {
  return {
    user: { id: 'user-1', email: 'user@test.com' },
    organization: { id: 'org-1' },
    membership: { role },
  };
}

const ACTIVATION = { id: 'activation-1' };
const TARGET = { id: 'target-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrganization.mockResolvedValue(orgContext('viewer'));
  mockCreateServerSupabaseClient.mockResolvedValue({});
  mockUseCases.createCampaignActivation.mockResolvedValue(ok(ACTIVATION));
  mockUseCases.cancelCampaignActivation.mockResolvedValue(ok(ACTIVATION));
  mockUseCases.addCampaignActivationTarget.mockResolvedValue(ok(TARGET));
  mockUseCases.prepareActivationTarget.mockResolvedValue(ok(TARGET));
  mockUseCases.markActivationTargetReady.mockResolvedValue(ok(TARGET));
  mockUseCases.markActivationTargetPublished.mockResolvedValue(ok(TARGET));
  mockUseCases.cancelActivationTarget.mockResolvedValue(ok(TARGET));
  mockUseCases.listCampaignActivationsByCampaign.mockResolvedValue(
    ok({ data: [], total: 0, page: 1, pageSize: 20, totalPages: 0, hasNextPage: false, hasPreviousPage: false }),
  );
});

describe('createCampaignActivationAction', () => {
  it('S1: strategist puede crear — organizationId/actorUserId resueltos del servidor', async () => {
    mockRequireOrganizationRole.mockResolvedValue(orgContext('strategist'));

    const result = await createCampaignActivationAction({
      campaignId: 'campaign-1',
      notes: 'contexto',
    });

    expect(result.ok).toBe(true);
    expect(mockRequireOrganizationRole).toHaveBeenCalledWith('strategist');
    const input = firstArg(mockUseCases.createCampaignActivation);
    expect(input).toEqual({
      campaignId: 'campaign-1',
      organizationId: 'org-1',
      actorUserId: 'user-1',
      notes: 'contexto',
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/campaigns/campaign-1');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/campaigns/campaign-1/activation');
  });

  it('S2: operator NO puede crear — FORBIDDEN, use case nunca invocado', async () => {
    mockRequireOrganizationRole.mockRejectedValue(new Error('redirect'));

    const result = await createCampaignActivationAction({ campaignId: 'campaign-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(mockUseCases.createCampaignActivation).not.toHaveBeenCalled();
  });

  it('S3: viewer NO puede crear — FORBIDDEN', async () => {
    mockRequireOrganizationRole.mockRejectedValue(new Error('redirect'));

    const result = await createCampaignActivationAction({ campaignId: 'campaign-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });

  it('S4: duplicado (CONFLICT) del use case se traduce a un ActionResult seguro', async () => {
    mockRequireOrganizationRole.mockResolvedValue(orgContext('strategist'));
    mockUseCases.createCampaignActivation.mockResolvedValue(
      err({ code: 'CONFLICT', message: 'Campaign campaign-1 already has a non-terminal activation.' }),
    );

    const result = await createCampaignActivationAction({ campaignId: 'campaign-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('CONFLICT');
      expect(result.error).toContain('already has a non-terminal activation');
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('S5: transición inválida (VALIDATION_ERROR) se traduce a un mensaje seguro, sin lanzar', async () => {
    mockRequireOrganizationRole.mockResolvedValue(orgContext('strategist'));
    mockUseCases.createCampaignActivation.mockResolvedValue(
      err({ code: 'VALIDATION_ERROR', message: 'Campaign campaign-1 is not approved (current status: draft)' }),
    );

    const result = await createCampaignActivationAction({ campaignId: 'campaign-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });

  it('S8: actor spoofing imposible — payload con actorUserId/organizationId inyectados se ignora', async () => {
    mockRequireOrganizationRole.mockResolvedValue(orgContext('strategist'));

    const maliciousPayload = {
      campaignId: 'campaign-1',
      actorUserId: 'attacker-id',
      organizationId: 'attacker-org',
    } as unknown as Parameters<typeof createCampaignActivationAction>[0];

    await createCampaignActivationAction(maliciousPayload);

    const input = firstArg(mockUseCases.createCampaignActivation);
    expect(input['actorUserId']).toBe('user-1');
    expect(input['organizationId']).toBe('org-1');
  });
});

describe('addCampaignActivationTargetAction — rol mínimo strategist', () => {
  it('S6a: strategist puede agregar un target manual', async () => {
    mockRequireOrganizationRole.mockResolvedValue(orgContext('strategist'));

    const result = await addCampaignActivationTargetAction({
      campaignId: 'campaign-1',
      activationId: 'activation-1',
      channel: 'manual',
      provider: 'manual',
      placement: 'instagram_feed',
    });

    expect(result.ok).toBe(true);
    expect(mockRequireOrganizationRole).toHaveBeenCalledWith('strategist');
    const input = firstArg(mockUseCases.addCampaignActivationTarget);
    expect(input).toMatchObject({ channel: 'manual', provider: 'manual', actorUserId: 'user-1' });
  });

  it('S6b: operator NO puede agregar un target — FORBIDDEN antes de invocar el use case', async () => {
    mockRequireOrganizationRole.mockRejectedValue(new Error('redirect'));

    const result = await addCampaignActivationTargetAction({
      campaignId: 'campaign-1',
      activationId: 'activation-1',
      channel: 'manual',
      provider: 'manual',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(mockUseCases.addCampaignActivationTarget).not.toHaveBeenCalled();
  });
});

describe('operación manual de targets — rol mínimo operator', () => {
  it('S6c: operator puede preparar/marcar listo/marcar publicado', async () => {
    mockRequireOrganizationRole.mockResolvedValue(orgContext('operator'));

    const prepareResult = await prepareActivationTargetAction({
      campaignId: 'campaign-1',
      targetId: 'target-1',
    });
    const readyResult = await markActivationTargetReadyAction({
      campaignId: 'campaign-1',
      targetId: 'target-1',
    });
    const publishedResult = await markActivationTargetPublishedAction({
      campaignId: 'campaign-1',
      targetId: 'target-1',
      externalReference: 'post-123',
      note: 'Publicado manualmente en Instagram',
    });

    expect(prepareResult.ok).toBe(true);
    expect(readyResult.ok).toBe(true);
    expect(publishedResult.ok).toBe(true);
    expect(mockRequireOrganizationRole).toHaveBeenCalledWith('operator');

    const publishInput = firstArg(mockUseCases.markActivationTargetPublished);
    expect(publishInput).toEqual({
      targetId: 'target-1',
      externalReference: 'post-123',
      note: 'Publicado manualmente en Instagram',
      organizationId: 'org-1',
      actorUserId: 'user-1',
    });
  });

  it('S6d: viewer NO puede operar targets — FORBIDDEN', async () => {
    mockRequireOrganizationRole.mockRejectedValue(new Error('redirect'));

    const result = await prepareActivationTargetAction({ campaignId: 'campaign-1', targetId: 'target-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(mockUseCases.prepareActivationTarget).not.toHaveBeenCalled();
  });
});

describe('cancelActivationTargetAction / cancelCampaignActivationAction — rol mínimo strategist', () => {
  it('S6e: operator NO puede cancelar un target individual — FORBIDDEN', async () => {
    mockRequireOrganizationRole.mockRejectedValue(new Error('redirect'));

    const result = await cancelActivationTargetAction({
      campaignId: 'campaign-1',
      targetId: 'target-1',
      reason: 'motivo',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(mockUseCases.cancelActivationTarget).not.toHaveBeenCalled();
  });

  it('S6f (operator NO puede cancelar la activación completa) — FORBIDDEN, mismo criterio que §5 del kickoff', async () => {
    mockRequireOrganizationRole.mockRejectedValue(new Error('redirect'));

    const result = await cancelCampaignActivationAction({
      campaignId: 'campaign-1',
      activationId: 'activation-1',
      reason: 'motivo',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(mockUseCases.cancelCampaignActivation).not.toHaveBeenCalled();
  });

  it('S7: strategist puede cancelar y la razón se propaga tal cual al use case', async () => {
    mockRequireOrganizationRole.mockResolvedValue(orgContext('strategist'));

    const result = await cancelCampaignActivationAction({
      campaignId: 'campaign-1',
      activationId: 'activation-1',
      reason: 'Cliente pausó el presupuesto',
    });

    expect(result.ok).toBe(true);
    const input = firstArg(mockUseCases.cancelCampaignActivation);
    expect(input['reason']).toBe('Cliente pausó el presupuesto');
  });

  it('S7b: razón vacía rechazada por el use case (VALIDATION_ERROR) se traduce sin lanzar', async () => {
    mockRequireOrganizationRole.mockResolvedValue(orgContext('strategist'));
    mockUseCases.cancelCampaignActivation.mockResolvedValue(
      err({ code: 'VALIDATION_ERROR', message: 'A non-empty cancellation reason is required.' }),
    );

    const result = await cancelCampaignActivationAction({
      campaignId: 'campaign-1',
      activationId: 'activation-1',
      reason: '',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
  });
});

describe('lecturas — S9: viewer+ (cualquier miembro activo), sin efectos secundarios de escritura', () => {
  it('viewer puede leer una activación', async () => {
    mockRequireOrganization.mockResolvedValue(orgContext('viewer'));
    mockUseCases.getCampaignActivation.mockResolvedValue(ok(ACTIVATION));

    const result = await getCampaignActivationAction({ activationId: 'activation-1' });

    expect(result.ok).toBe(true);
    expect(mockRequireOrganizationRole).not.toHaveBeenCalled();
    // Ningún método de escritura fue invocado por una lectura pura.
    expect(mockUseCases.createCampaignActivation).not.toHaveBeenCalled();
    expect(mockUseCases.cancelCampaignActivation).not.toHaveBeenCalled();
    expect(mockUseCases.addCampaignActivationTarget).not.toHaveBeenCalled();
    expect(mockUseCases.prepareActivationTarget).not.toHaveBeenCalled();
    expect(mockUseCases.markActivationTargetReady).not.toHaveBeenCalled();
    expect(mockUseCases.markActivationTargetPublished).not.toHaveBeenCalled();
    expect(mockUseCases.cancelActivationTarget).not.toHaveBeenCalled();
  });

  it('no autenticado / sin org activa → FORBIDDEN', async () => {
    mockRequireOrganization.mockRejectedValue(new Error('redirect'));

    const result = await listCampaignActivationsByCampaignAction({ campaignId: 'campaign-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
  });
});

describe('S10: ningún Server Action de este archivo llama a un proveedor externo', () => {
  it('el código fuente no importa adapters de Meta/Google/LinkedIn/email ni hace fetch directo', () => {
    const here = fileURLToPath(import.meta.url).replace(/\\/g, '/');
    const actionsPath = here.replace(/__tests__\/actions\.test\.ts$/, 'actions.ts');
    const source = readFileSync(actionsPath, 'utf-8');

    const forbiddenPatterns = [
      /\bfetch\(/i,
      /MetaAdapter/i,
      /GoogleAdsClient/i,
      /LinkedInClient/i,
      /EmailProvider/i,
      /graph\.facebook\.com/i,
      /googleads\.googleapis\.com/i,
      /api\.linkedin\.com/i,
      /sendgrid|mailgun|nodemailer|smtp:\/\//i,
    ];

    for (const pattern of forbiddenPatterns) {
      expect(source).not.toMatch(pattern);
    }
  });
});
