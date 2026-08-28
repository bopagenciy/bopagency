import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptCredential, decryptCredential } from '../credential-cipher';

describe('CredentialCipher (AES-256-GCM)', () => {
  const originalEnv = process.env['META_CREDENTIAL_ENCRYPTION_KEY'];
  const testKeyHex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    process.env['META_CREDENTIAL_ENCRYPTION_KEY'] = testKeyHex;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env['META_CREDENTIAL_ENCRYPTION_KEY'] = originalEnv;
    } else {
      delete process.env['META_CREDENTIAL_ENCRYPTION_KEY'];
    }
  });

  it('cifra y descifra un token correctamente con la Master Key', () => {
    const token = 'EAABsbCS192837465_sample_page_access_token_12345';
    const encrypted = encryptCredential(token);

    expect(encrypted.keyVersion).toBe(1);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(encrypted.authTag).toHaveLength(32); // 16 bytes = 32 hex chars

    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(token);
  });

  it('falla al descifrar si la Master Key es diferente', () => {
    const token = 'secret_page_token';
    const encrypted = encryptCredential(token);

    // Cambiar key a otra clave de 32 bytes en hex
    process.env['META_CREDENTIAL_ENCRYPTION_KEY'] = 'ff'.repeat(32);

    expect(() => decryptCredential(encrypted)).toThrow();
  });

  it('lanza error si META_CREDENTIAL_ENCRYPTION_KEY no está configurada', () => {
    delete process.env['META_CREDENTIAL_ENCRYPTION_KEY'];
    expect(() => encryptCredential('test')).toThrow(/missing/);
  });

  it('lanza error si la Master Key no tiene 32 bytes', () => {
    process.env['META_CREDENTIAL_ENCRYPTION_KEY'] = '12345';
    expect(() => encryptCredential('test')).toThrow(/must be exactly 32 bytes/);
  });
});
