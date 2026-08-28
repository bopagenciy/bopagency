/**
 * GoogleOAuthClient — Phase 8F.1.
 *
 * Cliente de infraestructura servidor para intercambiar authorization codes
 * por tokens de OAuth 2.0 con Google.
 */

export type GoogleTokenExchangeResult = {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn: number;
  tokenType: string;
  scope: string;
};

export class GoogleOAuthClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  /**
   * Intercambia un authorization code por tokens de acceso y refresh en servidor.
   */
  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
  ): Promise<GoogleTokenExchangeResult> {
    const params = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google OAuth token exchange failed with status ${response.status}: ${errText}`);
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }
}
