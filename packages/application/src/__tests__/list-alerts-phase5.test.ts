/**
 * Tests para listAlerts use case (Phase 5A — con organizationId).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { listAlerts } from '../use-cases/alerts/list-alerts.use-case';
import type { ListAlertsInput, ListAlertsDeps } from '../use-cases/alerts/list-alerts.use-case';
import type { AlertRepository, UpsertAlertResult, CreateAlertInput } from '@bop-agency/domain';
import type { Alert, AlertFilter, AlertId } from '@bop-agency/domain';
import type { PaginatedResult, PaginationParams, Result } from '@bop-agency/shared';
import type { AlertCountBySeverity } from '@bop-agency/domain';
import { paginate, ok } from '@bop-agency/shared';
import type { LoggerPort } from '../ports/logger.port';

// ─── Fake AlertRepository ─────────────────────────────────────────────────────

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
  id: 'alert-1' as AlertId,
  organizationId: 'org-1' as unknown as Alert['organizationId'],
  clientId: null,
  alertKey: 'ctr-drop-2026-06',
  alertType: 'ctr_drop',
  platform: 'meta',
  accountId: null,
  severity: 'warning',
  status: 'active',
  title: 'CTR bajo',
  description: null,
  metadata: {},
  detectedAt: null,
  acknowledgedAt: null,
  acknowledgedBy: null,
  snoozedUntil: null,
  resolvedAt: null,
  resolvedBy: null,
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  ...overrides,
});

class FakeAlertRepository implements AlertRepository {
  private alerts: Alert[];

  constructor(alerts: Alert[] = []) {
    this.alerts = alerts;
  }

  async findByOrganization(
    filter: AlertFilter,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>> {
    let filtered = this.alerts.filter((a) => a.organizationId === filter.organizationId);
    if (filter.status) {
      filtered = filtered.filter((a) => a.status === filter.status);
    }
    if (filter.severity) {
      filtered = filtered.filter((a) => a.severity === filter.severity);
    }
    const total = filtered.length;
    const page = pagination.page ?? 1;
    const pageSize = pagination.pageSize ?? 20;
    const sliced = filtered.slice((page - 1) * pageSize, page * pageSize);
    return paginate(sliced, total, pagination);
  }

  async findById(id: AlertId, _orgId: Alert['organizationId']): Promise<Result<Alert>> {
    const found = this.alerts.find((a) => a.id === id);
    if (!found) return { success: false, error: { code: 'NOT_FOUND', message: 'not found' } };
    return ok(found);
  }

  async findActiveByOrganization(
    organizationId: Alert['organizationId'],
    _filters: unknown,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>> {
    const filtered = this.alerts.filter(
      (a) => a.organizationId === organizationId && a.status === 'active',
    );
    return paginate(filtered, filtered.length, pagination);
  }

  async findByClient(
    clientId: Alert['clientId'],
    organizationId: Alert['organizationId'],
    _filters: unknown,
    pagination: PaginationParams,
  ): Promise<PaginatedResult<Alert>> {
    const filtered = this.alerts.filter(
      (a) => a.clientId === clientId && a.organizationId === organizationId,
    );
    return paginate(filtered, filtered.length, pagination);
  }

  async countBySeverity(_orgId: Alert['organizationId']): Promise<Result<AlertCountBySeverity>> {
    return ok({ critical: 0, warning: 1, info: 0 });
  }

  async acknowledge(_id: AlertId, _orgId: Alert['organizationId']): Promise<Result<void>> {
    return ok(undefined);
  }

  async resolve(_id: AlertId, _orgId: Alert['organizationId']): Promise<Result<void>> {
    return ok(undefined);
  }

  async upsertByAlertKey(_input: CreateAlertInput): Promise<Result<UpsertAlertResult>> {
    return ok({ alert: makeAlert(), created: true });
  }

  async findActiveByAlertKey(_key: string, _orgId: Alert['organizationId']): Promise<Result<Alert | null>> {
    return ok(null);
  }

  async resolveActiveByAlertKeyPrefixes(_prefixes: string[], _orgId: Alert['organizationId'], _resolvedBy: string): Promise<Result<number>> {
    return ok(0);
  }
}

const silentLogger: LoggerPort = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('listAlerts (Phase 5A)', () => {
  const org1 = 'org-1' as unknown as Alert['organizationId'];
  const org2 = 'org-2' as unknown as Alert['organizationId'];

  let org1Alerts: Alert[];

  beforeEach(() => {
    org1Alerts = [
      makeAlert({
        id: 'a1' as AlertId,
        organizationId: org1,
        status: 'active',
        severity: 'critical',
      }),
      makeAlert({
        id: 'a2' as AlertId,
        organizationId: org1,
        status: 'acknowledged',
        severity: 'warning',
      }),
      makeAlert({
        id: 'a3' as AlertId,
        organizationId: org1,
        status: 'resolved',
        severity: 'info',
      }),
      makeAlert({
        id: 'a4' as AlertId,
        organizationId: org2,
        status: 'active',
        severity: 'critical',
      }),
    ];
  });

  const makeDeps = (alerts: Alert[]): ListAlertsDeps => ({
    alertRepository: new FakeAlertRepository(alerts),
    logger: silentLogger,
  });

  it('filtra por organizationId — no devuelve alertas de otra org', async () => {
    const input: ListAlertsInput = { organizationId: org1, pagination: {} };
    const result = await listAlerts(input, makeDeps(org1Alerts));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.data).toHaveLength(3);
    expect(result.value.data.every((a) => a.organizationId === org1)).toBe(true);
  });

  it('filtra por status=active', async () => {
    const input: ListAlertsInput = { organizationId: org1, status: 'active', pagination: {} };
    const result = await listAlerts(input, makeDeps(org1Alerts));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.data).toHaveLength(1);
    expect(result.value.data.at(0)?.id).toBe('a1');
  });

  it('filtra por status=resolved', async () => {
    const input: ListAlertsInput = { organizationId: org1, status: 'resolved', pagination: {} };
    const result = await listAlerts(input, makeDeps(org1Alerts));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.data).toHaveLength(1);
    expect(result.value.data.at(0)?.id).toBe('a3');
  });

  it('filtra por severity=critical', async () => {
    const input: ListAlertsInput = { organizationId: org1, severity: 'critical', pagination: {} };
    const result = await listAlerts(input, makeDeps(org1Alerts));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.data).toHaveLength(1);
    expect(result.value.data.at(0)?.id).toBe('a1');
  });

  it('devuelve ok([]) si no hay alertas para la organización', async () => {
    const input: ListAlertsInput = {
      organizationId: 'org-inexistente' as unknown as Alert['organizationId'],
      pagination: {},
    };
    const result = await listAlerts(input, makeDeps(org1Alerts));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.data).toHaveLength(0);
    expect(result.value.total).toBe(0);
  });

  it('aplica paginación', async () => {
    const input: ListAlertsInput = { organizationId: org1, pagination: { page: 1, pageSize: 2 } };
    const result = await listAlerts(input, makeDeps(org1Alerts));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.data).toHaveLength(2);
    expect(result.value.total).toBe(3);
    expect(result.value.hasNextPage).toBe(true);
  });

  it('propaga error del repositorio como err()', async () => {
    class ThrowingRepo extends FakeAlertRepository {
      override async findByOrganization(): Promise<never> {
        throw new Error('DB connection lost');
      }
    }
    const deps: ListAlertsDeps = { alertRepository: new ThrowingRepo(), logger: silentLogger };
    const result = await listAlerts({ organizationId: org1, pagination: {} }, deps);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.code).toBe('INTERNAL_ERROR');
  });
});
