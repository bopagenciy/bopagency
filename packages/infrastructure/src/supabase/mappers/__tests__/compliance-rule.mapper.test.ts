import { describe, it, expect } from 'vitest';
import { rowToComplianceRule, type ComplianceRuleRow } from '../compliance-rule.mapper';

const makeRow = (overrides: Partial<ComplianceRuleRow> = {}): ComplianceRuleRow => ({
  id: 'rule-uuid-1',
  organization_id: null,
  client_id: null,
  platform: null,
  jurisdiction: null,
  rule_key: 'disclaimer-required',
  title: 'Disclaimer requerido',
  description: 'Toda campaña de salud debe incluir un disclaimer legal.',
  severity: 'high',
  category: 'salud_general',
  active: true,
  source: null,
  metadata: {},
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...overrides,
});

describe('rowToComplianceRule', () => {
  it('mapea una regla global (organization_id NULL)', () => {
    const rule = rowToComplianceRule(makeRow());
    expect(rule.organizationId).toBeNull();
    expect(rule.clientId).toBeNull();
  });

  it('mapea una regla de organización', () => {
    const row = makeRow({ organization_id: 'org-uuid-1' });
    const rule = rowToComplianceRule(row);
    expect(rule.organizationId).toBe('org-uuid-1');
    expect(rule.clientId).toBeNull();
  });

  it('mapea una regla de cliente', () => {
    const row = makeRow({ organization_id: 'org-uuid-1', client_id: 'client-uuid-1' });
    const rule = rowToComplianceRule(row);
    expect(rule.organizationId).toBe('org-uuid-1');
    expect(rule.clientId).toBe('client-uuid-1');
  });

  it('mapea platform NULL como null (aplica a todas)', () => {
    const rule = rowToComplianceRule(makeRow({ platform: null }));
    expect(rule.platform).toBeNull();
  });

  it('mapea una platform válida', () => {
    const rule = rowToComplianceRule(makeRow({ platform: 'meta_ads' }));
    expect(rule.platform).toBe('meta_ads');
  });

  it('lanza si platform no es válida', () => {
    const row = makeRow({ platform: 'not-a-real-platform' });
    expect(() => rowToComplianceRule(row)).toThrow(/platform/);
  });

  it('lanza si severity no es válida', () => {
    const row = makeRow({ severity: 'catastrophic' });
    expect(() => rowToComplianceRule(row)).toThrow(/severity/);
  });

  it('mapea las 4 severidades válidas', () => {
    for (const severity of ['critical', 'high', 'medium', 'low']) {
      const rule = rowToComplianceRule(makeRow({ severity }));
      expect(rule.severity).toBe(severity);
    }
  });

  it('mapea active boolean tal cual', () => {
    expect(rowToComplianceRule(makeRow({ active: false })).active).toBe(false);
    expect(rowToComplianceRule(makeRow({ active: true })).active).toBe(true);
  });

  it('lanza si metadata no es un objeto', () => {
    const row = makeRow({ metadata: 'oops' });
    expect(() => rowToComplianceRule(row)).toThrow(/metadata/);
  });

  it('lanza si updated_at no es una fecha válida', () => {
    const row = makeRow({ updated_at: 'not-a-date' });
    expect(() => rowToComplianceRule(row)).toThrow(/updated_at/);
  });
});
