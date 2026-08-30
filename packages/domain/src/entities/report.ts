/**
 * Report & ReportDelivery — Entidades de dominio para las tablas
 * `public.reports` y `public.report_deliveries` (Phase 9A.0).
 */

import type { OrganizationId } from './organization';
import type { ClientId } from './client';

export type ReportId = string & { readonly _brand: 'ReportId' };
export type ReportDeliveryId = string & { readonly _brand: 'ReportDeliveryId' };

export function reportId(id: string): ReportId {
  if (!id || id.trim().length === 0) {
    throw new Error('ReportId cannot be empty');
  }
  return id as ReportId;
}

export function reportDeliveryId(id: string): ReportDeliveryId {
  if (!id || id.trim().length === 0) {
    throw new Error('ReportDeliveryId cannot be empty');
  }
  return id as ReportDeliveryId;
}

export type ReportType = 'weekly' | 'monthly' | 'custom';
export type ReportStatus = 'draft' | 'generated' | 'failed';
export type DeliveryChannel = 'email' | 'pdf_download' | 'webhook';
export type DeliveryStatus = 'queued' | 'delivered' | 'failed';

export type ReportSummary = {
  readonly title: string;
  readonly executiveSummary: string;
  readonly highlights: string[];
  readonly recommendations: string[];
  readonly metricsOverview: {
    readonly totalSpend: number;
    readonly totalImpressions: number;
    readonly totalClicks: number;
    readonly totalLeads: number;
    readonly totalConversions: number;
    readonly avgRoas: number;
  };
};

export type ReportDelivery = {
  readonly id: ReportDeliveryId;
  readonly organizationId: OrganizationId;
  readonly reportId: ReportId;
  readonly recipientEmail: string;
  readonly channel: DeliveryChannel;
  readonly status: DeliveryStatus;
  readonly attemptNumber: number;
  readonly idempotencyKey: string | null;
  readonly providerMessageId: string | null;
  readonly sentAt: Date | null;
  readonly errorMessage: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
};

export type Report = {
  readonly id: ReportId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly reportType: ReportType;
  readonly status: ReportStatus;
  readonly periodLabel: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly currency: string;
  readonly generatedAt: Date | null;
  readonly summary: ReportSummary;
  readonly payload: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

/**
 * Valida los estados de transición permitidos en un reporte (generación/contenido).
 */
export function canTransitionReportStatus(from: ReportStatus, to: ReportStatus): boolean {
  if (from === to) return true;
  switch (from) {
    case 'draft':
      return to === 'generated' || to === 'failed';
    case 'generated':
      return to === 'failed';
    case 'failed':
      return to === 'generated' || to === 'draft';
    default:
      return false;
  }
}

/**
 * Valida que el período del reporte sea consistente.
 */
export function validateReportPeriod(start: Date, end: Date): boolean {
  return start <= end;
}
