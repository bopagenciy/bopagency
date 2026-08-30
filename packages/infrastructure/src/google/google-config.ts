/**
 * google-config.ts — Configuración y versionado centralizado de Google Ads API (Phase 9B.2).
 */

export const DEFAULT_GOOGLE_ADS_API_VERSION = 'v25';

export function getGoogleAdsApiVersion(): string {
  const envVer = process.env['GOOGLE_ADS_API_VERSION'];
  if (envVer && /^v\d+$/.test(envVer.trim())) {
    return envVer.trim();
  }
  return DEFAULT_GOOGLE_ADS_API_VERSION;
}
