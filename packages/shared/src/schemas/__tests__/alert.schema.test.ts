/**
 * Alert schemas — tests unitarios
 */
import { describe, it, expect } from 'vitest';
import { acknowledgeAlertSchema, resolveAlertSchema } from '../alert.schema';

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

describe('acknowledgeAlertSchema', () => {
  it('acepta un UUID válido', () => {
    const result = acknowledgeAlertSchema.safeParse({ alertId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rechaza string no UUID', () => {
    const result = acknowledgeAlertSchema.safeParse({ alertId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rechaza alertId ausente', () => {
    const result = acknowledgeAlertSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rechaza string vacío', () => {
    const result = acknowledgeAlertSchema.safeParse({ alertId: '' });
    expect(result.success).toBe(false);
  });

  it('rechaza organizationId si se pasa (no está en schema)', () => {
    // organizationId extra es ignorado por Zod (no falla — se stripea)
    const result = acknowledgeAlertSchema.safeParse({
      alertId: VALID_UUID,
      organizationId: 'extra-org',
    });
    // Debe ser válido (campos extra son ignorados en Zod por defecto)
    expect(result.success).toBe(true);
    if (result.success) {
      // organizationId no debe aparecer en el resultado parseado
      expect(Object.keys(result.data)).not.toContain('organizationId');
    }
  });
});

describe('resolveAlertSchema', () => {
  it('acepta un UUID válido', () => {
    const result = resolveAlertSchema.safeParse({ alertId: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it('rechaza string no UUID', () => {
    const result = resolveAlertSchema.safeParse({ alertId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rechaza alertId ausente', () => {
    const result = resolveAlertSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('no incluye organizationId en el schema (seguridad)', () => {
    const result = resolveAlertSchema.safeParse({ alertId: VALID_UUID });
    if (result.success) {
      expect(Object.keys(result.data)).toEqual(['alertId']);
    }
  });
});
