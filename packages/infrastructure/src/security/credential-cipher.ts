/**
 * CredentialCipher — Phase 8E.
 *
 * Cifrado y descifrado simétrico AES-256-GCM para tokens de integración de proveedor.
 * La Master Key vive exclusivamente en memoria de servidor (process.env.META_CREDENTIAL_ENCRYPTION_KEY).
 * NUNCA se persiste la Master Key en base de datos ni en logs.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export type EncryptedPayload = {
  keyVersion: number;
  ciphertext: string;
  iv: string;
  authTag: string;
};

const DEFAULT_KEY_VERSION = 1;

/**
 * Obtiene y valida la Master Key desde process.env.META_CREDENTIAL_ENCRYPTION_KEY.
 * Soporta formato hex (64 caracteres) o base64 (44 caracteres) o string UTF-8 de 32 bytes.
 */
function getMasterKey(): Buffer {
  const rawKey = process.env['META_CREDENTIAL_ENCRYPTION_KEY'];
  if (!rawKey) {
    throw new Error(
      'META_CREDENTIAL_ENCRYPTION_KEY is missing from environment variables. Credential operation aborted.',
    );
  }

  const trimmed = rawKey.trim();
  let keyBuf: Buffer;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    keyBuf = Buffer.from(trimmed, 'hex');
  } else if (/^[A-Za-z0-9+/=]{44}$/.test(trimmed)) {
    keyBuf = Buffer.from(trimmed, 'base64');
  } else {
    keyBuf = Buffer.from(trimmed, 'utf-8');
  }

  if (keyBuf.length !== 32) {
    throw new Error(
      `META_CREDENTIAL_ENCRYPTION_KEY must be exactly 32 bytes (got ${keyBuf.length} bytes).`,
    );
  }

  return keyBuf;
}

/**
 * Cifra un texto plano usando AES-256-GCM.
 * Genera un IV aleatorio de 12 bytes por operación.
 */
export function encryptCredential(
  plaintext: string,
  keyVersion = DEFAULT_KEY_VERSION,
): EncryptedPayload {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('encryptCredential requires a non-empty string payload');
  }

  const masterKey = getMasterKey();
  const ivBuf = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey, ivBuf);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTagBuf = cipher.getAuthTag();

  return {
    keyVersion,
    ciphertext,
    iv: ivBuf.toString('hex'),
    authTag: authTagBuf.toString('hex'),
  };
}

/**
 * Descifra un payload EncryptedPayload usando AES-256-GCM.
 */
export function decryptCredential(payload: EncryptedPayload): string {
  if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
    throw new Error('decryptCredential requires a valid EncryptedPayload object');
  }

  const masterKey = getMasterKey();
  const ivBuf = Buffer.from(payload.iv, 'hex');
  const authTagBuf = Buffer.from(payload.authTag, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', masterKey, ivBuf);
  decipher.setAuthTag(authTagBuf);

  let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
