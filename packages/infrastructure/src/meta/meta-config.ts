/**
 * meta-config.ts — Phase 8E / Phase 9B.1.
 *
 * Configuración centralizada de Meta Graph API.
 * EXIGE que process.env.META_GRAPH_API_VERSION esté definida y cumpla el formato ^v\d+\.\d+$.
 */

export const DEFAULT_META_GRAPH_API_VERSION = 'v26.0';

export function getMetaGraphApiVersion(): string {
  const version = process.env['META_GRAPH_API_VERSION'];
  if (!version || !version.trim()) {
    throw new Error(
      'META_GRAPH_API_VERSION is missing from environment configuration. Startup gate failed.',
    );
  }

  const trimmed = version.trim();
  if (!/^v\d+\.\d+$/.test(trimmed)) {
    throw new Error(
      `META_GRAPH_API_VERSION format invalid: "${trimmed}". Must match pattern ^v\\d+\\.\\d+$ (e.g. "v26.0").`,
    );
  }

  return trimmed;
}

export function getMetaAppConfig(): { appId: string; appSecret: string } {
  const appId = process.env['META_APP_ID'];
  const appSecret = process.env['META_APP_SECRET'];

  if (!appId || !appId.trim()) {
    throw new Error('META_APP_ID environment variable is missing.');
  }

  if (!appSecret || !appSecret.trim()) {
    throw new Error('META_APP_SECRET environment variable is missing.');
  }

  return {
    appId: appId.trim(),
    appSecret: appSecret.trim(),
  };
}
