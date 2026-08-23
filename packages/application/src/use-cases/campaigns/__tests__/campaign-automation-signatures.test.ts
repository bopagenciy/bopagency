/**
 * Tests — campaign-automation-signatures — Phase 7F
 *
 * Cubre: determinismo de las firmas (idempotency keys), longitud máxima,
 * y que no incluyan PII/timestamps.
 */

import { describe, it, expect } from 'vitest';
import {
  campaignReviewRequestedKey,
  campaignRejectedKey,
  campaignApprovedKey,
  campaignAiProviderFailureKey,
  buildCampaignTaskTags,
  buildCampaignTaskSignatureTag,
} from '../campaign-automation-signatures';
import type { OrganizationId, CampaignId } from '@bop-agency/domain';

const ORG = 'org-111' as OrganizationId;
const CAMPAIGN = 'campaign-222' as CampaignId;

describe('campaign-automation-signatures', () => {
  it('produces deterministic, stable keys for the same input', () => {
    expect(campaignReviewRequestedKey(ORG, CAMPAIGN)).toBe(campaignReviewRequestedKey(ORG, CAMPAIGN));
    expect(campaignRejectedKey(ORG, CAMPAIGN)).toBe(campaignRejectedKey(ORG, CAMPAIGN));
    expect(campaignApprovedKey(ORG, CAMPAIGN)).toBe(campaignApprovedKey(ORG, CAMPAIGN));
  });

  it('produces distinct keys per event type for the same campaign', () => {
    const keys = new Set([
      campaignReviewRequestedKey(ORG, CAMPAIGN),
      campaignRejectedKey(ORG, CAMPAIGN),
      campaignApprovedKey(ORG, CAMPAIGN),
    ]);
    expect(keys.size).toBe(3);
  });

  it('produces distinct keys per campaign for the same event type', () => {
    const other = 'campaign-999' as CampaignId;
    expect(campaignApprovedKey(ORG, CAMPAIGN)).not.toBe(campaignApprovedKey(ORG, other));
  });

  it('never exceeds the 255-char DB limit even with long inputs', () => {
    const longOrg = ('org-' + 'x'.repeat(300)) as OrganizationId;
    expect(campaignReviewRequestedKey(longOrg, CAMPAIGN).length).toBeLessThanOrEqual(255);
  });

  it('does not embed timestamps or random values (no digits-only volatile suffix)', () => {
    const key = campaignApprovedKey(ORG, CAMPAIGN);
    expect(key).toBe('campaign:org-111:campaign-222:approved');
  });

  it('scopes AI provider failure keys by errorKind, normalized and uppercased', () => {
    const key = campaignAiProviderFailureKey(ORG, String(CAMPAIGN), 'ai_timeout');
    expect(key).toBe('campaign:org-111:campaign-222:ai-provider-failure:AI_TIMEOUT');
  });

  it('builds task tags including org and campaign scoping for RLS/filtering', () => {
    const tags = buildCampaignTaskTags(ORG, CAMPAIGN, 'campaign_rejected');
    expect(tags).toContain(`org:${ORG}`);
    expect(tags).toContain(`campaign-id:${CAMPAIGN}`);
    expect(tags).toContain('event:campaign_rejected');
  });

  it('builds a stable signature tag usable for dedup lookups', () => {
    const tag1 = buildCampaignTaskSignatureTag(ORG, CAMPAIGN, 'campaign_approved');
    const tag2 = buildCampaignTaskSignatureTag(ORG, CAMPAIGN, 'campaign_approved');
    expect(tag1).toBe(tag2);
    expect(tag1.startsWith('sig:')).toBe(true);
  });
});
