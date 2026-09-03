/**
 * finalize-meta-connection.use-case.ts — Phase 8E.
 *
 * Finaliza la selección de recurso llamando a la RPC SECURITY DEFINER `public.finalize_meta_connection`.
 * Deriva la identidad del usuario desde la sesión de auth.uid() en Postgres.
 */

import { ok, err, createError } from '@bop-agency/shared';
import type { Result, ErrorCode } from '@bop-agency/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

export type FinalizeMetaConnectionInput = {
  pendingConnectionId: string;
  selectedPageId: string;
};

export type FinalizeMetaConnectionResult = {
  clientIntegrationId: string;
  isReconnect: boolean;
  eventType: 'connected' | 'reauthorized';
};

export async function finalizeMetaConnection(
  client: SupabaseClient,
  input: FinalizeMetaConnectionInput,
): Promise<Result<FinalizeMetaConnectionResult>> {
  const { data, error } = await client.rpc('finalize_meta_connection', {
    p_pending_connection_id: input.pendingConnectionId,
    p_selected_page_id: input.selectedPageId,
  });

  if (error) {
    return err(createError('INTERNAL_ERROR', `Finalization RPC failed: ${error.message}`));
  }

  if (!data || data.success !== true) {
    const message = data?.message || 'Finalization failed';
    const rawCode = data?.error_code || 'INTERNAL_ERROR';
    const code: ErrorCode =
      rawCode === 'FORBIDDEN'
        ? 'FORBIDDEN'
        : rawCode === 'NOT_FOUND'
          ? 'NOT_FOUND'
          : rawCode === 'EXPIRED'
            ? 'CONFLICT'
            : 'INTERNAL_ERROR';
    return err(createError(code, `[${rawCode}] ${message}`));
  }

  return ok({
    clientIntegrationId: data.client_integration_id,
    isReconnect: Boolean(data.is_reconnect),
    eventType: data.event_type as 'connected' | 'reauthorized',
  });
}

export type FinalizeMetaAdAccountConnectionInput = {
  pendingConnectionId: string;
  selectedAccountId: string;
};

export async function finalizeMetaAdAccountConnection(
  client: SupabaseClient,
  input: FinalizeMetaAdAccountConnectionInput,
): Promise<Result<FinalizeMetaConnectionResult>> {
  return finalizeMetaConnection(client, {
    pendingConnectionId: input.pendingConnectionId,
    selectedPageId: input.selectedAccountId,
  });
}
