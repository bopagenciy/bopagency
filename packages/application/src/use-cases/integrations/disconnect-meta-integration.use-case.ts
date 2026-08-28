/**
 * disconnect-meta-integration.use-case.ts — Phase 8E.
 *
 * Desconexión LOCAL de integración de Meta.
 * Elimina la fila en `client_integration_credentials`, marca `client_integrations.status = 'inactive'`
 * y registra el evento 'disconnected'. Preserva la fila de integración y los targets históricos intactos.
 */

import { ok, err, createError } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export type DisconnectMetaIntegrationInput = {
  clientIntegrationId: string;
  organizationId: string;
  actorUserId: string;
};

export async function disconnectMetaIntegration(
  client: SupabaseClient,
  input: DisconnectMetaIntegrationInput,
): Promise<Result<{ success: boolean }>> {
  // 1. Eliminar credenciales asociadas en base de datos (service_role / RPC boundary)
  const { error: credErr } = await client
    .from('client_integration_credentials')
    .delete()
    .eq('client_integration_id', input.clientIntegrationId)
    .eq('organization_id', input.organizationId);

  if (credErr) {
    return err(
      createError('INTERNAL_ERROR', `Failed to delete integration credentials: ${credErr.message}`),
    );
  }

  // 2. Marcar status = 'inactive' en client_integrations
  const { error: intErr } = await client
    .from('client_integrations')
    .update({
      status: 'inactive',
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.clientIntegrationId)
    .eq('organization_id', input.organizationId);

  if (intErr) {
    return err(
      createError('INTERNAL_ERROR', `Failed to set integration inactive: ${intErr.message}`),
    );
  }

  // 3. Registrar evento de auditoría
  const { error: evtErr } = await client.from('client_integration_events').insert({
    organization_id: input.organizationId,
    client_integration_id: input.clientIntegrationId,
    event_type: 'disconnected',
    actor_user_id: input.actorUserId,
    metadata: { source: 'user_action' },
  });

  if (evtErr) {
    // Si la inserción del evento falla, loguear pero no interrumpir la desconexión
  }

  return ok({ success: true });
}
