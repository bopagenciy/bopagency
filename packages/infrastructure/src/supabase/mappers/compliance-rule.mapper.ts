/**
 * ComplianceRuleMapper — Supabase DB rows → Domain ComplianceRule entities.
 *
 * Alineado con la tabla `compliance_rules` creada en
 * 20260816130000_phase7b_campaign_studio_persistence.sql.
 *
 * IMPORTANTE:
 * - `organization_id`/`client_id` son nullable en BD (NULL organization_id =
 *   regla global; NULL client_id = regla de organización completa) — el
 *   mapper los transporta tal cual, sin inventar un valor por defecto.
 * - `platform` es texto nullable con CHECK en BD (no ENUM) — igual criterio
 *   que CampaignMapper: NULL = aplica a todas las plataformas.
 * - `severity` es ENUM de Postgres — se valida contra ComplianceRuleSeverity.
 */

import type {
  ComplianceRule,
  ComplianceRuleId,
  ComplianceRuleSeverity,
} from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type { AdPlatform } from '@bop-agency/shared';
import { AD_PLATFORMS } from '@bop-agency/shared';

// ─── Row type (alineado con compliance_rules) ──────────────────────────────────

export type ComplianceRuleRow = {
  id: string;
  organization_id: string | null;
  client_id: string | null;
  platform: string | null;
  jurisdiction: string | null;
  rule_key: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  active: boolean;
  source: string | null;
  metadata: unknown; // Json en Supabase
  created_at: string;
  updated_at: string;
};

// ─── DB enum values ───────────────────────────────────────────────────────────

const COMPLIANCE_RULE_SEVERITIES: ComplianceRuleSeverity[] = ['critical', 'high', 'medium', 'low'];

// ─── Internal parsers ─────────────────────────────────────────────────────────

function parseSeverity(raw: string, rowId: string): ComplianceRuleSeverity {
  if ((COMPLIANCE_RULE_SEVERITIES as string[]).includes(raw)) {
    return raw as ComplianceRuleSeverity;
  }
  throw new Error(
    `ComplianceRuleMapper: severity "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${COMPLIANCE_RULE_SEVERITIES.join(', ')}`,
  );
}

function parsePlatform(raw: string | null, rowId: string): AdPlatform | null {
  if (raw === null || raw === undefined) return null;
  if ((AD_PLATFORMS as readonly string[]).includes(raw)) {
    return raw as AdPlatform;
  }
  throw new Error(
    `ComplianceRuleMapper: platform "${raw}" no es válido (row.id=${rowId}). Valores válidos: ${AD_PLATFORMS.join(', ')}`,
  );
}

function parseMetadata(raw: unknown, rowId: string): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`ComplianceRuleMapper: metadata no es un objeto (row.id=${rowId})`);
  }
  return raw as Record<string, unknown>;
}

function parseDate(raw: string, field: string, rowId: string): Date {
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw new Error(
      `ComplianceRuleMapper: "${field}" no es una fecha válida (row.id=${rowId}): ${raw}`,
    );
  }
  return d;
}

// ─── Public mapper ────────────────────────────────────────────────────────────

export function rowToComplianceRule(row: ComplianceRuleRow): ComplianceRule {
  return {
    id: row.id as ComplianceRuleId,
    organizationId: row.organization_id ? (row.organization_id as unknown as OrganizationId) : null,
    clientId: row.client_id ? (row.client_id as ClientId) : null,
    platform: parsePlatform(row.platform, row.id),
    jurisdiction: row.jurisdiction,
    ruleKey: row.rule_key,
    title: row.title,
    description: row.description,
    severity: parseSeverity(row.severity, row.id),
    category: row.category,
    active: row.active,
    source: row.source,
    metadata: parseMetadata(row.metadata, row.id),
    createdAt: parseDate(row.created_at, 'created_at', row.id),
    updatedAt: parseDate(row.updated_at, 'updated_at', row.id),
  };
}
