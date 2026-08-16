/**
 * SupabaseComplianceRuleRepository — tests unitarios.
 * Sin conexión a Supabase real. Mock del cliente con vitest.
 *
 * Cobertura:
 * - query acotada a "global o de esta organización" (.or() con organization_id)
 * - active=true siempre aplicado
 * - scope de cliente: global/org visibles siempre, cliente ajeno descartado
 * - platform/jurisdiction: sin filtro = no excluye; con filtro = global + match
 * - precedencia (cliente > organización > global) delegada a resolveComplianceRulePrecedence
 * - nunca retorna reglas de otra organización (ni siquiera transitoriamente:
 *   la query en BD ya las excluye, no solo el filtro en TS)
 */

import { describe, it, expect, vi } from 'vitest';
import { SupabaseComplianceRuleRepository } from '../supabase-compliance-rule.repository';
import type { ComplianceRuleRow } from '../../mappers/compliance-rule.mapper';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrganizationId, ClientId } from '@bop-agency/domain';
import { isOk, isErr } from '@bop-agency/shared';

const ORG_ID = 'org-uuid-1' as unknown as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as unknown as ClientId;
const OTHER_CLIENT_ID = 'client-uuid-2' as unknown as ClientId;

let counter = 0;
const makeRow = (overrides: Partial<ComplianceRuleRow> = {}): ComplianceRuleRow => {
  counter += 1;
  return {
    id: `rule-uuid-${counter}`,
    organization_id: null,
    client_id: null,
    platform: null,
    jurisdiction: null,
    rule_key: `rule-${counter}`,
    title: `Regla ${counter}`,
    description: 'Descripción de la regla.',
    severity: 'medium',
    category: 'general',
    active: true,
    source: null,
    metadata: {},
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
};

function makeSupabaseMock(result: { data?: unknown; error?: { message: string } | null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: result.data ?? [], error: result.error ?? null }),
  };
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

describe('SupabaseComplianceRuleRepository.findApplicableRules', () => {
  it('acota la query a global o de la organización dada', async () => {
    const supabase = makeSupabaseMock({ data: [] });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    await repo.findApplicableRules({ organizationId: ORG_ID });

    expect(supabase._chain.or).toHaveBeenCalledWith(
      `organization_id.is.null,organization_id.eq.${ORG_ID}`,
    );
  });

  it('siempre filtra active=true en la query', async () => {
    const supabase = makeSupabaseMock({ data: [] });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    await repo.findApplicableRules({ organizationId: ORG_ID });

    expect(supabase._chain.eq).toHaveBeenCalledWith('active', true);
  });

  it('incluye reglas globales y de organización (client_id NULL)', async () => {
    const global = makeRow({ rule_key: 'a' });
    const org = makeRow({ rule_key: 'b', organization_id: ORG_ID as string });
    const supabase = makeSupabaseMock({ data: [global, org] });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findApplicableRules({ organizationId: ORG_ID });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((r) => r.ruleKey).sort()).toEqual(['a', 'b']);
    }
  });

  it('incluye reglas del cliente solicitado', async () => {
    const clientRule = makeRow({
      rule_key: 'c',
      organization_id: ORG_ID as string,
      client_id: CLIENT_ID as string,
    });
    const supabase = makeSupabaseMock({ data: [clientRule] });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findApplicableRules({ organizationId: ORG_ID, clientId: CLIENT_ID });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((r) => r.ruleKey)).toEqual(['c']);
    }
  });

  it('NUNCA retorna reglas de otro cliente dentro de la misma organización', async () => {
    const otherClientRule = makeRow({
      rule_key: 'd',
      organization_id: ORG_ID as string,
      client_id: OTHER_CLIENT_ID as string,
    });
    const global = makeRow({ rule_key: 'global' });
    const supabase = makeSupabaseMock({ data: [otherClientRule, global] });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findApplicableRules({ organizationId: ORG_ID, clientId: CLIENT_ID });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((r) => r.ruleKey)).toEqual(['global']);
    }
  });

  it('sin platform en el filtro: no excluye reglas específicas de plataforma', async () => {
    const metaRule = makeRow({ rule_key: 'meta', platform: 'meta_ads' });
    const googleRule = makeRow({ rule_key: 'google', platform: 'google_ads' });
    const supabase = makeSupabaseMock({ data: [metaRule, googleRule] });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findApplicableRules({ organizationId: ORG_ID });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((r) => r.ruleKey).sort()).toEqual(['google', 'meta']);
    }
  });

  it('con platform en el filtro: incluye globales de plataforma + coincidencias, excluye otras plataformas', async () => {
    const universal = makeRow({ rule_key: 'universal', platform: null });
    const metaRule = makeRow({ rule_key: 'meta', platform: 'meta_ads' });
    const googleRule = makeRow({ rule_key: 'google', platform: 'google_ads' });
    const supabase = makeSupabaseMock({ data: [universal, metaRule, googleRule] });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findApplicableRules({ organizationId: ORG_ID, platform: 'meta_ads' });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((r) => r.ruleKey).sort()).toEqual(['meta', 'universal']);
    }
  });

  it('con jurisdiction en el filtro: incluye globales de jurisdicción + coincidencias', async () => {
    const universal = makeRow({ rule_key: 'universal', jurisdiction: null });
    const us = makeRow({ rule_key: 'us', jurisdiction: 'US' });
    const mx = makeRow({ rule_key: 'mx', jurisdiction: 'MX' });
    const supabase = makeSupabaseMock({ data: [universal, us, mx] });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findApplicableRules({ organizationId: ORG_ID, jurisdiction: 'US' });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.map((r) => r.ruleKey).sort()).toEqual(['universal', 'us']);
    }
  });

  it('aplica precedencia: la regla de cliente gana sobre org/global con el mismo ruleKey', async () => {
    const global = makeRow({ rule_key: 'k', title: 'Global' });
    const org = makeRow({ rule_key: 'k', title: 'Org', organization_id: ORG_ID as string });
    const client = makeRow({
      rule_key: 'k',
      title: 'Cliente',
      organization_id: ORG_ID as string,
      client_id: CLIENT_ID as string,
    });
    const supabase = makeSupabaseMock({ data: [global, org, client] });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findApplicableRules({ organizationId: ORG_ID, clientId: CLIENT_ID });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.title).toBe('Cliente');
    }
  });

  it('propaga error de Supabase como INTERNAL_ERROR', async () => {
    const supabase = makeSupabaseMock({ data: null, error: { message: 'boom' } });
    const repo = new SupabaseComplianceRuleRepository(supabase as unknown as SupabaseClient);

    const result = await repo.findApplicableRules({ organizationId: ORG_ID });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe('INTERNAL_ERROR');
    }
  });
});
