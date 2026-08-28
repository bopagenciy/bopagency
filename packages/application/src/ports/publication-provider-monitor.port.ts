/**
 * PublicationProviderMonitorPort & PublicationProviderMonitorRegistry — Phase 8G.1.
 *
 * Puerto y Registro para la observación en LECTURA PURA (`read-only`) del estado
 * operativo en el proveedor de recursos ya publicados exitosamente (`succeeded`).
 *
 * INVARIANTE PRIMARIO:
 * La observación del proveedor NUNCA muta el historial de publicación ni el estado del job.
 * El job de publicación completado permanece `succeeded` para siempre.
 * CERO escrituras al proveedor (0 mutate / enable / pause / edit).
 */

import type { Result, ActivationChannel, ActivationProvider } from '@bop-agency/shared';

export type ProviderResourceObservation = {
  readonly provider: ActivationProvider;
  readonly channel: ActivationChannel;
  readonly externalId: string;
  readonly observedAt: string; // ISO 8601 server timestamp
  readonly availability: 'observed' | 'unavailable' | 'not_found';
  readonly unavailabilityReason?:
    | 'AUTH_EXPIRED'
    | 'INTEGRATION_NOT_AVAILABLE'
    | 'PROVIDER_QUERY_FAILED'
    | 'MISSING_RESOURCE_IDENTITY'
    | 'CHANNEL_NOT_CONFIGURED'
    | null;
  readonly resourceStatus?: string | null; // e.g. 'ENABLED', 'PAUSED', 'REMOVED'
  readonly servingStatus?: string | null; // e.g. 'SERVING', 'NEEDS_ATTENTION', 'ENDED'
  readonly primaryStatus?: string | null; // e.g. 'ELIGIBLE', 'PAUSED', 'REMOVED'
  readonly primaryStatusReasons?: readonly string[];
  readonly rawStatusCode?: number | null;
  readonly metadata?: Record<string, unknown>;
};

export type ObserveInput = {
  readonly jobId: string;
  readonly targetId: string;
  readonly organizationId: string;
  readonly clientId: string;
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  readonly externalId: string;
  readonly clientIntegrationId?: string | null;
  readonly attemptMetadata?: Record<string, unknown> | null;
  readonly targetMetadata?: Record<string, unknown> | null;
};

export interface PublicationProviderMonitorPort {
  supports(channel: ActivationChannel, provider: ActivationProvider): boolean;
  observe(input: ObserveInput): Promise<Result<ProviderResourceObservation>>;
}

export class PublicationProviderMonitorRegistry {
  private readonly monitors: PublicationProviderMonitorPort[] = [];

  register(monitor: PublicationProviderMonitorPort): void {
    this.monitors.push(monitor);
  }

  resolve(channel: ActivationChannel, provider: ActivationProvider): PublicationProviderMonitorPort | null {
    return this.monitors.find((m) => m.supports(channel, provider)) || null;
  }
}
