/**
 * SupabaseCredentialRepository — Phase 8E.
 *
 * Repositorio de servidor para leer y escribir credenciales cifradas en
 * `public.client_integration_credentials`.
 *
 * Utiliza el cliente Supabase con service_role. Accede a las columnas de cifrado
 * y utiliza CredentialCipher para cifrar/descifrar en memoria de Node.js.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptCredential, decryptCredential } from '../../security/credential-cipher';

export type ResolvedPageCredential = {
  clientIntegrationId: string;
  organizationId: string;
  pageAccessToken: string;
  tokenExpiresAt: string | null;
};

export class SupabaseCredentialRepository {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Resuelve y descifra el Page Access Token para una integración dada.
   */
  async resolvePageAccessToken(
    clientIntegrationId: string,
  ): Promise<ResolvedPageCredential | null> {
    const { data, error } = await this.client
      .from('client_integration_credentials')
      .select(
        'organization_id, client_integration_id, key_version, ciphertext, iv, auth_tag, token_expires_at',
      )
      .eq('client_integration_id', clientIntegrationId)
      .eq('credential_type', 'page_access_token')
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const plaintextToken = decryptCredential({
      keyVersion: data.key_version,
      ciphertext: data.ciphertext,
      iv: data.iv,
      authTag: data.auth_tag,
    });

    return {
      clientIntegrationId: data.client_integration_id,
      organizationId: data.organization_id,
      pageAccessToken: plaintextToken,
      tokenExpiresAt: data.token_expires_at,
    };
  }

  /**
   * Guarda o actualiza la credencial cifrada para una integración.
   */
  async storePageAccessToken(input: {
    organizationId: string;
    clientIntegrationId: string;
    pageAccessToken: string;
    tokenExpiresAt?: string | null;
  }): Promise<void> {
    const encrypted = encryptCredential(input.pageAccessToken);

    const { error } = await this.client.from('client_integration_credentials').upsert(
      {
        organization_id: input.organizationId,
        client_integration_id: input.clientIntegrationId,
        credential_type: 'page_access_token',
        key_version: encrypted.keyVersion,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        token_expires_at: input.tokenExpiresAt || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_integration_id,credential_type' },
    );

    if (error) {
      throw new Error(`Failed to store credential: ${error.message}`);
    }
  }

  /**
   * Elimina las credenciales asociadas a una integración (al desconectar).
   */
  async deletePageAccessToken(clientIntegrationId: string): Promise<void> {
    const { error } = await this.client
      .from('client_integration_credentials')
      .delete()
      .eq('client_integration_id', clientIntegrationId)
      .eq('credential_type', 'page_access_token');

    if (error) {
      throw new Error(`Failed to delete credential: ${error.message}`);
    }
  }

  /**
   * Resuelve y descifra el Refresh Token de Google Ads para una integración dada.
   */
  async resolveGoogleRefreshToken(
    clientIntegrationId: string,
  ): Promise<{ clientIntegrationId: string; organizationId: string; refreshToken: string } | null> {
    const { data, error } = await this.client
      .from('client_integration_credentials')
      .select(
        'organization_id, client_integration_id, key_version, ciphertext, iv, auth_tag',
      )
      .eq('client_integration_id', clientIntegrationId)
      .eq('credential_type', 'google_ads_refresh_token')
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const plaintextToken = decryptCredential({
      keyVersion: data.key_version,
      ciphertext: data.ciphertext,
      iv: data.iv,
      authTag: data.auth_tag,
    });

    return {
      clientIntegrationId: data.client_integration_id,
      organizationId: data.organization_id,
      refreshToken: plaintextToken,
    };
  }

  /**
   * Guarda o actualiza el Refresh Token de Google Ads cifrado para una integración.
   */
  async storeGoogleRefreshToken(input: {
    organizationId: string;
    clientIntegrationId: string;
    refreshToken: string;
  }): Promise<void> {
    const encrypted = encryptCredential(input.refreshToken);

    const { error } = await this.client.from('client_integration_credentials').upsert(
      {
        organization_id: input.organizationId,
        client_integration_id: input.clientIntegrationId,
        credential_type: 'google_ads_refresh_token',
        key_version: encrypted.keyVersion,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_integration_id,credential_type' },
    );

    if (error) {
      throw new Error(`Failed to store Google refresh token: ${error.message}`);
    }
  }

  /**
   * Elimina el Refresh Token de Google Ads al desconectar.
   */
  async deleteGoogleRefreshToken(clientIntegrationId: string): Promise<void> {
    const { error } = await this.client
      .from('client_integration_credentials')
      .delete()
      .eq('client_integration_id', clientIntegrationId)
      .eq('credential_type', 'google_ads_refresh_token');

    if (error) {
      throw new Error(`Failed to delete Google refresh token: ${error.message}`);
    }
  }
}
