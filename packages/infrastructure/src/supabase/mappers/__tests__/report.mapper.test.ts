import { describe, it, expect } from 'vitest';
import { rowToReport, rowToReportDelivery } from '../report.mapper';

describe('ReportMapper & ReportDeliveryMapper (Phase 9A.0)', () => {
  it('maps valid database row to domain Report entity', () => {
    const report = rowToReport({
      id: 'rep-100',
      organization_id: 'org-1',
      client_id: 'client-1',
      report_type: 'monthly',
      status: 'generated',
      period_label: 'Agosto 2026',
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      currency: 'COP',
      generated_at: '2026-08-30T10:00:00Z',
      summary: {
        title: 'Reporte Mensual Agosto',
        executiveSummary: 'Rendimiento sólido en Meta Ads.',
        highlights: ['CPC bajó 15%'],
        recommendations: ['Aumentar presupuesto'],
        metricsOverview: {
          totalSpend: 500000,
          totalImpressions: 120000,
          totalClicks: 3500,
          totalLeads: 80,
          totalConversions: 30,
          avgRoas: 4.2,
        },
      },
      payload: { customNotes: 'Cliente satisfecho' },
      created_at: '2026-08-30T10:00:00Z',
      updated_at: '2026-08-30T10:00:00Z',
    });

    expect(report.id).toBe('rep-100');
    expect(report.reportType).toBe('monthly');
    expect(report.summary.title).toBe('Reporte Mensual Agosto');
    expect(report.summary.metricsOverview.totalSpend).toBe(500000);
  });

  it('maps valid database row to domain ReportDelivery entity', () => {
    const delivery = rowToReportDelivery({
      id: 'del-55',
      organization_id: 'org-1',
      report_id: 'rep-100',
      recipient_email: 'cliente@ejemplo.com',
      channel: 'email',
      status: 'delivered',
      sent_at: '2026-08-30T10:05:00Z',
      error_message: null,
      metadata: { resendId: 'msg_123' },
      created_at: '2026-08-30T10:00:00Z',
    });

    expect(delivery.id).toBe('del-55');
    expect(delivery.recipientEmail).toBe('cliente@ejemplo.com');
    expect(delivery.status).toBe('delivered');
    expect(delivery.metadata).toEqual({ resendId: 'msg_123' });
  });
});
