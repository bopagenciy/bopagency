import { describe, it, expect } from 'vitest';
import {
  extractMetaLeads,
  resolveMetaPurchaseMetrics,
  type MetaActionItem,
} from '../meta-actions.mapper';

describe('Meta Actions & Conversion Mapper (Phase 9B.1)', () => {
  it('returns null when actions array is missing or empty', () => {
    expect(extractMetaLeads(null)).toBeNull();
    expect(extractMetaLeads([])).toBeNull();
    const purchaseRes = resolveMetaPurchaseMetrics(null, null);
    expect(purchaseRes.conversions).toBeNull();
    expect(purchaseRes.revenue).toBeNull();
  });

  it('extracts lead count prioritizing canonical "lead" and avoiding double counting', () => {
    const actions: MetaActionItem[] = [
      { action_type: 'offsite_conversion.fb_pixel_lead', value: '8' },
      { action_type: 'lead', value: '10' },
      { action_type: 'link_click', value: '100' },
    ];
    expect(extractMetaLeads(actions)).toBe(10);
  });

  it('falls back to pixel lead if canonical "lead" is missing', () => {
    const actions: MetaActionItem[] = [
      { action_type: 'offsite_conversion.fb_pixel_lead', value: '25' },
    ];
    expect(extractMetaLeads(actions)).toBe(25);
  });

  it('resolves conversion count and revenue from the same action family (purchase)', () => {
    const actions: MetaActionItem[] = [
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '4' },
      { action_type: 'purchase', value: '5' },
      { action_type: 'omni_purchase', value: '5' },
    ];
    const actionValues: MetaActionItem[] = [
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '350.00' },
      { action_type: 'purchase', value: '450.00' },
    ];

    const result = resolveMetaPurchaseMetrics(actions, actionValues);
    expect(result.actionType).toBe('purchase');
    expect(result.conversions).toBe(5); // Prioriza 'purchase'=5 (NO suma 5+5+4=14)
    expect(result.revenue).toBe('450.00'); // Asocia con 'purchase'=450.00
  });

  it('returns null revenue when count exists but matching action_value is missing', () => {
    const actions: MetaActionItem[] = [
      { action_type: 'purchase', value: '3' },
    ];
    const actionValues: MetaActionItem[] = [
      { action_type: 'offsite_conversion.fb_pixel_purchase', value: '200.00' },
    ];

    const result = resolveMetaPurchaseMetrics(actions, actionValues);
    expect(result.actionType).toBe('purchase');
    expect(result.conversions).toBe(3);
    expect(result.revenue).toBeNull(); // No mezcla familias distintas
  });
});
