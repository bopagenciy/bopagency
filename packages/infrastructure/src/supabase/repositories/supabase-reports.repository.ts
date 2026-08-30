/**
 * SupabaseReportsRepository — Implementación de ReportsRepository respaldada por Supabase.
 */

import { ok, err, paginate } from '@bop-agency/shared';
import type { Result, PaginatedResult, PaginationParams } from '@bop-agency/shared';
import type {
  Report,
  ReportDelivery,
  ReportId,
  ReportDeliveryId,
  ReportStatus,
  DeliveryStatus,
  ReportsRepository,
  ReportFilter,
  CreateReportInput,
  CreateReportDeliveryInput,
} from '@bop-agency/domain';
import type { ClientId, OrganizationId } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToReport,
  rowToReportDelivery,
  type ReportRow,
  type ReportDeliveryRow,
} from '../mappers/report.mapper';

const DEFAULT_PAGE_SIZE = 20;

export class SupabaseReportsRepository implements ReportsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async findById(id: ReportId, organizationId: OrganizationId): Promise<Result<Report>> {
    try {
      const { data, error } = await this.client
        .from('reports')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (error || !data) {
        return err({
          code: 'NOT_FOUND',
          message: `Report not found: ${id}`,
        });
      }

      return ok(rowToReport(data as ReportRow));
    } catch (e) {
      return err({
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Unknown error finding report',
      });
    }
  }

  async findByFilter(
    filter: ReportFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Report>> {
    const page = Math.max(1, pagination.page || 1);
    const pageSize = pagination.pageSize || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
      let query = this.client
        .from('reports')
        .select('*', { count: 'exact' })
        .eq('organization_id', filter.organizationId);

      if (filter.clientId) query = query.eq('client_id', filter.clientId);
      if (filter.reportType) query = query.eq('report_type', filter.reportType);
      if (filter.status) query = query.eq('status', filter.status);

      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, count, error } = await query;

      if (error) {
        return paginate([], 0, pagination);
      }

      const reports = (data || []).map((row) => rowToReport(row as ReportRow));
      return paginate(reports, count || 0, pagination);
    } catch {
      return paginate([], 0, pagination);
    }
  }

  async findByOrganization(
    filter: ReportFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Report>> {
    return this.findByFilter(filter, pagination);
  }

  async findByClient(
    clientId: ClientId,
    pagination: PaginationParams,
    organizationId?: OrganizationId,
  ): Promise<PaginatedResult<Report>> {
    if (organizationId) {
      return this.findByFilter(
        { organizationId, clientId },
        pagination,
      );
    }

    const page = Math.max(1, pagination.page || 1);
    const pageSize = pagination.pageSize || DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
      const { data, count, error } = await this.client
        .from('reports')
        .select('*', { count: 'exact' })
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        return paginate([], 0, pagination);
      }

      const reports = (data || []).map((row) => rowToReport(row as ReportRow));
      return paginate(reports, count || 0, pagination);
    } catch {
      return paginate([], 0, pagination);
    }
  }

  async save(input: CreateReportInput): Promise<Result<Report>> {
    try {
      const payloadToSave = {
        organization_id: input.organizationId,
        client_id: input.clientId,
        report_type: input.reportType,
        status: input.status || 'draft',
        period_label: input.periodLabel || null,
        period_start: input.periodStart.toISOString().split('T')[0],
        period_end: input.periodEnd.toISOString().split('T')[0],
        currency: input.currency || 'COP',
        summary: input.summary || null,
        payload: input.payload || null,
      };

      const { data, error } = await this.client
        .from('reports')
        .insert(payloadToSave)
        .select('*')
        .single();

      if (error || !data) {
        return err({
          code: 'INTERNAL_ERROR',
          message: error?.message || 'Failed to save report',
        });
      }

      return ok(rowToReport(data as ReportRow));
    } catch (e) {
      return err({
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Unknown error saving report',
      });
    }
  }

  async updateStatus(
    id: ReportId,
    organizationId: OrganizationId,
    status: ReportStatus,
    fileUrl?: string | null,
    errorMessage?: string | null,
  ): Promise<Result<Report>> {
    try {
      const updateData: Record<string, unknown> = { status };
      if (status === 'generated') {
        updateData.generated_at = new Date().toISOString();
      }
      if (fileUrl) updateData.file_url = fileUrl;
      if (errorMessage) updateData.error_message = errorMessage;

      const { data, error } = await this.client
        .from('reports')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select('*')
        .single();

      if (error || !data) {
        return err({
          code: 'INTERNAL_ERROR',
          message: error?.message || `Failed to update report status to ${status}`,
        });
      }

      return ok(rowToReport(data as ReportRow));
    } catch (e) {
      return err({
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Unknown error updating report status',
      });
    }
  }

  async saveDelivery(input: CreateReportDeliveryInput): Promise<Result<ReportDelivery>> {
    try {
      const payloadToSave = {
        organization_id: input.organizationId,
        report_id: input.reportId,
        recipient_email: input.recipientEmail,
        channel: input.channel || 'email',
        status: input.status || 'queued',
        idempotency_key: input.idempotencyKey || null,
        sent_at: input.sentAt ? input.sentAt.toISOString() : null,
        error_message: input.errorMessage || null,
        metadata: input.metadata || {},
      };

      const { data, error } = await this.client
        .from('report_deliveries')
        .insert(payloadToSave)
        .select('*')
        .single();

      if (error || !data) {
        return err({
          code: 'INTERNAL_ERROR',
          message: error?.message || 'Failed to save report delivery',
        });
      }

      return ok(rowToReportDelivery(data as ReportDeliveryRow));
    } catch (e) {
      return err({
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Unknown error saving report delivery',
      });
    }
  }

  async logDeliveryAttempt(input: CreateReportDeliveryInput): Promise<Result<ReportDelivery>> {
    return this.saveDelivery(input);
  }

  async updateDeliveryStatus(
    deliveryId: ReportDeliveryId,
    organizationId: OrganizationId,
    status: DeliveryStatus,
    providerMessageId?: string | null,
    errorMessage?: string | null,
  ): Promise<Result<ReportDelivery>> {
    try {
      const updateData: Record<string, unknown> = { status };
      if (status === 'delivered') {
        updateData.sent_at = new Date().toISOString();
      }
      if (providerMessageId) updateData.provider_message_id = providerMessageId;
      if (errorMessage) updateData.error_message = errorMessage;

      const { data, error } = await this.client
        .from('report_deliveries')
        .update(updateData)
        .eq('id', deliveryId)
        .eq('organization_id', organizationId)
        .select('*')
        .single();

      if (error || !data) {
        return err({
          code: 'INTERNAL_ERROR',
          message: error?.message || `Failed to update delivery status to ${status}`,
        });
      }

      return ok(rowToReportDelivery(data as ReportDeliveryRow));
    } catch (e) {
      return err({
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Unknown error updating delivery status',
      });
    }
  }

  async findDeliveriesByReport(
    reportId: ReportId,
    organizationId: OrganizationId,
  ): Promise<Result<ReportDelivery[]>> {
    try {
      const { data, error } = await this.client
        .from('report_deliveries')
        .select('*')
        .eq('report_id', reportId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        return err({
          code: 'INTERNAL_ERROR',
          message: error.message,
        });
      }

      const deliveries = (data || []).map((row) => rowToReportDelivery(row as ReportDeliveryRow));
      return ok(deliveries);
    } catch (e) {
      return err({
        code: 'INTERNAL_ERROR',
        message: e instanceof Error ? e.message : 'Unknown error fetching report deliveries',
      });
    }
  }
}
