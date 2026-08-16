/**
 * campaign-generated-content (dominio) — tests unitarios (Phase 7D).
 *
 * Cubre: isSupportedGenerationPlatform (meta_ads/google_ads sí,
 * youtube_ads/otros no) y una guarda de consistencia entre
 * GENERATED_CONTENT_SCHEMA_VERSION de dominio y de shared (dos constantes
 * mirror deliberadas — ver nota de "duplicación documentada" en
 * PHASE_7D_AI_CAMPAIGN_BUILDER_REPORT.md; este test existe para que
 * cualquier drift entre ambas rompa el build inmediatamente).
 */
import { describe, it, expect } from 'vitest';
import {
  isSupportedGenerationPlatform,
  SUPPORTED_GENERATION_PLATFORMS,
  GENERATED_CONTENT_SCHEMA_VERSION as DOMAIN_SCHEMA_VERSION,
} from '../entities/campaign-generated-content';
import { GENERATED_CONTENT_SCHEMA_VERSION as SHARED_SCHEMA_VERSION } from '@bop-agency/shared';

describe('isSupportedGenerationPlatform', () => {
  it('acepta meta_ads', () => {
    expect(isSupportedGenerationPlatform('meta_ads')).toBe(true);
  });

  it('acepta google_ads', () => {
    expect(isSupportedGenerationPlatform('google_ads')).toBe(true);
  });

  it('rechaza youtube_ads (deferido en 7D — sin builder implementado)', () => {
    expect(isSupportedGenerationPlatform('youtube_ads')).toBe(false);
  });

  it('rechaza plataformas inexistentes', () => {
    expect(isSupportedGenerationPlatform('myspace_ads')).toBe(false);
  });

  it('SUPPORTED_GENERATION_PLATFORMS contiene exactamente meta_ads y google_ads', () => {
    expect([...SUPPORTED_GENERATION_PLATFORMS].sort()).toEqual(['google_ads', 'meta_ads']);
  });
});

describe('GENERATED_CONTENT_SCHEMA_VERSION — consistencia dominio/shared', () => {
  it('la constante de dominio y la de shared coinciden exactamente', () => {
    expect(DOMAIN_SCHEMA_VERSION).toBe(SHARED_SCHEMA_VERSION);
  });
});
