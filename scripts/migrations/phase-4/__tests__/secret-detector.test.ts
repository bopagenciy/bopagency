import { describe, it, expect } from 'vitest';
import { detectSecrets } from '../adapters/secret-detector';

describe('detectSecrets', () => {
  it('returns no secrets for clean data', () => {
    const result = detectSecrets({
      name: 'legalink-col',
      slug: 'legalink-col',
      status: 'active',
      industry: 'legal',
    });
    expect(result.hasSecrets).toBe(false);
    expect(result.detectedFields).toHaveLength(0);
  });

  it('detects sensitive field names', () => {
    const result = detectSecrets({ token: 'any-non-empty-value', name: 'test' });
    expect(result.hasSecrets).toBe(true);
    expect(result.detectedFields).toContain('token');
  });

  it('detects Meta/Facebook token pattern', () => {
    const fakeToken = 'EAA' + 'a'.repeat(60);
    const result = detectSecrets({ some_field: fakeToken });
    expect(result.hasSecrets).toBe(true);
  });

  it('detects OpenAI key pattern', () => {
    const fakeKey = 'sk-' + 'a'.repeat(30);
    const result = detectSecrets({ model_key: fakeKey });
    expect(result.hasSecrets).toBe(true);
  });

  it('does NOT flag short strings', () => {
    const result = detectSecrets({ some_value: 'short' });
    expect(result.hasSecrets).toBe(false);
  });

  it('scans nested objects recursively', () => {
    const result = detectSecrets({
      client: {
        integrations: {
          meta: {
            access_token: 'some-value',
          },
        },
      },
    });
    expect(result.hasSecrets).toBe(true);
  });

  it('never includes the actual secret value in detectedFields', () => {
    const fakeToken = 'EAA' + 'x'.repeat(60);
    const result = detectSecrets({ my_token: fakeToken });
    // detectedFields contains field NAMES only
    expect(result.detectedFields).toContain('my_token');
    for (const field of result.detectedFields) {
      expect(field).not.toContain(fakeToken);
    }
  });

  it('handles arrays of objects', () => {
    const result = detectSecrets([
      { name: 'ok', value: 'clean' },
      { name: 'secret', password: 'hunter2' },
    ]);
    expect(result.hasSecrets).toBe(true);
    expect(result.detectedFields).toContain('password');
  });
});
