/**
 * MetricsProviderRegistry — Puerto de abstracción para el registro y resolución de proveedores de métricas (Phase 9B.0).
 */

import type { MetricPlatform } from '@bop-agency/shared';
import type { MetricsProvider } from './metrics-provider.port';

export interface MetricsProviderRegistry {
  get(platform: MetricPlatform): MetricsProvider | undefined;
}
