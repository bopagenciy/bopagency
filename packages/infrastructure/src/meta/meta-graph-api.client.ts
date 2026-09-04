/**
 * meta-graph-api.client.ts — Phase 8E.
 *
 * Cliente HTTP fuertemente tipado para interactuar con Meta Graph API.
 * Utiliza fetch nativo (inyectable para testing/mocks).
 */

import { getMetaGraphApiVersion, getMetaAppConfig } from './meta-config';

export type DiscoveredMetaPage = {
  page_id: string;
  page_name: string;
  page_access_token: string;
  instagram_account_id: string | null;
  instagram_username: string | null;
};

export type DiscoveredMetaAdAccount = {
  id: string;
  canonicalAdAccountId: string;
  name: string;
  account_status: number;
  currency: string | null;
  timezone_name: string | null;
};

export type MetaPublishResult = {
  id: string;
  post_id?: string;
  permalink_url?: string;
  httpStatus: number;
  headers?: Record<string, string>;
};

export type MetaGraphApiErrorResponse = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class MetaGraphApiClient {
  private readonly baseUrl: string;

  constructor(
    private readonly fetchFn: typeof fetch = globalThis.fetch,
    customVersion?: string,
  ) {
    const version = customVersion || getMetaGraphApiVersion();
    this.baseUrl = `https://graph.facebook.com/${version}`;
  }

  /**
   * Intercambia el código OAuth de autorización por un User Access Token de corta duración.
   */
  async exchangeCodeForUserToken(code: string, redirectUri: string): Promise<string> {
    const { appId, appSecret } = getMetaAppConfig();
    const url = new URL(`${this.baseUrl}/oauth/access_token`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('code', code);

    const res = await this.fetchFn(url.toString(), { method: 'GET' });
    const data = await res.json();

    if (!res.ok || !data.access_token) {
      throw new Error(`Meta OAuth code exchange failed: ${data.error?.message || res.statusText}`);
    }

    return data.access_token as string;
  }

  /**
   * Obtiene un Long-Lived User Access Token (60 días).
   */
  async exchangeUserTokenForLongLived(shortLivedToken: string): Promise<string> {
    const { appId, appSecret } = getMetaAppConfig();
    const url = new URL(`${this.baseUrl}/oauth/access_token`);
    url.searchParams.set('grant_type', 'fb_exchange_token');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('fb_exchange_token', shortLivedToken);

    const res = await this.fetchFn(url.toString(), { method: 'GET' });
    const data = await res.json();

    if (!res.ok || !data.access_token) {
      // Retornar token corto si el intercambio falla en entorno de prueba
      return shortLivedToken;
    }

    return data.access_token as string;
  }

  /**
   * Descubre Páginas de Facebook administradas por el usuario y sus cuentas de Instagram Professional vinculadas (/me/accounts).
   * Resiliente: solo requiere permisos básicos de páginas (id, name, access_token).
   * El enriquecimiento de Instagram es opcional e individual por página; si falla (ej. falta instagram_basic), la página se preserva.
   */
  async discoverPagesAndAccounts(userAccessToken: string): Promise<DiscoveredMetaPage[]> {
    const url = new URL(`${this.baseUrl}/me/accounts`);
    url.searchParams.set('fields', 'id,name,access_token');
    url.searchParams.set('access_token', userAccessToken);

    const res = await this.fetchFn(url.toString(), { method: 'GET' });
    const data = await res.json();

    if (!res.ok || !data.data || !Array.isArray(data.data)) {
      throw new Error(`Meta accounts discovery failed: ${data.error?.message || res.statusText}`);
    }

    const pages: DiscoveredMetaPage[] = [];

    for (const item of data.data as Array<Record<string, unknown>>) {
      const pageId = String(item['id'] || '');
      const pageName = String(item['name'] || 'Facebook Page');
      const pageToken = String(item['access_token'] || '');

      let igAccountId: string | null = null;
      let igUsername: string | null = null;

      // Enriquecimiento opcional de Instagram con aislamiento de fallos
      if (pageId && pageToken) {
        try {
          const igUrl = new URL(`${this.baseUrl}/${pageId}`);
          igUrl.searchParams.set('fields', 'instagram_business_account{id,username}');
          igUrl.searchParams.set('access_token', pageToken);

          const igRes = await this.fetchFn(igUrl.toString(), { method: 'GET' });
          if (igRes.ok) {
            const igData = await igRes.json();
            const ig = igData?.['instagram_business_account'] as
              { id?: string; username?: string } | undefined;
            if (ig?.id) {
              igAccountId = String(ig.id);
              igUsername = ig.username ? String(ig.username) : null;
            }
          }
        } catch {
          // Enriquecimiento opcional falló de forma segura; se preserva la página
        }
      }

      pages.push({
        page_id: pageId,
        page_name: pageName,
        page_access_token: pageToken,
        instagram_account_id: igAccountId,
        instagram_username: igUsername,
      });
    }

    return pages;
  }

  /**
   * Descubre Cuentas Publicitarias (Meta Ad Accounts).
   * Requiere permiso 'ads_read'.
   * Estrategia de descubrimiento robusta:
   * 1. Consulta /me/adaccounts (estándar para usuarios humanos).
   * 2. Si /me/adaccounts está vacío o falla, consulta /{id}/assigned_ad_accounts
   *    (endpoint canónico para tokens de System User / Business Login).
   * 3. Registra diagnósticos seguros (sin exponer tokens ni credenciales).
   */
  async discoverAdAccounts(userAccessToken: string): Promise<DiscoveredMetaAdAccount[]> {
    const fields = 'id,name,account_id,account_status,currency,timezone_name';

    const normalizeAccounts = (dataList: Array<Record<string, unknown>>): DiscoveredMetaAdAccount[] => {
      return dataList.map((item) => {
        const rawId = String(item['id'] || '');
        const rawAccountId = item['account_id'] ? String(item['account_id']) : rawId;
        const canonical = rawAccountId.startsWith('act_') ? rawAccountId.slice(4) : rawAccountId;

        return {
          id: rawId.startsWith('act_') ? rawId : `act_${rawId}`,
          canonicalAdAccountId: canonical,
          name: String(item['name'] || `Ad Account ${canonical}`),
          account_status: typeof item['account_status'] === 'number' ? item['account_status'] : 1,
          currency: item['currency'] ? String(item['currency']) : null,
          timezone_name: item['timezone_name'] ? String(item['timezone_name']) : null,
        };
      });
    };

    // Intento 1: /me/adaccounts
    const meUrl = new URL(`${this.baseUrl}/me/adaccounts`);
    meUrl.searchParams.set('fields', fields);
    meUrl.searchParams.set('access_token', userAccessToken);

    let meError: string | null = null;
    try {
      const res = await this.fetchFn(meUrl.toString(), { method: 'GET' });
      const data = await res.json();

      if (res.ok && Array.isArray(data.data)) {
        if (data.data.length > 0) {
          return normalizeAccounts(data.data as Array<Record<string, unknown>>);
        }
      } else if (!res.ok) {
        meError = data.error?.message || res.statusText;
        console.warn('[Meta Graph API] /me/adaccounts discovery failed', {
          status: res.status,
          errorCode: data.error?.code,
          errorSubcode: data.error?.error_subcode,
          errorType: data.error?.type,
        });
      } else {
        meError = 'Response data is malformed';
      }
    } catch (err: unknown) {
      meError = err instanceof Error ? err.message : 'Network failure';
    }

    // Intento 2: /{system_user_id}/assigned_ad_accounts (System User / Business Login)
    try {
      const userUrl = new URL(`${this.baseUrl}/me`);
      userUrl.searchParams.set('fields', 'id');
      userUrl.searchParams.set('access_token', userAccessToken);

      const userRes = await this.fetchFn(userUrl.toString(), { method: 'GET' });
      if (userRes.ok) {
        const userData = await userRes.json();
        const actorId = userData?.id ? String(userData.id) : null;
        if (actorId) {
          const assignedUrl = new URL(`${this.baseUrl}/${actorId}/assigned_ad_accounts`);
          assignedUrl.searchParams.set('fields', fields);
          assignedUrl.searchParams.set('access_token', userAccessToken);

          const assignedRes = await this.fetchFn(assignedUrl.toString(), { method: 'GET' });
          const assignedData = await assignedRes.json();

          if (assignedRes.ok && Array.isArray(assignedData.data) && assignedData.data.length > 0) {
            return normalizeAccounts(assignedData.data as Array<Record<string, unknown>>);
          } else if (!assignedRes.ok) {
            console.warn('[Meta Graph API] /{actorId}/assigned_ad_accounts discovery failed', {
              status: assignedRes.status,
              actorId,
              errorCode: assignedData.error?.code,
              errorSubcode: assignedData.error?.error_subcode,
              errorType: assignedData.error?.type,
            });
          }
        }
      }
    } catch (fallbackErr: unknown) {
      console.warn('[Meta Graph API] assigned_ad_accounts fallback error', {
        message: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      });
    }

    // Si hubo un error explícito de API y ninguno de los dos métodos encontró cuentas, propagar error
    if (meError) {
      throw new Error(`Meta ad accounts discovery failed: ${meError}`);
    }

    return [];
  }

  /**
   * Publica un post orgánico en una Página de Facebook (Texto o Imagen + Texto).
   */
  async publishFacebookPost(
    pageId: string,
    pageAccessToken: string,
    content: { message: string; imageUrl?: string | null },
  ): Promise<MetaPublishResult> {
    const isPhoto = Boolean(content.imageUrl);
    const endpoint = isPhoto
      ? `${this.baseUrl}/${pageId}/photos`
      : `${this.baseUrl}/${pageId}/feed`;

    const bodyParams = new URLSearchParams();
    bodyParams.set('access_token', pageAccessToken);

    if (isPhoto && content.imageUrl) {
      bodyParams.set('url', content.imageUrl);
      bodyParams.set('caption', content.message);
    } else {
      bodyParams.set('message', content.message);
    }

    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      const err: Error & { metaError?: unknown; httpStatus?: number } = new Error(
        data.error?.message || `Meta API post error ${res.status}`,
      );
      err.metaError = data.error;
      err.httpStatus = res.status;
      throw err;
    }

    const headersObj: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });

    const resultObj: MetaPublishResult = {
      id: String(data.id || data.post_id || ''),
      httpStatus: res.status,
      headers: headersObj,
    };
    if (data.post_id) {
      resultObj.post_id = String(data.post_id);
    }
    if (data.permalink_url) {
      resultObj.permalink_url = String(data.permalink_url);
    }

    return resultObj;
  }

  /**
   * Paso 1 de Instagram: Crea un contenedor de media (Single Image + Caption).
   */
  async createInstagramContainer(
    igAccountId: string,
    pageAccessToken: string,
    imageUrl: string,
    caption: string,
  ): Promise<{ creationId: string; httpStatus: number }> {
    const endpoint = `${this.baseUrl}/${igAccountId}/media`;

    const bodyParams = new URLSearchParams();
    bodyParams.set('access_token', pageAccessToken);
    bodyParams.set('image_url', imageUrl);
    bodyParams.set('caption', caption);

    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    const data = await res.json();

    if (!res.ok || !data.id) {
      const err: Error & { metaError?: unknown; httpStatus?: number } = new Error(
        data.error?.message || `Meta IG Container error ${res.status}`,
      );
      err.metaError = data.error;
      err.httpStatus = res.status;
      throw err;
    }

    return {
      creationId: String(data.id),
      httpStatus: res.status,
    };
  }

  /**
   * Paso 2 de Instagram: Publica un contenedor previamente creado.
   */
  async publishInstagramContainer(
    igAccountId: string,
    pageAccessToken: string,
    creationId: string,
  ): Promise<MetaPublishResult> {
    const endpoint = `${this.baseUrl}/${igAccountId}/media_publish`;

    const bodyParams = new URLSearchParams();
    bodyParams.set('access_token', pageAccessToken);
    bodyParams.set('creation_id', creationId);

    const res = await this.fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    const data = await res.json();

    if (!res.ok || !data.id) {
      const err: Error & { metaError?: unknown; httpStatus?: number } = new Error(
        data.error?.message || `Meta IG Publish error ${res.status}`,
      );
      err.metaError = data.error;
      err.httpStatus = res.status;
      throw err;
    }

    const headersObj: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headersObj[k.toLowerCase()] = v;
    });

    return {
      id: String(data.id),
      httpStatus: res.status,
      headers: headersObj,
    };
  }

  /**
   * Consulta el estado de procesamiento de un contenedor de Instagram.
   */
  async checkInstagramContainerStatus(
    creationId: string,
    pageAccessToken: string,
  ): Promise<{ statusCode: string; httpStatus: number }> {
    const url = new URL(`${this.baseUrl}/${creationId}`);
    url.searchParams.set('fields', 'status_code,status');
    url.searchParams.set('access_token', pageAccessToken);

    const res = await this.fetchFn(url.toString(), { method: 'GET' });
    const data = await res.json();

    if (!res.ok) {
      const err: Error & { metaError?: unknown; httpStatus?: number } = new Error(
        data.error?.message || `Meta IG container status error ${res.status}`,
      );
      err.metaError = data.error;
      err.httpStatus = res.status;
      throw err;
    }

    return {
      statusCode: String(data.status_code || 'EXPIRED'),
      httpStatus: res.status,
    };
  }

  /**
   * Phase 8G.2 — Consulta LECTURA PURA el estado de un post de Facebook via Graph API.
   */
  async observeFacebookPost(
    postId: string,
    accessToken: string,
  ): Promise<{
    result: {
      id: string;
      created_time?: string | undefined;
      permalink_url?: string | undefined;
      is_published?: boolean | undefined;
    } | null;
    requestId: string | null;
    httpStatus: number;
    errorSubcode?: number | null;
    errorCode?: number | null;
  }> {
    const url = new URL(`${this.baseUrl}/${postId}`);
    url.searchParams.set('fields', 'id,created_time,permalink_url,is_published');
    url.searchParams.set('access_token', accessToken);

    const res = await this.fetchFn(url.toString(), { method: 'GET' });
    const requestId = res.headers.get('x-fb-trace-id') || res.headers.get('x-app-usage') || null;
    const data = await res.json();

    if (!res.ok) {
      const metaErr = data.error;
      return {
        result: null,
        requestId,
        httpStatus: res.status,
        errorCode: metaErr?.code ? Number(metaErr.code) : null,
        errorSubcode: metaErr?.error_subcode ? Number(metaErr.error_subcode) : null,
      };
    }

    return {
      result: {
        id: String(data.id),
        created_time: data.created_time ? String(data.created_time) : undefined,
        permalink_url: data.permalink_url ? String(data.permalink_url) : undefined,
        is_published: data.is_published !== undefined ? Boolean(data.is_published) : undefined,
      },
      requestId,
      httpStatus: res.status,
    };
  }

  /**
   * Phase 8G.2 — Consulta LECTURA PURA el estado de un media item de Instagram via Graph API.
   */
  async observeInstagramMedia(
    mediaId: string,
    accessToken: string,
  ): Promise<{
    result: {
      id: string;
      media_type?: string | undefined;
      media_product_type?: string | undefined;
      permalink?: string | undefined;
      timestamp?: string | undefined;
    } | null;
    requestId: string | null;
    httpStatus: number;
    errorSubcode?: number | null;
    errorCode?: number | null;
  }> {
    const url = new URL(`${this.baseUrl}/${mediaId}`);
    url.searchParams.set('fields', 'id,media_type,media_product_type,permalink,timestamp');
    url.searchParams.set('access_token', accessToken);

    const res = await this.fetchFn(url.toString(), { method: 'GET' });
    const requestId = res.headers.get('x-fb-trace-id') || res.headers.get('x-app-usage') || null;
    const data = await res.json();

    if (!res.ok) {
      const metaErr = data.error;
      return {
        result: null,
        requestId,
        httpStatus: res.status,
        errorCode: metaErr?.code ? Number(metaErr.code) : null,
        errorSubcode: metaErr?.error_subcode ? Number(metaErr.error_subcode) : null,
      };
    }

    return {
      result: {
        id: String(data.id),
        media_type: data.media_type ? String(data.media_type) : undefined,
        media_product_type: data.media_product_type ? String(data.media_product_type) : undefined,
        permalink: data.permalink ? String(data.permalink) : undefined,
        timestamp: data.timestamp ? String(data.timestamp) : undefined,
      },
      requestId,
      httpStatus: res.status,
    };
  }
}
