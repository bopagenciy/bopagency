/**
 * google-metrics-error.mapper.ts — Mapeo sanitizado de errores de Google Ads API a MetricsProviderError (Phase 9B.2).
 * Sanitiza mensajes de error eliminando tokens de acceso o tokens de desarrollador.
 */

import type { MetricsProviderError } from '@bop-agency/application';

export type GoogleAdsApiErrorResponseBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: readonly Record<string, unknown>[];
  };
  message?: string;
};

export function mapGoogleResponseToMetricsError(
  httpStatus: number,
  responseBody?: unknown,
): MetricsProviderError {
  const body = (responseBody && typeof responseBody === 'object' ? responseBody : {}) as GoogleAdsApiErrorResponseBody;
  const rawMsg = body.error?.message || body.message || `Google Ads API request failed with HTTP ${httpStatus}`;
  const statusStr = body.error?.status || '';

  // Sanitizar el mensaje para eliminar credenciales sensibles
  const sanitizedMsg = rawMsg
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer REDACTED')
    .replace(/developer-token[=:\s]+[^\s&]+/gi, 'developer-token=REDACTED')
    .replace(/access_token[=:\s]+[^\s&]+/gi, 'access_token=REDACTED');

  if (httpStatus === 401 || statusStr === 'UNAUTHENTICATED' || sanitizedMsg.includes('UNAUTHENTICATED')) {
    return {
      category: 'AUTH_FAILURE',
      message: `Google Ads API authentication failed: ${sanitizedMsg}`,
      isRetryable: false,
    };
  }

  if (httpStatus === 403 || statusStr === 'PERMISSION_DENIED' || sanitizedMsg.includes('PERMISSION_DENIED')) {
    return {
      category: 'AUTH_FAILURE',
      message: `Google Ads API permission denied: ${sanitizedMsg}`,
      isRetryable: false,
    };
  }

  if (httpStatus === 429 || statusStr === 'RESOURCE_EXHAUSTED' || sanitizedMsg.includes('RESOURCE_EXHAUSTED')) {
    return {
      category: 'RATE_LIMIT',
      message: `Google Ads API rate limit or quota exceeded: ${sanitizedMsg}`,
      isRetryable: true,
    };
  }

  if (httpStatus === 400 || statusStr === 'INVALID_ARGUMENT' || sanitizedMsg.includes('INVALID_ARGUMENT')) {
    return {
      category: 'INVALID_REQUEST',
      message: `Google Ads API invalid request or GAQL syntax error: ${sanitizedMsg}`,
      isRetryable: false,
    };
  }

  if (httpStatus >= 500 || statusStr === 'UNAVAILABLE' || statusStr === 'INTERNAL') {
    return {
      category: 'TRANSIENT_FAILURE',
      message: `Google Ads API server error (${httpStatus}): ${sanitizedMsg}`,
      isRetryable: true,
    };
  }

  return {
    category: 'UNKNOWN',
    message: `Google Ads API unexpected error (${httpStatus}): ${sanitizedMsg}`,
    isRetryable: false,
  };
}

/**
 * Convierte micros de costo (cost_micros) a string decimal canónico de 2 decimales sin imprecisión flotante.
 */
export function convertCostMicrosToMonetaryString(costMicros: number | string | null | undefined): string | null {
  if (costMicros === null || costMicros === undefined) return null;

  const rawStr = String(costMicros).trim();
  if (!/^\d+$/.test(rawStr)) return null;

  const microsNum = BigInt(rawStr);
  if (microsNum < 0n) return null;

  // 1,000,000 micros = $1.00
  // Para redondeo a 2 decimales (centavos), se evalúan los micros restantes en posición de centavos (micros / 10,000)
  const integerPart = microsNum / 1000000n;
  const remainderMicros = microsNum % 1000000n;

  // Redondeo determinista usando la posición del tercer dígito decimal (micros 1,000s)
  let cents = Number(remainderMicros / 10000n);
  const subCents = Number((remainderMicros % 10000n) / 1000n);

  let finalInt = integerPart;
  if (subCents >= 5) {
    cents += 1;
    if (cents >= 100) {
      cents = 0;
      finalInt += 1n;
    }
  }

  const centsStr = cents.toString().padStart(2, '0');
  return `${finalInt.toString()}.${centsStr}`;
}
