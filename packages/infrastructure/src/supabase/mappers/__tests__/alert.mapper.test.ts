import { describe, it, expect } from 'vitest';
import { rowToAlert, type AlertRow } from '../alert.mapper';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseAlertRow: AlertRow = {
  id: 'alert-uuid-1',
  organization_id: 'org-uuid-1',
  client_id: 'client-uuid-1',
  alert_key: 'ctr-drop-2026-06-meta',
  alert_type: 'ctr_drop',
  platform: 'meta',
  account_id: 'act_123456',
  severity: 'warning',
  status: 'active',
  title: 'CTR por debajo del umbral',
  description: 'El CTR cayó a 0.067% (umbral: 1%)',
  metadata: { threshold: 1, actual: 0.067 },
  detected_at: '2026-06-15T10:00:00.000Z',
  acknowledged_at: null,
  acknowledged_by: null,
  snoozed_until: null,
  resolved_at: null,
  resolved_by: null,
  created_at: '2026-06-15T10:00:00.000Z',
  updated_at: '2026-06-15T10:00:00.000Z',
};

// ─── rowToAlert ───────────────────────────────────────────────────────────────

describe('rowToAlert', () => {
  it('mapea todos los campos básicos correctamente', () => {
    const alert = rowToAlert(baseAlertRow);
    expect(alert.id).toBe('alert-uuid-1');
    expect(alert.organizationId).toBe('org-uuid-1');
    expect(alert.clientId).toBe('client-uuid-1');
    expect(alert.alertKey).toBe('ctr-drop-2026-06-meta');
    expect(alert.alertType).toBe('ctr_drop');
    expect(alert.platform).toBe('meta');
    expect(alert.accountId).toBe('act_123456');
    expect(alert.severity).toBe('warning');
    expect(alert.status).toBe('active');
    expect(alert.title).toBe('CTR por debajo del umbral');
    expect(alert.description).toBe('El CTR cayó a 0.067% (umbral: 1%)');
    expect(alert.metadata).toEqual({ threshold: 1, actual: 0.067 });
    expect(alert.detectedAt).toBeInstanceOf(Date);
    expect(alert.acknowledgedAt).toBeNull();
    expect(alert.acknowledgedBy).toBeNull();
    expect(alert.snoozedUntil).toBeNull();
    expect(alert.resolvedAt).toBeNull();
    expect(alert.resolvedBy).toBeNull();
    expect(alert.createdAt).toBeInstanceOf(Date);
    expect(alert.updatedAt).toBeInstanceOf(Date);
  });

  it('client_id null se mapea a null', () => {
    const alert = rowToAlert({ ...baseAlertRow, client_id: null });
    expect(alert.clientId).toBeNull();
  });

  it('platform null se mapea a null', () => {
    const alert = rowToAlert({ ...baseAlertRow, platform: null });
    expect(alert.platform).toBeNull();
  });

  it('mapea todos los status válidos', () => {
    const statuses = ['active', 'acknowledged', 'snoozed', 'resolved'] as const;
    for (const status of statuses) {
      const alert = rowToAlert({ ...baseAlertRow, status });
      expect(alert.status).toBe(status);
    }
  });

  it('mapea todos los severity válidos', () => {
    const severities = ['critical', 'warning', 'info'] as const;
    for (const severity of severities) {
      const alert = rowToAlert({ ...baseAlertRow, severity });
      expect(alert.severity).toBe(severity);
    }
  });

  it('mapea campos de acknowledged cuando están presentes', () => {
    const alert = rowToAlert({
      ...baseAlertRow,
      status: 'acknowledged',
      acknowledged_at: '2026-06-16T09:00:00.000Z',
      acknowledged_by: 'user-uuid-2',
    });
    expect(alert.acknowledgedAt).toBeInstanceOf(Date);
    expect(alert.acknowledgedBy).toBe('user-uuid-2');
  });

  it('mapea campos de resolved cuando están presentes', () => {
    const alert = rowToAlert({
      ...baseAlertRow,
      status: 'resolved',
      resolved_at: '2026-06-17T14:00:00.000Z',
      resolved_by: 'user-uuid-3',
    });
    expect(alert.resolvedAt).toBeInstanceOf(Date);
    expect(alert.resolvedBy).toBe('user-uuid-3');
  });

  it('mapea snoozed_until cuando está presente', () => {
    const alert = rowToAlert({
      ...baseAlertRow,
      status: 'snoozed',
      snoozed_until: '2026-06-20T00:00:00.000Z',
    });
    expect(alert.snoozedUntil).toBeInstanceOf(Date);
  });

  it('metadata null o undefined se mapea a {}', () => {
    const alert = rowToAlert({ ...baseAlertRow, metadata: null });
    expect(alert.metadata).toEqual({});
  });

  it('lanza error si status no es válido', () => {
    expect(() => rowToAlert({ ...baseAlertRow, status: 'open' })).toThrow(
      'status "open" no es válido',
    );
  });

  it('lanza error si severity no es válido', () => {
    expect(() => rowToAlert({ ...baseAlertRow, severity: 'high' })).toThrow(
      'severity "high" no es válido',
    );
  });

  it('lanza error si platform no es válida (cuando tiene valor)', () => {
    expect(() => rowToAlert({ ...baseAlertRow, platform: 'meta_ads' })).toThrow(
      'platform "meta_ads" no es válido',
    );
  });

  it('lanza error si detected_at no es fecha válida', () => {
    expect(() => rowToAlert({ ...baseAlertRow, detected_at: 'no-es-fecha' })).toThrow(
      '"detected_at" no es una fecha válida',
    );
  });

  it('title null se mapea a null (campo opcional en DB)', () => {
    const alert = rowToAlert({ ...baseAlertRow, title: null });
    expect(alert.title).toBeNull();
  });

  it('description null se mapea a null', () => {
    const alert = rowToAlert({ ...baseAlertRow, description: null });
    expect(alert.description).toBeNull();
  });
});
