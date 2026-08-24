/**
 * SupabaseCampaignActivationRepository — tests unitarios.
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseCampaignActivationRepository } from '../supabase-campaign-activation.repository';
import type { CampaignActivationRow, CampaignActivationTargetRow } from '../../mappers/campaign-activation.mapper';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  OrganizationId,
  ClientId,
  CampaignId,
  CampaignApprovalId,
  CampaignActivationId,
  CampaignActivationTargetId,
} from '@bop-agency/domain';
import { isOk, isErr } from '@bop-agency/shared';

const ORG_ID = 'org-uuid-1' as unknown as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as unknown as ClientId;
const CAMPAIGN_ID = 'campaign-uuid-1' as unknown as CampaignId;
const APPROVAL_ID = 'approval-uuid-1' as unknown as CampaignApprovalId;
const ACTIVATION_ID = 'activation-uuid-1' as unknown as CampaignActivationId;
const TARGET_ID = 'target-uuid-1' as unknown as CampaignActivationTargetId;

const makeActivationRow = (overrides: Partial<CampaignActivationRow> = {}): CampaignActivationRow => ({
  id: ACTIVATION_ID as string,
  organization_id: ORG_ID as string,
  client_id: CLIENT_ID as string,
  campaign_id: CAMPAIGN_ID as string,
  campaign_approval_id: APPROVAL_ID as string,
  status: 'pending',
  approved_snapshot: { schemaVersion: 'activation-snapshot-v1' },
  scheduled_at: null,
  prepared_at: null,
  ready_at: null,
  started_at: null,
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancellation_reason: null,
  notes: null,
  metadata: {},
  created_by: 'user-uuid-1',
  updated_by: null,
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
  ...overrides,
});

const makeTargetRow = (overrides: Partial<CampaignActivationTargetRow> = {}): CampaignActivationTargetRow => ({
  id: TARGET_ID as string,
  activation_id: ACTIVATION_ID as string,
  organization_id: ORG_ID as string,
  client_id: CLIENT_ID as string,
  channel: 'manual',
  provider: 'manual',
  placement: null,
  client_integration_id: null,
  status: 'pending',
  readiness_checklist: {},
  scheduled_at: null,
  published_at: null,
  published_by: null,
  external_reference: null,
  failed_at: null,
  failure_code: null,
  failure_message: null,
  cancelled_at: null,
  cancelled_by: null,
  metadata: {},
  created_at: '2026-08-24T00:00:00.000Z',
  updated_at: '2026-08-24T00:00:00.000Z',
  ...overrides,
});

describe('SupabaseCampaignActivationRepository.findById', () => {
  it('retorna la activation mapeada', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeActivationRow(), error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(ACTIVATION_ID, ORG_ID);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.id).toBe(ACTIVATION_ID);
    }
    expect(chain.eq).toHaveBeenCalledWith('id', ACTIVATION_ID);
    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });

  it('retorna NOT_FOUND si no existe', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findById(ACTIVATION_ID, ORG_ID);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('SupabaseCampaignActivationRepository.findActiveByCampaign', () => {
  it('filtra por status no-terminal', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: makeActivationRow(), error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findActiveByCampaign(CAMPAIGN_ID, ORG_ID);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value?.id).toBe(ACTIVATION_ID);
    }
    expect(chain.in).toHaveBeenCalledWith(
      'status',
      expect.arrayContaining(['pending', 'preparing', 'ready', 'scheduled', 'executing']),
    );
  });

  it('retorna null si no hay activation activa', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findActiveByCampaign(CAMPAIGN_ID, ORG_ID);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBeNull();
    }
  });
});

describe('SupabaseCampaignActivationRepository.create', () => {
  it('inserta y retorna la activation creada', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeActivationRow(), error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      campaignId: CAMPAIGN_ID,
      campaignApprovalId: APPROVAL_ID,
      approvedSnapshot: { schemaVersion: 'activation-snapshot-v1' } as never,
      createdBy: 'user-uuid-1',
    });

    expect(isOk(result)).toBe(true);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: ORG_ID,
        client_id: CLIENT_ID,
        campaign_id: CAMPAIGN_ID,
        campaign_approval_id: APPROVAL_ID,
        status: 'pending',
      }),
    );
  });

  it('mapea error de trigger check_activation_source como VALIDATION_ERROR', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'check_activation_source: campaign is not approved' },
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      campaignId: CAMPAIGN_ID,
      campaignApprovalId: APPROVAL_ID,
      approvedSnapshot: {} as never,
      createdBy: 'user-uuid-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('mapea duplicate key (idempotencia) como CONFLICT', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'duplicate key value violates unique constraint "uq_campaign_activations_active_per_campaign"' },
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.create({
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      campaignId: CAMPAIGN_ID,
      campaignApprovalId: APPROVAL_ID,
      approvedSnapshot: {} as never,
      createdBy: 'user-uuid-1',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });
});

describe('SupabaseCampaignActivationRepository.cancel', () => {
  it('llama a la RPC cancel_campaign_activation y recarga la activation', async () => {
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeActivationRow({ status: 'cancelled' }), error: null }),
    };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.cancel(ACTIVATION_ID, ORG_ID, 'user-uuid-1', 'Cliente pausó la campaña');

    expect(rpc).toHaveBeenCalledWith('cancel_campaign_activation', {
      p_activation_id: ACTIVATION_ID,
      p_reason: 'Cliente pausó la campaña',
    });
    expect(isOk(result)).toBe(true);
  });

  it('mapea error de rol insuficiente como FORBIDDEN', async () => {
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeActivationRow(), error: null }),
    };
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'cancel_campaign_activation: actor lacks strategist+ role (activation_id: x)' },
    });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.cancel(ACTIVATION_ID, ORG_ID, 'user-uuid-1', 'razón');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('FORBIDDEN');
    }
  });

  it('mapea "is already terminal" como CONFLICT', async () => {
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeActivationRow(), error: null }),
    };
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'cancel_campaign_activation: activation x is already terminal (status: completed)' },
    });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.cancel(ACTIVATION_ID, ORG_ID, 'user-uuid-1', 'razón');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });

  it('no llama a la RPC si la activation no pertenece a la organización', async () => {
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'no rows' } }),
    };
    const rpc = vi.fn();
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.cancel(ACTIVATION_ID, ORG_ID, 'user-uuid-1', 'razón');

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('SupabaseCampaignActivationRepository.addTarget', () => {
  it('inserta un target manual', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeTargetRow(), error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.addTarget({
      activationId: ACTIVATION_ID,
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      channel: 'manual',
      provider: 'manual',
    });

    expect(isOk(result)).toBe(true);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'manual', provider: 'manual', client_integration_id: null, status: 'pending' }),
    );
  });

  it('mapea dedupe (23505) como CONFLICT', async () => {
    const chain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'duplicate key value violates unique constraint "uq_activation_targets_dedupe"' },
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.addTarget({
      activationId: ACTIVATION_ID,
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
      channel: 'manual',
      provider: 'manual',
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });
});

describe('SupabaseCampaignActivationRepository — RPCs de transición de target', () => {
  const setup = () => {
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeTargetRow(), error: null }),
    };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);
    return { repo, rpc };
  };

  it('prepareTarget llama a prepare_activation_target con el checklist', async () => {
    const { repo, rpc } = setup();
    const result = await repo.prepareTarget(TARGET_ID, ORG_ID, 'user-uuid-1', { assetsReady: true });
    expect(rpc).toHaveBeenCalledWith('prepare_activation_target', {
      p_target_id: TARGET_ID,
      p_checklist: { assetsReady: true },
    });
    expect(isOk(result)).toBe(true);
  });

  it('markTargetReady llama a mark_activation_target_ready', async () => {
    const { repo, rpc } = setup();
    await repo.markTargetReady(TARGET_ID, ORG_ID, 'user-uuid-1');
    expect(rpc).toHaveBeenCalledWith('mark_activation_target_ready', { p_target_id: TARGET_ID });
  });

  it('markTargetPublished llama a mark_activation_target_published con referencia y nota opcionales', async () => {
    const { repo, rpc } = setup();
    await repo.markTargetPublished(TARGET_ID, ORG_ID, 'user-uuid-1', 'post-123', 'Publicado en historia');
    expect(rpc).toHaveBeenCalledWith('mark_activation_target_published', {
      p_target_id: TARGET_ID,
      p_external_reference: 'post-123',
      p_note: 'Publicado en historia',
    });
  });

  it('markTargetPublished funciona sin referencia/nota (camino manual mínimo)', async () => {
    const { repo, rpc } = setup();
    await repo.markTargetPublished(TARGET_ID, ORG_ID, 'user-uuid-1');
    expect(rpc).toHaveBeenCalledWith('mark_activation_target_published', {
      p_target_id: TARGET_ID,
      p_external_reference: null,
      p_note: null,
    });
  });

  it('cancelTarget llama a cancel_activation_target con la razón', async () => {
    const { repo, rpc } = setup();
    await repo.cancelTarget(TARGET_ID, ORG_ID, 'user-uuid-1', 'Canal descartado');
    expect(rpc).toHaveBeenCalledWith('cancel_activation_target', {
      p_target_id: TARGET_ID,
      p_reason: 'Canal descartado',
    });
  });

  it('mapea "is not pending" como CONFLICT en prepareTarget', async () => {
    const findChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: makeTargetRow(), error: null }),
    };
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'prepare_activation_target: target x is not pending (current status: ready)' },
    });
    const supabase = { from: vi.fn().mockReturnValue(findChain), rpc };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.prepareTarget(TARGET_ID, ORG_ID, 'user-uuid-1');
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('CONFLICT');
    }
  });
});

describe('SupabaseCampaignActivationRepository.listTargets / listEvents — tenant scoping', () => {
  it('listTargets siempre filtra por activation_id y organization_id', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [makeTargetRow()], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    await repo.listTargets(ACTIVATION_ID, ORG_ID);

    expect(chain.eq).toHaveBeenCalledWith('activation_id', ACTIVATION_ID);
    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });

  it('listEvents pagina y filtra por organization_id', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'event-uuid-1',
            organization_id: ORG_ID,
            activation_id: ACTIVATION_ID,
            target_id: null,
            event_type: 'activation_created',
            actor_user_id: 'user-uuid-1',
            is_system: false,
            from_status: null,
            to_status: null,
            note: null,
            metadata: {},
            created_at: '2026-08-24T00:00:00.000Z',
          },
        ],
        error: null,
        count: 1,
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.listEvents(ACTIVATION_ID, ORG_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(chain.eq).toHaveBeenCalledWith('organization_id', ORG_ID);
  });

  it('listEvents retorna resultado vacío si Supabase devuelve error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' }, count: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const repo = new SupabaseCampaignActivationRepository(supabase as unknown as SupabaseClient);

    const result = await repo.listEvents(ACTIVATION_ID, ORG_ID, { page: 1, pageSize: 20 });

    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
  });
});
