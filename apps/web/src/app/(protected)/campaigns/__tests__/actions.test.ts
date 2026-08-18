/**
 * Campaign Server Actions — selección de proveedor de IA (Phase 7D.1).
 *
 * Estrategia: mocks totales de dependencias externas (mismo patrón que
 * `automations/__tests__/actions.test.ts`). No se toca Supabase ni ningún
 * proveedor real.
 *
 * Cobertura (§21 "SERVER ACTION"):
 *   S1. provider válido se propaga al use case
 *   S2. provider omitido → el use case no recibe el campo (default del servidor)
 *   S3. provider '' (opción "usar predeterminado") → tampoco se propaga
 *   S4. provider arbitrario → VALIDATION_ERROR, use case NUNCA invocado
 *   S5. el payload no acepta API key ni model desde el cliente (se ignoran)
 *   S6. regenerate: provider válido se propaga
 *   S7. regenerate: provider arbitrario → VALIDATION_ERROR sin invocar el use case
 *   S8. rol insuficiente → FORBIDDEN antes de cualquier validación de provider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from '@bop-agency/shared';
import {
  aiGenerationTimeout,
  aiProviderFailure,
  aiRateLimited,
  campaignGenerationUnavailable,
  invalidAiOutput,
} from '@bop-agency/domain';

const {
  mockRevalidatePath,
  mockRequireOrganizationRole,
  mockCreateServerSupabaseClient,
  mockUseCases,
  MockComposition,
} = vi.hoisted(() => {
  const mockUseCases = {
    listCampaigns: vi.fn(),
    getCampaign: vi.fn(),
    listCampaignApprovals: vi.fn(),
    getApplicableComplianceRules: vi.fn(),
    evaluateCampaignCompliance: vi.fn(),
    createCampaignDraft: vi.fn(),
    editCampaignDraft: vi.fn(),
    submitCampaignForReview: vi.fn(),
    approveCampaign: vi.fn(),
    rejectCampaign: vi.fn(),
    generateCampaignDraftWithAI: vi.fn(),
    regenerateCampaignContent: vi.fn(),
  };
  return {
    mockRevalidatePath: vi.fn(),
    mockRequireOrganizationRole: vi.fn(),
    mockCreateServerSupabaseClient: vi.fn().mockResolvedValue({}),
    mockUseCases,
    MockComposition: vi.fn().mockReturnValue({ useCases: mockUseCases, repositories: {} }),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/lib/auth/server', () => ({
  requireOrganization: vi.fn(),
  requireOrganizationRole: mockRequireOrganizationRole,
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}));
vi.mock('@/lib/composition/campaign.composition', () => ({
  createCampaignComposition: MockComposition,
}));

import {
  editCampaignDraftAction,
  generateCampaignDraftWithAiAction,
  regenerateCampaignContentAction,
} from '../actions';

const ORG_CONTEXT = {
  user: { id: 'user-1' },
  organization: { id: 'org-1' },
  membership: { role: 'operator' },
};

const CAMPAIGN = { id: 'campaign-1' };

/** Primer argumento con el que se invocó un mock, sin non-null assertions. */
function firstArg(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const [first] = mock.mock.calls as [unknown[]] | [];
  if (first === undefined) throw new Error('el use case no fue invocado');
  return first[0] as Record<string, unknown>;
}

const BASE_PAYLOAD = {
  clientId: 'client-1',
  platform: 'meta_ads',
  objective: 'lead_generation',
  brief: 'Brief de prueba con suficiente contenido.',
  budget: 5000000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrganizationRole.mockResolvedValue(ORG_CONTEXT);
  mockCreateServerSupabaseClient.mockResolvedValue({});
  mockUseCases.generateCampaignDraftWithAI.mockResolvedValue(ok(CAMPAIGN));
  mockUseCases.regenerateCampaignContent.mockResolvedValue(ok(CAMPAIGN));
  mockUseCases.editCampaignDraft.mockResolvedValue(ok(CAMPAIGN));
});

