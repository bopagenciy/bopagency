/**
 * ChannelPublisherPort — Puerto de la capa de aplicación para publicar en un
 * canal/proveedor externo (Meta, Google, etc.) — Phase 8B.2.
 *
 * Abstracción provider-neutral que aísla `dispatchPublicationJob` de
 * cualquier SDK/HTTP de proveedor concreto — mismo criterio arquitectónico
 * exacto que `WorkflowDispatcherPort` (8B.0/6D) y `CampaignGeneratorPort`
 * (7D): `application`/`domain` NUNCA importan `fetch`, SDKs de proveedor,
 * ni `process.env`; toda esa integración vive en un adapter de
 * `infrastructure` que 8B.2 NO implementa todavía (ver PHASE_8B2 report,
 * sección "Non-goals" y decisión n8n).
 *
 * 8B.2 NO registra ningún publisher real — solo el puerto + fakes
 * deterministas (`channel-publisher.fakes.ts`) para tests/composición de
 * diagnóstico. Meta/Google/OAuth/tokens quedan explícitamente diferidos a
 * 8B.3+.
 *
 * Restricciones (mismo criterio que los otros puertos de application):
 * - `PublishReceipt` expone ÚNICAMENTE metadata segura y provider-neutral
 *   — nunca un tipo de respuesta específico de Meta/Google, nunca headers
 *   de autorización, tokens, ni el body crudo sin validar del proveedor.
 * - `publish()` NUNCA debe lanzar por un resultado de negocio (éxito/fallo/
 *   ambiguo) — eso se codifica en `PublishReceipt.outcome`. Una excepción
 *   real (red, timeout no capturado, bug del adapter) SÍ puede propagarse;
 *   el orquestador (`dispatchPublicationJob`) la trata como
 *   `unknown_outcome` — ver esa función para el detalle de la regla de
 *   seguridad (nunca asumir éxito ni fallo ante una excepción, porque la
 *   solicitud pudo haber sido aceptada por el proveedor antes de que la
 *   excepción ocurriera).
 */

import type { Result } from '@bop-agency/shared';
import type { ActivationChannel, ActivationProvider, PublicationFailureCategory } from '@bop-agency/shared';
import type {
  OrganizationId,
  ClientId,
  CampaignActivationTargetId,
  CampaignPublicationJobId,
} from '@bop-agency/domain';

// ─── Publish input ─────────────────────────────────────────────────────────────

/**
 * Input provider-neutral enviado al publisher. Deliberadamente NO incluye
 * ningún token/secret de integración — un adapter real (8B.3+) resuelve
 * credenciales internamente (p.ej. vía `client_integrations`), nunca a
 * través de este input.
 */
export type PublishInput = {
  readonly jobId: CampaignPublicationJobId;
  readonly organizationId: OrganizationId;
  readonly clientId: ClientId;
  readonly targetId: CampaignActivationTargetId;
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  /** Referencia de la client_integration a usar — nunca el secreto en sí. */
  readonly clientIntegrationId: string | null;
  /** 1-based — coincide con `CampaignPublicationAttempt.attemptNumber`. */
  readonly attemptNumber: number;
  /** Igual a `CampaignPublicationJob.idempotencyKey` — el publisher DEBE
   *  usarla como idempotency key si el proveedor real la soporta. */
  readonly idempotencyKey: string;
  /** Metadata adicional segura (nunca secretos) — opcional. */
  readonly metadata?: Record<string, unknown>;
};

// ─── Publish receipt ───────────────────────────────────────────────────────────

export type PublishOutcome = 'succeeded' | 'failed' | 'unknown_outcome';

/**
 * Resultado provider-neutral de un intento de publicación. `outcome` es el
 * único campo que el orquestador usa para decidir qué RPC de 8B.1 invocar
 * — TODO lo demás es metadata de diagnóstico opcional.
 *
 * Cuando `outcome === 'succeeded'`, `externalId` DEBE estar presente — el
 * orquestador trata un succeeded sin `externalId` como una violación de
 * contrato del publisher y lo degrada defensivamente a `unknown_outcome`
 * (nunca confía ciegamente en un "éxito" sin referencia externa
 * verificable).
 */
export type PublishReceipt = {
  readonly outcome: PublishOutcome;
  readonly externalId?: string | null;
  readonly externalUrl?: string | null;
  readonly providerStatus?: string | null;
  readonly httpStatus?: number | null;
  readonly providerErrorCode?: string | null;
  /** Solo relevante/usado cuando `outcome === 'failed'`. */
  readonly failureCategory?: PublicationFailureCategory | null;
  readonly durationMs?: number | null;
  readonly metadata?: Record<string, unknown>;
};

// ─── Port ───────────────────────────────────────────────────────────────────────

export interface ChannelPublisherPort {
  /** true si este publisher sabe manejar la combinación channel/provider dada. */
  supports(channel: ActivationChannel, provider: ActivationProvider): boolean;

  /**
   * Ejecuta la publicación. Retorna `Result<PublishReceipt>` — un `err`
   * aquí se reserva para violaciones de contrato detectadas ANTES de
   * intentar cualquier request (p.ej. validación local de input), nunca
   * para un resultado de negocio ambiguo; el orquestador trata un `err`
   * defensivamente como `unknown_outcome` de todos modos (ver nota de
   * cabecera) salvo que el caller ya haya verificado `supports()` (en ese
   * caso un `err` indica un bug del adapter, no una respuesta real del
   * proveedor).
   */
  publish(input: PublishInput): Promise<Result<PublishReceipt>>;

  // NOTA (8B.2): reconcile()/cancel() del lado del proveedor NO se definen
  // todavía — 8B.1/8B.2 nunca hacen una llamada real al proveedor para
  // cancelar (la cancelación in_progress es "cooperativa", solo marca
  // intención en DB) ni para reconciliar (reconcile_publication_job es una
  // decisión humana strategist+ sobre el estado ya observado, no una
  // consulta activa al proveedor). Diferido a 8B.3 si un proveedor real
  // llega a necesitar una consulta de estado activa.
}

// ─── Registry ───────────────────────────────────────────────────────────────────

/**
 * ChannelPublisherRegistry — resuelve el `ChannelPublisherPort` adecuado
 * para un (channel, provider) dado. Mismo rol que
 * `campaign-ai-provider.factory.ts` (7D.1) para `CampaignGeneratorPort`,
 * pero deliberadamente simple (sin selección por variable de entorno) ya
 * que 8B.2 no registra ningún publisher real — la composición de
 * diagnóstico/tests decide qué instancias pasar.
 */
export class ChannelPublisherRegistry {
  private readonly publishers: readonly ChannelPublisherPort[];

  constructor(publishers: readonly ChannelPublisherPort[]) {
    this.publishers = publishers;
  }

  resolve(channel: ActivationChannel, provider: ActivationProvider): ChannelPublisherPort | null {
    return this.publishers.find((p) => p.supports(channel, provider)) ?? null;
  }
}
