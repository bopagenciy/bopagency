import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleAdsDiscoveryClient } from '../google-ads-discovery.client';

describe('GoogleAdsDiscoveryClient', () => {
  const devToken = 'test-developer-token';
  let client: GoogleAdsDiscoveryClient;

  beforeEach(() => {
    client = new GoogleAdsDiscoveryClient(devToken, 'v25');
    vi.restoreAllMocks();
  });

  it('lists accessible customer IDs and filters non-10-digit IDs', async () => {
    const mockResponse = {
      resourceNames: ['customers/1234567890', 'customers/9876543210', 'customers/invalid'],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    } as unknown as Response);

    const customers = await client.listAccessibleCustomers('test-access-token');

    expect(customers).toEqual(['1234567890', '9876543210']);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v25/customers:listAccessibleCustomers',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
          'developer-token': devToken,
        }),
      }),
    );
  });
});
