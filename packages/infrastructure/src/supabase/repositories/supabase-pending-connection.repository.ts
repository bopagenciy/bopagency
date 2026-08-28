/**
 * SupabasePendingConnectionRepository — Phase 8E.
 *
 * Repositorio de servidor respaldado por service_role para crear sesiones
 * temporales de selección de recursos (pending_oauth_connections & pending_oauth_resources).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptCredential } from '../../security/credential-cipher';
import type { DiscoveredMetaPage } from '../../meta/meta-graph-api.client';

export type CreatePendingSessionInput = {
  organizationId: string;
  clientId: string;
  userId: string;
  pages: DiscoveredMetaPage[];
  ttlMinutes?: number;
};

export class SupabasePendingConnectionRepository {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Crea la sesión temporal pending_oauth_connections + pending_oauth_resources (cifrando los tokens).
   */
  async createPendingSession(input: CreatePendingSessionInput): Promise<{
    pendingConnectionId: string;
    expiresAt: string;
  }> {
    const ttlMinutes = input.ttlMinutes || 10;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    const { data: conn, error: connErr } = await this.client
      .from('pending_oauth_connections')
      .insert({
        organization_id: input.organizationId,
        client_id: input.clientId,
        user_id: input.userId,
        provider: 'meta',
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (connErr || !conn) {
      throw new Error(`Failed to create pending oauth connection: ${connErr?.message}`);
    }

    const pendingConnectionId = conn.id;

    if (input.pages.length > 0) {
      const resourceRows = input.pages.map((p) => {
        const encrypted = encryptCredential(p.page_access_token);
        return {
          pending_connection_id: pendingConnectionId,
          page_id: p.page_id,
          page_name: p.page_name,
          instagram_account_id: p.instagram_account_id,
          instagram_username: p.instagram_username,
          key_version: encrypted.keyVersion,
          encrypted_page_token: encrypted.ciphertext,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
        };
      });

      const { error: resErr } = await this.client
        .from('pending_oauth_resources')
        .insert(resourceRows);

      if (resErr) {
        throw new Error(`Failed to insert pending oauth resources: ${resErr.message}`);
      }
    }

    return {
      pendingConnectionId,
      expiresAt,
    };
  }
}
