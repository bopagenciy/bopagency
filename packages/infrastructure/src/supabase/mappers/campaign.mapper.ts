/**
 * CampaignMapper — Supabase DB rows → Domain Campaign entities.
 *
 * Alineado con la tabla `campaigns` creada en
 * 20260816130000_phase7b_campaign_studio_persistence.sql.
 *
 * IMPORTANTE:
 * - `status` y `objective` son ENUMs de Postgres — se validan contra los
 *   valores reales del dominio (CAMPAIGN_STATUSES / CampaignObjective).
 * - `platform` es texto con CHECK en BD (no ENUM) — se valida contra
 *   AD_PLATFORMS, igual que MetricMapper valida platform contra METRIC_PLATFORMS.
 * - `budget` es `numeric` en Postgres → llega como string via postgres.js/PostgREST
 *   en algunos drivers; se parsea de forma tolerante (string o number).
 * - `generated_content` es jsonb nullable — NUNCA implica aprobación automática
 *   por su sola presencia (regla de negocio fijada), el mapper solo lo transporta.
 */

import type { Campaign, CampaignId } from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type { CampaignObjective } from '@bop-agency/domain';
import type { CampaignStatus, AdPlatform } from '@bop-agency/shared';
import { CAMPAIGN_STATUSES, AD_PLATFORMS } from '@bop-agency/shared';

// ─── Row type (alineado con campaigns.Row) ─────────────────────────────────────

export type CampaignRow = {
  id: string;
  organization_id: string;
  client_id: string;
  name: string;
  platform: string;
  objective: string;
  status: string;
  brief: string | null;
  budget: number | string;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  generated_content: unknown | null; // Json en Supabase
  metadata: unknown; // Json en Supabase
  created_by: string;
  updated_by: string | null;
  submitted_for_review_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

// ─── DB enum values ───────────────────────────────────────────────────────────

const CAMPAIGN_OBJECTIVES: CampaignObjective[] = [
  'brand_awareness',
  'reach',
  'traffic',
  'engagement',
  'lead_generation',
  'conversions',
  'catalog_sales',
];

// ─── Internal parsers ─────────────────────────────────────────────────────────

function parseStatus(raw: string, rowId: string): CampaignStatus {
  if ((CAMPAIGN_STATUSES as readonly string[]).includes(raw)) {
    return raw as CampaignStatus;
  }
  throw new Error(
    `CampaignMapper: status "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${CAMPAIGN_STATUSES.join(', ')}`,
  );
}

function parseObjective(raw: string, rowId: string): CampaignObjective {
  if ((CAMPAIGN_OBJECTIVES as string[]).includes(raw)) {
    return raw as CampaignObjective;
  }
  throw new Error(
    `CampaignMapper: objective "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${CAMPAIGN_OBJECTIVES.join(', ')}`,
  );
}

function parsePlatform(raw: string, rowId: string): AdPlatform {
  if ((AD_PLATFORMS as readonly string[]).includes(raw)) {
    return raw as AdPlatform;
  }
  throw new Error(
    `CampaignMapper: platform "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${AD_PLATFORMS.join(', ')}`,
  );
}

function parseBudget(raw: number | string, rowId: string): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  throw new Error(`CampaignMapper: budget inválido (row.id=${rowId}): ${String(raw)}`);
}

function parseMetadata(raw: unknown, rowId: string): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`CampaignMapper: metadata no es un objeto (row.id=${rowId})`);
  }
  return raw as Record<string, unknown>;
}

function parseGeneratedContent(raw: unknown, rowId: string): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`CampaignMapper: generated_content no es un objeto (row.id=${rowId})`);
  }
  return raw as Record<string, unknown>;
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(`CampaignMapper: "${field}" no es una fecha válida (row.id=${rowId}): ${raw}`);
  }
  return d;
}

function parseOptionalDate(raw: string | null, field: string, rowId: string): Date | null {
  if (raw === null || raw === undefined) return null;
  return parseDate(raw, field, rowId);
}

// ─── Public mapper ────────────────────────────────────────────────────────────

export function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id as CampaignId,
    organizationId: row.organization_id as unknown as OrganizationId,
    clientId: row.client_id as ClientId,
    name: row.name,
    platform: parsePlatform(row.platform, row.id),
    objective: parseObjective(row.objective, row.id),
    status: parseStatus(row.status, row.id),
    brief: row.brief,
    budget: parseBudget(row.budget, row.id),
    currency: row.currency,
    startDate: parseOptionalDate(row.start_date, 'start_date', row.id),
    endDate: parseOptionalDate(row.end_date, 'end_date', row.id),
    generatedContent: parseGeneratedContent(row.generated_content, row.id),
    metadata: parseMetadata(row.metadata, row.id),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    submittedForReviewAt: parseOptionalDate(
      row.submitted_for_review_at,
      'submitted_for_review_at',
      row.id,
    ),
    approvedAt: parseOptionalDate(row.approved_at, 'approved_at', row.id),
    rejectedAt: parseOptionalDate(row.rejected_at, 'rejected_at', row.id),
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
  };
}
