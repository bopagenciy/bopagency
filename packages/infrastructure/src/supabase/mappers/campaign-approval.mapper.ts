/**
 * CampaignApprovalMapper — Supabase DB rows → Domain CampaignApproval entities.
 *
 * Alineado con la tabla `campaign_approvals` creada en
 * 20260816130000_phase7b_campaign_studio_persistence.sql. Tabla append-only:
 * este mapper solo transporta filas ya escritas (por las RPCs
 * approve_campaign/reject_campaign de Phase 7C) — nunca construye un objeto
 * para insertar.
 */

import type { CampaignApproval, CampaignApprovalId, CampaignApprovalAction } from '@bop-agency/domain';
import type { CampaignId } from '@bop-agency/domain';
import type { OrganizationId } from '@bop-agency/domain';

// ─── Row type (alineado con campaign_approvals) ────────────────────────────────

export type CampaignApprovalRow = {
  id: string;
  organization_id: string;
  campaign_id: string;
  action: string;
  note: string | null;
  actor_user_id: string;
  metadata: unknown; // Json en Supabase
  created_at: string;
};

// ─── DB enum values ───────────────────────────────────────────────────────────

const CAMPAIGN_APPROVAL_ACTIONS: CampaignApprovalAction[] = ['approved', 'rejected'];

// ─── Internal parsers ─────────────────────────────────────────────────────────

function parseAction(raw: string, rowId: string): CampaignApprovalAction {
  if ((CAMPAIGN_APPROVAL_ACTIONS as string[]).includes(raw)) {
    return raw as CampaignApprovalAction;
  }
  throw new Error(
    `CampaignApprovalMapper: action "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${CAMPAIGN_APPROVAL_ACTIONS.join(', ')}`,
  );
}

function parseMetadata(raw: unknown, rowId: string): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`CampaignApprovalMapper: metadata no es un objeto (row.id=${rowId})`);
  }
  return raw as Record<string, unknown>;
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(
      `CampaignApprovalMapper: "${field}" no es una fecha válida (row.id=${rowId}): ${raw}`,
    );
  }
  return d;
}

// ─── Public mapper ────────────────────────────────────────────────────────────

export function rowToCampaignApproval(row: CampaignApprovalRow): CampaignApproval {
  return {
    id: row.id as CampaignApprovalId,
    organizationId: row.organization_id as unknown as OrganizationId,
    campaignId: row.campaign_id as CampaignId,
    action: parseAction(row.action, row.id),
    note: row.note,
    actorUserId: row.actor_user_id,
    metadata: parseMetadata(row.metadata, row.id),
    createdAt: parseDate(row.created_at, 'created_at', row.id),
  };
}
