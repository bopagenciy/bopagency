import type { GoogleAdsDiscoveredCustomer } from '@bop-agency/shared';

/**
 * GoogleAdsDiscoveryClient — Phase 8F.1.
 *
 * Cliente de lectura estricta (read-only) para listar cuentas de Google Ads accesibles
 * y consultar la jerarquía de cuentas de administrador (MCC).
 *
 * NUNCA ejecuta operaciones de escritura (mutate), ni creación de campañas, presupuestos o anuncios.
 */

export class GoogleAdsDiscoveryClient {
  constructor(
    private readonly developerToken: string,
    private readonly apiVersion: string = 'v25',
  ) {}

  /**
   * Obtiene la lista de IDs de clientes accesibles directamente por el token OAuth.
   * Endpoint REST: GET https://googleads.googleapis.com/{version}/customers:listAccessibleCustomers
   */
  async listAccessibleCustomers(accessToken: string): Promise<string[]> {
    const url = `https://googleads.googleapis.com/${this.apiVersion}/customers:listAccessibleCustomers`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.developerToken,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Ads ListAccessibleCustomers failed with status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const resourceNames: string[] = data.resourceNames || [];

    // Convierte "customers/1234567890" a "1234567890"
    return resourceNames
      .map(rn => rn.replace(/^customers\//, '').trim())
      .filter(id => /^\d{10}$/.test(id));
  }

  /**
   * Consulta metadatos no sensibles de una cuenta concreta usando GAQL SearchStream.
   */
  async searchCustomerMetadata(
    accessToken: string,
    customerId: string,
  ): Promise<GoogleAdsDiscoveredCustomer | null> {
    const url = `https://googleads.googleapis.com/${this.apiVersion}/customers/${customerId}/googleAds:searchStream`;
    const query = `
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.manager
      FROM customer
      LIMIT 1
    `;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const batch = data[0];
    const row = batch?.results?.[0]?.customer;

    if (!row) {
      return null;
    }

    return {
      customerId: String(row.id),
      customerName: row.descriptiveName || `Account ${row.id}`,
      managerCustomerId: null,
      isManager: Boolean(row.manager),
      currencyCode: row.currencyCode || null,
      timeZone: row.timeZone || null,
    };
  }

  /**
   * Consulta la jerarquía customer_client de una cuenta manager (MCC) usando GAQL SearchStream.
   */
  async searchCustomerClientHierarchy(
    accessToken: string,
    managerCustomerId: string,
  ): Promise<GoogleAdsDiscoveredCustomer[]> {
    const url = `https://googleads.googleapis.com/${this.apiVersion}/customers/${managerCustomerId}/googleAds:searchStream`;
    const query = `
      SELECT
        customer_client.client_customer,
        customer_client.id,
        customer_client.descriptive_name,
        customer_client.currency_code,
        customer_client.time_zone,
        customer_client.manager,
        customer_client.status,
        customer_client.hidden,
        customer_client.level
      FROM customer_client
      WHERE customer_client.status = 'ENABLED'
        AND customer_client.hidden = false
    `;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': this.developerToken,
        'login-customer-id': managerCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const results: GoogleAdsDiscoveredCustomer[] = [];

    for (const batch of data) {
      for (const row of batch.results || []) {
        const client = row.customerClient;
        if (!client || !client.id) continue;

        const custId = String(client.id);
        const isManager = Boolean(client.manager);

        results.push({
          customerId: custId,
          customerName: client.descriptiveName || `Account ${custId}`,
          managerCustomerId: managerCustomerId,
          isManager,
          currencyCode: client.currencyCode || null,
          timeZone: client.timeZone || null,
        });
      }
    }

    return results;
  }
}
