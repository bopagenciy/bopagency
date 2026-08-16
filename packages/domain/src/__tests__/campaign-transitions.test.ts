import { describe, it, expect } from 'vitest';
import {
  canTransitionCampaign,
  getCampaignNextStates,
  isCampaignStatusTerminal,
} from '../entities/campaign';
import type { CampaignStatus } from '@bop-agency/shared';
import { CAMPAIGN_STATUSES } from '@bop-agency/shared';

describe('canTransitionCampaign', () => {
  it('permite draft → review', () => {
    expect(canTransitionCampaign('draft', 'review')).toBe(true);
  });

  it('permite review → approved', () => {
    expect(canTransitionCampaign('review', 'approved')).toBe(true);
  });

  it('permite review → rejected', () => {
    expect(canTransitionCampaign('review', 'rejected')).toBe(true);
  });

  it('rechaza draft → approved (no puede saltarse review)', () => {
    expect(canTransitionCampaign('draft', 'approved')).toBe(false);
  });

  it('rechaza draft → rejected', () => {
    expect(canTransitionCampaign('draft', 'rejected')).toBe(false);
  });

  it('rechaza review → active (debe pasar por approved primero)', () => {
    expect(canTransitionCampaign('review', 'active')).toBe(false);
  });

  it('permite approved → active', () => {
    expect(canTransitionCampaign('approved', 'active')).toBe(true);
  });

  it('rechaza cualquier transición desde rejected (estado terminal)', () => {
    for (const to of CAMPAIGN_STATUSES) {
      expect(canTransitionCampaign('rejected', to)).toBe(false);
    }
  });

  it('rechaza cualquier transición desde completed (estado terminal)', () => {
    for (const to of CAMPAIGN_STATUSES) {
      expect(canTransitionCampaign('completed', to)).toBe(false);
    }
  });

  it('rechaza auto-transición draft → draft', () => {
    expect(canTransitionCampaign('draft', 'draft')).toBe(false);
  });
});

describe('getCampaignNextStates', () => {
  it('retorna los estados válidos desde draft', () => {
    expect(getCampaignNextStates('draft')).toEqual(['review']);
  });

  it('retorna los estados válidos desde review', () => {
    expect(getCampaignNextStates('review')).toEqual(['approved', 'rejected']);
  });

  it('retorna array vacío para rejected', () => {
    expect(getCampaignNextStates('rejected')).toEqual([]);
  });

  it('retorna una copia (no la referencia interna)', () => {
    const a = getCampaignNextStates('draft');
    const b = getCampaignNextStates('draft');
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('isCampaignStatusTerminal', () => {
  it('rejected es terminal', () => {
    expect(isCampaignStatusTerminal('rejected')).toBe(true);
  });

  it('completed es terminal', () => {
    expect(isCampaignStatusTerminal('completed')).toBe(true);
  });

  it('draft no es terminal', () => {
    expect(isCampaignStatusTerminal('draft')).toBe(false);
  });

  it('review no es terminal', () => {
    expect(isCampaignStatusTerminal('review')).toBe(false);
  });

  it('approved no es terminal', () => {
    expect(isCampaignStatusTerminal('approved')).toBe(false);
  });

  it('cubre los 7 CampaignStatus sin lanzar', () => {
    for (const status of CAMPAIGN_STATUSES as readonly CampaignStatus[]) {
      expect(() => isCampaignStatusTerminal(status)).not.toThrow();
    }
  });
});
