import type { SupabaseClient } from '@supabase/supabase-js';
import { ok, err, createError, validationError, type Result } from '@bop-agency/shared';

export type FinalizeGoogleConnectionDeps = {
  organizationRepository: {
    findMember: (orgId: string, userId: string) => Promise<{ role: string } | null>;
  };
};

export type FinalizeGoogleConnectionInput = {
  pendingConnectionId: string;
  selectedResourceId: string;
  organizationId: string;
  clientId: string;
  actorUserId: string;
};

export type FinalizeGoogleConnectionResult = {
  clientIntegrationId: string;
  isReconnect: boolean;
  eventType: 'connected' | 'reauthorized';
};

export async function finalizeGoogleConnection(
  supabase: SupabaseClient,
  input: FinalizeGoogleConnectionInput,
  deps: FinalizeGoogleConnectionDeps,
): Promise<Result<FinalizeGoogleConnectionResult>> {
  // 1. Verificar rol strategist+ del actor inmediatamente antes de ejecutar la RPC
  const member = await deps.organizationRepository.findMember(input.organizationId, input.actorUserId);
  if (!member || !['owner', 'admin', 'strategist'].includes(member.role.toLowerCase())) {
    return err(createError('FORBIDDEN', 'Requires strategist role or higher to finalize Google connection'));
  }

  // 2. Invocar la RPC de base de datos finalize_google_connection con p_selected_resource_id UUID
  const rpcClient = supabase as unknown as {
    rpc: (
      fnName: string,
      args: Record<string, unknown>,
    ) => Promise<{
      data: {
        success?: boolean;
        error_code?: string;
        message?: string;
        client_integration_id?: string;
        is_reconnect?: boolean;
        event_type?: 'connected' | 'reauthorized';
      } | null;
      error: { message: string } | null;
    }>;
  };

  const { data: rpcRes, error: rpcErr } = await rpcClient.rpc('finalize_google_connection', {
    p_pending_connection_id: input.pendingConnectionId,
    p_selected_resource_id: input.selectedResourceId,
  });

  if (rpcErr || !rpcRes) {
    return err(validationError(rpcErr?.message || 'Failed to finalize Google connection'));
  }

  if (rpcRes.success !== true) {
    const errorCode = rpcRes.error_code || 'VALIDATION_ERROR';
    const message = rpcRes.message || 'Failed to finalize Google connection';

    if (errorCode === 'FORBIDDEN' || errorCode === 'UNAUTHORIZED') {
      return err(createError(errorCode as 'FORBIDDEN' | 'UNAUTHORIZED', message));
    }
    return err(validationError(message));
  }

  return ok({
    clientIntegrationId: rpcRes.client_integration_id || '',
    isReconnect: rpcRes.is_reconnect || false,
    eventType: rpcRes.event_type || 'connected',
  });
}
