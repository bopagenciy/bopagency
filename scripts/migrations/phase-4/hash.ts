/**
 * Phase 4 Migration — Content hashing for idempotency
 *
 * SHA-256 of JSON.stringify with sorted keys over normalized content.
 * Deterministic: same logical content → same hash, regardless of key order.
 */

import { createHash } from 'crypto';

/** Recursively sorts object keys before serializing */
function sortedReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Computes SHA-256 of the normalized JSON representation of the given data.
 * Keys are sorted at all nesting levels for determinism.
 */
export function computeHash(data: unknown): string {
  const normalized = JSON.stringify(data, sortedReplacer);
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/**
 * Computes SHA-256 of raw UTF-8 string content (for Markdown files).
 * Normalizes line endings to LF.
 */
export function computeTextHash(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}
