import { z } from 'zod';
import { CAMPAIGN_CURRENCIES, parseBudgetAmount } from './campaign.schema';

export const GOOGLE_ADS_BIDDING_STRATEGIES = ['MAXIMIZE_CLICKS', 'MANUAL_CPC'] as const;
export type GoogleAdsBiddingStrategy = (typeof GOOGLE_ADS_BIDDING_STRATEGIES)[number];

export const GOOGLE_ADS_KEYWORD_MATCH_POLICIES = ['BROAD', 'PHRASE', 'EXACT'] as const;
export type GoogleAdsKeywordMatchPolicy = (typeof GOOGLE_ADS_KEYWORD_MATCH_POLICIES)[number];

export const GOOGLE_ADS_EU_POLITICAL_ADVERTISING_DECLARATIONS = [
  'CONTAINS_EU_POLITICAL_ADVERTISING',
  'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
] as const;
export type GoogleAdsEuPoliticalAdvertisingDeclaration =
  (typeof GOOGLE_ADS_EU_POLITICAL_ADVERTISING_DECLARATIONS)[number];

const dailyBudgetAmountSchema = z
  .union([z.number(), z.string()], {
    errorMap: () => ({ message: 'El presupuesto diario es requerido y debe ser un número válido' }),
  })
  .transform((raw, ctx): number => {
    const parsed = parseBudgetAmount(raw);
    if (parsed === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El presupuesto diario es requerido y debe ser un número válido',
      });
      return z.NEVER;
    }
    if (parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El presupuesto diario debe ser mayor a 0',
      });
      return z.NEVER;
    }
    const micros = parsed * 1_000_000;
    if (Math.abs(micros - Math.round(micros)) > 1e-6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El presupuesto diario no puede tener más de 6 decimales',
      });
      return z.NEVER;
    }
    return parsed;
  });

const providerIdsSchema = (fieldName: string) =>
  z
    .array(z.string())
    .min(1, `Debe especificar al menos un ID de ${fieldName}`)
    .superRefine((items, ctx) => {
      for (const raw of items) {
        const trimmed = raw.trim();
        if (!/^\d+$/.test(trimmed)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Todos los IDs de ${fieldName} deben ser strictly numéricos`,
          });
          return;
        }
      }
    })
    .transform((items) => Array.from(new Set(items.map((i) => i.trim()))));

/**
 * Schema de lectura / histórico — permite `euPoliticalAdvertisingDeclaration` opcional
 * para asegurar compatibilidad de lectura con snapshots creados antes de 8F.2A.
 */
export const googleAdsActivationConfigSchema = z.object({
  dailyBudget: z.object({
    amount: dailyBudgetAmountSchema,
    currency: z.enum(CAMPAIGN_CURRENCIES, {
      errorMap: () => ({ message: 'Moneda de presupuesto diario no soportada' }),
    }),
  }),
  biddingStrategy: z.enum(GOOGLE_ADS_BIDDING_STRATEGIES, {
    errorMap: () => ({ message: 'Estrategia de puja de Google Ads requerida o no soportada' }),
  }),
  finalUrl: z
    .string()
    .trim()
    .url({ message: 'URL final debe ser una URL válida' })
    .refine((url) => url.startsWith('https://'), {
      message: 'URL final debe usar protocolo HTTPS',
    }),
  geoTargetIds: providerIdsSchema('geolocalización'),
  languageCriterionIds: providerIdsSchema('idioma'),
  keywordMatchPolicy: z.enum(GOOGLE_ADS_KEYWORD_MATCH_POLICIES, {
    errorMap: () => ({ message: 'Política de coincidencia de palabras clave requerida' }),
  }),
  negativeKeywordMatchPolicy: z.enum(GOOGLE_ADS_KEYWORD_MATCH_POLICIES, {
    errorMap: () => ({ message: 'Política de coincidencia de palabras clave negativas requerida' }),
  }),
  euPoliticalAdvertisingDeclaration: z
    .enum(GOOGLE_ADS_EU_POLITICAL_ADVERTISING_DECLARATIONS, {
      errorMap: () => ({ message: 'Declaración de publicidad política de la UE requerida' }),
    })
    .optional()
    .nullable(),
});

export type GoogleAdsActivationConfigShape = z.infer<typeof googleAdsActivationConfigSchema>;

/**
 * Schema estricto para nuevas aprobaciones, creación de activaciones y publicación (8F.2A+).
 * EXIGE que la declaración de publicidad política de la UE esté presente explícitamente.
 */
export const strictGoogleAdsActivationConfigSchema = googleAdsActivationConfigSchema.extend({
  euPoliticalAdvertisingDeclaration: z.enum(GOOGLE_ADS_EU_POLITICAL_ADVERTISING_DECLARATIONS, {
    errorMap: () => ({ message: 'Declaración de publicidad política de la UE requerida' }),
  }),
});

export type PublishableGoogleAdsActivationConfig = z.infer<typeof strictGoogleAdsActivationConfigSchema>;

/**
 * Helper de reducción de tipos seguro para verificar si una configuración de Google Ads es elegible para publicación.
 */
export function isPublishableGoogleAdsConfig(
  config: unknown,
): config is PublishableGoogleAdsActivationConfig {
  return strictGoogleAdsActivationConfigSchema.safeParse(config).success;
}
