/**
 * budgetAmountSchema / parseBudgetAmount — Phase 7D.1.1.
 *
 * BUG DE ORIGEN: en el smoke real, una campaña generada con IA quedó con
 * presupuesto $0 pese a haberse ingresado uno en el formulario. La causa raíz
 * es que `z.coerce.number()` convierte silenciosamente `null`, `''`, `false` y
 * `[]` en 0 — y 0 pasa `.min(0)` sin error, así que se persistía como un
 * presupuesto legítimo de cero.
 *
 * Estos tests fijan que esa vía queda cerrada: lo que no es un número real ya
 * NO se convierte en 0, sino que falla la validación.
 *
 * Cobertura:
 *   B1.  número válido pasa intacto
 *   B2.  cadena numérica se convierte
 *   B3.  cadena con espacios / NBSP / separadores de miles se normaliza
 *   B4.  null NO se convierte en 0
 *   B5.  '' NO se convierte en 0
 *   B6.  undefined (campo ausente) NO se convierte en 0
 *   B7.  false NO se convierte en 0
 *   B8.  [] NO se convierte en 0
 *   B9.  NaN / Infinity rechazados
 *   B10. texto no numérico rechazado
 *   B11. negativo rechazado con su mensaje específico
 *   B12. 0 explícito sigue siendo válido a nivel de schema (el > 0 es regla de UI)
 *   B13. el schema de creación manual y el de IA usan la misma regla
 */
import { describe, it, expect } from 'vitest';
import {
  budgetAmountSchema,
  parseBudgetAmount,
  createCampaignDraftSchema,
  generateCampaignDraftWithAiSchema,
} from '../campaign.schema';

const AI_BASE = {
  clientId: 'client-1',
  platform: 'meta_ads',
  objective: 'lead_generation',
  brief: 'Brief de prueba con suficiente contenido.',
};

const MANUAL_BASE = {
  clientId: 'client-1',
  name: 'Campaña manual',
  platform: 'meta_ads',
  objective: 'lead_generation',
};

describe('parseBudgetAmount', () => {
  it('B1: acepta un número finito', () => {
    expect(parseBudgetAmount(5_000_000)).toBe(5_000_000);
    expect(parseBudgetAmount(0)).toBe(0);
  });

  it('B2: acepta una cadena numérica', () => {
    expect(parseBudgetAmount('5000000')).toBe(5_000_000);
    expect(parseBudgetAmount('1234.56')).toBe(1234.56);
  });

  it('B3: normaliza espacios, NBSP y separadores de miles', () => {
    expect(parseBudgetAmount(' 5000000 ')).toBe(5_000_000);
    expect(parseBudgetAmount('1 234 567')).toBe(1_234_567);
    expect(parseBudgetAmount('1,234,567')).toBe(1_234_567);
    expect(parseBudgetAmount('1,234,567.89')).toBe(1_234_567.89);
  });

  it('B4–B8: null / vacío / undefined / booleanos / arrays NO valen 0', () => {
    // Number(...) de todos estos vale 0 — es exactamente el bug que se corrige.
    for (const raw of [null, undefined, '', '   ', false, true, [], {}]) {
      expect(parseBudgetAmount(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it('B9: NaN e Infinity son rechazados', () => {
    expect(parseBudgetAmount(Number.NaN)).toBeNull();
    expect(parseBudgetAmount(Number.POSITIVE_INFINITY)).toBeNull();
    expect(parseBudgetAmount('Infinity')).toBeNull();
  });

  it('B10: texto no numérico es rechazado', () => {
    expect(parseBudgetAmount('cinco millones')).toBeNull();
    expect(parseBudgetAmount('5000000 COP')).toBeNull();
    expect(parseBudgetAmount('1.2.3')).toBeNull();
  });
});

describe('budgetAmountSchema', () => {
  it('B4b: null falla con mensaje explícito en vez de convertirse en 0', () => {
    const result = budgetAmountSchema.safeParse(null);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toContain('requerido');
    }
  });

  it('B5b: cadena vacía falla en vez de convertirse en 0', () => {
    expect(budgetAmountSchema.safeParse('').success).toBe(false);
  });

  it('B11: un negativo falla con su mensaje específico', () => {
    const result = budgetAmountSchema.safeParse(-1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.message).toBe('El presupuesto no puede ser negativo');
    }
  });

  it('B12: 0 explícito sigue siendo válido a nivel de schema', () => {
    const result = budgetAmountSchema.safeParse(0);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe(0);
  });
});

describe('budget en los schemas de campaña', () => {
  it('B13a: generateCampaignDraftWithAiSchema conserva el presupuesto ingresado', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse({ ...AI_BASE, budget: 5_000_000 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.budget).toBe(5_000_000);
  });

  it('B13b: generateCampaignDraftWithAiSchema rechaza un budget nulo en vez de guardar 0', () => {
    const result = generateCampaignDraftWithAiSchema.safeParse({ ...AI_BASE, budget: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.some((e) => e.path.includes('budget'))).toBe(true);
    }
  });

  it('B13c: createCampaignDraftSchema aplica la misma regla', () => {
    expect(createCampaignDraftSchema.safeParse({ ...MANUAL_BASE, budget: 3_000_000 }).success).toBe(
      true,
    );
    expect(createCampaignDraftSchema.safeParse({ ...MANUAL_BASE, budget: '' }).success).toBe(false);
    expect(createCampaignDraftSchema.safeParse({ ...MANUAL_BASE, budget: null }).success).toBe(false);
  });
});
