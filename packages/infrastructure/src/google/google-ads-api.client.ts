import type { LoggerPort } from '@bop-agency/application';

export type GoogleAdsApiClientConfig = {
  readonly developerToken: string;
  readonly apiVersion?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
};

export type GoogleMutateOperation = Record<string, unknown>;

export type GoogleAdsMutateRequestPayload = {
  readonly mutateOperations: readonly GoogleMutateOperation[];
  readonly partialFailure: false;
  readonly validateOnly: false;
  readonly responseContentType: 'RESOURCE_NAME_ONLY';
};

export type GoogleAdsMutateResultItem = {
  readonly campaignResult?: {
    readonly resourceName?: string;
  };
  readonly campaignBudgetResult?: {
    readonly resourceName?: string;
  };
  readonly adGroupResult?: {
    readonly resourceName?: string;
  };
  readonly adGroupAdResult?: {
    readonly resourceName?: string;
  };
};

export type GoogleAdsMutateResponse = {
  readonly mutateOperationResponses?: readonly GoogleAdsMutateResultItem[];
};

export class GoogleAdsApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly rawError?: unknown,
    public readonly requestId?: string | null,
  ) {
    super(message);
    this.name = 'GoogleAdsApiError';
  }
}

export function requireGoogleAdsApiVersion(): string {
  const version = process.env['GOOGLE_ADS_API_VERSION'];
  if (!version || !/^v\d+$/.test(version.trim())) {
    throw new Error(
      'GOOGLE_ADS_API_VERSION environment variable is required and must match format v{number}',
    );
  }
  return version.trim();
}

export function requireGoogleAdsDeveloperToken(): string {
  const token = process.env['GOOGLE_ADS_DEVELOPER_TOKEN'];
  if (!token || token.trim().length === 0) {
    throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN environment variable is required');
  }
  return token.trim();
}

export class GoogleAdsApiClient {
  private readonly developerToken: string;
  private readonly apiVersion: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    config: GoogleAdsApiClientConfig,
    private readonly logger: LoggerPort,
  ) {
    this.developerToken = config.developerToken;
    this.apiVersion = config.apiVersion ?? requireGoogleAdsApiVersion();
    this.clientId = config.clientId ?? process.env['GOOGLE_CLIENT_ID'] ?? '';
    this.clientSecret = config.clientSecret ?? process.env['GOOGLE_CLIENT_SECRET'] ?? '';
  }

  /**
   * Refresca el Access Token OAuth de Google usando el Refresh Token desencriptado.
   * El access token se mantiene ÚNICAMENTE en la memoria volátil del servidor.
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    if (!refreshToken || refreshToken.trim().length === 0) {
      throw new GoogleAdsApiError('Refresh token is required to obtain access token', 401);
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken.trim(),
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    let response: Response;
    try {
      response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } catch (netErr) {
      this.logger.error('GoogleAdsApiClient: token refresh network failure', { error: netErr });
      throw new GoogleAdsApiError('Network failure refreshing Google access token', 503, netErr);
    }

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok || !data['access_token']) {
      const errorDescription = typeof data['error_description'] === 'string' ? data['error_description'] : 'Token refresh failed';
      this.logger.warn('GoogleAdsApiClient: token refresh rejected', { status: response.status });
      throw new GoogleAdsApiError(errorDescription, response.status, data);
    }

    return {
      accessToken: data['access_token'] as string,
      expiresIn: typeof data['expires_in'] === 'number' ? data['expires_in'] : 3600,
    };
  }

  /**
   * Ejecuta una llamada `GoogleAdsService.Mutate` REST atómica.
   */
  async mutate(params: {
    readonly customerId: string;
    readonly managerCustomerId: string | null;
    readonly accessToken: string;
    readonly payload: GoogleAdsMutateRequestPayload;
  }): Promise<{
    readonly response: GoogleAdsMutateResponse;
    readonly requestId: string | null;
  }> {
    const cleanCustomerId = params.customerId.replace(/-/g, '').trim();
    const endpoint = `https://googleads.googleapis.com/${this.apiVersion}/customers/${cleanCustomerId}/googleAds:mutate`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${params.accessToken}`,
      'developer-token': this.developerToken,
      'Content-Type': 'application/json',
    };

    if (params.managerCustomerId && params.managerCustomerId.trim().length > 0) {
      headers['login-customer-id'] = params.managerCustomerId.replace(/-/g, '').trim();
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(params.payload),
      });
    } catch (netErr) {
      this.logger.error('GoogleAdsApiClient: mutate network failure', { error: netErr });
      throw new GoogleAdsApiError('Network failure executing Google Ads atomic mutate', 503, netErr);
    }

    const requestId = response.headers.get('request-id');
    const responseData = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const message =
        typeof responseData['message'] === 'string'
          ? responseData['message']
          : `Google Ads API mutate failed with status ${response.status}`;

      this.logger.warn('GoogleAdsApiClient: mutate call rejected by provider', {
        status: response.status,
        requestId,
      });

      throw new GoogleAdsApiError(message, response.status, responseData, requestId);
    }

    return {
      response: responseData as GoogleAdsMutateResponse,
      requestId,
    };
  }
}
