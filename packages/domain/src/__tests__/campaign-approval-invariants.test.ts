import { describe, it, expect } from 'vitest';
import { isValidRejectionNote } from '../entities/campaign-approval';

describe('isValidRejectionNote', () => {
  it('rechaza null', () => {
    expect(isValidRejectionNote(null)).toBe(false);
  });

  it('rechaza undefined', () => {
    expect(isValidRejectionNote(undefined)).toBe(false);
  });

  it('rechaza string vacío', () => {
    expect(isValidRejectionNote('')).toBe(false);
  });

  it('rechaza string solo con espacios en blanco', () => {
    expect(isValidRejectionNote('   ')).toBe(false);
  });

  it('rechaza string solo con tabs/newlines', () => {
    expect(isValidRejectionNote('\t\n  \n')).toBe(false);
  });

  it('acepta una nota no vacía', () => {
    expect(isValidRejectionNote('El presupuesto excede el límite aprobado por el cliente.')).toBe(
      true,
    );
  });

  it('acepta una nota con espacios alrededor pero contenido real', () => {
    expect(isValidRejectionNote('  falta disclaimer legal  ')).toBe(true);
  });
});
