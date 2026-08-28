/**
 * PublicationReconcilerPort & PublicationReconcilerRegistry — Phase 8G.0.
 *
 * Puerto y Registro para la reconciliación de lectura (`read-only`) de ejecuciones de
 * publicación en estado `unknown_outcome`.
 *
 * Invariante Primario:
 * La reconciliación NUNCA publica, NUNCA reintenta automáticamente, NUNCA muta
 * ni elimina recursos del proveedor. Es 100% LECTURA.
 */

import type { Result, ActivationChannel, ActivationProvider } from '@bop-agency/shared';

export type ReconcileInput = {
  readonly jobId: string;
  readonly targetId: string;
  readonly organizationId: string;
  readonly clientId: string;
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  readonly clientIntegrationId?: string | null;
  readonly attemptMetadata?: Record<string, unknown> | null;
  readonly targetMetadata?: Record<string, unknown> | null;
};

export type ReconcileResult = {
  readonly outcome: 'confirmed_published' | 'confirmed_not_published' | 'unresolved';
  readonly externalId?: string | null;
  readonly externalUrl?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly unresolvedReason?: string | null;
};

export interface PublicationReconcilerPort {
  supports(channel: ActivationChannel, provider: ActivationProvider): boolean;
  reconcile(input: ReconcileInput): Promise<Result<ReconcileResult>>;
}

export class PublicationReconcilerRegistry {
  private readonly reconcilers: PublicationReconcilerPort[] = [];

  register(reconciler: PublicationReconcilerPort): void {
    this.reconcilers.push(reconciler);
  }

  resolve(channel: ActivationChannel, provider: ActivationProvider): PublicationReconcilerPort | null {
    return this.reconcilers.find((r) => r.supports(channel, provider)) || null;
  }
}