describe('editCampaignDraftAction — draft edit flow (auditoría 7E)', () => {
  it('E1: propaga solo los campos provistos, con organizationId/actorUserId resueltos del servidor', async () => {
    const result = await editCampaignDraftAction({
      campaignId: 'campaign-1',
      name: 'Nuevo nombre',
      budget: 7000000,
    });

    expect(result.ok).toBe(true);
    const input = firstArg(mockUseCases.editCampaignDraft);
    expect(input).toEqual({
      campaignId: 'campaign-1',
      name: 'Nuevo nombre',
      budget: 7000000,
      organizationId: 'org-1',
      actorUserId: 'user-1',
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/campaigns');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/campaigns/campaign-1');
  });

  it('E2: rol insuficiente retorna FORBIDDEN sin invocar el use case', async () => {
    mockRequireOrganizationRole.mockRejectedValueOnce(new Error('forbidden'));

    const result = await editCampaignDraftAction({ campaignId: 'campaign-1', name: 'X' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(mockUseCases.editCampaignDraft).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('E3: status/organizationId/actorUserId enviados desde el cliente nunca llegan crudos al use case', async () => {
    await editCampaignDraftAction({
      campaignId: 'campaign-1',
      name: 'Nombre válido',
      // Campos que el tipo del payload NO declara — simula un cliente que
      // intenta forzar status/organizationId/actorUserId en el POST.
      status: 'approved',
      organizationId: 'org-attacker',
      actorUserId: 'user-attacker',
    } as never);

    const input = firstArg(mockUseCases.editCampaignDraft);
    expect(input.organizationId).toBe('org-1');
    expect(input.actorUserId).toBe('user-1');
    expect('status' in input).toBe(false);
  });

  it('E4: un error de dominio (campaña no editable) se propaga con su mensaje', async () => {
    mockUseCases.editCampaignDraft.mockResolvedValueOnce(
      err({ code: 'VALIDATION_ERROR' as const, message: 'Cannot edit campaign in status "review".' }),
    );

    const result = await editCampaignDraftAction({ campaignId: 'campaign-1', name: 'X' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toBe('Cannot edit campaign in status "review".');
    }
  });
});

describe('generateCampaignDraftWithAiAction — provider (7D.1)', () => {
  it('S1: propaga un provider válido al use case', async () => {
    const result = await generateCampaignDraftWithAiAction({ ...BASE_PAYLOAD, provider: 'gemini' });

    expect(result.ok).toBe(true);
    const input = firstArg(mockUseCases.generateCampaignDraftWithAI);
    expect(input.provider).toBe('gemini');
  });

  it('S2: sin provider, el use case no recibe el campo', async () => {
    await generateCampaignDraftWithAiAction(BASE_PAYLOAD);

    const input = firstArg(mockUseCases.generateCampaignDraftWithAI);
    expect('provider' in input).toBe(false);
  });

  it("S3: provider '' (opción \"usar predeterminado\") tampoco se propaga", async () => {
    await generateCampaignDraftWithAiAction({ ...BASE_PAYLOAD, provider: '' });

    const input = firstArg(mockUseCases.generateCampaignDraftWithAI);
    expect('provider' in input).toBe(false);
  });

  it('S4: provider arbitrario retorna VALIDATION_ERROR y NUNCA invoca el use case', async () => {
    const result = await generateCampaignDraftWithAiAction({
      ...BASE_PAYLOAD,
      provider: 'https://evil.example.com/v1',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(mockUseCases.generateCampaignDraftWithAI).not.toHaveBeenCalled();
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('S5: apiKey/model enviados desde el cliente nunca llegan al use case', async () => {
    await generateCampaignDraftWithAiAction({
      ...BASE_PAYLOAD,
      provider: 'openai',
      // Campos que el tipo del payload NO declara — se fuerzan para simular
      // un cliente malicioso que los agrega al POST de la Server Action.
      apiKey: 'sk-leaked-key',
      model: 'gpt-4o-custom',
      apiUrl: 'https://evil.example.com',
    } as never);

    const input = firstArg(mockUseCases.generateCampaignDraftWithAI);
    expect(input.provider).toBe('openai');
    expect('apiKey' in input).toBe(false);
    expect('model' in input).toBe(false);
    expect('apiUrl' in input).toBe(false);
    expect(JSON.stringify(input)).not.toContain('sk-leaked-key');
  });

  it('S8: rol insuficiente retorna FORBIDDEN sin invocar el use case', async () => {
    mockRequireOrganizationRole.mockRejectedValueOnce(new Error('forbidden'));

    const result = await generateCampaignDraftWithAiAction({ ...BASE_PAYLOAD, provider: 'gemini' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FORBIDDEN');
    expect(mockUseCases.generateCampaignDraftWithAI).not.toHaveBeenCalled();
  });

  it('S9: un error de configuración del proveedor se traduce a copy accionable, sin texto técnico', async () => {
    mockUseCases.generateCampaignDraftWithAI.mockResolvedValueOnce(
      err(campaignGenerationUnavailable('provider "openai" is not configured (missing OPENAI_API_KEY).')),
    );

    const result = await generateCampaignDraftWithAiAction({ ...BASE_PAYLOAD, provider: 'openai' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error).toBe(
        'El proveedor de IA seleccionado no está configurado en el servidor. Elige otro proveedor o avisa a un administrador.',
      );
      // Nada técnico llega al usuario: ni nombre de variable, ni inglés, ni keys.
      expect(result.error).not.toContain('OPENAI_API_KEY');
      expect(result.error).not.toContain('not configured');
      expect(result.error).not.toMatch(/sk-|AIza|Bearer/);
    }
  });
});

// ─── Phase 7D.1.1 — mensajes de error orientados al usuario ────────────────────

describe('mapError — copy de errores de IA (7D.1.1)', () => {
  it('T1: AI_TIMEOUT muestra el mensaje de reintento, no el texto técnico en inglés', async () => {
    mockUseCases.generateCampaignDraftWithAI.mockResolvedValueOnce(err(aiGenerationTimeout()));

    const result = await generateCampaignDraftWithAiAction(BASE_PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        'La generación con IA tardó más de lo esperado. Intenta nuevamente.',
      );
      expect(result.error).not.toContain('timed out');
    }
  });

  it('T2: AI_RATE_LIMITED muestra el mensaje de límite temporal', async () => {
    mockUseCases.generateCampaignDraftWithAI.mockResolvedValueOnce(err(aiRateLimited()));

    const result = await generateCampaignDraftWithAiAction(BASE_PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('RATE_LIMITED');
      expect(result.error).toBe(
        'El proveedor de IA está temporalmente limitado. Intenta nuevamente en unos momentos.',
      );
      expect(result.error).not.toContain('rate limit');
    }
  });

  it('T3: AI_EXTERNAL_SERVICE_ERROR (5xx) muestra "no disponible temporalmente" sin el status', async () => {
    mockUseCases.generateCampaignDraftWithAI.mockResolvedValueOnce(
      err(aiProviderFailure('AI provider request failed: status 503 (UNAVAILABLE)')),
    );

    const result = await generateCampaignDraftWithAiAction(BASE_PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        'El proveedor de IA no está disponible temporalmente. Intenta nuevamente.',
      );
      expect(result.error).not.toContain('503');
      expect(result.error).not.toContain('UNAVAILABLE');
    }
  });

  it('T4: AI_INVALID_OUTPUT no expone rutas de campos ni jerga de schema', async () => {
    mockUseCases.generateCampaignDraftWithAI.mockResolvedValueOnce(
      err(invalidAiOutput('el contenido generado no cumple el schema esperado (campos: adSets.0.creatives).')),
    );

    const result = await generateCampaignDraftWithAiAction(BASE_PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(
        'La IA devolvió un resultado que no pudimos interpretar. Intenta nuevamente o ajusta el brief.',
      );
      expect(result.error).not.toContain('schema');
      expect(result.error).not.toContain('adSets');
    }
  });

  it('T5: un VALIDATION_ERROR normal sí conserva su mensaje (es accionable por el usuario)', async () => {
    mockUseCases.generateCampaignDraftWithAI.mockResolvedValueOnce(
      err({ code: 'VALIDATION_ERROR' as const, message: 'El brief es requerido para generar con IA' }),
    );

    const result = await generateCampaignDraftWithAiAction(BASE_PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('El brief es requerido para generar con IA');
  });

  it('T6: los detalles internos (attempts/provider/kind) NUNCA llegan al cliente', async () => {
    mockUseCases.generateCampaignDraftWithAI.mockResolvedValueOnce(err(aiGenerationTimeout()));

    const result = await generateCampaignDraftWithAiAction(BASE_PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result).sort()).toEqual(['code', 'error', 'ok']);
      expect(JSON.stringify(result)).not.toContain('attempts');
      expect(JSON.stringify(result)).not.toContain('aiErrorKind');
    }
  });
});

describe('regenerateCampaignContentAction — provider (7D.1)', () => {
  it('S6: propaga un provider válido al use case', async () => {
    const result = await regenerateCampaignContentAction({
      campaignId: 'campaign-1',
      provider: 'anthropic',
    });

    expect(result.ok).toBe(true);
    const input = firstArg(mockUseCases.regenerateCampaignContent);
    expect(input.provider).toBe('anthropic');
  });

  it('S7: provider arbitrario retorna VALIDATION_ERROR sin invocar el use case', async () => {
    const result = await regenerateCampaignContentAction({
      campaignId: 'campaign-1',
      provider: 'claude-code',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('VALIDATION_ERROR');
    expect(mockUseCases.regenerateCampaignContent).not.toHaveBeenCalled();
  });

  it('S10: sin provider, se omite el campo para que el servidor reutilice el original', async () => {
    await regenerateCampaignContentAction({ campaignId: 'campaign-1' });

    const input = firstArg(mockUseCases.regenerateCampaignContent);
    expect('provider' in input).toBe(false);
  });
});
