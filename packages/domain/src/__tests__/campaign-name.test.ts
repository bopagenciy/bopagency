/**
 * Reglas de nombre de campaña — Phase 7D.1.1.
 *
 * DEFECTO DE ORIGEN: la generación con IA producía nombres de campaña
 * excesivamente largos porque se usaba el `campaignConcept` COMPLETO (un
 * párrafo narrativo) truncado a 200 caracteres.
 *
 * Cobertura:
 *   N1.  el nombre del usuario siempre gana
 *   N2.  el nombre del usuario se recorta a espacios sobrantes
 *   N3.  un nombre de usuario vacío / solo espacios no cuenta como nombre
 *   N4.  un concepto corto se usa tal cual
 *   N5.  un párrafo se corta en el primer límite de oración
 *   N6.  corta también en ';', ':', salto de línea y raya
 *   N7.  nunca excede AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH
 *   N8.  corta en frontera de palabra y marca con '…'
 *   N9.  concepto vacío → fallback
 *   N10. una primera "palabra" larguísima no rompe el límite
 *   N11. el nombre del usuario respeta el límite duro de BD (200)
 *   N12. el resultado nunca contiene saltos de línea ni espacios colapsables
 */
import { describe, it, expect } from 'vitest';
import {
  AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  deriveCampaignNameFromConcept,
  resolveAiCampaignName,
} from '../entities/campaign';

const FALLBACK = 'meta_ads — AI draft';

/** Concepto realista tal y como lo devolvió el modelo en el smoke. */
const NARRATIVE_CONCEPT =
  'Campaña de generación de leads para clínicas dentales en Bogotá que posiciona la ' +
  'primera consulta gratuita como puerta de entrada, apoyándose en testimonios de ' +
  'pacientes reales y en una promesa de agenda flexible para profesionales ocupados.';

describe('deriveCampaignNameFromConcept', () => {
  it('N4: un concepto corto se usa tal cual', () => {
    expect(deriveCampaignNameFromConcept('Temporada alta odontología', FALLBACK)).toBe(
      'Temporada alta odontología',
    );
  });

  it('N5: un párrafo se corta en el primer límite de oración', () => {
    const result = deriveCampaignNameFromConcept(
      'Leads para clínicas dentales. Segunda oración que no debe aparecer.',
      FALLBACK,
    );
    expect(result).toBe('Leads para clínicas dentales');
  });

  it('N6: corta también en ";", ":", salto de línea y raya', () => {
    expect(deriveCampaignNameFromConcept('Título corto; resto ignorado', FALLBACK)).toBe(
      'Título corto',
    );
    expect(deriveCampaignNameFromConcept('Título corto: resto ignorado', FALLBACK)).toBe(
      'Título corto',
    );
    expect(deriveCampaignNameFromConcept('Título corto\nresto ignorado', FALLBACK)).toBe(
      'Título corto',
    );
    expect(deriveCampaignNameFromConcept('Título corto — resto ignorado', FALLBACK)).toBe(
      'Título corto',
    );
  });

  it('N7: nunca excede el límite de nombres derivados', () => {
    const result = deriveCampaignNameFromConcept(NARRATIVE_CONCEPT, FALLBACK);
    expect(result.length).toBeLessThanOrEqual(AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH);
    expect(AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH).toBeLessThan(CAMPAIGN_NAME_MAX_LENGTH);
  });

  it('N8: corta en frontera de palabra y marca el truncado', () => {
    const result = deriveCampaignNameFromConcept(NARRATIVE_CONCEPT, FALLBACK);
    expect(result.endsWith('…')).toBe(true);
    // No debe partir una palabra por la mitad.
    expect(result.slice(0, -1).trimEnd()).toBe(result.slice(0, -1));
    expect(NARRATIVE_CONCEPT.startsWith(result.slice(0, -1))).toBe(true);
  });

  it('N9: un concepto vacío o solo espacios cae al fallback', () => {
    expect(deriveCampaignNameFromConcept('', FALLBACK)).toBe(FALLBACK);
    expect(deriveCampaignNameFromConcept('    \n  ', FALLBACK)).toBe(FALLBACK);
  });

  it('N10: una primera "palabra" larguísima no rompe el límite', () => {
    const result = deriveCampaignNameFromConcept('A'.repeat(300), FALLBACK);
    expect(result.length).toBeLessThanOrEqual(AI_DERIVED_CAMPAIGN_NAME_MAX_LENGTH);
  });

  it('N12: colapsa espacios y no deja saltos de línea', () => {
    const result = deriveCampaignNameFromConcept('  Título   con    espacios  ', FALLBACK);
    expect(result).toBe('Título con espacios');
    expect(result).not.toMatch(/[\n\r]/);
  });
});

describe('resolveAiCampaignName', () => {
  it('N1: el nombre del usuario siempre gana sobre el concepto generado', () => {
    expect(
      resolveAiCampaignName({
        userProvidedName: 'Temporada alta — Meta Ads',
        concept: NARRATIVE_CONCEPT,
        fallback: FALLBACK,
      }),
    ).toBe('Temporada alta — Meta Ads');
  });

  it('N2: recorta espacios sobrantes del nombre del usuario', () => {
    expect(
      resolveAiCampaignName({ userProvidedName: '  Mi campaña  ', concept: '', fallback: FALLBACK }),
    ).toBe('Mi campaña');
  });

  it('N3: un nombre vacío o de solo espacios no cuenta — se deriva del concepto', () => {
    for (const userProvidedName of [undefined, '', '   ']) {
      expect(
        resolveAiCampaignName({
          userProvidedName,
          concept: 'Leads para clínicas dentales. Otra oración.',
          fallback: FALLBACK,
        }),
      ).toBe('Leads para clínicas dentales');
    }
  });

  it('N11: un nombre de usuario larguísimo respeta el límite duro de BD (200)', () => {
    const result = resolveAiCampaignName({
      userProvidedName: 'Campaña '.repeat(60),
      concept: '',
      fallback: FALLBACK,
    });
    expect(result.length).toBeLessThanOrEqual(CAMPAIGN_NAME_MAX_LENGTH);
  });
});
