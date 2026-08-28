import { describe, it, expect } from 'vitest';
import {
  googleAdsIntegrationConfigSchema,
  googleAdsDiscoveredCustomerSchema,
  finalizeGoogleConnectionInputSchema,
} from '../google-integration.schema';

describe('Google Integration Schemas', () => {
  describe('googleAdsIntegrationConfigSchema', () => {
    it('validates a valid 10-digit customer ID config', () => {
      const valid = {
        customer_id: '1234567890',
        customer_name: 'Test Agency Account',
        manager_customer_id: '9876543210',
        is_manager: false,
        currency_code: 'USD',
        time_zone: 'America/New_York',
      };
      const result = googleAdsIntegrationConfigSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('rejects customer ID with hyphens or non-10 digits', () => {
      const invalid = {
        customer_id: '123-456-7890',
        customer_name: 'Test Account',
      };
      const result = googleAdsIntegrationConfigSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('googleAdsDiscoveredCustomerSchema', () => {
    it('validates discovered customer metadata', () => {
      const valid = {
        id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        customerId: '1234567890',
        customerName: 'Direct Client Account',
        managerCustomerId: null,
        isManager: false,
        currencyCode: 'EUR',
        timeZone: 'Europe/Madrid',
      };
      const result = googleAdsDiscoveredCustomerSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('finalizeGoogleConnectionInputSchema', () => {
    it('validates finalization input parameters', () => {
      const valid = {
        pendingConnectionId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
        selectedResourceId: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
        organizationId: 'f1e2d3c4-b5a6-9f8e-7d6c-5b4a3f2e1d0c',
        clientId: 'e1d2c3b4-a5f6-8e9d-7c6b-5a4f3e2d1c0b',
      };
      const result = finalizeGoogleConnectionInputSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
