/**
 * InMemoryMetricsProviderRegistry — Implementación en memoria para pruebas de MetricsProviderRegistry (Phase 9B.0).
 * Ubicada en la capa de utilidades de pruebas (testing).
 */

import type { MetricPlatform } from '@bop-agency/shared';
import type { MetricsProvider } from '../ports/metrics-provider.port';
import type { MetricsProviderRegistry } from '../ports/metrics-provider-registry';

export class InMemoryMetricsProviderRegistry implements MetricsProviderRegistry {
  private providers = new Map<MetricPlatform, MetricsProvider>();

  register(provider: MetricsProvider): void {
    this.providers.set(provider.platform, provider);
  }

  get(platform: MetricPlatform): MetricsProvider | undefined {
    return this.providers.get(platform);
  }
}
