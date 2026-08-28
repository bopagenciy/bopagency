import { z } from 'zod';

/**
 * Schema para validar la configuración almacenada en public.client_integrations.configuration
 * cuando provider === 'google'.
 */
export const googleAdsIntegrationConfigSchema = z.object({
  customer_id: z.string().regex(/^\d{10}$/, 'Customer ID must be exactly 10 numeric digits'),
  customer_name: z.string().min(1, 'Customer name is required'),
  manager_customer_id: z
    .string()
    .regex(/^\d{10}$/, 'Manager Customer ID must be exactly 10 numeric digits')
    .nullable()
    .optional(),
  is_manager: z.boolean().default(false),
  currency_code: z.string().nullable().optional(),
  time_zone: z.string().nullable().optional(),
});

export type GoogleAdsIntegrationConfig = z.infer<typeof googleAdsIntegrationConfigSchema>;

/**
 * Schema para validar los recursos de cuentas descubiertas durante OAuth.
 */
export const googleAdsDiscoveredCustomerSchema = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().regex(/^\d{10}$/, 'Customer ID must be exactly 10 numeric digits'),
  customerName: z.string().min(1, 'Customer name is required'),
  managerCustomerId: z
    .string()
    .regex(/^\d{10}$/, 'Manager Customer ID must be exactly 10 numeric digits')
    .nullable()
    .optional(),
  isManager: z.boolean().default(false),
  currencyCode: z.string().nullable().optional(),
  timeZone: z.string().nullable().optional(),
});

export type GoogleAdsDiscoveredCustomer = z.infer<typeof googleAdsDiscoveredCustomerSchema>;

/**
 * Schema para iniciar el flujo de OAuth con Google.
 */
export const connectGoogleOAuthInputSchema = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  intent: z.enum(['connect', 'reconnect', 'reconsent']).default('connect'),
  redirectUri: z.string().url(),
});

export type ConnectGoogleOAuthInput = z.infer<typeof connectGoogleOAuthInputSchema>;

/**
 * Schema para finalizar la conexión seleccionando una cuenta/recurso de Google Ads.
 */
export const finalizeGoogleConnectionInputSchema = z.object({
  pendingConnectionId: z.string().uuid(),
  selectedResourceId: z.string().uuid(),
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
});

export type FinalizeGoogleConnectionInput = z.infer<typeof finalizeGoogleConnectionInputSchema>;
