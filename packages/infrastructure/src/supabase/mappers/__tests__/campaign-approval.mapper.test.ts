import { describe, it, expect } from 'vitest';
import { rowToCampaignApproval, type CampaignApprovalRow } from '../campaign-approval.mapper';

const makeRow = (overrides: Partial<CampaignApprovalRow> = {}): CampaignApprovalRow => ({
  id: 'approval-uuid-1',
  organization_id: 'org-uuid-1',
  campaign_id: 'campaign-uuid-1',
  action: 'approved',
  note: null,
  actor_user_id: 'user-uuid-1',
  metadata: {},
  created_at: '2026-08-16T00:00:00.000Z',
  ...overrides,
});

describe('rowToCampaignApproval', () => {
  it('mapea una fila de aprobación válida', () => {
    const row = makeRow();
    const approval = rowToCampaignApproval(row);

    expect(approval.id).toBe('approval-uuid-1');
    expect(approval.organizationId).toBe('org-uuid-1');
    expect(approval.campaignId).toBe('campaign-uuid-1');
    expect(approval.action).toBe('approved');
    expect(approval.note).toBeNull();
    expect(approval.actorUserId).toBe('user-uuid-1');
    expect(approval.createdAt).toBeInstanceOf(Date);
  });

  it('mapea una fila de rechazo con note', () => {
    const row = makeRow({ action: 'rejected', note: 'Presupuesto excesivo' });
    const approval = rowToCampaignApproval(row);

    expect(approval.action).toBe('rejected');
    expect(approval.note).toBe('Presupuesto excesivo');
  });

  it('lanza si action no es válida', () => {
    const row = makeRow({ action: 'maybe' });
    expect(() => rowToCampaignApproval(row)).toThrow(/action/);
  });

  it('lanza si metadata no es un objeto', () => {
    const row = makeRow({ metadata: 'not-an-object' });
    expect(() => rowToCampaignApproval(row)).toThrow(/metadata/);
  });

  it('trata metadata null como objeto vacío', () => {
    const row = makeRow({ metadata: null });
    const approval = rowToCampaignApproval(row);
    expect(approval.metadata).toEqual({});
  });

  it('lanza si created_at no es una fecha válida', () => {
    const row = makeRow({ created_at: 'not-a-date' });
    expect(() => rowToCampaignApproval(row)).toThrow(/created_at/);
  });
});
