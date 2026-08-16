/**
 * campaignGeneratedContentSchema — tests unitarios (Phase 7D).
 *
 * Cubre: meta_ads válido, google_ads válido, discriminador platform
 * inválido/ausente, schemaVersion incorrecta, límites de headlines/
 * descriptions de Google RSA, campos requeridos ausentes.
 */
import { describe, it, expect } from 'vitest';
import {
  campaignGeneratedContentSchema,
  metaAdsGeneratedContentSchema,
  googleAdsGeneratedContentSchema,
  GENERATED_CONTENT_SCHEMA_VERSION,
} from '../campaign-generated-content.schema';

function baseFields() {
  return {
    schemaVersion: GENERATED_CONTENT_SCHEMA_VERSION,
    language: 'es',
    campaignConcept: 'Campaña de lanzamiento de temporada',
    targetAudience: 'Adultos 25-45 interesados en fitness',
    valueProposition: 'Entrenamiento personalizado a precio accesible',
    messaging: ['Empieza hoy', 'Resultados reales'],
    callsToAction: ['Regístrate ahora'],
    landingPageRecommendations: ['Incluir testimonios reales verificados'],
    complianceNotes: [],
    assumptions: [],
  };
}

function validMetaAdsContent() {
  return {
    ...baseFields(),
    platform: 'meta_ads' as const,
    adSets: [
      {
        name: 'Ad Set — Cold Audience',
        audienceType: 'cold' as const,
        targetingSummary: 'Intereses en fitness y bienestar, 25-45 años',
        placementSuggestions: ['Feed', 'Stories'],
        creatives: [
          {
            hook: '¿Cansado de rutinas que no funcionan?',
            headline: 'Entrena diferente',
            primaryText: 'Descubre un plan hecho para ti.',
            format: 'video',
            visualSuggestion: 'Video corto mostrando el entrenamiento en acción',
          },
        ],
      },
    ],
  };
}

function validGoogleAdsContent() {
  return {
    ...baseFields(),
    platform: 'google_ads' as const,
    adGroups: [
      {
        name: 'Ad Group — Fitness Local',
        theme: 'Entrenamiento personalizado',
        headlines: ['Entrena hoy', 'Planes a tu medida', 'Resultados reales'],
        descriptions: ['Entrenamiento personalizado cerca de ti.'],
      },
    ],
    keywordSuggestions: ['entrenador personal', 'gimnasio cerca de mi'],
    negativeKeywordSuggestions: ['gratis'],
  };
}

describe('metaAdsGeneratedContentSchema / campaignGeneratedContentSchema (meta_ads)', () => {
  it('acepta un contenido meta_ads válido', () => {
    const result = campaignGeneratedContentSchema.safeParse(validMetaAdsContent());
    expect(result.success).toBe(true);
  });

  it('rechaza schemaVersion incorrecta', () => {
    const result = campaignGeneratedContentSchema.safeParse({
      ...validMetaAdsContent(),
      schemaVersion: 'campaign-content-v0',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza adSets vacío', () => {
    const result = metaAdsGeneratedContentSchema.safeParse({ ...validMetaAdsContent(), adSets: [] });
    expect(result.success).toBe(false);
  });

  it('rechaza audienceType inválido', () => {
    const content = validMetaAdsContent();
    const result = metaAdsGeneratedContentSchema.safeParse({
      ...content,
      adSets: [{ ...content.adSets[0], audienceType: 'hot' }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza messaging vacío', () => {
    const result = metaAdsGeneratedContentSchema.safeParse({ ...validMetaAdsContent(), messaging: [] });
    expect(result.success).toBe(false);
  });
});

describe('googleAdsGeneratedContentSchema / campaignGeneratedContentSchema (google_ads)', () => {
  it('acepta un contenido google_ads válido', () => {
    const result = campaignGeneratedContentSchema.safeParse(validGoogleAdsContent());
    expect(result.success).toBe(true);
  });

  it('rechaza menos de 3 headlines (mínimo real de Responsive Search Ads)', () => {
    const content = validGoogleAdsContent();
    const result = googleAdsGeneratedContentSchema.safeParse({
      ...content,
      adGroups: [{ ...content.adGroups[0], headlines: ['Solo uno', 'Solo dos'] }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza headline mayor a 30 caracteres', () => {
    const content = validGoogleAdsContent();
    const result = googleAdsGeneratedContentSchema.safeParse({
      ...content,
      adGroups: [
        {
          ...content.adGroups[0],
          headlines: ['a'.repeat(31), 'Titular corto', 'Otro titular'],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza description mayor a 90 caracteres', () => {
    const content = validGoogleAdsContent();
    const result = googleAdsGeneratedContentSchema.safeParse({
      ...content,
      adGroups: [{ ...content.adGroups[0], descriptions: ['a'.repeat(91)] }],
    });
    expect(result.success).toBe(false);
  });

  it('rechaza keywordSuggestions vacío', () => {
    const result = googleAdsGeneratedContentSchema.safeParse({
      ...validGoogleAdsContent(),
      keywordSuggestions: [],
    });
    expect(result.success).toBe(false);
  });

  it('acepta negativeKeywordSuggestions vacío (no es obligatorio tener keywords negativas)', () => {
    const result = googleAdsGeneratedContentSchema.safeParse({
      ...validGoogleAdsContent(),
      negativeKeywordSuggestions: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('campaignGeneratedContentSchema — discriminador platform', () => {
  it('rechaza platform ausente', () => {
    const { platform, ...withoutPlatform } = validMetaAdsContent();
    void platform;
    const result = campaignGeneratedContentSchema.safeParse(withoutPlatform);
    expect(result.success).toBe(false);
  });

  it('rechaza platform no soportado (ej. youtube_ads — 7D solo implementa meta_ads/google_ads)', () => {
    const result = campaignGeneratedContentSchema.safeParse({
      ...validMetaAdsContent(),
      platform: 'youtube_ads',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza contenido meta_ads con la forma de google_ads (adGroups en vez de adSets)', () => {
    const { adSets: _adSets, ...rest } = validMetaAdsContent();
    void _adSets;
    const result = campaignGeneratedContentSchema.safeParse({
      ...rest,
      adGroups: validGoogleAdsContent().adGroups,
    });
    expect(result.success).toBe(false);
  });
});
