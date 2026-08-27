/**
 * Fakes deterministas de `ChannelPublisherPort` — Phase 8B.2.
 *
 * NO son adapters de producción — no hacen HTTP, no importan SDKs de
 * proveedor, no leen `client_integrations` reales. Existen exclusivamente
 * para (a) tests de `dispatchPublicationJob` y (b) composición de
 * diagnóstico local mientras no exista un adapter real (8B.3+). Cada uno
 * modela un resultado distinto y determinista para poder testear las 3
 * ramas de `PublishReceipt.outcome` más los 2 casos de "excepción"/
 * "proveedor no soportado" sin ninguna red real.
 */

import { ok } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { ActivationChannel, ActivationProvider } from '@bop-agency/shared';
import type { ChannelPublisherPort, PublishInput, PublishReceipt } from './channel-publisher.port';

type FakePublisherOptions = {
  /** Combinaciones channel/provider soportadas — por defecto, todas. */
  readonly supportedProviders?: readonly ActivationProvider[];
};

function supportsDefault(
  options: FakePublisherOptions | undefined,
  _channel: ActivationChannel,
  provider: ActivationProvider,
): boolean {
  if (!options?.supportedProviders) return true;
  return options.supportedProviders.includes(provider);
}

/** Siempre resuelve `succeeded` con un externalId determinista. */
export class FakeSuccessfulPublisher implements ChannelPublisherPort {
  constructor(private readonly options?: FakePublisherOptions) {}

  supports(channel: ActivationChannel, provider: ActivationProvider): boolean {
    return supportsDefault(this.options, channel, provider);
  }

  async publish(input: PublishInput): Promise<Result<PublishReceipt>> {
    return ok({
      outcome: 'succeeded',
      externalId: `fake-ext-${input.jobId}-${input.attemptNumber}`,
      externalUrl: `https://example.invalid/fake/${input.jobId}`,
      providerStatus: 'ACTIVE',
      httpStatus: 200,
      durationMs: 5,
    });
  }
}

/** Siempre resuelve `failed` — modela un rechazo explícito y conclusivo del proveedor. */
export class FakeFailedPublisher implements ChannelPublisherPort {
  constructor(private readonly options?: FakePublisherOptions) {}

  supports(channel: ActivationChannel, provider: ActivationProvider): boolean {
    return supportsDefault(this.options, channel, provider);
  }

  async publish(_input: PublishInput): Promise<Result<PublishReceipt>> {
    return ok({
      outcome: 'failed',
      failureCategory: 'PROVIDER_REJECTED',
      providerErrorCode: 'FAKE_REJECTED',
      httpStatus: 422,
      durationMs: 5,
    });
  }
}

/**
 * Siempre resuelve `unknown_outcome` — modela un 5xx ambiguo o un timeout
 * donde el proveedor pudo o no haber aceptado la solicitud.
 */
export class FakeUnknownOutcomePublisher implements ChannelPublisherPort {
  constructor(private readonly options?: FakePublisherOptions) {}

  supports(channel: ActivationChannel, provider: ActivationProvider): boolean {
    return supportsDefault(this.options, channel, provider);
  }

  async publish(_input: PublishInput): Promise<Result<PublishReceipt>> {
    return ok({
      outcome: 'unknown_outcome',
      providerStatus: 'AMBIGUOUS_5XX',
      httpStatus: 503,
      durationMs: 5,
    });
  }
}

/**
 * SIEMPRE lanza una excepción (no retorna un `Result`) — modela un
 * transporte que se cae, o un throw inesperado, DESPUÉS de que la
 * solicitud pudo haber sido enviada/aceptada. El orquestador
 * (`dispatchPublicationJob`) DEBE capturar esto y tratarlo como
 * `unknown_outcome`, nunca como `failed` — ver la regla de seguridad en
 * `channel-publisher.port.ts`.
 */
export class FakeThrowingPublisher implements ChannelPublisherPort {
  constructor(private readonly options?: FakePublisherOptions) {}

  supports(channel: ActivationChannel, provider: ActivationProvider): boolean {
    return supportsDefault(this.options, channel, provider);
  }

  async publish(_input: PublishInput): Promise<Result<PublishReceipt>> {
    throw new Error('FakeThrowingPublisher: simulated transport failure after request may have been sent');
  }
}

/**
 * `succeeded` pero SIN `externalId` — modela un publisher con bug/
 * contrato roto. `dispatchPublicationJob` debe degradar esto a
 * `unknown_outcome` (nunca confiar en un "éxito" sin referencia externa
 * verificable) — usado solo para testear esa guarda defensiva.
 */
export class FakeMalformedSuccessPublisher implements ChannelPublisherPort {
  supports(): boolean {
    return true;
  }

  async publish(_input: PublishInput): Promise<Result<PublishReceipt>> {
    return ok({ outcome: 'succeeded', externalId: null });
  }
}
