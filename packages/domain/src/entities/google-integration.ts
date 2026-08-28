/**
 * Google Integration Entity & Invariants — Domain Layer.
 *
 * Representa la lógica pura de dominio para la entidad de integración de Google Ads.
 */

export interface GoogleIntegrationMetadata {
  customerId: string;
  customerName: string;
  managerCustomerId?: string | null;
  isManager: boolean;
  currencyCode?: string | null;
  timeZone?: string | null;
}

export function normalizeCustomerId(rawId: string): string {
  const cleaned = rawId.replace(/\D/g, '');
  if (cleaned.length !== 10) {
    throw new Error(`Invalid Google Customer ID format: '${rawId}'. Must contain exactly 10 digits.`);
  }
  return cleaned;
}

export function formatCustomerIdForDisplay(customerId: string): string {
  const normalized = normalizeCustomerId(customerId);
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6, 10)}`;
}
