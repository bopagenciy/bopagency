import { describe, it, expect } from 'vitest';
import {
  googleAdsActivationConfigSchema,
  strictGoogleAdsActivationConfigSchema,
  isPublishableGoogleAdsConfig,
} from '../google-ads-config.schema';

describe('googleAdsActivationConfigSchema (8F.0 Baseline & Legacy Compatibility)', () => {
  const validConfig = {
    dailyBudget: {
      amount: 50.25,
      currency: 'USD',
    },
    biddingStrategy: 'MAXIMIZE_CLICKS',
    finalUrl: 'https://example.com/promo',
    geoTargetIds: ['2170', ' 2170 ', '2840'],
    languageCriterionIds: ['1003', '1000'],
    keywordMatchPolicy: 'PHRASE',
    negativeKeywordMatchPolicy: 'BROAD',
  };

  it('acepta una configuración válida de Google Ads', () => {
    const result = googleAdsActivationConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dailyBudget.amount).toBe(50.25);
      expect(result.data.geoTargetIds).toEqual(['2170', '2840']);
      expect(result.data.languageCriterionIds).toEqual(['1003', '1000']);
    }
  });

  it('rechaza presupuesto diario igual a 0', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      dailyBudget: { amount: 0, currency: 'USD' },
    });
    expect(result.success).toBe(false);
  });

  it('rechaza presupuesto diario negativo', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      dailyBudget: { amount: -10, currency: 'USD' },
    });
    expect(result.success).toBe(false);
  });

  it('rechaza presupuestos no finitos (NaN, Infinity)', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      dailyBudget: { amount: NaN, currency: 'USD' },
    });
    expect(result.success).toBe(false);
  });

  it('acepta montos representables exactamente en micros (1, 0.1, 0.000001, 50.25, 50.123456)', () => {
    for (const amount of [1, 0.1, 0.000001, 50.25, 50.123456]) {
      const result = googleAdsActivationConfigSchema.safeParse({
        ...validConfig,
        dailyBudget: { amount, currency: 'USD' },
      });
      expect(result.success).toBe(true);
    }
  });

  it('rechaza montos no representables o inválidos (0, -1, 0.0000001, 50.1234567)', () => {
    for (const amount of [0, -1, 0.0000001, 50.1234567]) {
      const result = googleAdsActivationConfigSchema.safeParse({
        ...validConfig,
        dailyBudget: { amount, currency: 'USD' },
      });
      expect(result.success).toBe(false);
    }
  });

  it('rechaza toda la configuración si CUALQUIER ID de geolocalización es inválido', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      geoTargetIds: ['2170', 'abc', '2840'],
    });
    expect(result.success).toBe(false);
  });

  it('recorta espacios y elimina IDs duplicados', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      geoTargetIds: [' 2170 ', '2170', '2840 '],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geoTargetIds).toEqual(['2170', '2840']);
    }
  });

  it('rechaza lista vacía de geoTargetIds', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      geoTargetIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza lista vacía de languageCriterionIds', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      languageCriterionIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('requiere keywordMatchPolicy', () => {
    const invalid = { ...validConfig } as Partial<typeof validConfig>;
    delete invalid.keywordMatchPolicy;
    const result = googleAdsActivationConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('requiere negativeKeywordMatchPolicy', () => {
    const invalid = { ...validConfig } as Partial<typeof validConfig>;
    delete invalid.negativeKeywordMatchPolicy;
    const result = googleAdsActivationConfigSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rechaza políticas de coincidencia inválidas', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      keywordMatchPolicy: 'INVALID_POLICY',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza estrategia de puja inválida', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      biddingStrategy: 'MAXIMIZE_CONVERSIONS',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza URL final HTTP (requiere HTTPS)', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      finalUrl: 'http://example.com/promo',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza URL final malformada', () => {
    const result = googleAdsActivationConfigSchema.safeParse({
      ...validConfig,
      finalUrl: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('googleAdsActivationConfigSchema & strictGoogleAdsActivationConfigSchema (Phase 8F.2A EU Declaration)', () => {
  const baseValidConfig = {
    dailyBudget: { amount: 50, currency: 'USD' },
    biddingStrategy: 'MAXIMIZE_CLICKS',
    finalUrl: 'https://example.com/promo',
    geoTargetIds: ['2840'],
    languageCriterionIds: ['1000'],
    keywordMatchPolicy: 'PHRASE',
    negativeKeywordMatchPolicy: 'EXACT',
  };

  it('legacy schema parsea configuración sin declaración de publicidad política de la UE (opcional/nullable)', () => {
    const result = googleAdsActivationConfigSchema.safeParse(baseValidConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.euPoliticalAdvertisingDeclaration).toBeUndefined();
    }
  });

  it('legacy schema parsea configuración con CONTAINS_EU_POLITICAL_ADVERTISING', () => {
    const config = {
      ...baseValidConfig,
      euPoliticalAdvertisingDeclaration: 'CONTAINS_EU_POLITICAL_ADVERTISING',
    };
    const result = googleAdsActivationConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.euPoliticalAdvertisingDeclaration).toBe('CONTAINS_EU_POLITICAL_ADVERTISING');
    }
  });

  it('legacy schema parsea configuración con DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING', () => {
    const config = {
      ...baseValidConfig,
      euPoliticalAdvertisingDeclaration: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    };
    const result = googleAdsActivationConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.euPoliticalAdvertisingDeclaration).toBe('DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING');
    }
  });

  it('legacy schema rechaza valores de enum inválidos para la declaración de la UE', () => {
    const config = {
      ...baseValidConfig,
      euPoliticalAdvertisingDeclaration: 'INVALID_DECLARATION',
    };
    const result = googleAdsActivationConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('strict schema rechaza configuración sin declaración de publicidad política de la UE', () => {
    const result = strictGoogleAdsActivationConfigSchema.safeParse(baseValidConfig);
    expect(result.success).toBe(false);
  });

  it('strict schema acepta configuración con DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING explícito', () => {
    const config = {
      ...baseValidConfig,
      euPoliticalAdvertisingDeclaration: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    };
    const result = strictGoogleAdsActivationConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('strict schema acepta configuración con CONTAINS_EU_POLITICAL_ADVERTISING explícito', () => {
    const config = {
      ...baseValidConfig,
      euPoliticalAdvertisingDeclaration: 'CONTAINS_EU_POLITICAL_ADVERTISING',
    };
    const result = strictGoogleAdsActivationConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('isPublishableGoogleAdsConfig retorna false para config legacy sin declaración y true para config estricta válida', () => {
    expect(isPublishableGoogleAdsConfig(baseValidConfig)).toBe(false);
    const validStrict = {
      ...baseValidConfig,
      euPoliticalAdvertisingDeclaration: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    };
    expect(isPublishableGoogleAdsConfig(validStrict)).toBe(true);
  });
});
