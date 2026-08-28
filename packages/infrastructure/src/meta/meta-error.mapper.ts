/**
 * meta-error.mapper.ts — Phase 8E.
 *
 * Mapea códigos de error de Meta Graph API hacia la categoría existente de dominio `PublicationFailureCategory`.
 * NO introduce categorías nuevas de dominio.
 */

import type { PublicationFailureCategory } from '@bop-agency/shared';

export type MetaErrorPayload = {
  message?: string;
  code?: number;
  error_subcode?: number;
  type?: string;
  fbtrace_id?: string;
};

export function mapMetaErrorToFailureCategory(
  httpStatus: number,
  metaError?: MetaErrorPayload,
): PublicationFailureCategory {
  const code = metaError?.code;

  if (httpStatus === 429 || code === 4 || code === 17 || code === 32) {
    return 'RATE_LIMITED';
  }

  if (code === 190 || code === 102 || httpStatus === 401) {
    return 'INTEGRATION_NOT_AVAILABLE';
  }

  if (
    code === 200 ||
    code === 299 ||
    (code !== undefined && code >= 200 && code <= 299) ||
    httpStatus === 403
  ) {
    return 'INTEGRATION_NOT_AVAILABLE';
  }

  if (code === 100 || httpStatus === 400) {
    return 'DISPATCH_FAILED';
  }

  if (code === 1 || code === 2 || (code !== undefined && code >= 500) || httpStatus >= 500) {
    return 'PROVIDER_OUTAGE';
  }

  return 'DISPATCH_FAILED';
}
