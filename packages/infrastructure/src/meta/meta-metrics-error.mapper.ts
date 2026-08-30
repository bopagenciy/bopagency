/**
 * meta-metrics-error.mapper.ts — Mapeo higienizado de errores de Meta Graph API a MetricsProviderError (Phase 9B.1).
 * Garantiza que NUNCA se expongan access tokens ni encabezados con credenciales sensibles en mensajes o metadatos de error.
 */

import type { MetricsProviderError } from '@bop-agency/application';

export type MetaApiErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

/**
 * Mapea la respuesta de error de Meta a la abstracción de error neutral MetricsProviderError.
 */
export function mapMetaResponseToMetricsError(
  httpStatus: number,
  body?: MetaApiErrorBody | null,
): MetricsProviderError {
  const code = body?.error?.code;
  const rawMsg = body?.error?.message || `Meta Graph API request failed with HTTP ${httpStatus}`;
  // Sanitizar el mensaje para eliminar cualquier token accidental que pudiera estar en URLs
  const sanitizedMessage = rawMsg.replace(/access_token=[^&]+/g, 'access_token=REDACTED');

  if (httpStatus === 401 || httpStatus === 403 || code === 190 || code === 102 || code === 200 || code === 299) {
    return {
      category: 'AUTH_FAILURE',
      message: sanitizedMessage,
      isRetryable: false,
    };
  }

  if (httpStatus === 429 || code === 4 || code === 17 || code === 32) {
    return {
      category: 'RATE_LIMIT',
      message: sanitizedMessage,
      isRetryable: true,
    };
  }

  if (httpStatus === 400 || code === 100) {
    return {
      category: 'INVALID_REQUEST',
      message: sanitizedMessage,
      isRetryable: false,
    };
  }

  if (httpStatus >= 500 || code === 1 || code === 2) {
    return {
      category: 'TRANSIENT_FAILURE',
      message: sanitizedMessage,
      isRetryable: true,
    };
  }

  return {
    category: 'UNKNOWN',
    message: sanitizedMessage,
    isRetryable: false,
  };
}
