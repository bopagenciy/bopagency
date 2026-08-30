/**
 * ReportsRepository — Contrato de dominio para persistencia y entrega de reportes (Phase 9A.0).
 */

import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  Report,
  ReportId,
  ReportType,
  ReportStatus,
  ReportDelivery,
  ReportDeliveryId,
  DeliveryChannel,
  DeliveryStatus,
} from '../entities/report';
import type { ClientId } from '../entities/client';
import type { OrganizationId } from '../entities/organization';

export type ReportFilter = {
  readonly organizationId: OrganizationId;
  readonly clientId?: ClientId;
  readonly reportType?: ReportType;
  readonly status?: ReportStatus;
  readonly startDate?: Date;
  readonly endDate?: Date;
};

export type CreateReportInput = {
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly reportType: ReportType;
  readonly title?: string;
  readonly status?: ReportStatus;
  readonly periodLabel?: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly currency?: string;
  readonly summary?: string | null;
  readonly payload?: Record<string, unknown>;
  readonly createdBy?: string;
};

export type CreateReportDeliveryInput = {
  readonly organizationId: OrganizationId;
  readonly reportId: ReportId;
  readonly recipientEmail: string;
  readonly channel?: DeliveryChannel;
  readonly status?: DeliveryStatus;
  readonly idempotencyKey?: string | null;
  readonly sentAt?: Date | null;
  readonly errorMessage?: string | null;
  readonly metadata?: Record<string, unknown>;
};

export interface ReportsRepository {
  findById(id: ReportId, organizationId: OrganizationId): Promise<Result<Report>>;

  findByFilter(
    filter: ReportFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Report>>;

  findByClient(
    clientId: ClientId,
    pagination: PaginationParams,
    organizationId?: OrganizationId,
  ): Promise<PaginatedResult<Report>>;

  save(input: CreateReportInput): Promise<Result<Report>>;

  updateStatus(
    id: ReportId,
    organizationId: OrganizationId,
    status: ReportStatus,
    fileUrl?: string | null,
    errorMessage?: string | null,
  ): Promise<Result<Report>>;

  logDeliveryAttempt(input: CreateReportDeliveryInput): Promise<Result<ReportDelivery>>;

  saveDelivery(input: CreateReportDeliveryInput): Promise<Result<ReportDelivery>>;

  updateDeliveryStatus(
    deliveryId: ReportDeliveryId,
    organizationId: OrganizationId,
    status: DeliveryStatus,
    providerMessageId?: string | null,
    errorMessage?: string | null,
  ): Promise<Result<ReportDelivery>>;
}

export type ReportRepository = ReportsRepository;
