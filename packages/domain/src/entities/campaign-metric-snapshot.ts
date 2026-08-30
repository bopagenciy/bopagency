/**
 * CampaignMetricSnapshot — Entidad de dominio para la tabla
 * `public.campaign_metric_snapshots` (Phase 9A.0).
 *
 * Representa una foto/snapshot diaria o periódica de rendimiento para una campaña específica
 * o cliente en una plataforma publicitaria.
 */

import type { OrganizationId } from './organization';
import type { ClientId } from './client';
import type { CampaignId } from './campaign';
import type { CampaignActivationId } from './campaign-activation';
import type { MetricPlatform } from '@bop-agency/shared';

export type CampaignMetricSnapshotId = string & { readonly _brand: 'CampaignMetricSnapshotId' };

export function campaignMetricSnapshotId(id: string): CampaignMetricSnapshotId {
  if (!id || id.trim().length === 0) {
    throw new Error('CampaignMetricSnapshotId cannot be empty');
  }
  return id as CampaignMetricSnapshotId;
}

export type SnapshotGranularity = 'daily' | 'weekly' | 'monthly' | 'total';
export type SnapshotScope = 'campaign' | 'client' | 'account';

export type CampaignMetricSnapshotValues = {
  readonly spend: string | null;
  readonly impressions: number | null;
  readonly reach: number | null;
  readonly clicks: number | null;
  readonly leads: number | null;
  readonly conversions: number | null;
  readonly revenue: string | null;
  readonly ctr: number | null;
  readonly cpc: number | null;
  readonly cpm: number | null;
  readonly roas: number | null;
};

export type CampaignMetricSnapshot = {
  readonly id: CampaignMetricSnapshotId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly campaignId: CampaignId | null;
  readonly activationId: CampaignActivationId | null;
  readonly platform: MetricPlatform;
  readonly providerAccountId: string | null;
  readonly externalCampaignId: string | null;
  readonly snapshotDate: Date;
  readonly granularity: SnapshotGranularity;
  readonly scope: SnapshotScope;
  readonly currency: string;
  readonly metrics: CampaignMetricSnapshotValues;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * Convierte y normaliza montos monetarios a un decimal string canónico de 2 decimales ("1234.57").
 * Para entradas string, realiza redondeo/normalización sin pasar por la imprecisión del flotante JS.
 */
export function parseMonetaryAmount(raw: number | string | null): string | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;

    const parts = trimmed.split('.');
    const rawInt = parts[0] ?? '';
    const integerPart = rawInt.replace(/^0+(?=\d)/, '') || '0';
    const fractionPart = parts[1] || '';

    if (fractionPart.length === 0) {
      return `${integerPart}.00`;
    } else if (fractionPart.length === 1) {
      return `${integerPart}.${fractionPart}0`;
    } else if (fractionPart.length === 2) {
      return `${integerPart}.${fractionPart}`;
    } else {
      const thirdDigitChar = fractionPart[2] ?? '0';
      const thirdDigit = parseInt(thirdDigitChar, 10);
      let cents = parseInt(fractionPart.slice(0, 2), 10);
      let intVal = BigInt(integerPart);

      if (thirdDigit >= 5) {
        cents += 1;
        if (cents >= 100) {
          cents = 0;
          intVal += 1n;
        }
      }
      const centsStr = cents.toString().padStart(2, '0');
      return `${intVal.toString()}.${centsStr}`;
    }
  }

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    const rounded = Math.round((raw + Number.EPSILON) * 100) / 100;
    return rounded.toFixed(2);
  }

  return null;
}

/**
 * Valida los invariantes numéricos del snapshot de métricas de campaña.
 */
export function validateCampaignMetricSnapshotValues(values: CampaignMetricSnapshotValues): string[] {
  const errors: string[] = [];
  if (values.spend !== null) {
    if (!/^\d+\.\d{2}$/.test(values.spend)) {
      errors.push(`CampaignMetricSnapshotValues.spend debe ser nulo o un string decimal válido de 2 decimales (recibido: ${values.spend})`);
    }
  }

  if (values.revenue !== null) {
    if (!/^\d+\.\d{2}$/.test(values.revenue)) {
      errors.push(`CampaignMetricSnapshotValues.revenue debe ser nulo o un string decimal válido de 2 decimales (recibido: ${values.revenue})`);
    }
  }

  const numericFields: (keyof Omit<CampaignMetricSnapshotValues, 'spend' | 'revenue'>)[] = [
    'impressions',
    'reach',
    'clicks',
    'leads',
    'conversions',
    'ctr',
    'cpc',
    'cpm',
    'roas',
  ];

  for (const field of numericFields) {
    const val = values[field];
    if (val !== null) {
      if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
        errors.push(`CampaignMetricSnapshotValues.${field} debe ser nulo o un número finito no negativo (recibido: ${String(val)})`);
      }
    }
  }

  return errors;
}

/**
 * Calcula CTR, CPC, CPM y ROAS derivados a partir de métricas brutas.
 * Devuelve null si la métrica primitiva no está disponible o no aplica.
 * Ignora ratios externos del caller y recalcula determinísticamente.
 */
export function computeDerivedSnapshotMetrics(raw: {
  spend: number | string | null;
  impressions: number | null;
  clicks: number | null;
  revenue: number | string | null;
}): {
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  roas: number | null;
} {
  const safeSpendStr = parseMonetaryAmount(raw.spend);
  const safeRevenueStr = parseMonetaryAmount(raw.revenue);
  const spendNum = safeSpendStr !== null ? parseFloat(safeSpendStr) : null;
  const revenueNum = safeRevenueStr !== null ? parseFloat(safeRevenueStr) : null;

  const ctr = (raw.impressions !== null && raw.clicks !== null)
    ? (raw.impressions > 0 ? (raw.clicks / raw.impressions) * 100 : 0)
    : null;

  const cpc = (raw.clicks !== null && spendNum !== null)
    ? (raw.clicks > 0 ? spendNum / raw.clicks : 0)
    : null;

  const cpm = (raw.impressions !== null && spendNum !== null)
    ? (raw.impressions > 0 ? (spendNum / raw.impressions) * 1000 : 0)
    : null;

  const roas = (revenueNum !== null && spendNum !== null)
    ? (spendNum > 0 ? revenueNum / spendNum : 0)
    : null;

  return {
    ctr: ctr !== null && Number.isFinite(ctr) ? Number(ctr.toFixed(4)) : null,
    cpc: cpc !== null && Number.isFinite(cpc) ? Number(cpc.toFixed(4)) : null,
    cpm: cpm !== null && Number.isFinite(cpm) ? Number(cpm.toFixed(4)) : null,
    roas: roas !== null && Number.isFinite(roas) ? Number(roas.toFixed(4)) : null,
  };
}
