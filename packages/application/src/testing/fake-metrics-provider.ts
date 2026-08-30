/**
 * FakeMetricsProvider — Implementación determinista de prueba para MetricsProvider (Phase 9B.0).
 * Ubicada en la capa de utilidades de pruebas (testing).
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { MetricPlatform } from '@bop-agency/shared';
import type {
  MetricsProvider,
  MetricsProviderPageResult,
  MetricsProviderError,
} from '../ports/metrics-provider.port';
import type { NormalizedMetricRecord, MetricsProviderFetchRequest } from '../dtos/normalized-metric-record.dto';

export type FakePage = {
  readonly records: NormalizedMetricRecord[];
  readonly nextCursor: string | null;
};

export type FakeMetricsProviderConfig = {
  readonly platform: MetricPlatform;
  readonly pages?: FakePage[] | undefined;
  readonly errorToReturn?: MetricsProviderError | undefined;
};

export class FakeMetricsProvider implements MetricsProvider {
  public readonly platform: MetricPlatform;
  private pages: FakePage[];
  private errorToReturn?: MetricsProviderError | undefined;
  public fetchCount = 0;
  public receivedRequests: MetricsProviderFetchRequest[] = [];

  constructor(config: FakeMetricsProviderConfig) {
    this.platform = config.platform;
    this.pages = config.pages || [{ records: [], nextCursor: null }];
    this.errorToReturn = config.errorToReturn ?? undefined;
  }

  async fetchMetrics(
    request: MetricsProviderFetchRequest,
  ): Promise<Result<MetricsProviderPageResult, MetricsProviderError>> {
    this.fetchCount += 1;
    this.receivedRequests.push(request);

    if (this.errorToReturn) {
      return err(this.errorToReturn);
    }

    const cursor = request.pageCursor ?? null;

    let pageIndex = 0;
    if (cursor) {
      if (cursor.startsWith('page-')) {
        const parsed = parseInt(cursor.replace('page-', ''), 10);
        if (!Number.isNaN(parsed)) {
          pageIndex = parsed;
        }
      }
    }

    const currentPage = this.pages[pageIndex] || { records: [], nextCursor: null };
    const hasMore = currentPage.nextCursor !== null;

    return ok({
      records: currentPage.records,
      nextCursor: currentPage.nextCursor,
      hasMore,
    });
  }
}
