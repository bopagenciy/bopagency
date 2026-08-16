import { describe, it, expect } from 'vitest';
import {
  resolveComplianceRulePrecedence,
  evaluateCampaignCompliance,
} from '../entities/compliance-rule';
import type { ComplianceRule } from '../entities/compliance-rule';
import type { Campaign, CampaignId } from '../entities/campaign';
import type { OrganizationId } from '../entities/organization';
import type { ClientId } from '../entities/client';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_ID = 'org-uuid-1' as unknown as OrganizationId;
const OTHER_ORG_ID = 'org-uuid-2' as unknown as OrganizationId;
const CLIENT_ID = 'client-uuid-1' as unknown as ClientId;
const CAMPAIGN_ID = 'campaign-uuid-1' as unknown as CampaignId;

let ruleCounter = 0;

function makeRule(overrides: Partial<ComplianceRule> = {}): ComplianceRule {
  ruleCounter += 1;
  return {
    id: `rule-uuid-${ruleCounter}` as unknown as ComplianceRule['id'],
    organizationId: null,
    clientId: null,
    platform: null,
    jurisdiction: null,
    ruleKey: 'disclaimer-required',
    title: 'Disclaimer requerido',
    description: 'Toda campaña de salud debe incluir un disclaimer legal.',
    severity: 'high',
    category: 'salud_general',
    active: true,
    source: null,
    metadata: {},
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: CAMPAIGN_ID,
    organizationId: ORG_ID,
    clientId: CLIENT_ID,
    name: 'Campaña de Verano',
    platform: 'meta_ads',
    objective: 'lead_generation',
    status: 'review',
    brief: null,
    budget: 5000000,
    currency: 'COP',
    startDate: null,
    endDate: null,
    generatedContent: null,
    metadata: {},
    createdBy: 'user-uuid-1',
    updatedBy: null,
    submittedForReviewAt: new Date('2026-08-10T00:00:00.000Z'),
    approvedAt: null,
    rejectedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    ...overrides,
  };
}

// ─── resolveComplianceRulePrecedence ────────────────────────────────────────────

