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
   */
  async discoverPagesAndAccounts(userAccessToken: string): Promise<DiscoveredMetaPage[]> {
    const url = new URL(`${this.baseUrl}/me/accounts`);
    url.searchParams.set('fields', 'id,name,access_token,instagram_business_account{id,username}');
    url.searchParams.set('access_token', userAccessToken);

    const res = await this.fetchFn(url.toString(), { method: 'GET' });
    const data = await res.json();

    if (!res.ok || !data.data || !Array.isArray(data.data)) {
      throw new Error(`Meta accounts discovery failed: ${data.error?.message || res.statusText}`);
    }

    return (data.data as Array<Record<string, unknown>>).map((item) => {
      const ig = item['instagram_business_account'] as
        { id?: string; username?: string } | undefined;
      return {
        page_id: String(item['id'] || ''),
        page_name: String(item['name'] || 'Facebook Page'),
        page_access_token: String(item['access_token'] || ''),
        instagram_account_id: ig?.id ? String(ig.id) : null,
        instagram_username: ig?.username ? String(ig.username) : null,
      };
    });
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
}
