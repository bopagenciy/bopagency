import { describe, it, expect } from 'vitest';
import {
  rowToCampaignActivation,
  rowToCampaignActivationTarget,
  rowToCampaignActivationEvent,
  type CampaignActivationRow,
  type CampaignActivationTargetRow,
  type CampaignActivationEventRow,
} from '../campaign-activation.mapper';

const makeActivationRow = (overrides: Partial<CampaignActivationRow> = {}): CampaignActivationRow => ({
  id: 'activation-uuid-1',
  organization_id: 'org-uuid-1',
  client_id: 'client-uuid-1',
  campaign_id: 'campaign-uuid-1',
  campaign_approval_id: 'approval-uuid-1',
  status: 'pending',
  approved_snapshot: {
    schemaVersion: 'activation-snapshot-v1',
    campaign: { id: 'campaign-uuid-1', name: 'Campaña X' },
    generatedContent: null,
    metadata: {},
    approval: { campaignApprovalId: 'approval-uuid-1', approvedAt: '2026-08-16T00:00:00.000Z', approvedBy: 'user-uuid-1' },
  },
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
  id: 'target-uuid-1',
  activation_id: 'activation-uuid-1',
  organization_id: 'org-uuid-1',
  client_id: 'client-uuid-1',
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

const makeEventRow = (overrides: Partial<CampaignActivationEventRow> = {}): CampaignActivationEventRow => ({
  id: 'event-uuid-1',
  organization_id: 'org-uuid-1',
  activation_id: 'activation-uuid-1',
  target_id: null,
  event_type: 'activation_created',
  actor_user_id: 'user-uuid-1',
  is_system: false,
  from_status: null,
  to_status: null,
  note: null,
  metadata: {},
  created_at: '2026-08-24T00:00:00.000Z',
  ...overrides,
});

describe('rowToCampaignActivation', () => {
  it('mapea una fila válida', () => {
    const activation = rowToCampaignActivation(makeActivationRow());
    expect(activation.id).toBe('activation-uuid-1');
    expect(activation.organizationId).toBe('org-uuid-1');
    expect(activation.status).toBe('pending');
    expect(activation.approvedSnapshot).toMatchObject({ schemaVersion: 'activation-snapshot-v1' });
    expect(activation.createdAt).toBeInstanceOf(Date);
    expect(activation.cancelledAt).toBeNull();
  });

  it('mapea fechas nullable presentes', () => {
    const row = makeActivationRow({
      cancelled_at: '2026-08-24T10:00:00.000Z',
      cancelled_by: 'user-uuid-2',
      cancellation_reason: 'Cliente pausó la campaña',
      status: 'cancelled',
    });
    const activation = rowToCampaignActivation(row);
    expect(activation.cancelledAt).toBeInstanceOf(Date);
    expect(activation.cancellationReason).toBe('Cliente pausó la campaña');
  });

  it('lanza si status no es válido', () => {
    const row = makeActivationRow({ status: 'not-a-status' });
    expect(() => rowToCampaignActivation(row)).toThrow(/status/);
  });

  it('lanza si approved_snapshot no es un objeto', () => {
    const row = makeActivationRow({ approved_snapshot: 'not-an-object' });
    expect(() => rowToCampaignActivation(row)).toThrow(/approved_snapshot/);
  });

  it('lanza si created_at no es una fecha válida', () => {
    const row = makeActivationRow({ created_at: 'not-a-date' });
    expect(() => rowToCampaignActivation(row)).toThrow(/created_at/);
  });

  it('trata metadata null como objeto vacío', () => {
    const row = makeActivationRow({ metadata: null });
    const activation = rowToCampaignActivation(row);
    expect(activation.metadata).toEqual({});
  });
});

describe('rowToCampaignActivationTarget', () => {
  it('mapea un target manual válido', () => {
    const target = rowToCampaignActivationTarget(makeTargetRow());
    expect(target.channel).toBe('manual');
    expect(target.provider).toBe('manual');
    expect(target.clientIntegrationId).toBeNull();
    expect(target.status).toBe('pending');
  });

  it('mapea un target con client_integration_id', () => {
    const row = makeTargetRow({
      channel: 'meta_ads',
      provider: 'meta',
      client_integration_id: 'integration-uuid-1',
    });
    const target = rowToCampaignActivationTarget(row);
    expect(target.clientIntegrationId).toBe('integration-uuid-1');
  });

  it('lanza si channel no es válido', () => {
    const row = makeTargetRow({ channel: 'not-a-channel' });
    expect(() => rowToCampaignActivationTarget(row)).toThrow(/channel/);
  });

  it('lanza si provider no es válido', () => {
    const row = makeTargetRow({ provider: 'not-a-provider' });
    expect(() => rowToCampaignActivationTarget(row)).toThrow(/provider/);
  });

  it('lanza si status no es válido', () => {
    const row = makeTargetRow({ status: 'not-a-status' });
    expect(() => rowToCampaignActivationTarget(row)).toThrow(/status/);
  });
});

describe('rowToCampaignActivationEvent', () => {
  it('mapea un evento a nivel activation (target_id null)', () => {
    const event = rowToCampaignActivationEvent(makeEventRow());
    expect(event.targetId).toBeNull();
    expect(event.eventType).toBe('activation_created');
    expect(event.isSystem).toBe(false);
    expect(event.actorUserId).toBe('user-uuid-1');
  });

  it('mapea un evento de sistema sin actor', () => {
    const row = makeEventRow({ is_system: true, actor_user_id: null, event_type: 'target_status_changed', target_id: 'target-uuid-1', from_status: 'ready', to_status: 'published' });
    const event = rowToCampaignActivationEvent(row);
    expect(event.isSystem).toBe(true);
    expect(event.actorUserId).toBeNull();
    expect(event.targetId).toBe('target-uuid-1');
    expect(event.fromStatus).toBe('ready');
    expect(event.toStatus).toBe('published');
  });

  it('lanza si event_type no es válido', () => {
    const row = makeEventRow({ event_type: 'not-a-real-event' });
    expect(() => rowToCampaignActivationEvent(row)).toThrow(/event_type/);
  });
});