describe('resolveComplianceRulePrecedence', () => {
  it('mantiene una única regla global si no hay ninguna más específica', () => {
    const global = makeRule({ ruleKey: 'global-only' });
    const result = resolveComplianceRulePrecedence([global]);
    expect(result).toEqual([global]);
  });

  it('la regla de organización gana sobre la global con el mismo ruleKey', () => {
    const global = makeRule({ ruleKey: 'k', title: 'Global' });
    const org = makeRule({ ruleKey: 'k', title: 'Org', organizationId: ORG_ID });
    const result = resolveComplianceRulePrecedence([global, org]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Org');
  });

  it('la regla de cliente gana sobre la de organización y la global con el mismo ruleKey', () => {
    const global = makeRule({ ruleKey: 'k', title: 'Global' });
    const org = makeRule({ ruleKey: 'k', title: 'Org', organizationId: ORG_ID });
    const client = makeRule({
      ruleKey: 'k',
      title: 'Cliente',
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
    });
    const result = resolveComplianceRulePrecedence([global, org, client]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('Cliente');
  });

  it('el orden de entrada no afecta el resultado (cliente sigue ganando)', () => {
    const global = makeRule({ ruleKey: 'k', title: 'Global' });
    const client = makeRule({
      ruleKey: 'k',
      title: 'Cliente',
      organizationId: ORG_ID,
      clientId: CLIENT_ID,
    });
    const result = resolveComplianceRulePrecedence([client, global]);
    expect(result[0]?.title).toBe('Cliente');
  });

  it('preserva reglas con ruleKey distinto sin colapsarlas', () => {
    const a = makeRule({ ruleKey: 'a' });
    const b = makeRule({ ruleKey: 'b', organizationId: ORG_ID });
    const result = resolveComplianceRulePrecedence([a, b]);
    expect(result.map((r) => r.ruleKey).sort()).toEqual(['a', 'b']);
  });

  it('retorna array vacío si no hay reglas', () => {
    expect(resolveComplianceRulePrecedence([])).toEqual([]);
  });
});

// ─── evaluateCampaignCompliance ──────────────────────────────────────────────────

describe('evaluateCampaignCompliance', () => {
  it('nunca produce violations/warnings automáticas con el schema actual (contenido textual)', () => {
    const campaign = makeCampaign();
    const rules = [makeRule()];
    const result = evaluateCampaignCompliance(campaign, rules);

    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.evaluatedRuleKeys).toEqual([]);
  });

  it('coloca cada regla activa aplicable en requiresManualReview', () => {
    const campaign = makeCampaign({ platform: 'meta_ads' });
    const rules = [makeRule({ ruleKey: 'a' }), makeRule({ ruleKey: 'b' })];
    const result = evaluateCampaignCompliance(campaign, rules);

    expect(result.requiresManualReview).toHaveLength(2);
    expect(result.requiresManualReview.map((r) => r.ruleKey).sort()).toEqual(['a', 'b']);
  });

  it('excluye reglas inactivas de requiresManualReview', () => {
    const campaign = makeCampaign();
    const rules = [makeRule({ ruleKey: 'active-rule', active: true }), makeRule({ ruleKey: 'inactive-rule', active: false })];
    const result = evaluateCampaignCompliance(campaign, rules);

    expect(result.requiresManualReview.map((r) => r.ruleKey)).toEqual(['active-rule']);
  });

  it('excluye reglas de otra plataforma (defensa en profundidad)', () => {
    const campaign = makeCampaign({ platform: 'meta_ads' });
    const rules = [makeRule({ ruleKey: 'meta-rule', platform: 'meta_ads' }), makeRule({ ruleKey: 'google-rule', platform: 'google_ads' })];
    const result = evaluateCampaignCompliance(campaign, rules);

    expect(result.requiresManualReview.map((r) => r.ruleKey)).toEqual(['meta-rule']);
  });

  it('incluye reglas sin plataforma específica (aplican a todas)', () => {
    const campaign = makeCampaign({ platform: 'google_ads' });
    const rules = [makeRule({ ruleKey: 'universal-rule', platform: null })];
    const result = evaluateCampaignCompliance(campaign, rules);

    expect(result.requiresManualReview.map((r) => r.ruleKey)).toEqual(['universal-rule']);
  });

  it('retorna requiresManualReview vacío si no hay reglas aplicables', () => {
    const campaign = makeCampaign();
    const result = evaluateCampaignCompliance(campaign, []);

    expect(result.requiresManualReview).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('incluye el campaignId en el resultado', () => {
    const campaign = makeCampaign();
    const result = evaluateCampaignCompliance(campaign, []);
    expect(result.campaignId).toBe(CAMPAIGN_ID);
  });

  it('es determinístico: misma entrada produce el mismo resultado', () => {
    const campaign = makeCampaign();
    const rules = [makeRule({ ruleKey: 'x' })];
    const r1 = evaluateCampaignCompliance(campaign, rules);
    const r2 = evaluateCampaignCompliance(campaign, rules);
    expect(r1).toEqual(r2);
  });

  it('no depende de la organización de la regla (no filtra por org aquí; eso es responsabilidad del repositorio)', () => {
    const campaign = makeCampaign({ organizationId: ORG_ID });
    const ruleFromOtherOrgShapeButAlreadyFilteredUpstream = makeRule({
      ruleKey: 'y',
      organizationId: OTHER_ORG_ID,
    });
    // NOTA: evaluateCampaignCompliance confía en que el caller (repositorio +
    // use case) ya filtró por organización antes de llegar aquí — esta
    // función pura no repite ese filtro (evitar duplicar responsabilidad de
    // scoping multi-tenant, que ya vive en ComplianceRuleRepository).
    const result = evaluateCampaignCompliance(campaign, [
      ruleFromOtherOrgShapeButAlreadyFilteredUpstream,
    ]);
    expect(result.requiresManualReview).toHaveLength(1);
  });
});
